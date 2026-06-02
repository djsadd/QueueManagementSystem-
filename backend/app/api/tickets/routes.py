import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.db import get_db
from app.models.user import User

from app.schemas.ticket import (
    MyWindowTicketsResponse,
    TicketAccept,
    TicketCreate,
    TicketResponse,
    TicketServiceReassign,
    TicketStudyLanguageUpdate,
    TicketUpdate,
)
from app.schemas.operator import OperatorStatusUpdate
from app.schemas.window import WindowStatusUpdate

from app.services.ticket_service import (
    TicketService
)

tickets_router = APIRouter(prefix="/tickets", tags=["tickets"])


@tickets_router.get(
    "/my-window",
    response_model=MyWindowTicketsResponse,
    dependencies=[],
)
async def get_my_window_tickets(
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    service_id: int | None = Query(default=None, gt=0),
    educational_program_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.get_my_window_tickets(
        db,
        current_user.id,
        search=search,
        status_filter=status_filter,
        service_id=service_id,
        educational_program_id=educational_program_id,
        page=page,
        page_size=page_size,
    )


@tickets_router.patch(
    "/my-window/status",
    response_model=MyWindowTicketsResponse,
    dependencies=[],
)
async def update_my_window_operator_status(
    data: OperatorStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.update_my_operator_status(db, current_user.id, data.status)


@tickets_router.patch(
    "/my-window/window-status",
    response_model=MyWindowTicketsResponse,
    dependencies=[],
)
async def update_my_window_status(
    data: WindowStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.update_my_window_status(db, current_user.id, data.status)


@tickets_router.patch(
    "/my-window/{ticket_id}/accept",
    response_model=TicketResponse,
    dependencies=[],
)
async def accept_my_window_ticket(
    ticket_id: uuid.UUID,
    data: TicketAccept,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.accept_my_ticket(db, current_user.id, ticket_id, data.iin)


@tickets_router.patch(
    "/my-window/{ticket_id}/complete",
    response_model=TicketResponse,
    dependencies=[],
)
async def complete_my_window_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.complete_my_ticket(db, current_user.id, ticket_id)


@tickets_router.patch(
    "/my-window/{ticket_id}/skip",
    response_model=TicketResponse,
    dependencies=[],
)
async def skip_my_window_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.skip_my_ticket(db, current_user.id, ticket_id)


@tickets_router.patch(
    "/my-window/{ticket_id}/decline",
    response_model=TicketResponse,
    dependencies=[],
)
async def decline_my_window_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.decline_my_ticket(db, current_user.id, ticket_id)


@tickets_router.patch(
    "/my-window/{ticket_id}/service",
    response_model=TicketResponse,
    dependencies=[],
)
async def reassign_my_window_ticket_service(
    ticket_id: uuid.UUID,
    data: TicketServiceReassign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.reassign_my_ticket_service(db, current_user.id, ticket_id, data)


@tickets_router.patch(
    "/my-window/{ticket_id}/study-language",
    response_model=TicketResponse,
    dependencies=[],
)
async def update_my_window_ticket_study_language(
    ticket_id: uuid.UUID,
    data: TicketStudyLanguageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await TicketService.update_my_ticket_study_language(
        db,
        current_user.id,
        ticket_id,
        data.study_language,
    )


@tickets_router.post(
    "/",
    response_model=TicketResponse,
    dependencies=[Depends(require_admin)],
)
async def create_ticket(
    data: TicketCreate,
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.create_ticket(
        db,
        data
    )

@tickets_router.get("/", response_model=list[TicketResponse], dependencies=[Depends(require_admin)])
async def get_tickets(
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.get_all_tickets(db)


@tickets_router.get("/{ticket_id}", response_model=TicketResponse, dependencies=[Depends(require_admin)])
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):

    return await TicketService.get_ticket(
        db,
        ticket_id
    )


@tickets_router.patch("/{ticket_id}", response_model=TicketResponse, dependencies=[Depends(require_admin)])
async def update_ticket(
    ticket_id: uuid.UUID,
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
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_admin)],
)
async def delete_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):

    await TicketService.delete_ticket(
        db,
        ticket_id
    )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
