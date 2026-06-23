# app/services/service_service.py

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service import Service
from app.schemas.service import (
    ServiceCreate,
    ServiceUpdate,
)


class ServiceService:

    @staticmethod
    async def create(
        db: AsyncSession,
        data: ServiceCreate
    ) -> Service:
        existing_service = await ServiceService.get_by_code(
            db,
            data.code
        )

        if existing_service is not None:
            raise HTTPException(
                status_code=409,
                detail="Service code already exists"
            )

        service_data = data.model_dump()
        await ServiceService.validate_reception_window(db, service_data)
        service = Service(**service_data)

        db.add(service)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Service code already exists"
            )

        await db.refresh(service)

        return service

    @staticmethod
    async def get_all(
        db: AsyncSession
    ) -> list[Service]:

        result = await db.execute(
            select(Service)
        )

        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        service_id: int
    ) -> Service | None:

        result = await db.execute(
            select(Service).where(
                Service.id == service_id
            )
        )

        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_code(
        db: AsyncSession,
        code: str
    ) -> Service | None:

        result = await db.execute(
            select(Service).where(
                Service.code == code
            )
        )

        return result.scalar_one_or_none()

    @staticmethod
    async def update(
        db: AsyncSession,
        service: Service,
        data: ServiceUpdate
    ) -> Service:

        update_data = data.model_dump(
            exclude_unset=True
        )
        merged_data = {
            "requires_reception_desk": service.requires_reception_desk,
            "reception_window_id": service.reception_window_id,
            **update_data,
        }
        await ServiceService.validate_reception_window(db, merged_data)

        if merged_data["requires_reception_desk"] is False:
            update_data["reception_window_id"] = None

        for field, value in update_data.items():
            setattr(service, field, value)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Service code already exists"
            )

        await db.refresh(service)

        return service

    @staticmethod
    async def delete(
        db: AsyncSession,
        service: Service
    ) -> None:

        try:
            await db.delete(service)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Service is used by tickets"
            )

    @staticmethod
    async def validate_reception_window(
        db: AsyncSession,
        data: dict,
    ) -> None:
        requires_reception_desk = data.get("requires_reception_desk", False)
        reception_window_id = data.get("reception_window_id")

        if not requires_reception_desk:
            data["reception_window_id"] = None
            return

        if reception_window_id is not None:
            data["reception_window_id"] = None
