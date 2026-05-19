# app/schemas/ticket.py

from pydantic import BaseModel


class TicketCreate(BaseModel):
    full_name: str
    iin: str
    phone: str
    service_id: int


class TicketResponse(BaseModel):
    id: int
    ticket_number: str
    status: str
    estimated_wait: int | None

    class Config:
        from_attributes = True