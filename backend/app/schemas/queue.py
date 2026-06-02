import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QueueLogBase(BaseModel):
    ticket_id: uuid.UUID
    action: str
    operator_id: uuid.UUID | None = None


class QueueLogCreate(QueueLogBase):
    pass


class QueueLogResponse(QueueLogBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
