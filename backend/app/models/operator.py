import enum
import uuid

from sqlalchemy import DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OperatorStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    BUSY = "BUSY"
    BREAK = "BREAK"


class Operator(Base):
    __tablename__ = "operators"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    window_id: Mapped[int | None] = mapped_column(ForeignKey("windows.id"), nullable=True)
    status: Mapped[OperatorStatus] = mapped_column(
        Enum(OperatorStatus),
        nullable=False,
        default=OperatorStatus.OFFLINE,
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
