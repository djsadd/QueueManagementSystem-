# app/models/queue_log.py

from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    DateTime,
)

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QueueLog(Base):
    __tablename__ = "queue_logs"

    id: Mapped[int] = mapped_column(primary_key=True)

    ticket_id: Mapped[int] = mapped_column(
        ForeignKey("tickets.id")
    )

    action: Mapped[str] = mapped_column(String(255))

    operator_id: Mapped[int | None]

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )