import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.db import get_db
from app.models.operator import Operator
from app.models.user import User
from app.schemas.education import (
    AcademicDegreeResponse,
    EducationalProgramResponse,
    OperatorAcademicDegreesUpdate,
    OperatorEducationalProgramsUpdate,
)
from app.schemas.operator import (
    OperatorCreate,
    OperatorResponse,
    OperatorServiceResponse,
    OperatorServicesUpdate,
    OperatorUpdate,
)
from app.schemas.service import ServiceResponse
from app.services.education_service import (
    AcademicDegreeService,
    EducationalProgramService,
    OperatorAcademicDegreeService,
    OperatorEducationalProgramService,
)
from app.services.operator_service import OperatorService, OperatorServiceTypeService
from app.services.service_service import ServiceService


operators_router = APIRouter(prefix="/operators", tags=["operators"])


@operators_router.post("/", response_model=OperatorResponse, dependencies=[Depends(require_admin)])
async def create_operator(data: OperatorCreate, db: AsyncSession = Depends(get_db)):
    return await OperatorService.create(db, data)


@operators_router.get("/", response_model=list[OperatorResponse], dependencies=[Depends(require_admin)])
async def get_operators(db: AsyncSession = Depends(get_db)):
    return await OperatorService.get_all(db)


async def get_current_operator(db: AsyncSession, current_user: User) -> Operator:
    operator = await OperatorService.get_by_user_id(db, current_user.id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator profile not found")

    return operator


@operators_router.get("/me", response_model=OperatorResponse)
async def get_my_operator(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_current_operator(db, current_user)


@operators_router.get("/me/services", response_model=list[OperatorServiceResponse])
async def get_my_operator_services(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await get_current_operator(db, current_user)
    return await OperatorServiceTypeService.get_for_operator(db, operator.id)


@operators_router.put("/me/services", response_model=list[OperatorServiceResponse])
async def replace_my_operator_services(
    data: OperatorServicesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await get_current_operator(db, current_user)
    return await OperatorServiceTypeService.replace_for_operator(
        db,
        operator.id,
        data.service_ids,
        data.service_languages_by_service,
    )


@operators_router.get("/me/educational-programs", response_model=list[EducationalProgramResponse])
async def get_my_operator_educational_programs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await get_current_operator(db, current_user)
    return await OperatorEducationalProgramService.get_for_operator(db, operator.id)


@operators_router.put("/me/educational-programs", response_model=list[EducationalProgramResponse])
async def replace_my_operator_educational_programs(
    data: OperatorEducationalProgramsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await get_current_operator(db, current_user)
    return await OperatorEducationalProgramService.replace_for_operator(
        db,
        operator.id,
        data.educational_program_ids,
    )


@operators_router.get("/me/academic-degrees", response_model=list[AcademicDegreeResponse])
async def get_my_operator_academic_degrees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await get_current_operator(db, current_user)
    return await OperatorAcademicDegreeService.get_for_operator(db, operator.id)


@operators_router.put("/me/academic-degrees", response_model=list[AcademicDegreeResponse])
async def replace_my_operator_academic_degrees(
    data: OperatorAcademicDegreesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await get_current_operator(db, current_user)
    return await OperatorAcademicDegreeService.replace_for_operator(
        db,
        operator.id,
        data.academic_degree_ids,
    )


@operators_router.get("/me/available-services", response_model=list[ServiceResponse])
async def get_my_available_services(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_current_operator(db, current_user)
    return await ServiceService.get_all(db)


@operators_router.get("/me/available-educational-programs", response_model=list[EducationalProgramResponse])
async def get_my_available_educational_programs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_current_operator(db, current_user)
    return await EducationalProgramService.get_all(db)


@operators_router.get("/me/available-academic-degrees", response_model=list[AcademicDegreeResponse])
async def get_my_available_academic_degrees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await get_current_operator(db, current_user)
    return await AcademicDegreeService.get_all(db)


@operators_router.get("/{operator_id}", response_model=OperatorResponse, dependencies=[Depends(require_admin)])
async def get_operator(operator_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    operator = await OperatorService.get_by_id(db, operator_id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    return operator


@operators_router.patch("/{operator_id}", response_model=OperatorResponse, dependencies=[Depends(require_admin)])
async def update_operator(
    operator_id: uuid.UUID,
    data: OperatorUpdate,
    db: AsyncSession = Depends(get_db),
):
    operator = await OperatorService.get_by_id(db, operator_id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    return await OperatorService.update(db, operator, data)


@operators_router.delete(
    "/{operator_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_operator(operator_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    operator = await OperatorService.get_by_id(db, operator_id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    await OperatorService.delete(db, operator)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@operators_router.get(
    "/{operator_id}/services",
    response_model=list[OperatorServiceResponse],
    dependencies=[Depends(require_admin)],
)
async def get_operator_services(operator_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    return await OperatorServiceTypeService.get_for_operator(db, operator_id)


@operators_router.put(
    "/{operator_id}/services",
    response_model=list[OperatorServiceResponse],
    dependencies=[Depends(require_admin)],
)
async def replace_operator_services(
    operator_id: uuid.UUID,
    data: OperatorServicesUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await OperatorServiceTypeService.replace_for_operator(
        db,
        operator_id,
        data.service_ids,
        data.service_languages_by_service,
    )
