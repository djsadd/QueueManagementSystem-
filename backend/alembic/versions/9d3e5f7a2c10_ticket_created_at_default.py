"""ticket created at default

Revision ID: 9d3e5f7a2c10
Revises: f2c8d0a1b9e4
Create Date: 2026-05-20 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9d3e5f7a2c10"
down_revision: Union[str, Sequence[str], None] = "f2c8d0a1b9e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("tickets", "created_at", server_default=sa.text("now()"))


def downgrade() -> None:
    op.alter_column("tickets", "created_at", server_default=None)
