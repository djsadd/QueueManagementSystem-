from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db
from app.schemas.window import WindowCreate, WindowResponse, WindowUpdate
from app.services.windows_service import WindowService


windows_router = APIRouter(prefix="/windows", tags=["windows"])


@windows_router.post("/", response_model=WindowResponse)
async def create_window(
    data: WindowCreate,
    db: AsyncSession = Depends(get_db)
):
    return await WindowService.create(db, data)


@windows_router.get("/", response_model=list[WindowResponse])
async def get_windows(
    db: AsyncSession = Depends(get_db)
):
    return await WindowService.get_all(db)


@windows_router.get("/{window_id}", response_model=WindowResponse)
async def get_window(
    window_id: int,
    db: AsyncSession = Depends(get_db)
):
    window = await WindowService.get_by_id(db, window_id)

    if window is None:
        raise HTTPException(
            status_code=404,
            detail="Window not found"
        )

    return window


@windows_router.patch("/{window_id}", response_model=WindowResponse)
async def update_window(
    window_id: int,
    data: WindowUpdate,
    db: AsyncSession = Depends(get_db)
):
    window = await WindowService.get_by_id(db, window_id)

    if window is None:
        raise HTTPException(
            status_code=404,
            detail="Window not found"
        )

    return await WindowService.update(db, window, data)


@windows_router.delete(
    "/{window_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_window(
    window_id: int,
    db: AsyncSession = Depends(get_db)
):
    window = await WindowService.get_by_id(db, window_id)

    if window is None:
        raise HTTPException(
            status_code=404,
            detail="Window not found"
        )

    await WindowService.delete(db, window)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
