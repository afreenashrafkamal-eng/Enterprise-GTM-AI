"""add organization-scoped manual call history and follow-up queue

Revision ID: 9d12eac743b8
Revises: 8b2f9c6a41d0
Create Date: 2026-11-27 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9d12eac743b8"
down_revision: Union[str, Sequence[str], None] = "8b2f9c6a41d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "target_contacts",
        sa.Column("do_not_contact", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.create_table(
        "call_activities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("target_account_id", sa.String(length=36), nullable=False),
        sa.Column("target_contact_id", sa.String(length=36), nullable=False),
        sa.Column("called_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("outcome", sa.String(length=24), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("follow_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("follow_up_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "outcome IN ('connected', 'voicemail', 'no_answer', 'busy', 'wrong_number', 'do_not_call')",
            name="ck_call_activities_outcome",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_account_id"], ["target_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_contact_id"], ["target_contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_call_activities_org_called", "call_activities", ["organization_id", "called_at"])
    op.create_index("ix_call_activities_org_followup", "call_activities", ["organization_id", "follow_up_at"])
    op.create_index("ix_call_activities_organization_id", "call_activities", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_call_activities_organization_id", table_name="call_activities")
    op.drop_index("ix_call_activities_org_followup", table_name="call_activities")
    op.drop_index("ix_call_activities_org_called", table_name="call_activities")
    op.drop_table("call_activities")
    op.drop_column("target_contacts", "do_not_contact")
