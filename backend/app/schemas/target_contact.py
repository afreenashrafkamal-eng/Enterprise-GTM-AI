from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


EmailStatus = Literal["not_checked", "verified", "invalid"]
QualificationStatus = Literal["new", "qualified", "disqualified"]


class TargetContactCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    job_title: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    linkedin_url: str | None = Field(default=None, max_length=500)
    source_url: str | None = Field(default=None, max_length=1000)
    email_status: EmailStatus = "not_checked"
    qualification_status: QualificationStatus = "new"
    do_not_contact: bool = False


class TargetContactUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    job_title: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    linkedin_url: str | None = Field(default=None, max_length=500)
    source_url: str | None = Field(default=None, max_length=1000)
    email_status: EmailStatus | None = None
    qualification_status: QualificationStatus | None = None
    do_not_contact: bool | None = None


class TargetContactResponse(BaseModel):
    id: str
    target_account_id: str
    first_name: str
    last_name: str | None
    job_title: str | None
    email: str | None
    phone: str | None
    linkedin_url: str | None
    source_url: str | None
    email_status: EmailStatus
    qualification_status: QualificationStatus
    do_not_contact: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
