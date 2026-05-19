import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket
from app.models.ticket_event import TicketEvent
from app.schemas.ticket_event import TicketEventCreate, TicketEventUpdate


class TicketEventService:
    @staticmethod
    async def create(db: AsyncSession, data: TicketEventCreate) -> TicketEvent:
        create_data = data.model_dump()
        metadata = create_data.pop("metadata", None)

        await TicketEventService.ensure_ticket_exists(db, create_data.get("ticket_id"))

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
    async def get_by_id(db: AsyncSession, event_id: uuid.UUID) -> TicketEvent | None:
        result = await db.execute(select(TicketEvent).where(TicketEvent.id == event_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_ticket_id(db: AsyncSession, ticket_id: int) -> list[TicketEvent]:
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
    async def ensure_ticket_exists(db: AsyncSession, ticket_id: int | None) -> None:
        if ticket_id is None:
            return

        result = await db.execute(select(Ticket.id).where(Ticket.id == ticket_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Ticket not found")
