"""link workspaces to organizations

Revision ID: 8fcbd009610b
Revises: 229f76e2bbde
Create Date: 2026-11-20 23:29:40.883654
"""

from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "8fcbd009610b"
down_revision: Union[str, Sequence[str], None] = "229f76e2bbde"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the organization reference temporarily as nullable.
    op.add_column(
        "workspaces",
        sa.Column("organization_id", sa.String(length=36), nullable=True),
    )

    # Create a default organization for existing workspace data.
    default_organization_id = str(uuid4())

    op.execute(
        sa.text(
            """
            INSERT INTO organizations (
                id,
                name,
                slug,
                status,
                created_at,
                updated_at
            )
            VALUES (
                :id,
                'Default Organization',
                'default-organization',
                'active',
                NOW(),
                NOW()
            )
            """
        ).bindparams(id=default_organization_id)
    )

    # Link existing workspaces to the default organization.
    op.execute(
        sa.text(
            """
            UPDATE workspaces
            SET organization_id = :organization_id
            WHERE organization_id IS NULL
            """
        ).bindparams(organization_id=default_organization_id)
    )

    # Make organization ownership mandatory.
    op.alter_column(
        "workspaces",
        "organization_id",
        existing_type=sa.String(length=36),
        nullable=False,
    )

    op.create_index(
        "ix_workspaces_organization_id",
        "workspaces",
        ["organization_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_workspaces_organization_id_organizations",
        "workspaces",
        "organizations",
        ["organization_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_workspaces_organization_id_organizations",
        "workspaces",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_workspaces_organization_id",
        table_name="workspaces",
    )

    op.drop_column("workspaces", "organization_id")

    op.execute(
        sa.text(
            "DELETE FROM organizations WHERE slug = 'default-organization'"
        )
    )