import uuid

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.education import (
    AcademicDegree,
    EducationalProgram,
    OperatorAcademicDegree,
    OperatorEducationalProgram,
)
from app.models.operator import Operator
from app.schemas.education import (
    AcademicDegreeCreate,
    AcademicDegreeUpdate,
    EducationalProgramCreate,
    EducationalProgramUpdate,
)


class AcademicDegreeService:
    @staticmethod
    async def create(db: AsyncSession, data: AcademicDegreeCreate) -> AcademicDegree:
        degree = AcademicDegree(**data.model_dump())
        db.add(degree)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Academic degree code already exists")

        await db.refresh(degree)
        return degree

    @staticmethod
    async def get_all(db: AsyncSession) -> list[AcademicDegree]:
        result = await db.execute(select(AcademicDegree).order_by(AcademicDegree.id))
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, degree_id: int) -> AcademicDegree | None:
        result = await db.execute(select(AcademicDegree).where(AcademicDegree.id == degree_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update(db: AsyncSession, degree: AcademicDegree, data: AcademicDegreeUpdate) -> AcademicDegree:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(degree, field, value)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Academic degree code already exists")

        await db.refresh(degree)
        return degree

    @staticmethod
    async def delete(db: AsyncSession, degree: AcademicDegree) -> None:
        try:
            await db.delete(degree)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Academic degree is used by educational programs")


class EducationalProgramService:
    @staticmethod
    async def create(db: AsyncSession, data: EducationalProgramCreate) -> EducationalProgram:
        await EducationalProgramService.ensure_degree_exists(db, data.academic_degree_id)

        program = EducationalProgram(**data.model_dump())
        db.add(program)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Educational program code already exists")

        await db.refresh(program)
        return program

    @staticmethod
    async def get_all(db: AsyncSession) -> list[EducationalProgram]:
        result = await db.execute(select(EducationalProgram).order_by(EducationalProgram.id))
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, program_id: int) -> EducationalProgram | None:
        result = await db.execute(select(EducationalProgram).where(EducationalProgram.id == program_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update(
        db: AsyncSession,
        program: EducationalProgram,
        data: EducationalProgramUpdate,
    ) -> EducationalProgram:
        update_data = data.model_dump(exclude_unset=True)

        if "academic_degree_id" in update_data:
            await EducationalProgramService.ensure_degree_exists(db, update_data["academic_degree_id"])

        for field, value in update_data.items():
            setattr(program, field, value)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Educational program code already exists")

        await db.refresh(program)
        return program

    @staticmethod
    async def delete(db: AsyncSession, program: EducationalProgram) -> None:
        try:
            await db.delete(program)
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Educational program is used by operators")

    @staticmethod
    async def ensure_degree_exists(db: AsyncSession, degree_id: int) -> None:
        degree = await AcademicDegreeService.get_by_id(db, degree_id)

        if degree is None:
            raise HTTPException(status_code=404, detail="Academic degree not found")


class OperatorEducationalProgramService:
    @staticmethod
    async def get_for_operator(db: AsyncSession, operator_id: uuid.UUID) -> list[EducationalProgram]:
        await OperatorEducationalProgramService.ensure_operator_exists(db, operator_id)

        result = await db.execute(
            select(EducationalProgram)
            .join(
                OperatorEducationalProgram,
                OperatorEducationalProgram.educational_program_id == EducationalProgram.id,
            )
            .where(OperatorEducationalProgram.operator_id == operator_id)
            .order_by(EducationalProgram.id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def replace_for_operator(
        db: AsyncSession,
        operator_id: uuid.UUID,
        educational_program_ids: list[int],
    ) -> list[EducationalProgram]:
        await OperatorEducationalProgramService.ensure_operator_exists(db, operator_id)
        unique_program_ids = list(dict.fromkeys(educational_program_ids))
        await OperatorEducationalProgramService.ensure_programs_exist(db, unique_program_ids)

        await db.execute(
            delete(OperatorEducationalProgram).where(
                OperatorEducationalProgram.operator_id == operator_id
            )
        )

        for program_id in unique_program_ids:
            db.add(
                OperatorEducationalProgram(
                    operator_id=operator_id,
                    educational_program_id=program_id,
                )
            )

        await db.commit()
        return await OperatorEducationalProgramService.get_for_operator(db, operator_id)

    @staticmethod
    async def ensure_operator_exists(db: AsyncSession, operator_id: uuid.UUID) -> None:
        result = await db.execute(select(Operator.id).where(Operator.id == operator_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Operator not found")

    @staticmethod
    async def ensure_programs_exist(db: AsyncSession, program_ids: list[int]) -> None:
        if not program_ids:
            return

        result = await db.execute(
            select(EducationalProgram.id).where(EducationalProgram.id.in_(program_ids))
        )
        existing_ids = set(result.scalars().all())
        missing_ids = sorted(set(program_ids) - existing_ids)

        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Educational programs not found: {missing_ids}",
            )


class OperatorAcademicDegreeService:
    @staticmethod
    async def get_for_operator(db: AsyncSession, operator_id: uuid.UUID) -> list[AcademicDegree]:
        await OperatorEducationalProgramService.ensure_operator_exists(db, operator_id)

        result = await db.execute(
            select(AcademicDegree)
            .join(
                OperatorAcademicDegree,
                OperatorAcademicDegree.academic_degree_id == AcademicDegree.id,
            )
            .where(OperatorAcademicDegree.operator_id == operator_id)
            .order_by(AcademicDegree.id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def replace_for_operator(
        db: AsyncSession,
        operator_id: uuid.UUID,
        academic_degree_ids: list[int],
    ) -> list[AcademicDegree]:
        await OperatorEducationalProgramService.ensure_operator_exists(db, operator_id)
        unique_degree_ids = list(dict.fromkeys(academic_degree_ids))
        await OperatorAcademicDegreeService.ensure_degrees_exist(db, unique_degree_ids)

        await db.execute(
            delete(OperatorAcademicDegree).where(
                OperatorAcademicDegree.operator_id == operator_id
            )
        )

        for degree_id in unique_degree_ids:
            db.add(
                OperatorAcademicDegree(
                    operator_id=operator_id,
                    academic_degree_id=degree_id,
                )
            )

        await db.commit()
        return await OperatorAcademicDegreeService.get_for_operator(db, operator_id)

    @staticmethod
    async def ensure_degrees_exist(db: AsyncSession, degree_ids: list[int]) -> None:
        if not degree_ids:
            return

        result = await db.execute(select(AcademicDegree.id).where(AcademicDegree.id.in_(degree_ids)))
        existing_ids = set(result.scalars().all())
        missing_ids = sorted(set(degree_ids) - existing_ids)

        if missing_ids:
            raise HTTPException(
                status_code=404,
                detail=f"Academic degrees not found: {missing_ids}",
            )
