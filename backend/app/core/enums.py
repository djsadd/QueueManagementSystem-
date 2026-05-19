# app/core/enums.py

from enum import Enum


class TicketStatus(str, Enum):
    WAITING = "WAITING"
    CALLED = "CALLED"
    COMPLETED = "COMPLETED"
    SKIPPED = "SKIPPED"
    CANCELLED = "CANCELLED"