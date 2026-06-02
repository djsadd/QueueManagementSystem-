"""ticket study language

Revision ID: 6a8c4e2f1b90
Revises: 4c1b2d3e5f6a
Create Date: 2026-05-25 15:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6a8c4e2f1b90"
down_revision: Union[str, Sequence[str], None] = "4c1b2d3e5f6a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("study_language", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tickets", "study_language")
