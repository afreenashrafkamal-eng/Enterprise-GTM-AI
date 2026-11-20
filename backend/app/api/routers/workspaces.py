from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse


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
):
    existing_workspace = db.scalar(
        select(Workspace).where(
            Workspace.slug == workspace_data.slug
        )
    )

    if existing_workspace:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workspace slug already exists.",
        )

    workspace = Workspace(
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
    db: Session = Depends(get_db),
):
    workspaces = db.scalars(
        select(Workspace).order_by(Workspace.created_at.desc())
    ).all()

    return workspaces