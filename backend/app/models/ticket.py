import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Uuid,
    func,
)

from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.applicant import Applicant  # noqa: F401
from app.models.education import EducationalProgram  # noqa: F401
from app.models.operator import Operator  # noqa: F401
from app.models.service import Service  # noqa: F401
from app.models.window import Window  # noqa: F401


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)

    applicant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("applicants.id"),
        nullable=True,
    )

    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"))

    educational_program_id: Mapped[int | None] = mapped_column(
        ForeignKey("educational_programs.id"),
        nullable=True,
    )

    academic_degree_id: Mapped[int | None] = mapped_column(
        ForeignKey("academic_degrees.id"),
        nullable=True,
    )

    study_language: Mapped[str | None] = mapped_column(String(20), nullable=True)

    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("operators.id"),
        nullable=True,
    )

    window_id: Mapped[int | None] = mapped_column(
        ForeignKey("windows.id"),
        nullable=True,
    )

    ticket_number: Mapped[str] = mapped_column(String(50), unique=True)

    routing_key: Mapped[str | None] = mapped_column(String(255), nullable=True)

    assignment_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    queue_number: Mapped[int]

    priority: Mapped[int] = mapped_column(default=0)

    status: Mapped[str] = mapped_column(String(50), default="WAITING")

    estimated_wait: Mapped[int | None]

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

    called_at: Mapped[datetime | None]

    started_at: Mapped[datetime | None]

    completed_at: Mapped[datetime | None]
