import uuid
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, StringConstraints

from app.models.user import UserRole


def validate_bcrypt_password(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be 72 bytes or fewer")
    return password


PasswordStr = Annotated[
    str,
    StringConstraints(min_length=1),
    AfterValidator(validate_bcrypt_password),
]

class UserCreate(BaseModel):
    email: EmailStr
    password: PasswordStr
    full_name: str
    role: UserRole = UserRole.OPERATOR
    is_active: bool = True

class UserUpdate(BaseModel):
    email: EmailStr | None = None
    password: PasswordStr | None = None
    full_name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None

class UserLogin(BaseModel):
    email: EmailStr
    password: PasswordStr

class UserResponse(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
