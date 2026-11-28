from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OutboundStrategy(Base):
    __tablename__ = "outbound_strategies"

    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            name="uq_outbound_strategies_organization",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id"),
        nullable=False,
        index=True,
    )
    target_segment: Mapped[str | None] = mapped_column(Text, nullable=True)
    account_prioritization: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_and_problem: Mapped[str | None] = mapped_column(Text, nullable=True)
    value_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    channels_and_timing: Mapped[str | None] = mapped_column(Text, nullable=True)
    success_measures: Mapped[str | None] = mapped_column(Text, nullable=True)
    guardrails: Mapped[str | None] = mapped_column(Text, nullable=True)
    pilot_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    pilot_account_ids: Mapped[list[str]] = mapped_column(
        JSON,
        default=list,
        server_default="[]",
        nullable=False,
    )
    pilot_touches: Mapped[list[dict[str, str]]] = mapped_column(
        JSON,
        default=list,
        server_default="[]",
        nullable=False,
    )
    pilot_message_drafts: Mapped[list[dict[str, str | None]]] = mapped_column(
        JSON,
        default=list,
        server_default="[]",
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
