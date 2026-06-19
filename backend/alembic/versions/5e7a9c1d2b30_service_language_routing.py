"""service language routing

Revision ID: 5e7a9c1d2b30
Revises: 1a2b3c4d5e6f
Create Date: 2026-06-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5e7a9c1d2b30"
down_revision: Union[str, Sequence[str], None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column(
            "requires_service_language",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("services", "requires_service_language", server_default=None)

    op.add_column(
        "tickets",
        sa.Column("service_language", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "operator_services",
        sa.Column("service_languages", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("operator_services", "service_languages")
    op.drop_column("tickets", "service_language")
    op.drop_column("services", "requires_service_language")
