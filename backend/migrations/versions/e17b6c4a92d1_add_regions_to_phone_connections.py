"""allow a separate phone provider connection for each market

Revision ID: e17b6c4a92d1
Revises: d7a1c9f3b640
Create Date: 2026-11-28 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e17b6c4a92d1"
down_revision: Union[str, Sequence[str], None] = "d7a1c9f3b640"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("phone_connections", sa.Column("region", sa.String(length=2), nullable=False, server_default="IN"))
    op.drop_constraint("uq_phone_connection_org_provider", "phone_connections", type_="unique")
    op.create_unique_constraint(
        "uq_phone_connection_org_provider_region",
        "phone_connections",
        ["organization_id", "provider", "region"],
    )
    op.alter_column("phone_connections", "region", server_default=None)


def downgrade() -> None:
    op.drop_constraint("uq_phone_connection_org_provider_region", "phone_connections", type_="unique")
    op.create_unique_constraint("uq_phone_connection_org_provider", "phone_connections", ["organization_id", "provider"])
    op.drop_column("phone_connections", "region")
