from pydantic import BaseModel, ConfigDict
from datetime import datetime


class CompanyProfileCreate(BaseModel):
    website: str | None = None
    company_description: str | None = None
    industry: str | None = None
    products_services: str | None = None
    target_market: str | None = None
    company_size: str | None = None


class CompanyProfileUpdate(BaseModel):
    website: str | None = None
    company_description: str | None = None
    industry: str | None = None
    products_services: str | None = None
    target_market: str | None = None
    company_size: str | None = None


class CompanyProfileResponse(BaseModel):
    id: str
    organization_id: str
    website: str | None
    company_description: str | None
    industry: str | None
    products_services: str | None
    target_market: str | None
    company_size: str | None
    profile_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)