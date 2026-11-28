"""add pilot message drafts

Revision ID: 6ab98f04d1c3
Revises: a8d4c1f932e0
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6ab98f04d1c3"
down_revision: Union[str, Sequence[str], None] = "a8d4c1f932e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "outbound_strategies",
        sa.Column(
            "pilot_message_drafts",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("outbound_strategies", "pilot_message_drafts")
