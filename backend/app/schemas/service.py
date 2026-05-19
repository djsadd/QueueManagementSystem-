# app/schemas/service.py

from pydantic import BaseModel, ConfigDict


class ServiceBase(BaseModel):
    name: str
    code: str
    priority: int = 0
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    priority: int | None = None
    is_active: bool | None = None


class ServiceResponse(ServiceBase):
    id: int

    model_config = ConfigDict(from_attributes=True)