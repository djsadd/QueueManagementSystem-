# app/schemas/ticket.py

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TicketCreate(BaseModel):
    full_name: str = Field(examples=["Test User"])
    iin: str = Field(examples=["123456789012"])
    phone: str = Field(examples=["77001234567"])
    service_id: int = Field(gt=0, examples=[1])


class TicketUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    iin: str | None = Field(default=None, min_length=1, max_length=12)
    phone: str | None = Field(default=None, min_length=1, max_length=20)
    service_id: int | None = Field(default=None, gt=0)
    window_id: int | None = Field(default=None, gt=0)
    operator_id: int | None = Field(default=None, gt=0)
    status: str | None = Field(default=None, min_length=1, max_length=50)
    priority: int | None = Field(default=None, ge=0)
    estimated_wait: int | None = Field(default=None, ge=0)
    called_at: datetime | None = None
    completed_at: datetime | None = None


class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    queue_number: int
    status: str
    service_id: int
    window_id: int | None
    operator_id: int | None
    full_name: str
    iin: str
    phone: str
    priority: int
    estimated_wait: int | None
    created_at: datetime
    called_at: datetime | None
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
