from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.api.dependencies import require_organization_access
from app.models.company_profile import CompanyProfile
from app.models.organization import Organization
from app.schemas.company_profile import (
    CompanyProfileCreate,
    CompanyProfileUpdate,
    CompanyProfileResponse,
)

router = APIRouter(
    prefix="/organizations",
    tags=["Company Profile"],
    dependencies=[Depends(require_organization_access)],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_organization(db: Session, organization_id: str):
    organization = db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


@router.post(
    "/{organization_id}/company-profile",
    response_model=CompanyProfileResponse,
)
def create_company_profile(
    organization_id: str,
    data: CompanyProfileCreate,
    db: Session = Depends(get_db),
):
    get_organization(db, organization_id)

    existing = db.scalar(
        select(CompanyProfile).where(
            CompanyProfile.organization_id == organization_id
        )
    )

    if existing:
        raise HTTPException(status_code=409, detail="Company profile already exists")

    profile = CompanyProfile(
        organization_id=organization_id,
        **data.model_dump(),
    )

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get(
    "/{organization_id}/company-profile",
    response_model=CompanyProfileResponse,
)
def get_company_profile(
    organization_id: str,
    db: Session = Depends(get_db),
):
    profile = db.scalar(
        select(CompanyProfile).where(
            CompanyProfile.organization_id == organization_id
        )
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Company profile not found")

    return profile


@router.put(
    "/{organization_id}/company-profile",
    response_model=CompanyProfileResponse,
)
def update_company_profile(
    organization_id: str,
    data: CompanyProfileUpdate,
    db: Session = Depends(get_db),
):
    profile = db.scalar(
        select(CompanyProfile).where(
            CompanyProfile.organization_id == organization_id
        )
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Company profile not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile
