import uuid

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.security.password import hash_password, verify_password
from app.security.jwt import ALGORITHM, SECRET_KEY, create_access_token, create_refresh_token


async def register_user(db: AsyncSession, email: str, password: str, full_name: str):
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        role=UserRole.OPERATOR,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def login_user(user: User):
    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "refresh_token": create_refresh_token({"sub": str(user.id)}),
        "token_type": "bearer",
    }


async def refresh_user_tokens(db: AsyncSession, refresh_token: str):
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
    )

    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise credentials_error

        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise credentials_error

        user_id = uuid.UUID(subject)
    except (jwt.InvalidTokenError, ValueError):
        raise credentials_error

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_error

    return login_user(user)
