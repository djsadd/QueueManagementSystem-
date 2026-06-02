import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AcademicDegree(Base):
    __tablename__ = "academic_degrees"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class EducationalProgram(Base):
    __tablename__ = "educational_programs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_kk: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    academic_degree_id: Mapped[int] = mapped_column(ForeignKey("academic_degrees.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class OperatorAcademicDegree(Base):
    __tablename__ = "operator_academic_degrees"

    operator_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("operators.id", ondelete="CASCADE"),
        primary_key=True,
    )
    academic_degree_id: Mapped[int] = mapped_column(
        ForeignKey("academic_degrees.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class OperatorEducationalProgram(Base):
    __tablename__ = "operator_educational_programs"

    operator_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("operators.id", ondelete="CASCADE"),
        primary_key=True,
    )
    educational_program_id: Mapped[int] = mapped_column(
        ForeignKey("educational_programs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
