import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.operator import OperatorStatus


class OperatorBase(BaseModel):
    user_id: uuid.UUID
    window_id: int | None = None
    status: OperatorStatus = OperatorStatus.OFFLINE


class OperatorCreate(OperatorBase):
    pass


class OperatorUpdate(BaseModel):
    user_id: uuid.UUID | None = None
    window_id: int | None = None
    status: OperatorStatus | None = None


class OperatorResponse(OperatorBase):
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
