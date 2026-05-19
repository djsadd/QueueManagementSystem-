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
    async def create(
        db: AsyncSession,
        ticket: Ticket
    ):
        db.add(ticket)

        await db.commit()
        await db.refresh(ticket)

        return ticket