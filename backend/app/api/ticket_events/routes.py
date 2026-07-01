import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.db import get_db
from app.models.operator import Operator
from app.models.user import User
from app.schemas.ticket_event import (
    OperatorTicketAnalyticsResponse,
    TicketEventPageResponse,
    TicketEventCreate,
    TicketEventResponse,
    TicketEventUpdate,
)
from app.services.operator_service import OperatorService
from app.services.ticket_event_service import TicketEventService


ticket_events_router = APIRouter(
    prefix="/ticket-events",
    tags=["ticket-events"],
)


async def serialize_ticket_event(db: AsyncSession, ticket_event):
    return (await serialize_ticket_events(db, [ticket_event]))[0]


async def serialize_ticket_events(db: AsyncSession, ticket_events, include_metadata: bool = True):
    operator_ids = {
        ticket_event.operator_id
        for ticket_event in ticket_events
        if ticket_event.operator_id is not None
    }
    users_by_operator_id = {}

    if operator_ids:
        result = await db.execute(
            select(Operator.id, User)
            .join(User, Operator.user_id == User.id)
            .where(Operator.id.in_(operator_ids))
        )
        users_by_operator_id = {
            operator_id: user
            for operator_id, user in result.all()
        }

    return [
        {
            "id": ticket_event.id,
            "ticket_id": ticket_event.ticket_id,
            "event_type": ticket_event.event_type,
            "old_status": ticket_event.old_status,
            "new_status": ticket_event.new_status,
            "operator_id": ticket_event.operator_id,
            "operator_name": users_by_operator_id.get(ticket_event.operator_id).full_name
            if ticket_event.operator_id in users_by_operator_id
            else None,
            "operator_email": users_by_operator_id.get(ticket_event.operator_id).email
            if ticket_event.operator_id in users_by_operator_id
            else None,
            "metadata": ticket_event.metadata_ if include_metadata else None,
            "created_at": ticket_event.created_at,
        }
        for ticket_event in ticket_events
    ]


@ticket_events_router.post("/", response_model=TicketEventResponse, dependencies=[Depends(require_admin)])
async def create_ticket_event(
    data: TicketEventCreate,
    db: AsyncSession = Depends(get_db),
):
    ticket_event = await TicketEventService.create(db, data)
    return await serialize_ticket_event(db, ticket_event)


@ticket_events_router.get("/", response_model=list[TicketEventResponse], dependencies=[Depends(require_admin)])
async def get_ticket_events(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_metadata: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
):
    ticket_events = await TicketEventService.get_all(
        db,
        date_from=date_from,
        date_to=date_to,
        include_metadata=include_metadata,
    )
    return await serialize_ticket_events(db, ticket_events, include_metadata=include_metadata)


@ticket_events_router.get(
    "/page",
    response_model=TicketEventPageResponse,
    dependencies=[Depends(require_admin)],
)
async def get_ticket_events_page(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    operator_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    include_metadata: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
):
    page_result = await TicketEventService.get_page(
        db,
        page=page,
        page_size=page_size,
        search=search,
        event_type=event_type,
        operator_id=operator_id,
        status=status_filter,
        date_from=date_from,
        date_to=date_to,
        include_metadata=include_metadata,
    )

    return {
        **page_result,
        "items": await serialize_ticket_events(
            db,
            page_result["items"],
            include_metadata=include_metadata,
        ),
    }


@ticket_events_router.get("/me", response_model=list[TicketEventResponse])
async def get_my_ticket_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await OperatorService.get_by_user_id(db, current_user.id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    ticket_events = await TicketEventService.get_by_operator_id(db, operator.id)
    return await serialize_ticket_events(db, ticket_events)


@ticket_events_router.get(
    "/analytics",
    response_model=list[OperatorTicketAnalyticsResponse],
    dependencies=[Depends(require_admin)],
)
async def get_ticket_event_analytics(
    operator_id: uuid.UUID | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    return await TicketEventService.get_operator_analytics(
        db,
        operator_id,
        date_from=date_from,
        date_to=date_to,
    )


@ticket_events_router.get("/me/analytics", response_model=OperatorTicketAnalyticsResponse)
async def get_my_ticket_event_analytics(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    operator = await OperatorService.get_by_user_id(db, current_user.id)

    if operator is None:
        raise HTTPException(status_code=404, detail="Operator not found")

    rows = await TicketEventService.get_operator_analytics(
        db,
        operator.id,
        date_from=date_from,
        date_to=date_to,
    )

    if not rows:
        raise HTTPException(status_code=404, detail="Operator not found")

    return rows[0]


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
    return await serialize_ticket_events(db, ticket_events)


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
