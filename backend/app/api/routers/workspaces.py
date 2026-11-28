from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import ensure_organization_access, get_current_user
from app.db.dependencies import get_db
from app.models.organization import Organization
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse
from app.models.user import User


router = APIRouter(
    prefix="/workspaces",
    tags=["Workspaces"],
)


@router.post(
    "/",
    response_model=WorkspaceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace(
    workspace_data: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_organization_access(db, current_user, workspace_data.organization_id)
    organization = db.get(Organization, workspace_data.organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    existing_workspace = db.scalar(
        select(Workspace).where(Workspace.slug == workspace_data.slug)
    )
    if existing_workspace:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workspace slug already exists.",
        )

    workspace = Workspace(
        organization_id=workspace_data.organization_id,
        name=workspace_data.name,
        slug=workspace_data.slug,
    )

    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace


@router.get(
    "/",
    response_model=list[WorkspaceResponse],
)
def list_workspaces(
    organization_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_organization_access(db, current_user, organization_id)
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )

    return db.scalars(
        select(Workspace)
        .where(Workspace.organization_id == organization_id)
        .order_by(Workspace.created_at.desc())
    ).all()
