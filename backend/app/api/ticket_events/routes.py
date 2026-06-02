import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.db import get_db
from app.models.operator import Operator
from app.models.user import User
from app.schemas.ticket_event import TicketEventCreate, TicketEventResponse, TicketEventUpdate
from app.services.operator_service import OperatorService
from app.services.ticket_event_service import TicketEventService


ticket_events_router = APIRouter(
    prefix="/ticket-events",
    tags=["ticket-events"],
)


async def serialize_ticket_event(db: AsyncSession, ticket_event):
    operator_user = None
    if ticket_event.operator_id is not None:
        result = await db.execute(
            select(User)
            .join(Operator, Operator.user_id == User.id)
            .where(Operator.id == ticket_event.operator_id)
        )
        operator_user = result.scalar_one_or_none()

    return {
        "id": ticket_event.id,
        "ticket_id": ticket_event.ticket_id,
        "event_type": ticket_event.event_type,
        "old_status": ticket_event.old_status,
        "new_status": ticket_event.new_status,
        "operator_id": ticket_event.operator_id,
        "operator_name": operator_user.full_name if operator_user else None,
        "operator_email": operator_user.email if operator_user else None,
        "metadata": ticket_event.metadata_,
        "created_at": ticket_event.created_at,
    }


@ticket_events_router.post("/", response_model=TicketEventResponse, dependencies=[Depends(require_admin)])
async def create_ticket_event(
    data: TicketEventCreate,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.create(db, data)
    return await serialize_ticket_event(db, ticket_event)


@ticket_events_router.get("/", response_model=list[TicketEventResponse], dependencies=[Depends(require_admin)])
async def get_ticket_events(db: AsyncSession = Depends(get_db)):
    ticket_events = await TicketEventService.get_all(db)
    return [await serialize_ticket_event(db, ticket_event) for ticket_event in ticket_events]


@ticket_events_router.get("/me", response_model=list[TicketEventResponse])
async def get_my_ticket_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await OperatorService.get_by_user_id(db, current_user.id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    ticket_events = await TicketEventService.get_by_operator_id(db, operator.id)
    return [await serialize_ticket_event(db, ticket_event) for ticket_event in ticket_events]


@ticket_events_router.get(
    "/ticket/{ticket_id}",
    response_model=list[TicketEventResponse],
    dependencies=[Depends(require_admin)],
)
async def get_ticket_events_by_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ticket_events = await TicketEventService.get_by_ticket_id(db, ticket_id)
    return [await serialize_ticket_event(db, ticket_event) for ticket_event in ticket_events]


@ticket_events_router.get("/{event_id}", response_model=TicketEventResponse, dependencies=[Depends(require_admin)])
async def get_ticket_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.get_by_id(db, event_id)

    if ticket_event is None:
        raise HTTPException(status_code=404, detail="Ticket event not found")

    return await serialize_ticket_event(db, ticket_event)


@ticket_events_router.patch("/{event_id}", response_model=TicketEventResponse, dependencies=[Depends(require_admin)])
async def update_ticket_event(
    event_id: uuid.UUID,
    data: TicketEventUpdate,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.get_by_id(db, event_id)

    if ticket_event is None:
        raise HTTPException(status_code=404, detail="Ticket event not found")

    updated_ticket_event = await TicketEventService.update(db, ticket_event, data)
    return await serialize_ticket_event(db, updated_ticket_event)


@ticket_events_router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_ticket_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.get_by_id(db, event_id)

    if ticket_event is None:
        raise HTTPException(status_code=404, detail="Ticket event not found")

    await TicketEventService.delete(db, ticket_event)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
