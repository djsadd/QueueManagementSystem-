"""operator services

Revision ID: 4c1b2d3e5f6a
Revises: d7a3b9f0c2e1
Create Date: 2026-05-20 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4c1b2d3e5f6a"
down_revision: Union[str, Sequence[str], None] = "d7a3b9f0c2e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operator_services",
        sa.Column("operator_id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["operator_id"], ["operators.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("operator_id", "service_id"),
    )


def downgrade() -> None:
    op.drop_table("operator_services")
