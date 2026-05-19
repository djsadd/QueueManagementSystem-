# app/api/tickets/routes.py

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db

from app.schemas.ticket import (
    TicketCreate,
    TicketResponse
)

from app.services.ticket_service import (
    TicketService
)

tickets_router = APIRouter()


@tickets_router.post(
    "/",
    response_model=TicketResponse
)
async def create_ticket(
    data: TicketCreate,
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.create_ticket(
        db,
        data
    )