"""educational program service language flag

Revision ID: 3b8e1a6f4c92
Revises: 6f8b0c2d4e91
Create Date: 2026-06-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3b8e1a6f4c92"
down_revision: Union[str, Sequence[str], None] = "6f8b0c2d4e91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "educational_programs",
        sa.Column(
            "requires_service_language",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.alter_column("educational_programs", "requires_service_language", server_default=None)


def downgrade() -> None:
    op.drop_column("educational_programs", "requires_service_language")
