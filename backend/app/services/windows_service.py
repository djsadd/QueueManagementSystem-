# app/services/window_service.py

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.window import Window
from app.schemas.window import (
    WindowCreate,
    WindowUpdate,
)


class WindowService:

    @staticmethod
    async def create(
        db: AsyncSession,
        data: WindowCreate
    ) -> Window:

        window = Window(**data.model_dump())

        db.add(window)

        await db.commit()
        await db.refresh(window)

        return window

    @staticmethod
    async def get_all(
        db: AsyncSession
    ) -> list[Window]:

        result = await db.execute(
            select(Window)
        )

        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        window_id: int
    ) -> Window | None:

        result = await db.execute(
            select(Window).where(
                Window.id == window_id
            )
        )

        return result.scalar_one_or_none()

    @staticmethod
    async def update(
        db: AsyncSession,
        window: Window,
        data: WindowUpdate
    ) -> Window:

        update_data = data.model_dump(
            exclude_unset=True
        )

        for field, value in update_data.items():
            setattr(window, field, value)

        await db.commit()
        await db.refresh(window)

        return window

    @staticmethod
    async def delete(
        db: AsyncSession,
        window: Window
    ) -> None:

        await db.delete(window)
        await db.commit()