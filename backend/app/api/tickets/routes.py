# app/api/tickets/routes.py

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db

from app.schemas.ticket import (
    TicketCreate,
    TicketResponse,
    TicketUpdate,
)

from app.services.ticket_service import (
    TicketService
)

tickets_router = APIRouter(prefix="/tickets", tags=["tickets"])


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

@tickets_router.get("/", response_model=list[TicketResponse])
async def get_tickets(
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.get_all_tickets(db)


@tickets_router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.get_ticket(
        db,
        ticket_id
    )


@tickets_router.patch("/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.update_ticket(
        db,
        ticket_id,
        data
    )


@tickets_router.delete(
    "/{ticket_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
async def delete_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db)
):

    await TicketService.delete_ticket(
        db,
        ticket_id
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
