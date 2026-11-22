from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.organization import Organization
from app.models.target_account import TargetAccount
from app.schemas.target_account import (
    QualificationStatus,
    TargetAccountCreate,
    TargetAccountResponse,
    TargetAccountUpdate,
)


router = APIRouter(tags=["Target Accounts"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_organization_exists(db: Session, organization_id: str) -> None:
    if db.get(Organization, organization_id) is None:
        raise HTTPException(status_code=404, detail="Organization not found")


def get_target_account(
    db: Session,
    organization_id: str,
    account_id: str,
) -> TargetAccount:
    account = db.scalar(
        select(TargetAccount).where(
            TargetAccount.organization_id == organization_id,
            TargetAccount.id == account_id,
        )
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Target company not found")
    return account


@router.get(
    "/organizations/{organization_id}/target-accounts",
    response_model=list[TargetAccountResponse],
)
def list_target_accounts(
    organization_id: str,
    search: str | None = None,
    qualification_status: QualificationStatus | None = None,
    db: Session = Depends(get_db),
):
    ensure_organization_exists(db, organization_id)

    query = select(TargetAccount).where(
        TargetAccount.organization_id == organization_id
    )

    if search and search.strip():
        search_term = f"%{search.strip()}%"
        query = query.where(
            or_(
                TargetAccount.company_name.ilike(search_term),
                TargetAccount.industry.ilike(search_term),
                TargetAccount.location.ilike(search_term),
            )
        )

    if qualification_status:
        query = query.where(
            TargetAccount.qualification_status == qualification_status
        )

    query = query.order_by(TargetAccount.created_at.desc())
    return db.scalars(query).all()


@router.post(
    "/organizations/{organization_id}/target-accounts",
    response_model=TargetAccountResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_target_account(
    organization_id: str,
    data: TargetAccountCreate,
    db: Session = Depends(get_db),
):
    ensure_organization_exists(db, organization_id)

    company_name = data.company_name.strip()
    if not company_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Company name cannot be blank.",
        )

    account = TargetAccount(
        organization_id=organization_id,
        company_name=company_name,
        website=data.website,
        industry=data.industry,
        employee_range=data.employee_range,
        location=data.location,
        notes=data.notes,
    )

    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.put(
    "/organizations/{organization_id}/target-accounts/{account_id}",
    response_model=TargetAccountResponse,
)
def update_target_account(
    organization_id: str,
    account_id: str,
    data: TargetAccountUpdate,
    db: Session = Depends(get_db),
):
    ensure_organization_exists(db, organization_id)
    account = get_target_account(db, organization_id, account_id)

    updates = data.model_dump(exclude_unset=True)

    if "company_name" in updates:
        company_name = updates["company_name"]
        if company_name is None or not company_name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Company name cannot be blank.",
            )
        updates["company_name"] = company_name.strip()

    if (
        "qualification_status" in updates
        and updates["qualification_status"] is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Qualification status cannot be blank.",
        )

    for field, value in updates.items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)
    return account