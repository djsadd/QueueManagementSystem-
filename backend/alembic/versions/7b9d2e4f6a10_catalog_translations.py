"""catalog translations

Revision ID: 7b9d2e4f6a10
Revises: 6a8c4e2f1b90
Create Date: 2026-05-26 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7b9d2e4f6a10"
down_revision: Union[str, Sequence[str], None] = "6a8c4e2f1b90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table_name in ("services", "educational_programs"):
        op.add_column(table_name, sa.Column("name_kk", sa.String(length=255), nullable=True))
        op.add_column(table_name, sa.Column("name_en", sa.String(length=255), nullable=True))
        op.execute(
            sa.text(
                f"UPDATE {table_name} SET name_kk = name, name_en = name "
                "WHERE name_kk IS NULL OR name_en IS NULL"
            )
        )
        op.alter_column(table_name, "name_kk", nullable=False)
        op.alter_column(table_name, "name_en", nullable=False)


def downgrade() -> None:
    for table_name in ("educational_programs", "services"):
        op.drop_column(table_name, "name_en")
        op.drop_column(table_name, "name_kk")
