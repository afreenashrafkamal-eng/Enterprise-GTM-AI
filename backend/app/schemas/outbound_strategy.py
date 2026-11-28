from datetime import datetime
import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.target_account import QualificationStatus


class PilotTouch(BaseModel):
    day: str = Field(min_length=1, max_length=30)
    channel: Literal["Email", "LinkedIn"]
    purpose: str = Field(min_length=1, max_length=500)


class PilotMessageDraft(BaseModel):
    account_id: str = Field(min_length=1, max_length=36)
    contact_id: str | None = Field(default=None, max_length=36)
    subject: str = Field(max_length=200)
    body: str = Field(max_length=10000)
    evidence_url: str | None = Field(default=None, max_length=2000)
    reviewed: bool = False

    @model_validator(mode="after")
    def reviewed_copy_has_no_placeholders(self):
        if self.reviewed and re.search(r"\[[^\]]+\]", f"{self.subject}\n{self.body}"):
            raise ValueError("Replace all bracketed placeholders before marking a draft reviewed.")
        source = urlsplit(self.evidence_url or "")
        if self.reviewed and (
            source.scheme.lower() not in {"http", "https"}
            or not source.netloc
            or any(character.isspace() for character in self.evidence_url or "")
        ):
            raise ValueError("Add an HTTP or HTTPS source for the account-specific reason before marking a draft reviewed.")
        return self


class PilotMessageDraftResponse(BaseModel):
    account_id: str
    contact_id: str | None = None
    subject: str
    body: str
    evidence_url: str | None = None
    reviewed: bool = False


class OutboundStrategyUpdate(BaseModel):
    target_segment: str | None = None
    account_prioritization: str | None = None
    buyer_and_problem: str | None = None
    value_message: str | None = None
    channels_and_timing: str | None = None
    success_measures: str | None = None
    guardrails: str | None = None
    pilot_goal: str | None = None
    pilot_account_ids: list[str] | None = Field(default=None, max_length=5)
    pilot_touches: list[PilotTouch] | None = Field(default=None, max_length=8)
    pilot_message_drafts: list[PilotMessageDraft] | None = Field(
        default=None,
        max_length=5,
    )


class OutboundStrategyResponse(OutboundStrategyUpdate):
    pilot_message_drafts: list[PilotMessageDraftResponse] | None = None
    id: str
    organization_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OutboundPriorityResponse(BaseModel):
    id: str
    company_name: str
    industry: str | None
    location: str | None
    outreach_reason: str | None
    evidence_url: str | None
    qualification_status: QualificationStatus
    contact_count: int
    qualified_contact_count: int
    verified_email_count: int
