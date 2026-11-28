import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config.settings import settings
from app.db.base import Base
from app.db.session import SessionLocal
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.organization_role import OrganizationRole
from app.models.user import User
import app.models  # Ensure all organization-owned tables are registered for safe local cleanup.


router = APIRouter(prefix="/organizations", tags=["Organizations"])


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class OrganizationDeleteRequest(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=200)


LOCAL_DUMMY_ORGANIZATIONS = frozenset({"micro1", "SummitOps Cloud", "Northstar ERP"})


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    status: str
    billing_email: str | None
    country_code: str | None
    timezone: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("", response_model=list[OrganizationResponse])
def list_organizations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (
        settings.environment == "development"
        and not settings.google_auth_required
        and current_user.auth_provider == "local"
    ):
        return db.scalars(
            select(Organization).order_by(Organization.created_at.desc())
        ).all()

    return db.scalars(
        select(Organization)
        .join(
            OrganizationMembership,
            OrganizationMembership.organization_id == Organization.id,
        )
        .where(
            OrganizationMembership.user_id == current_user.id,
            OrganizationMembership.status == "active",
        )
        .order_by(Organization.created_at.desc())
    ).all()


@router.post(
    "",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Organization name cannot be blank.",
        )

    slug_base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    slug_base = slug_base[:80] or "organization"
    slug = f"{slug_base}-{uuid4().hex[:8]}"

    organization = Organization(name=name, slug=slug)
    db.add(organization)
    db.flush()

    membership = OrganizationMembership(
        organization_id=organization.id,
        user_id=current_user.id,
        status="active",
    )
    db.add(membership)
    db.flush()
    db.add(
        OrganizationRole(
            organization_membership_id=membership.id,
            role="Owner",
            assigned_by_user_id=current_user.id,
        )
    )
    db.commit()
    db.refresh(organization)
    return organization


def _organization_row_keys(db: Session, organization_id: str):
    """Collect this org's rows and all FK-linked descendants before deleting any."""
    tables = list(Base.metadata.sorted_tables)
    referenced_columns = {table: set() for table in tables}
    for child in tables:
        for foreign_key in child.foreign_keys:
            parent_column = foreign_key.column
            referenced_columns.setdefault(parent_column.table, set()).add(parent_column)

    selected_primary_keys = {}
    selected_values = {}
    for table in tables:
        conditions = []
        if table.name == "organizations" and "id" in table.c:
            conditions.append(table.c.id == organization_id)
        if "organization_id" in table.c:
            conditions.append(table.c.organization_id == organization_id)
        for foreign_key in table.foreign_keys:
            parent_values = selected_values.get(foreign_key.column, set())
            if parent_values:
                conditions.append(foreign_key.parent.in_(parent_values))
        if not conditions or not table.primary_key.columns:
            continue

        primary_key_columns = list(table.primary_key.columns)
        needed_columns = list(dict.fromkeys([
            *primary_key_columns,
            *referenced_columns.get(table, set()),
        ]))
        rows = db.execute(
            select(*needed_columns).where(or_(*conditions))
        ).mappings().all()
        if not rows:
            continue

        selected_primary_keys[table] = [
            tuple(row[column] for column in primary_key_columns)
            for row in rows
        ]
        for column in needed_columns:
            selected_values.setdefault(column, set()).update(
                row[column] for row in rows if row[column] is not None
            )

    return tables, selected_primary_keys


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_local_dummy_organization(
    organization_id: str,
    data: OrganizationDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # This narrowly allowlisted cleanup route is only available in local development.
    if (
        settings.environment != "development"
        or settings.google_auth_required
        or current_user.auth_provider != "local"
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")

    organization = db.get(Organization, organization_id)
    if (
        organization is None
        or organization.name not in LOCAL_DUMMY_ORGANIZATIONS
        or data.confirm_name != organization.name
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace is not an approved local test workspace.")

    tables, selected_primary_keys = _organization_row_keys(db, organization_id)
    try:
        for table in reversed(tables):
            primary_key_columns = list(table.primary_key.columns)
            keys = selected_primary_keys.get(table, [])
            if not keys:
                continue
            row_conditions = [
                and_(*(column == value for column, value in zip(primary_key_columns, key)))
                for key in keys
            ]
            db.execute(delete(table).where(or_(*row_conditions)))
        db.commit()
    except Exception:
        db.rollback()
        raise

    return Response(status_code=status.HTTP_204_NO_CONTENT)
