"""operator program study languages

Revision ID: 6f8b0c2d4e91
Revises: 5e7a9c1d2b30
Create Date: 2026-06-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f8b0c2d4e91"
down_revision: Union[str, Sequence[str], None] = "5e7a9c1d2b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "operator_educational_programs",
        sa.Column("study_languages", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("operator_educational_programs", "study_languages")
