"""analytics query indexes

Revision ID: d8e3f1a9b4c2
Revises: c6d8e2f4a1b3
Create Date: 2026-06-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d8e3f1a9b4c2"
down_revision: Union[str, Sequence[str], None] = "c6d8e2f4a1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("idx_tickets_created_at", "tickets", ["created_at"])
    op.create_index("idx_tickets_operator_created_at", "tickets", ["operator_id", "created_at"])
    op.create_index("idx_ticket_events_created_at", "ticket_events", ["created_at"])
    op.create_index("idx_ticket_events_operator_created_at", "ticket_events", ["operator_id", "created_at"])
    op.create_index("idx_ticket_events_ticket_id", "ticket_events", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("idx_ticket_events_ticket_id", table_name="ticket_events")
    op.drop_index("idx_ticket_events_operator_created_at", table_name="ticket_events")
    op.drop_index("idx_ticket_events_created_at", table_name="ticket_events")
    op.drop_index("idx_tickets_operator_created_at", table_name="tickets")
    op.drop_index("idx_tickets_created_at", table_name="tickets")
