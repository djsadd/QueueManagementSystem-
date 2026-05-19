"""add applicants

Revision ID: a8f6f2c7d9b1
Revises: e61db6f546f7
Create Date: 2026-05-19 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8f6f2c7d9b1"
down_revision: Union[str, Sequence[str], None] = "e61db6f546f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "applicants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("iin", sa.String(length=12), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("iin"),
    )


def downgrade() -> None:
    op.drop_table("applicants")
