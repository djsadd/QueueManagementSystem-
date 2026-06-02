"""service requires educational program

Revision ID: d7a3b9f0c2e1
Revises: c4f2a8b6d1e9
Create Date: 2026-05-20 13:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d7a3b9f0c2e1"
down_revision: Union[str, Sequence[str], None] = "c4f2a8b6d1e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column(
            "requires_educational_program",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(
        """
        UPDATE services
        SET requires_educational_program = true
        WHERE lower(coalesce(name, '') || ' ' || coalesce(code, '')) LIKE '%заяв%'
          AND (
            lower(coalesce(name, '') || ' ' || coalesce(code, '')) LIKE '%скан%'
            OR lower(coalesce(name, '') || ' ' || coalesce(code, '')) LIKE '%scan%'
          )
        """
    )
    op.alter_column("services", "requires_educational_program", server_default=None)


def downgrade() -> None:
    op.drop_column("services", "requires_educational_program")
