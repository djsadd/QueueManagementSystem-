# app/schemas/service.py

from pydantic import BaseModel, ConfigDict, Field


class ServiceBase(BaseModel):
    name: str = Field(min_length=1, max_length=255, examples=["Document Service"])
    name_kk: str = Field(min_length=1, max_length=255)
    name_en: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=10, examples=["DOC"])
    priority: int = Field(default=0, ge=0)
    is_active: bool = True
    requires_educational_program: bool = False
    requires_reception_desk: bool = False
    requires_service_language: bool = False


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    name_kk: str | None = Field(default=None, min_length=1, max_length=255)
    name_en: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=10)
    priority: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    requires_educational_program: bool | None = None
    requires_reception_desk: bool | None = None
    requires_service_language: bool | None = None


class ServiceResponse(ServiceBase):
    id: int

    model_config = ConfigDict(from_attributes=True)
