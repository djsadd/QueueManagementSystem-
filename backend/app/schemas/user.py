from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, StringConstraints


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

class UserLogin(BaseModel):
    email: EmailStr
    password: PasswordStr

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
