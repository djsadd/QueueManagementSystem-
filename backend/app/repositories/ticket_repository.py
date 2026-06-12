import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ticket import Ticket


class TicketRepository:

    @staticmethod
    async def get_last_queue_number(
        db: AsyncSession
    ):
        result = await db.execute(
            select(func.max(Ticket.queue_number))
        )

        return result.scalar() or 0

    @staticmethod
    async def get_last_queue_number_for_service(
        db: AsyncSession,
        service_id: int,
    ) -> int:
        result = await db.execute(
            select(func.max(Ticket.queue_number))
            .where(Ticket.service_id == service_id)
        )

        return result.scalar() or 0

    @staticmethod
    async def create(
        db: AsyncSession,
        ticket: Ticket
    ):
        db.add(ticket)

        await db.commit()
        await db.refresh(ticket)

        return ticket
    
    @staticmethod
    async def get_all(
        db: AsyncSession
    ):

        result = await db.execute(
            select(Ticket)
        )

        return list(result.scalars().all())

    @staticmethod
    async def get_for_window(
        db: AsyncSession,
        window_id: int,
    ) -> list[Ticket]:
        result = await db.execute(
            select(Ticket)
            .where(Ticket.window_id == window_id)
            .order_by(Ticket.created_at.desc())
        )

        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        ticket_id: uuid.UUID,
    ) -> Ticket | None:

        result = await db.execute(
            select(Ticket).where(Ticket.id == ticket_id)
        )

        return result.scalar_one_or_none()

    @staticmethod
    async def update(
        db: AsyncSession,
        ticket: Ticket
    ) -> Ticket:

        await db.commit()
        await db.refresh(ticket)

        return ticket

    @staticmethod
    async def delete(
        db: AsyncSession,
        ticket: Ticket
    ) -> None:

        await db.delete(ticket)
        await db.commit()
