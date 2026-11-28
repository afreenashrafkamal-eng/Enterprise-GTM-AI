"""store encrypted regional phone provider connections per client

Revision ID: d7a1c9f3b640
Revises: c4e8a71d9f20
Create Date: 2026-11-28 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7a1c9f3b640"
down_revision: Union[str, Sequence[str], None] = "c4e8a71d9f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "phone_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("account_sid", sa.String(length=150), nullable=False),
        sa.Column("agent_number", sa.String(length=30), nullable=False),
        sa.Column("caller_id", sa.String(length=30), nullable=False),
        sa.Column("credentials_encrypted", sa.Text(), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "provider", name="uq_phone_connection_org_provider"),
    )
    op.create_index("ix_phone_connections_organization_id", "phone_connections", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_phone_connections_organization_id", table_name="phone_connections")
    op.drop_table("phone_connections")
