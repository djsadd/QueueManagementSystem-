import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db
from app.schemas.operator import OperatorCreate, OperatorResponse, OperatorUpdate
from app.services.operator_service import OperatorService


operators_router = APIRouter(prefix="/operators", tags=["operators"])


@operators_router.post("/", response_model=OperatorResponse)
async def create_operator(data: OperatorCreate, db: AsyncSession = Depends(get_db)):
    return await OperatorService.create(db, data)


@operators_router.get("/", response_model=list[OperatorResponse])
async def get_operators(db: AsyncSession = Depends(get_db)):
    return await OperatorService.get_all(db)


@operators_router.get("/{operator_id}", response_model=OperatorResponse)
async def get_operator(operator_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    operator = await OperatorService.get_by_id(db, operator_id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    return operator


@operators_router.patch("/{operator_id}", response_model=OperatorResponse)
async def update_operator(
    operator_id: uuid.UUID,
    data: OperatorUpdate,
    db: AsyncSession = Depends(get_db),
):
    operator = await OperatorService.get_by_id(db, operator_id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    return await OperatorService.update(db, operator, data)


@operators_router.delete("/{operator_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_operator(operator_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    operator = await OperatorService.get_by_id(db, operator_id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    await OperatorService.delete(db, operator)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
