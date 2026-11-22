from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.company_profiles import get_db, get_organization
from app.models.ideal_customer_profile import IdealCustomerProfile
from app.schemas.ideal_customer_profile import (
    IdealCustomerProfileCreate,
    IdealCustomerProfileResponse,
    IdealCustomerProfileUpdate,
)


router = APIRouter(prefix="/organizations", tags=["Ideal Customer Profile"])


@router.post(
    "/{organization_id}/ideal-customer-profile",
    response_model=IdealCustomerProfileResponse,
    status_code=201,
)
def create_ideal_customer_profile(
    organization_id: str,
    data: IdealCustomerProfileCreate,
    db: Session = Depends(get_db),
):
    get_organization(db, organization_id)

    existing_profile = db.scalar(
        select(IdealCustomerProfile).where(
            IdealCustomerProfile.organization_id == organization_id
        )
    )
    if existing_profile:
        raise HTTPException(
            status_code=409,
            detail="An ideal customer profile already exists for this organization",
        )

    profile = IdealCustomerProfile(
        organization_id=organization_id,
        **data.model_dump(),
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get(
    "/{organization_id}/ideal-customer-profile",
    response_model=IdealCustomerProfileResponse,
)
def get_ideal_customer_profile(
    organization_id: str,
    db: Session = Depends(get_db),
):
    profile = db.scalar(
        select(IdealCustomerProfile).where(
            IdealCustomerProfile.organization_id == organization_id
        )
    )
    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Ideal customer profile not found",
        )

    return profile


@router.put(
    "/{organization_id}/ideal-customer-profile",
    response_model=IdealCustomerProfileResponse,
)
def update_ideal_customer_profile(
    organization_id: str,
    data: IdealCustomerProfileUpdate,
    db: Session = Depends(get_db),
):
    profile = db.scalar(
        select(IdealCustomerProfile).where(
            IdealCustomerProfile.organization_id == organization_id
        )
    )
    if not profile:
        raise HTTPException(
            status_code=404,
            detail="Ideal customer profile not found",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return profile