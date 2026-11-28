from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProspectingCampaign(Base):
    __tablename__ = "prospecting_campaigns"

    __table_args__ = (
        Index(
            "ix_prospecting_campaigns_organization_created",
            "organization_id",
            "created_at",
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
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    search_locations: Mapped[list[dict[str, str]]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    prospects: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    selected_indices: Mapped[list[int]] = mapped_column(
        JSON,
        default=list,
        nullable=False,
    )
    send_requested: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    web_search_calls: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    usage_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
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
