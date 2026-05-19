import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_db
from app.schemas.ticket_event import TicketEventCreate, TicketEventResponse, TicketEventUpdate
from app.services.ticket_event_service import TicketEventService


ticket_events_router = APIRouter(prefix="/ticket-events", tags=["ticket-events"])


def serialize_ticket_event(ticket_event):
    return {
        "id": ticket_event.id,
        "ticket_id": ticket_event.ticket_id,
        "event_type": ticket_event.event_type,
        "old_status": ticket_event.old_status,
        "new_status": ticket_event.new_status,
        "operator_id": ticket_event.operator_id,
        "metadata": ticket_event.metadata_,
        "created_at": ticket_event.created_at,
    }


@ticket_events_router.post("/", response_model=TicketEventResponse)
async def create_ticket_event(
    data: TicketEventCreate,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.create(db, data)
    return serialize_ticket_event(ticket_event)


@ticket_events_router.get("/", response_model=list[TicketEventResponse])
async def get_ticket_events(db: AsyncSession = Depends(get_db)):
    ticket_events = await TicketEventService.get_all(db)
    return [serialize_ticket_event(ticket_event) for ticket_event in ticket_events]


@ticket_events_router.get("/ticket/{ticket_id}", response_model=list[TicketEventResponse])
async def get_ticket_events_by_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
):
    ticket_events = await TicketEventService.get_by_ticket_id(db, ticket_id)
    return [serialize_ticket_event(ticket_event) for ticket_event in ticket_events]


@ticket_events_router.get("/{event_id}", response_model=TicketEventResponse)
async def get_ticket_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.get_by_id(db, event_id)

    if ticket_event is None:
        raise HTTPException(status_code=404, detail="Ticket event not found")

    return serialize_ticket_event(ticket_event)


@ticket_events_router.patch("/{event_id}", response_model=TicketEventResponse)
async def update_ticket_event(
    event_id: uuid.UUID,
    data: TicketEventUpdate,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.get_by_id(db, event_id)

    if ticket_event is None:
        raise HTTPException(status_code=404, detail="Ticket event not found")

    updated_ticket_event = await TicketEventService.update(db, ticket_event, data)
    return serialize_ticket_event(updated_ticket_event)


@ticket_events_router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket_event(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.get_by_id(db, event_id)

    if ticket_event is None:
        raise HTTPException(status_code=404, detail="Ticket event not found")

    await TicketEventService.delete(db, ticket_event)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
