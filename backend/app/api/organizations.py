import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.organization import Organization


router = APIRouter(prefix="/organizations", tags=["Organizations"])


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


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


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
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
    db.commit()
    db.refresh(organization)
    return organization