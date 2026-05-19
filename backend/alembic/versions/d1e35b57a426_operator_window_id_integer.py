"""operator window id integer

Revision ID: d1e35b57a426
Revises: c92a9644d61a
Create Date: 2026-05-19 17:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1e35b57a426"
down_revision: Union[str, Sequence[str], None] = "c92a9644d61a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "operators",
        "window_id",
        existing_type=sa.Uuid(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="NULL",
    )
    op.create_foreign_key(
        "operators_window_id_fkey",
        "operators",
        "windows",
        ["window_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("operators_window_id_fkey", "operators", type_="foreignkey")
    op.alter_column(
        "operators",
        "window_id",
        existing_type=sa.Integer(),
        type_=sa.Uuid(),
        existing_nullable=True,
        postgresql_using="NULL",
    )
