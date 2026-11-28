"""store encrypted CRM connections per client workspace

Revision ID: c4e8a71d9f20
Revises: b1a6c8d203ef
Create Date: 2026-11-28 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4e8a71d9f20"
down_revision: Union[str, Sequence[str], None] = "b1a6c8d203ef"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crm_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=False),
        sa.Column("portal_id", sa.String(length=100), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "provider", name="uq_crm_connection_org_provider"),
    )
    op.create_index("ix_crm_connections_organization_id", "crm_connections", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_crm_connections_organization_id", table_name="crm_connections")
    op.drop_table("crm_connections")
