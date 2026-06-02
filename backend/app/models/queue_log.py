import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Uuid,
)

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class QueueLog(Base):
    __tablename__ = "queue_logs"

    id: Mapped[int] = mapped_column(primary_key=True)

    ticket_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("tickets.id")
    )

    action: Mapped[str] = mapped_column(String(255))

    operator_id: Mapped[uuid.UUID | None]

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )
