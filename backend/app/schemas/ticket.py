import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.operator import OperatorStatus


class TicketCreate(BaseModel):
    applicant_id: uuid.UUID | None = None
    service_id: int = Field(gt=0, examples=[1])
    educational_program_id: int | None = Field(default=None, gt=0)
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    iin: str | None = Field(default=None, min_length=12, max_length=12)
    phone: str | None = Field(default=None, min_length=1, max_length=20)

    @model_validator(mode="after")
    def validate_applicant_source(self):
        if self.applicant_id is not None:
            return self

        if not any((self.full_name, self.iin, self.phone)):
            return self

        if self.full_name and self.iin and self.phone:
            return self

        raise ValueError("full_name, iin and phone must be provided together")


class TicketUpdate(BaseModel):
    applicant_id: uuid.UUID | None = None
    service_id: int | None = Field(default=None, gt=0)
    educational_program_id: int | None = Field(default=None, gt=0)
    window_id: int | None = Field(default=None, gt=0)
    operator_id: uuid.UUID | None = None
    status: str | None = Field(default=None, min_length=1, max_length=50)
    priority: int | None = Field(default=None, ge=0)
    estimated_wait: int | None = Field(default=None, ge=0)
    called_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class TicketServiceReassign(BaseModel):
    service_id: int = Field(gt=0)
    educational_program_id: int | None = Field(default=None, gt=0)


class TicketAccept(BaseModel):
    iin: str | None = Field(default=None, min_length=12, max_length=12, pattern=r"^[0-9]{12}$")


StudyLanguage = Literal["KAZAKH", "RUSSIAN", "ENGLISH"]


class TicketStudyLanguageUpdate(BaseModel):
    study_language: StudyLanguage | None = None


class TicketResponse(BaseModel):
    id: uuid.UUID
    applicant_id: uuid.UUID | None
    service_id: int
    educational_program_id: int | None
    academic_degree_id: int | None = None
    study_language: StudyLanguage | None = None
    full_name: str | None = None
    iin: str | None = None
    phone: str | None = None
    service_name: str | None = None
    service_name_kk: str | None = None
    service_name_en: str | None = None
    educational_program_name: str | None = None
    educational_program_name_kk: str | None = None
    educational_program_name_en: str | None = None
    educational_program_code: str | None = None
    academic_degree_name: str | None = None
    academic_degree_code: str | None = None
    operator_id: uuid.UUID | None
    operator_name: str | None = None
    operator_email: str | None = None
    window_id: int | None
    window_name: str | None = None
    window_floor: str | None = None
    ticket_number: str
    queue_number: int
    priority: int
    routing_key: str | None = None
    assignment_score: int | None = None
    status: str
    estimated_wait: int | None
    created_at: datetime
    called_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class MyWindowTicketsResponse(BaseModel):
    operator_id: uuid.UUID
    operator_status: OperatorStatus
    window_id: int
    window_name: str | None = None
    window_floor: str | None = None
    window_status: str | None = None
    global_waiting_count: int
    page: int
    page_size: int
    total: int
    total_pages: int
    tickets: list[TicketResponse]


class ReceptionTicketsResponse(BaseModel):
    waiting_count: int
    called_count: int
    page: int
    page_size: int
    total: int
    total_pages: int
    tickets: list[TicketResponse]


class QueueDisplayResponse(BaseModel):
    serving: list[TicketResponse]
    next: list[TicketResponse]
