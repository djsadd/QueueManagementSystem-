import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicant import Applicant
from app.schemas.applicant import ApplicantCreate, ApplicantUpdate


class ApplicantService:
    @staticmethod
    async def create(db: AsyncSession, data: ApplicantCreate) -> Applicant:
        applicant = Applicant(**data.model_dump())

        db.add(applicant)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Applicant IIN already exists")

        await db.refresh(applicant)
        return applicant

    @staticmethod
    async def get_all(db: AsyncSession) -> list[Applicant]:
        result = await db.execute(select(Applicant).order_by(Applicant.created_at.desc()))
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, applicant_id: uuid.UUID) -> Applicant | None:
        result = await db.execute(select(Applicant).where(Applicant.id == applicant_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_iin(db: AsyncSession, iin: str) -> Applicant | None:
        result = await db.execute(select(Applicant).where(Applicant.iin == iin))
        return result.scalar_one_or_none()

    @staticmethod
    async def update(
        db: AsyncSession,
        applicant: Applicant,
        data: ApplicantUpdate,
    ) -> Applicant:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(applicant, field, value)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Applicant IIN already exists")

        await db.refresh(applicant)
        return applicant

    @staticmethod
    async def delete(db: AsyncSession, applicant: Applicant) -> None:
        await db.delete(applicant)
        await db.commit()
