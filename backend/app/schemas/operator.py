import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.operator import OperatorStatus
from app.schemas.service import ServiceResponse


ServiceLanguage = Literal["KAZAKH", "RUSSIAN", "ENGLISH"]


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


class OperatorStatusUpdate(BaseModel):
    status: OperatorStatus


class OperatorServicesUpdate(BaseModel):
    service_ids: list[int]
    service_languages_by_service: dict[int, list[ServiceLanguage]] = Field(default_factory=dict)


class OperatorServiceResponse(ServiceResponse):
    service_languages: list[ServiceLanguage]


class OperatorResponse(OperatorBase):
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
