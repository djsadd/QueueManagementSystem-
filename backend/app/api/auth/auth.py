from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import TokenRefreshRequest, TokenResponse, UserCreate, UserLogin, UserResponse
from app.services.auth import authenticate_user, login_user, refresh_user_tokens, register_user

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register")
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await register_user(db, data.email, data.password, data.full_name)
    return {"id": user.id, "email": user.email, "full_name": user.full_name}


@auth_router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, data.email, data.password)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return login_user(user)


@auth_router.post("/refresh", response_model=TokenResponse)
async def refresh(data: TokenRefreshRequest, db: AsyncSession = Depends(get_db)):
    return await refresh_user_tokens(db, data.refresh_token)


@auth_router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
