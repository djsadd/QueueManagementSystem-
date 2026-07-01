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


class TicketEventPageResponse(BaseModel):
    items: list[TicketEventResponse]
    page: int
    page_size: int
    total: int
    total_pages: int


class OperatorServiceAnalyticsResponse(BaseModel):
    service_id: int
    service_name: str | None = None
    service_code: str | None = None
    tickets_count: int
    completed: int
    skipped: int
    active: int
    processed: int
    completion_rate: int
    share_percent: int
    average_processing_seconds: int
    total_processing_seconds: int
    fastest_processing_seconds: int
    slowest_processing_seconds: int
    average_wait_seconds: int
    last_ticket_at: datetime | None = None


class OperatorDailyAnalyticsResponse(BaseModel):
    date: str
    tickets_count: int
    completed: int
    skipped: int
    active: int


class OperatorTicketAnalyticsResponse(BaseModel):
    operator_id: uuid.UUID
    operator_name: str | None = None
    operator_email: str | None = None
    window_id: int | None = None
    window_name: str | None = None
    window_status: str | None = None
    accepted: int
    completed: int
    skipped: int
    declined: int
    processed: int
    total_actions: int
    completion_rate: int
    average_processing_seconds: int
    total_processing_seconds: int
    worked_seconds: int
    break_seconds: int
    popular_service_id: int | None = None
    popular_service_name: str | None = None
    popular_service_count: int
    last_activity: datetime | None = None
    service_analytics: list[OperatorServiceAnalyticsResponse] = Field(default_factory=list)
    daily_analytics: list[OperatorDailyAnalyticsResponse] = Field(default_factory=list)
