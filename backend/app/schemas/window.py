# app/schemas/window.py

from pydantic import BaseModel, ConfigDict


class WindowBase(BaseModel):
    name: str
    status: str = "OPEN"
    current_operator_id: int | None = None


class WindowCreate(WindowBase):
    pass


class WindowUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    current_operator_id: int | None = None


class WindowResponse(WindowBase):
    id: int

    model_config = ConfigDict(from_attributes=True)