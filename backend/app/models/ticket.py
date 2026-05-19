# app/models/ticket.py

from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    DateTime,
)

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(primary_key=True)

    ticket_number: Mapped[str] = mapped_column(String(50), unique=True)

    queue_number: Mapped[int]

    status: Mapped[str] = mapped_column(default="WAITING")

    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id")
    )

    window_id: Mapped[int | None] = mapped_column(
        ForeignKey("windows.id"),
        nullable=True
    )

    operator_id: Mapped[int | None] = mapped_column(nullable=True)

    full_name: Mapped[str] = mapped_column(String(255))

    iin: Mapped[str] = mapped_column(String(12))

    phone: Mapped[str] = mapped_column(String(20))

    priority: Mapped[int] = mapped_column(default=0)

    estimated_wait: Mapped[int | None]

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )

    called_at: Mapped[datetime | None]

    completed_at: Mapped[datetime | None]