"""create organization-scoped prospecting campaigns

Revision ID: c84a7d1e920f
Revises: d4e7a91c2b60
Create Date: 2026-11-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c84a7d1e920f"
down_revision: Union[str, Sequence[str], None] = "d4e7a91c2b60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prospecting_campaigns",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("search_locations", sa.JSON(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("prospects", sa.JSON(), nullable=False),
        sa.Column("selected_indices", sa.JSON(), nullable=False),
        sa.Column(
            "send_requested",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_prospecting_campaigns_organization_id",
        "prospecting_campaigns",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_prospecting_campaigns_organization_created",
        "prospecting_campaigns",
        ["organization_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_prospecting_campaigns_organization_created",
        table_name="prospecting_campaigns",
    )
    op.drop_index(
        "ix_prospecting_campaigns_organization_id",
        table_name="prospecting_campaigns",
    )
    op.drop_table("prospecting_campaigns")
