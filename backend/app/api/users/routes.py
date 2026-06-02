import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_admin
from app.dependencies.db import get_db
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.user_service import UserService


users_router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


@users_router.post("/", response_model=UserResponse)
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_db)):
    return await UserService.create(db, data)


@users_router.get("/", response_model=list[UserResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    return await UserService.get_all(db)


@users_router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await UserService.get_by_id(db, user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@users_router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
):
    user = await UserService.get_by_id(db, user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return await UserService.update(db, user, data)


@users_router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await UserService.get_by_id(db, user_id)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    await UserService.delete(db, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
