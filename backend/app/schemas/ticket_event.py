import uuid
from datetime import datetime
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class TicketEventBase(BaseModel):
    ticket_id: uuid.UUID | None = None
    event_type: str | None = Field(default=None, max_length=100)
    old_status: str | None = Field(default=None, max_length=50)
    new_status: str | None = Field(default=None, max_length=50)
    operator_id: uuid.UUID | None = None
    metadata: dict[str, Any] | None = Field(
        default=None,
        validation_alias=AliasChoices("metadata", "metadata_"),
    )


class TicketEventCreate(TicketEventBase):
    pass


class TicketEventUpdate(BaseModel):
    ticket_id: uuid.UUID | None = None
    event_type: str | None = Field(default=None, min_length=1, max_length=100)
    old_status: str | None = Field(default=None, min_length=1, max_length=50)
    new_status: str | None = Field(default=None, min_length=1, max_length=50)
    operator_id: uuid.UUID | None = None
    metadata: dict[str, Any] | None = None


class TicketEventResponse(TicketEventBase):
    id: uuid.UUID
    operator_name: str | None = None
    operator_email: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
