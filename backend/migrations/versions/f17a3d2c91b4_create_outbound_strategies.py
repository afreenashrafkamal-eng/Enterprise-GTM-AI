"""create outbound strategies

Revision ID: f17a3d2c91b4
Revises: eaf8f70feb39
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f17a3d2c91b4"
down_revision: Union[str, Sequence[str], None] = "eaf8f70feb39"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outbound_strategies",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("target_segment", sa.Text(), nullable=True),
        sa.Column("account_prioritization", sa.Text(), nullable=True),
        sa.Column("buyer_and_problem", sa.Text(), nullable=True),
        sa.Column("value_message", sa.Text(), nullable=True),
        sa.Column("channels_and_timing", sa.Text(), nullable=True),
        sa.Column("success_measures", sa.Text(), nullable=True),
        sa.Column("guardrails", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            name="uq_outbound_strategies_organization",
        ),
    )
    op.create_index(
        op.f("ix_outbound_strategies_organization_id"),
        "outbound_strategies",
        ["organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_outbound_strategies_organization_id"),
        table_name="outbound_strategies",
    )
    op.drop_table("outbound_strategies")
