from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


QualificationStatus = Literal["new", "qualified", "disqualified"]


class TargetAccountCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    website: str | None = None
    industry: str | None = None
    employee_range: str | None = None
    location: str | None = None
    notes: str | None = None


class TargetAccountUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    website: str | None = None
    industry: str | None = None
    employee_range: str | None = None
    location: str | None = None
    notes: str | None = None
    qualification_status: QualificationStatus | None = None


class TargetAccountResponse(BaseModel):
    id: str
    organization_id: str
    company_name: str
    website: str | None
    industry: str | None
    employee_range: str | None
    location: str | None
    notes: str | None
    qualification_status: QualificationStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)