"""add pilot plan to outbound strategy

Revision ID: a8d4c1f932e0
Revises: f17a3d2c91b4
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a8d4c1f932e0"
down_revision: Union[str, Sequence[str], None] = "f17a3d2c91b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "outbound_strategies",
        sa.Column("pilot_goal", sa.Text(), nullable=True),
    )
    op.add_column(
        "outbound_strategies",
        sa.Column(
            "pilot_account_ids",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
    )
    op.add_column(
        "outbound_strategies",
        sa.Column(
            "pilot_touches",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("outbound_strategies", "pilot_touches")
    op.drop_column("outbound_strategies", "pilot_account_ids")
    op.drop_column("outbound_strategies", "pilot_goal")
