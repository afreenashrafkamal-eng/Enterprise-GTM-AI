from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MarketingIntelligenceReport(Base):
    __tablename__ = "marketing_intelligence_reports"
    __table_args__ = (
        Index(
            "ix_marketing_intelligence_org_created",
            "organization_id",
            "created_at",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    filters: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    report: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    web_search_calls: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    usage_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
