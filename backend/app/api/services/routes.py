from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_admin
from app.dependencies.db import get_db
from app.schemas.service import ServiceCreate, ServiceResponse, ServiceUpdate
from app.services.service_service import ServiceService


services_router = APIRouter(prefix="/services", tags=["services"], dependencies=[Depends(require_admin)])


@services_router.post("/", response_model=ServiceResponse)
async def create_service(
    data: ServiceCreate,
    db: AsyncSession = Depends(get_db)
):
    return await ServiceService.create(db, data)


@services_router.get("/", response_model=list[ServiceResponse])
async def get_services(
    db: AsyncSession = Depends(get_db)
):
    return await ServiceService.get_all(db)


@services_router.get("/{service_id}", response_model=ServiceResponse)
async def get_service(
    service_id: int,
    db: AsyncSession = Depends(get_db)
):
    service = await ServiceService.get_by_id(db, service_id)

    if service is None:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    return service


@services_router.patch("/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: int,
    data: ServiceUpdate,
    db: AsyncSession = Depends(get_db)
):
    service = await ServiceService.get_by_id(db, service_id)

    if service is None:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    return await ServiceService.update(db, service, data)


@services_router.delete(
    "/{service_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_service(
    service_id: int,
    db: AsyncSession = Depends(get_db)
):
    service = await ServiceService.get_by_id(db, service_id)

    if service is None:
        raise HTTPException(
            status_code=404,
            detail="Service not found"
        )

    await ServiceService.delete(db, service)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
