"""ticket educational program

Revision ID: c4f2a8b6d1e9
Revises: 9d3e5f7a2c10
Create Date: 2026-05-20 12:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f2a8b6d1e9"
down_revision: Union[str, Sequence[str], None] = "9d3e5f7a2c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column("educational_program_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_tickets_educational_program_id_educational_programs",
        "tickets",
        "educational_programs",
        ["educational_program_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_tickets_educational_program_id_educational_programs",
        "tickets",
        type_="foreignkey",
    )
    op.drop_column("tickets", "educational_program_id")
