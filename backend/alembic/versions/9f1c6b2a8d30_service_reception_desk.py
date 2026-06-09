"""service reception desk flag

Revision ID: 9f1c6b2a8d30
Revises: 8e2f9a1b4c7d
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9f1c6b2a8d30"
down_revision: Union[str, Sequence[str], None] = "8e2f9a1b4c7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column(
            "requires_reception_desk",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("services", "requires_reception_desk", server_default=None)


def downgrade() -> None:
    op.drop_column("services", "requires_reception_desk")
