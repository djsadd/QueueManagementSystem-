import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operator import Operator
from app.models.ticket import Ticket
from app.models.ticket_event import TicketEvent
from app.schemas.ticket_event import TicketEventCreate, TicketEventUpdate
from app.services.assignment_service import AssignmentService


class TicketEventService:
    @staticmethod
    async def create(db: AsyncSession, data: TicketEventCreate) -> TicketEvent:
        create_data = data.model_dump()
        metadata = create_data.pop("metadata", None)

        await TicketEventService.ensure_ticket_exists(db, create_data.get("ticket_id"))
        if create_data.get("ticket_id") is not None and create_data.get("operator_id") is not None:
            await TicketEventService.assign_ticket_to_operator(
                db,
                create_data["ticket_id"],
                create_data["operator_id"],
            )

        ticket_event = TicketEvent(**create_data, metadata_=metadata)
        db.add(ticket_event)

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Ticket event could not be saved")

        await db.refresh(ticket_event)
        return ticket_event

    @staticmethod
    async def get_all(db: AsyncSession) -> list[TicketEvent]:
        result = await db.execute(select(TicketEvent).order_by(TicketEvent.created_at.desc()))
        return list(result.scalars().all())

    @staticmethod
    async def get_by_operator_id(db: AsyncSession, operator_id: uuid.UUID) -> list[TicketEvent]:
        result = await db.execute(
            select(TicketEvent)
            .where(TicketEvent.operator_id == operator_id)
            .order_by(TicketEvent.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, event_id: uuid.UUID) -> TicketEvent | None:
        result = await db.execute(select(TicketEvent).where(TicketEvent.id == event_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_ticket_id(db: AsyncSession, ticket_id: uuid.UUID) -> list[TicketEvent]:
        await TicketEventService.ensure_ticket_exists(db, ticket_id)

        result = await db.execute(
            select(TicketEvent)
            .where(TicketEvent.ticket_id == ticket_id)
            .order_by(TicketEvent.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def update(
        db: AsyncSession,
        ticket_event: TicketEvent,
        data: TicketEventUpdate,
    ) -> TicketEvent:
        update_data = data.model_dump(exclude_unset=True)

        if "ticket_id" in update_data:
            await TicketEventService.ensure_ticket_exists(db, update_data["ticket_id"])

        for field, value in update_data.items():
            if field == "metadata":
                ticket_event.metadata_ = value
            else:
                setattr(ticket_event, field, value)

        assignment_changed = "operator_id" in update_data or "ticket_id" in update_data
        if assignment_changed and ticket_event.ticket_id is not None:
            await TicketEventService.assign_ticket_to_operator(
                db,
                ticket_event.ticket_id,
                ticket_event.operator_id,
            )

        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(status_code=409, detail="Ticket event could not be saved")

        await db.refresh(ticket_event)
        return ticket_event

    @staticmethod
    async def delete(db: AsyncSession, ticket_event: TicketEvent) -> None:
        await db.delete(ticket_event)
        await db.commit()

    @staticmethod
    async def ensure_ticket_exists(db: AsyncSession, ticket_id: uuid.UUID | None) -> None:
        if ticket_id is None:
            return

        result = await db.execute(select(Ticket.id).where(Ticket.id == ticket_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

    @staticmethod
    async def assign_ticket_to_operator(
        db: AsyncSession,
        ticket_id: uuid.UUID,
        operator_id: uuid.UUID | None,
    ) -> None:
        ticket = await db.get(Ticket, ticket_id)

        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        operator = None
        if operator_id is not None:
            operator = await db.get(Operator, operator_id)

            if operator is None:
                raise HTTPException(status_code=404, detail="Operator not found")

            if operator.window_id is None:
                raise HTTPException(status_code=422, detail="Operator window is not assigned")

            profile = await AssignmentService.build_operator_profile(db, operator, active_ticket_count=0)
            if ticket.service_id not in profile.service_ids or not AssignmentService.operator_can_handle_ticket(
                profile,
                ticket,
            ):
                raise HTTPException(
                    status_code=422,
                    detail="Operator cannot handle ticket service or educational program",
                )

        ticket.operator_id = operator_id
        ticket.window_id = operator.window_id if operator is not None else None
