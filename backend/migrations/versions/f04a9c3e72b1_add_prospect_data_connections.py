"""save prospect-data provider credentials per client workspace

Revision ID: f04a9c3e72b1
Revises: e17b6c4a92d1
Create Date: 2026-11-28 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f04a9c3e72b1"
down_revision: Union[str, Sequence[str], None] = "e17b6c4a92d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prospect_data_connections",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False),
        sa.Column("credentials_encrypted", sa.Text(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "provider", name="uq_prospect_data_connection_org_provider"),
    )
    op.create_index("ix_prospect_data_connections_organization_id", "prospect_data_connections", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_prospect_data_connections_organization_id", table_name="prospect_data_connections")
    op.drop_table("prospect_data_connections")
