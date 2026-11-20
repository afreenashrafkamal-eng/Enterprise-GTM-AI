import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WorkspaceRole(Base):
    __tablename__ = "workspace_roles"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    workspace_membership_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("workspace_memberships.id"),
        nullable=False,
        index=True,
    )

    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    assigned_by_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_membership_id",
            "role",
            name="uq_workspace_roles_membership_role",
        ),
    )