import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ApplicantReportCreate(BaseModel):
    report_date: date
    file_name: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)


class ApplicantReportResponse(BaseModel):
    id: uuid.UUID
    report_date: date
    file_name: str
    content: str
    uploaded_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    is_latest_fallback: bool = False

    model_config = ConfigDict(from_attributes=True)
