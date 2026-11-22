from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IdealCustomerProfileCreate(BaseModel):
    industries: str | None = None
    employee_range: str | None = None
    revenue_range: str | None = None
    geographic_focus: str | None = None
    buyer_titles: str | None = None
    pain_points: str | None = None
    excluded_segments: str | None = None


class IdealCustomerProfileUpdate(BaseModel):
    industries: str | None = None
    employee_range: str | None = None
    revenue_range: str | None = None
    geographic_focus: str | None = None
    buyer_titles: str | None = None
    pain_points: str | None = None
    excluded_segments: str | None = None


class IdealCustomerProfileResponse(BaseModel):
    id: str
    organization_id: str
    industries: str | None
    employee_range: str | None
    revenue_range: str | None
    geographic_focus: str | None
    buyer_titles: str | None
    pain_points: str | None
    excluded_segments: str | None
    profile_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)