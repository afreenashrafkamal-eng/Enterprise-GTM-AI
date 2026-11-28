"""add organization-scoped marketing intelligence reports

Revision ID: a7c4d9e2f610
Revises: f04a9c3e72b1
Create Date: 2026-11-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c4d9e2f610"
down_revision: Union[str, Sequence[str], None] = "f04a9c3e72b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "marketing_intelligence_reports",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("web_search_calls", sa.Integer(), server_default="0", nullable=False),
        sa.Column("usage_model", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_marketing_intelligence_reports_organization_id",
        "marketing_intelligence_reports",
        ["organization_id"],
    )
    op.create_index(
        "ix_marketing_intelligence_org_created",
        "marketing_intelligence_reports",
        ["organization_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_marketing_intelligence_org_created", table_name="marketing_intelligence_reports")
    op.drop_index("ix_marketing_intelligence_reports_organization_id", table_name="marketing_intelligence_reports")
    op.drop_table("marketing_intelligence_reports")
