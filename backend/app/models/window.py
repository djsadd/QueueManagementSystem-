# app/models/window.py

from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Window(Base):
    __tablename__ = "windows"

    id: Mapped[int] = mapped_column(primary_key=True)

    name: Mapped[str] = mapped_column(String(255))

    floor: Mapped[str | None] = mapped_column(String(50), nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="OPEN")

    current_operator_id: Mapped[int | None] = mapped_column(nullable=True)
