from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TargetContact(Base):
    __tablename__ = "target_contacts"

    __table_args__ = (
        CheckConstraint(
            "email_status IN ('not_checked', 'verified', 'invalid')",
            name="ck_target_contacts_email_status",
        ),
        CheckConstraint(
            "qualification_status IN ('new', 'qualified', 'disqualified')",
            name="ck_target_contacts_qualification_status",
        ),
        Index(
            "ix_target_contacts_account_status",
            "target_account_id",
            "qualification_status",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    target_account_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("target_accounts.id"),
        nullable=False,
        index=True,
    )

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    email_status: Mapped[str] = mapped_column(
        String(20),
        default="not_checked",
        server_default="not_checked",
        nullable=False,
    )

    qualification_status: Mapped[str] = mapped_column(
        String(20),
        default="new",
        server_default="new",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )