"""service reception window

Revision ID: b4d2a6c8e9f1
Revises: 3b8e1a6f4c92
Create Date: 2026-06-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4d2a6c8e9f1"
down_revision: Union[str, Sequence[str], None] = "3b8e1a6f4c92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("reception_window_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_services_reception_window_id_windows",
        "services",
        "windows",
        ["reception_window_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_services_reception_window_id_windows",
        "services",
        type_="foreignkey",
    )
    op.drop_column("services", "reception_window_id")
