"""applicant born date

Revision ID: 0f9d8c7b6a5e
Revises: d8e3f1a9b4c2
Create Date: 2026-07-28 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0f9d8c7b6a5e"
down_revision: Union[str, Sequence[str], None] = "d8e3f1a9b4c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("applicants", sa.Column("born_date", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("applicants", "born_date")
