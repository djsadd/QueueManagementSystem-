import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_admin
from app.dependencies.db import get_db
from app.schemas.education import (
    AcademicDegreeCreate,
    AcademicDegreeResponse,
    AcademicDegreeUpdate,
    EducationalProgramCreate,
    EducationalProgramResponse,
    EducationalProgramUpdate,
    OperatorAcademicDegreesUpdate,
    OperatorEducationalProgramResponse,
    OperatorEducationalProgramsUpdate,
)
from app.services.education_service import (
    AcademicDegreeService,
    EducationalProgramService,
    OperatorAcademicDegreeService,
    OperatorEducationalProgramService,
)


academic_degrees_router = APIRouter(prefix="/academic-degrees", tags=["academic-degrees"])
educational_programs_router = APIRouter(
    prefix="/educational-programs",
    tags=["educational-programs"],
    dependencies=[Depends(require_admin)],
)
operator_programs_router = APIRouter(prefix="/operators", tags=["operator-educational-programs"])


@academic_degrees_router.post("/", response_model=AcademicDegreeResponse, dependencies=[Depends(require_admin)])
async def create_academic_degree(
    data: AcademicDegreeCreate,
    db: AsyncSession = Depends(get_db),
):
    return await AcademicDegreeService.create(db, data)


@academic_degrees_router.get("/", response_model=list[AcademicDegreeResponse], dependencies=[Depends(require_admin)])
async def get_academic_degrees(db: AsyncSession = Depends(get_db)):
    return await AcademicDegreeService.get_all(db)


@academic_degrees_router.get("/{degree_id}", response_model=AcademicDegreeResponse, dependencies=[Depends(require_admin)])
async def get_academic_degree(degree_id: int, db: AsyncSession = Depends(get_db)):
    degree = await AcademicDegreeService.get_by_id(db, degree_id)

    if degree is None:
        raise HTTPException(status_code=404, detail="Academic degree not found")

    return degree


@academic_degrees_router.patch("/{degree_id}", response_model=AcademicDegreeResponse, dependencies=[Depends(require_admin)])
async def update_academic_degree(
    degree_id: int,
    data: AcademicDegreeUpdate,
    db: AsyncSession = Depends(get_db),
):
    degree = await AcademicDegreeService.get_by_id(db, degree_id)

    if degree is None:
        raise HTTPException(status_code=404, detail="Academic degree not found")

    return await AcademicDegreeService.update(db, degree, data)


@academic_degrees_router.delete(
    "/{degree_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_academic_degree(degree_id: int, db: AsyncSession = Depends(get_db)):
    degree = await AcademicDegreeService.get_by_id(db, degree_id)

    if degree is None:
        raise HTTPException(status_code=404, detail="Academic degree not found")

    await AcademicDegreeService.delete(db, degree)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@educational_programs_router.post("/", response_model=EducationalProgramResponse)
async def create_educational_program(
    data: EducationalProgramCreate,
    db: AsyncSession = Depends(get_db),
):
    return await EducationalProgramService.create(db, data)


@educational_programs_router.get("/", response_model=list[EducationalProgramResponse])
async def get_educational_programs(db: AsyncSession = Depends(get_db)):
    return await EducationalProgramService.get_all(db)


@educational_programs_router.get("/{program_id}", response_model=EducationalProgramResponse)
async def get_educational_program(program_id: int, db: AsyncSession = Depends(get_db)):
    program = await EducationalProgramService.get_by_id(db, program_id)

    if program is None:
        raise HTTPException(status_code=404, detail="Educational program not found")

    return program


@educational_programs_router.patch("/{program_id}", response_model=EducationalProgramResponse)
async def update_educational_program(
    program_id: int,
    data: EducationalProgramUpdate,
    db: AsyncSession = Depends(get_db),
):
    program = await EducationalProgramService.get_by_id(db, program_id)

    if program is None:
        raise HTTPException(status_code=404, detail="Educational program not found")

    return await EducationalProgramService.update(db, program, data)


@educational_programs_router.delete(
    "/{program_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_educational_program(program_id: int, db: AsyncSession = Depends(get_db)):
    program = await EducationalProgramService.get_by_id(db, program_id)

    if program is None:
        raise HTTPException(status_code=404, detail="Educational program not found")

    await EducationalProgramService.delete(db, program)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@operator_programs_router.get(
    "/{operator_id}/educational-programs",
    response_model=list[OperatorEducationalProgramResponse],
    dependencies=[Depends(require_admin)],
)
async def get_operator_educational_programs(
    operator_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await OperatorEducationalProgramService.get_for_operator(db, operator_id)


@operator_programs_router.put(
    "/{operator_id}/educational-programs",
    response_model=list[OperatorEducationalProgramResponse],
    dependencies=[Depends(require_admin)],
)
async def replace_operator_educational_programs(
    operator_id: uuid.UUID,
    data: OperatorEducationalProgramsUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await OperatorEducationalProgramService.replace_for_operator(
        db,
        operator_id,
        data.educational_program_ids,
        data.study_languages_by_program,
    )


@operator_programs_router.get(
    "/{operator_id}/academic-degrees",
    response_model=list[AcademicDegreeResponse],
    dependencies=[Depends(require_admin)],
)
async def get_operator_academic_degrees(
    operator_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await OperatorAcademicDegreeService.get_for_operator(db, operator_id)


@operator_programs_router.put(
    "/{operator_id}/academic-degrees",
    response_model=list[AcademicDegreeResponse],
    dependencies=[Depends(require_admin)],
)
async def replace_operator_academic_degrees(
    operator_id: uuid.UUID,
    data: OperatorAcademicDegreesUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await OperatorAcademicDegreeService.replace_for_operator(
        db,
        operator_id,
        data.academic_degree_ids,
    )
