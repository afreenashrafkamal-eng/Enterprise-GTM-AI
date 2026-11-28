"""add account-level outreach evidence

Revision ID: d4e7a91c2b60
Revises: 6ab98f04d1c3
Create Date: 2026-11-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e7a91c2b60"
down_revision: Union[str, Sequence[str], None] = "6ab98f04d1c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "target_accounts",
        sa.Column("outreach_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "target_accounts",
        sa.Column("evidence_url", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("target_accounts", "evidence_url")
    op.drop_column("target_accounts", "outreach_reason")
