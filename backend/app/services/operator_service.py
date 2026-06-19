import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operator import Operator
from app.realtime import realtime_manager
from app.models.service import OperatorService as OperatorServiceLink, Service
from app.models.user import User
from app.schemas.operator import OperatorCreate, OperatorUpdate


DEFAULT_SERVICE_LANGUAGES = ["KAZAKH", "RUSSIAN", "ENGLISH"]


class OperatorService:
    @staticmethod
    async def create(db: AsyncSession, data: OperatorCreate) -> Operator:
        await OperatorService.ensure_user_exists(db, data.user_id)

        operator = Operator(**data.model_dump())
        db.add(operator)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Operator already exists or user is invalid")

        await db.refresh(operator)
        return operator

    @staticmethod
    async def get_all(db: AsyncSession) -> list[Operator]:
        result = await db.execute(select(Operator).order_by(Operator.created_at.desc()))
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, operator_id: uuid.UUID) -> Operator | None:
        result = await db.execute(select(Operator).where(Operator.id == operator_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_user_id(db: AsyncSession, user_id: uuid.UUID) -> Operator | None:
        result = await db.execute(select(Operator).where(Operator.user_id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update(db: AsyncSession, operator: Operator, data: OperatorUpdate) -> Operator:
        update_data = data.model_dump(exclude_unset=True)
        previous_window_id = operator.window_id

        if "user_id" in update_data:
            await OperatorService.ensure_user_exists(db, update_data["user_id"])

        for field, value in update_data.items():
            setattr(operator, field, value)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Operator update conflicts with existing data")

        await db.refresh(operator)
        await realtime_manager.broadcast_my_window_update(
            previous_window_id,
            "operator_updated",
            {"operator_id": str(operator.id)},
        )
        if operator.window_id != previous_window_id:
            await realtime_manager.broadcast_my_window_update(
                operator.window_id,
                "operator_updated",
                {"operator_id": str(operator.id)},
            )

        return operator

    @staticmethod
    async def delete(db: AsyncSession, operator: Operator) -> None:
        window_id = operator.window_id
        await db.delete(operator)
        await db.commit()
        await realtime_manager.broadcast_my_window_update(
            window_id,
            "operator_deleted",
            {"operator_id": str(operator.id)},
        )

    @staticmethod
    async def ensure_user_exists(db: AsyncSession, user_id: uuid.UUID) -> None:
        result = await db.execute(select(User.id).where(User.id == user_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="User not found")


class OperatorServiceTypeService:
    @staticmethod
    async def get_for_operator(db: AsyncSession, operator_id: uuid.UUID) -> list[dict]:
        await OperatorServiceTypeService.ensure_operator_exists(db, operator_id)

        result = await db.execute(
            select(Service, OperatorServiceLink.service_languages)
            .join(OperatorServiceLink, OperatorServiceLink.service_id == Service.id)
            .where(OperatorServiceLink.operator_id == operator_id)
            .order_by(Service.id)
        )
        return [
            {
                **{
                    column.name: getattr(service, column.name)
                    for column in Service.__table__.columns
                },
                "service_languages": OperatorServiceTypeService.normalize_service_languages(service_languages),
            }
            for service, service_languages in result.all()
        ]

    @staticmethod
    async def replace_for_operator(
        db: AsyncSession,
        operator_id: uuid.UUID,
        service_ids: list[int],
        service_languages_by_service: dict[int, list[str]] | None = None,
    ) -> list[dict]:
        await OperatorServiceTypeService.ensure_operator_exists(db, operator_id)
        unique_service_ids = list(dict.fromkeys(service_ids))
        await OperatorServiceTypeService.ensure_services_exist(db, unique_service_ids)
        service_languages_by_service = service_languages_by_service or {}

        await db.execute(
            delete(OperatorServiceLink).where(OperatorServiceLink.operator_id == operator_id)
        )

        for service_id in unique_service_ids:
            db.add(
                OperatorServiceLink(
                    operator_id=operator_id,
                    service_id=service_id,
                    service_languages=OperatorServiceTypeService.normalize_service_languages(
                        service_languages_by_service.get(service_id)
                    ),
                )
            )

        await db.commit()
        return await OperatorServiceTypeService.get_for_operator(db, operator_id)

    @staticmethod
    def normalize_service_languages(service_languages: list[str] | None) -> list[str]:
        if not service_languages:
            return DEFAULT_SERVICE_LANGUAGES.copy()

        normalized = [
            language
            for language in DEFAULT_SERVICE_LANGUAGES
            if language in set(service_languages)
        ]
        return normalized or DEFAULT_SERVICE_LANGUAGES.copy()

    @staticmethod
    async def ensure_operator_exists(db: AsyncSession, operator_id: uuid.UUID) -> None:
        result = await db.execute(select(Operator.id).where(Operator.id == operator_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Operator not found")

    @staticmethod
    async def ensure_services_exist(db: AsyncSession, service_ids: list[int]) -> None:
        if not service_ids:
            return

        result = await db.execute(select(Service.id).where(Service.id.in_(service_ids)))
        existing_ids = set(result.scalars().all())
        missing_ids = sorted(set(service_ids) - existing_ids)

        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Services not found: {missing_ids}",
            )
