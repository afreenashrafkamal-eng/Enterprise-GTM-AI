from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CallActivity(Base):
    __tablename__ = "call_activities"

    __table_args__ = (
        CheckConstraint(
            "outcome IN ('connected', 'voicemail', 'no_answer', 'busy', 'wrong_number', 'do_not_call')",
            name="ck_call_activities_outcome",
        ),
        Index("ix_call_activities_org_called", "organization_id", "called_at"),
        Index("ix_call_activities_org_followup", "organization_id", "follow_up_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    target_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("target_accounts.id", ondelete="CASCADE"), nullable=False)
    target_contact_id: Mapped[str] = mapped_column(String(36), ForeignKey("target_contacts.id", ondelete="CASCADE"), nullable=False)
    called_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    outcome: Mapped[str] = mapped_column(String(24), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    follow_up_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
