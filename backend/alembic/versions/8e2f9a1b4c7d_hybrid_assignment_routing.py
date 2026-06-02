"""hybrid assignment routing

Revision ID: 8e2f9a1b4c7d
Revises: 7b9d2e4f6a10
Create Date: 2026-05-28 16:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8e2f9a1b4c7d"
down_revision: Union[str, Sequence[str], None] = "7b9d2e4f6a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "operator_academic_degrees",
        sa.Column("operator_id", sa.Uuid(), nullable=False),
        sa.Column("academic_degree_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["academic_degree_id"], ["academic_degrees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operator_id"], ["operators.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("operator_id", "academic_degree_id"),
    )

    op.add_column("tickets", sa.Column("academic_degree_id", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("routing_key", sa.String(length=255), nullable=True))
    op.add_column("tickets", sa.Column("assignment_score", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tickets_academic_degree_id_academic_degrees",
        "tickets",
        "academic_degrees",
        ["academic_degree_id"],
        ["id"],
    )

    op.execute(
        """
        UPDATE tickets
        SET academic_degree_id = educational_programs.academic_degree_id
        FROM educational_programs
        WHERE tickets.educational_program_id = educational_programs.id
        """
    )
    op.execute(
        """
        UPDATE tickets
        SET routing_key = concat_ws(
            '.',
            coalesce(lower(replace(academic_degrees.code, ' ', '_')), 'any_degree'),
            coalesce(lower(replace(educational_programs.code, ' ', '_')), 'any_program'),
            coalesce(lower(replace(services.code, ' ', '_')), concat('service_', tickets.service_id::text))
        )
        FROM services, educational_programs, academic_degrees
        WHERE services.id = tickets.service_id
          AND educational_programs.id = tickets.educational_program_id
          AND academic_degrees.id = educational_programs.academic_degree_id
        """
    )
    op.execute(
        """
        UPDATE tickets
        SET routing_key = concat_ws(
            '.',
            'any_degree',
            'any_program',
            coalesce(lower(replace(services.code, ' ', '_')), concat('service_', tickets.service_id::text))
        )
        FROM services
        WHERE services.id = tickets.service_id
          AND tickets.routing_key IS NULL
        """
    )

    op.create_index("ix_tickets_assignment_lookup", "tickets", ["status", "operator_id", "service_id"])
    op.create_index("ix_tickets_routing_key", "tickets", ["routing_key"])
    op.create_index("ix_tickets_academic_degree_id", "tickets", ["academic_degree_id"])


def downgrade() -> None:
    op.drop_index("ix_tickets_academic_degree_id", table_name="tickets")
    op.drop_index("ix_tickets_routing_key", table_name="tickets")
    op.drop_index("ix_tickets_assignment_lookup", table_name="tickets")
    op.drop_constraint("fk_tickets_academic_degree_id_academic_degrees", "tickets", type_="foreignkey")
    op.drop_column("tickets", "assignment_score")
    op.drop_column("tickets", "routing_key")
    op.drop_column("tickets", "academic_degree_id")
    op.drop_table("operator_academic_degrees")
