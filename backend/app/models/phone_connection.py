from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PhoneConnection(Base):
    __tablename__ = "phone_connections"
    __table_args__ = (UniqueConstraint("organization_id", "provider", "region", name="uq_phone_connection_org_provider_region"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False, default="exotel")
    region: Mapped[str] = mapped_column(String(2), nullable=False, default="IN")
    account_sid: Mapped[str] = mapped_column(String(150), nullable=False)
    agent_number: Mapped[str] = mapped_column(String(30), nullable=False)
    caller_id: Mapped[str] = mapped_column(String(30), nullable=False)
    credentials_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
