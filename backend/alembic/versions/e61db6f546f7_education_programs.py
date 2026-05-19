"""education programs

Revision ID: e61db6f546f7
Revises: d1e35b57a426
Create Date: 2026-05-19 17:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e61db6f546f7"
down_revision: Union[str, Sequence[str], None] = "d1e35b57a426"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "academic_degrees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "educational_programs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("academic_degree_id", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["academic_degree_id"], ["academic_degrees.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_table(
        "operator_educational_programs",
        sa.Column("operator_id", sa.Uuid(), nullable=False),
        sa.Column("educational_program_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["educational_program_id"], ["educational_programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operator_id"], ["operators.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("operator_id", "educational_program_id"),
    )


def downgrade() -> None:
    op.drop_table("operator_educational_programs")
    op.drop_table("educational_programs")
    op.drop_table("academic_degrees")
