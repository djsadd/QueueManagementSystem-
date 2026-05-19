import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operator import Operator
from app.models.user import User
from app.schemas.operator import OperatorCreate, OperatorUpdate


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
    async def update(db: AsyncSession, operator: Operator, data: OperatorUpdate) -> Operator:
        update_data = data.model_dump(exclude_unset=True)

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
        return operator

    @staticmethod
    async def delete(db: AsyncSession, operator: Operator) -> None:
        await db.delete(operator)
        await db.commit()

    @staticmethod
    async def ensure_user_exists(db: AsyncSession, user_id: uuid.UUID) -> None:
        result = await db.execute(select(User.id).where(User.id == user_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="User not found")
