from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator


QualificationStatus = Literal["new", "qualified", "disqualified"]


def normalize_evidence_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    value = value.strip()
    parsed = urlsplit(value)
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.netloc
        or any(character.isspace() for character in value)
    ):
        raise ValueError("Evidence URL must be a valid HTTP or HTTPS link.")
    return value


class TargetAccountCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    website: str | None = None
    industry: str | None = None
    employee_range: str | None = None
    location: str | None = None
    notes: str | None = None
    outreach_reason: str | None = Field(default=None, max_length=2000)
    evidence_url: str | None = Field(default=None, max_length=2000)

    @field_validator("evidence_url")
    @classmethod
    def valid_evidence_url(cls, value: str | None) -> str | None:
        return normalize_evidence_url(value)


class TargetAccountUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    website: str | None = None
    industry: str | None = None
    employee_range: str | None = None
    location: str | None = None
    notes: str | None = None
    outreach_reason: str | None = Field(default=None, max_length=2000)
    evidence_url: str | None = Field(default=None, max_length=2000)
    qualification_status: QualificationStatus | None = None

    @field_validator("evidence_url")
    @classmethod
    def valid_evidence_url(cls, value: str | None) -> str | None:
        return normalize_evidence_url(value)


class TargetAccountResponse(BaseModel):
    id: str
    organization_id: str
    company_name: str
    website: str | None
    industry: str | None
    employee_range: str | None
    location: str | None
    notes: str | None
    outreach_reason: str | None
    evidence_url: str | None
    qualification_status: QualificationStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
