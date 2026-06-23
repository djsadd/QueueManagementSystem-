"""service reception window no-op

Revision ID: b4d2a6c8e9f1
Revises: 3b8e1a6f4c92
Create Date: 2026-06-22 00:00:00.000000

"""
from typing import Sequence, Union


revision: str = "b4d2a6c8e9f1"
down_revision: Union[str, Sequence[str], None] = "3b8e1a6f4c92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
