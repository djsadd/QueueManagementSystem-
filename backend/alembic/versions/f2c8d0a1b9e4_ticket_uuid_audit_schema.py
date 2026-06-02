"""ticket uuid audit schema

Revision ID: f2c8d0a1b9e4
Revises: b7d4e2a9c6f3
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2c8d0a1b9e4"
down_revision: Union[str, Sequence[str], None] = "b7d4e2a9c6f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.drop_constraint("ticket_events_ticket_id_fkey", "ticket_events", type_="foreignkey")
    op.drop_constraint("queue_logs_ticket_id_fkey", "queue_logs", type_="foreignkey")

    op.add_column("tickets", sa.Column("id_uuid", sa.Uuid(), nullable=True))
    op.add_column("tickets", sa.Column("applicant_id", sa.Uuid(), nullable=True))
    op.add_column("tickets", sa.Column("operator_uuid", sa.Uuid(), nullable=True))
    op.add_column("tickets", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("ticket_events", sa.Column("ticket_uuid", sa.Uuid(), nullable=True))
    op.add_column("queue_logs", sa.Column("ticket_uuid", sa.Uuid(), nullable=True))
    op.add_column("queue_logs", sa.Column("operator_uuid", sa.Uuid(), nullable=True))

    op.execute("UPDATE tickets SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL")
    op.execute(
        """
        UPDATE ticket_events
        SET ticket_uuid = tickets.id_uuid
        FROM tickets
        WHERE ticket_events.ticket_id = tickets.id
        """
    )
    op.execute(
        """
        UPDATE queue_logs
        SET ticket_uuid = tickets.id_uuid
        FROM tickets
        WHERE queue_logs.ticket_id = tickets.id
        """
    )

    op.alter_column("tickets", "id_uuid", nullable=False)

    op.drop_constraint("tickets_pkey", "tickets", type_="primary")
    op.drop_column("ticket_events", "ticket_id")
    op.drop_column("queue_logs", "ticket_id")
    op.drop_column("queue_logs", "operator_id")
    op.drop_column("tickets", "id")
    op.drop_column("tickets", "full_name")
    op.drop_column("tickets", "iin")
    op.drop_column("tickets", "phone")
    op.drop_column("tickets", "operator_id")

    op.alter_column("tickets", "id_uuid", new_column_name="id")
    op.alter_column("tickets", "operator_uuid", new_column_name="operator_id")
    op.alter_column("ticket_events", "ticket_uuid", new_column_name="ticket_id")
    op.alter_column("queue_logs", "ticket_uuid", new_column_name="ticket_id")
    op.alter_column("queue_logs", "operator_uuid", new_column_name="operator_id")

    op.create_primary_key("tickets_pkey", "tickets", ["id"])
    op.create_foreign_key("tickets_applicant_id_fkey", "tickets", "applicants", ["applicant_id"], ["id"])
    op.create_foreign_key("tickets_operator_id_fkey", "tickets", "operators", ["operator_id"], ["id"])
    op.create_foreign_key("ticket_events_ticket_id_fkey", "ticket_events", "tickets", ["ticket_id"], ["id"])
    op.create_foreign_key("ticket_events_operator_id_fkey", "ticket_events", "operators", ["operator_id"], ["id"])
    op.create_foreign_key("queue_logs_ticket_id_fkey", "queue_logs", "tickets", ["ticket_id"], ["id"])
    op.create_foreign_key("queue_logs_operator_id_fkey", "queue_logs", "operators", ["operator_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("queue_logs_operator_id_fkey", "queue_logs", type_="foreignkey")
    op.drop_constraint("queue_logs_ticket_id_fkey", "queue_logs", type_="foreignkey")
    op.drop_constraint("ticket_events_operator_id_fkey", "ticket_events", type_="foreignkey")
    op.drop_constraint("ticket_events_ticket_id_fkey", "ticket_events", type_="foreignkey")
    op.drop_constraint("tickets_operator_id_fkey", "tickets", type_="foreignkey")
    op.drop_constraint("tickets_applicant_id_fkey", "tickets", type_="foreignkey")

    op.add_column("tickets", sa.Column("id_int", sa.Integer(), nullable=True))
    op.add_column("tickets", sa.Column("full_name", sa.String(length=255), nullable=True))
    op.add_column("tickets", sa.Column("iin", sa.String(length=12), nullable=True))
    op.add_column("tickets", sa.Column("phone", sa.String(length=20), nullable=True))
    op.add_column("tickets", sa.Column("operator_int", sa.Integer(), nullable=True))
    op.add_column("ticket_events", sa.Column("ticket_int", sa.Integer(), nullable=True))
    op.add_column("queue_logs", sa.Column("ticket_int", sa.Integer(), nullable=True))
    op.add_column("queue_logs", sa.Column("operator_int", sa.Integer(), nullable=True))

    op.execute(
        """
        WITH numbered AS (
            SELECT id, row_number() OVER (ORDER BY created_at, ticket_number)::integer AS new_id
            FROM tickets
        )
        UPDATE tickets
        SET id_int = numbered.new_id
        FROM numbered
        WHERE tickets.id = numbered.id
        """
    )
    op.execute(
        """
        UPDATE ticket_events
        SET ticket_int = tickets.id_int
        FROM tickets
        WHERE ticket_events.ticket_id = tickets.id
        """
    )
    op.execute(
        """
        UPDATE queue_logs
        SET ticket_int = tickets.id_int
        FROM tickets
        WHERE queue_logs.ticket_id = tickets.id
        """
    )

    op.execute("UPDATE tickets SET full_name = '' WHERE full_name IS NULL")
    op.execute("UPDATE tickets SET iin = '' WHERE iin IS NULL")
    op.execute("UPDATE tickets SET phone = '' WHERE phone IS NULL")

    op.alter_column("tickets", "id_int", nullable=False)
    op.alter_column("tickets", "full_name", nullable=False)
    op.alter_column("tickets", "iin", nullable=False)
    op.alter_column("tickets", "phone", nullable=False)

    op.drop_constraint("tickets_pkey", "tickets", type_="primary")
    op.drop_column("ticket_events", "ticket_id")
    op.drop_column("queue_logs", "ticket_id")
    op.drop_column("queue_logs", "operator_id")
    op.drop_column("tickets", "id")
    op.drop_column("tickets", "applicant_id")
    op.drop_column("tickets", "operator_id")
    op.drop_column("tickets", "started_at")

    op.alter_column("tickets", "id_int", new_column_name="id")
    op.alter_column("tickets", "operator_int", new_column_name="operator_id")
    op.alter_column("ticket_events", "ticket_int", new_column_name="ticket_id")
    op.alter_column("queue_logs", "ticket_int", new_column_name="ticket_id")
    op.alter_column("queue_logs", "operator_int", new_column_name="operator_id")

    op.create_primary_key("tickets_pkey", "tickets", ["id"])
    op.create_foreign_key("ticket_events_ticket_id_fkey", "ticket_events", "tickets", ["ticket_id"], ["id"])
    op.create_foreign_key("queue_logs_ticket_id_fkey", "queue_logs", "tickets", ["ticket_id"], ["id"])
