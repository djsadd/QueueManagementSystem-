"""add operators

Revision ID: c92a9644d61a
Revises: ba3393f7848f
Create Date: 2026-05-19 17:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c92a9644d61a"
down_revision: Union[str, Sequence[str], None] = "ba3393f7848f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    operator_status = postgresql.ENUM(
        "ONLINE",
        "OFFLINE",
        "BUSY",
        "BREAK",
        name="operatorstatus",
        create_type=False,
    )
    operator_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "operators",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("window_id", sa.Uuid(), nullable=True),
        sa.Column("status", operator_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("operators")
    sa.Enum(name="operatorstatus").drop(op.get_bind(), checkfirst=True)
