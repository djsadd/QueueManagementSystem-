import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TicketStatus
from app.dependencies.db import get_db
from app.models.ticket import Ticket
from app.schemas.education import EducationalProgramResponse
from app.schemas.service import ServiceResponse
from app.schemas.ticket import QueueDisplayResponse, TicketCreate, TicketResponse
from app.services.education_service import EducationalProgramService
from app.services.service_service import ServiceService
from app.services.ticket_service import TicketService


public_router = APIRouter(prefix="/public", tags=["public"])


@public_router.get("/services", response_model=list[ServiceResponse])
async def get_public_services(db: AsyncSession = Depends(get_db)):
    services = await ServiceService.get_all(db)
    return [service for service in services if service.is_active]


@public_router.get("/educational-programs", response_model=list[EducationalProgramResponse])
async def get_public_educational_programs(db: AsyncSession = Depends(get_db)):
    programs = await EducationalProgramService.get_all(db)
    return [program for program in programs if program.is_active]


@public_router.post("/tickets", response_model=TicketResponse)
async def create_public_ticket(
    data: TicketCreate,
    x_queue_client: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    if x_queue_client != "desktop-terminal":
        raise HTTPException(status_code=403, detail="Онлайн получение талона через сайт закрыто")

    return await TicketService.create_ticket(db, data)


@public_router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_public_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    return await TicketService.get_ticket(db, ticket_id)


@public_router.get("/queue-display", response_model=QueueDisplayResponse)
async def get_public_queue_display(
    service_id: int | None = Query(default=None, gt=0),
    service_ids: list[int] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    selected_service_ids = sorted(set(service_ids or ([] if service_id is None else [service_id])))

    serving_query = (
        select(Ticket)
        .where(Ticket.status == TicketStatus.CALLED.value)
        .order_by(Ticket.called_at.desc().nullslast(), Ticket.created_at.desc())
        .limit(6)
    )
    next_query = (
        select(Ticket)
        .where(Ticket.status == TicketStatus.WAITING.value)
        .order_by(Ticket.priority.desc(), Ticket.created_at.asc())
    )

    if selected_service_ids:
        serving_query = serving_query.where(Ticket.service_id.in_(selected_service_ids))
        next_query = next_query.where(Ticket.service_id.in_(selected_service_ids))

    serving_result = await db.execute(
        serving_query
    )
    next_result = await db.execute(
        next_query
    )

    serving_tickets = list(serving_result.scalars().all())
    next_tickets = list(next_result.scalars().all())

    return {
        "serving": [
            await TicketService.build_ticket_response(db, ticket)
            for ticket in serving_tickets
        ],
        "next": [
            await TicketService.build_ticket_response(db, ticket)
            for ticket in next_tickets
        ],
    }
