"""record model and web-search usage for each prospect campaign

Revision ID: b1a6c8d203ef
Revises: 9d12eac743b8
Create Date: 2026-11-27 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1a6c8d203ef"
down_revision: Union[str, Sequence[str], None] = "9d12eac743b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("prospecting_campaigns", sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False))
    op.add_column("prospecting_campaigns", sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False))
    op.add_column("prospecting_campaigns", sa.Column("web_search_calls", sa.Integer(), server_default="0", nullable=False))
    op.add_column("prospecting_campaigns", sa.Column("usage_model", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("prospecting_campaigns", "usage_model")
    op.drop_column("prospecting_campaigns", "web_search_calls")
    op.drop_column("prospecting_campaigns", "output_tokens")
    op.drop_column("prospecting_campaigns", "input_tokens")
