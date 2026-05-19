import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApplicantBase(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    iin: str | None = Field(default=None, min_length=12, max_length=12)
    phone: str | None = Field(default=None, max_length=20)
    telegram_chat_id: int | None = None


class ApplicantCreate(ApplicantBase):
    pass


class ApplicantUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    iin: str | None = Field(default=None, min_length=12, max_length=12)
    phone: str | None = Field(default=None, min_length=1, max_length=20)
    telegram_chat_id: int | None = None


class ApplicantResponse(ApplicantBase):
    id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
