import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IdealCustomerProfile(Base):
    __tablename__ = "ideal_customer_profiles"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )

    industries: Mapped[str | None] = mapped_column(Text, nullable=True)
    employee_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    revenue_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    geographic_focus: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_titles: Mapped[str | None] = mapped_column(Text, nullable=True)
    pain_points: Mapped[str | None] = mapped_column(Text, nullable=True)
    excluded_segments: Mapped[str | None] = mapped_column(Text, nullable=True)

    profile_status: Mapped[str] = mapped_column(
        String(20),
        default="draft",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            name="uq_ideal_customer_profiles_organization",
        ),
    )