import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db
from app.schemas.applicant import ApplicantCreate, ApplicantResponse, ApplicantUpdate
from app.services.applicant_service import ApplicantService


applicants_router = APIRouter(prefix="/applicants", tags=["applicants"])


@applicants_router.post("/", response_model=ApplicantResponse)
async def create_applicant(
    data: ApplicantCreate,
    db: AsyncSession = Depends(get_db),
):
    return await ApplicantService.create(db, data)


@applicants_router.get("/", response_model=list[ApplicantResponse])
async def get_applicants(db: AsyncSession = Depends(get_db)):
    return await ApplicantService.get_all(db)


@applicants_router.get("/iin/{iin}", response_model=ApplicantResponse)
async def get_applicant_by_iin(
    iin: str,
    db: AsyncSession = Depends(get_db),
):
    applicant = await ApplicantService.get_by_iin(db, iin)

    if applicant is None:
        raise HTTPException(status_code=404, detail="Applicant not found")

    return applicant


@applicants_router.get("/{applicant_id}", response_model=ApplicantResponse)
async def get_applicant(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    applicant = await ApplicantService.get_by_id(db, applicant_id)

    if applicant is None:
        raise HTTPException(status_code=404, detail="Applicant not found")

    return applicant


@applicants_router.patch("/{applicant_id}", response_model=ApplicantResponse)
async def update_applicant(
    applicant_id: uuid.UUID,
    data: ApplicantUpdate,
    db: AsyncSession = Depends(get_db),
):
    applicant = await ApplicantService.get_by_id(db, applicant_id)

    if applicant is None:
        raise HTTPException(status_code=404, detail="Applicant not found")

    return await ApplicantService.update(db, applicant, data)


@applicants_router.delete("/{applicant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_applicant(
    applicant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    applicant = await ApplicantService.get_by_id(db, applicant_id)

    if applicant is None:
        raise HTTPException(status_code=404, detail="Applicant not found")

    await ApplicantService.delete(db, applicant)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
