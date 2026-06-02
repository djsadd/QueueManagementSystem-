import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.queue_log import QueueLog
from app.schemas.queue import (
    QueueLogCreate,
)


class QueueLogService:

    @staticmethod
    async def create(
        db: AsyncSession,
        data: QueueLogCreate
    ) -> QueueLog:

        log = QueueLog(**data.model_dump())

        db.add(log)

        await db.commit()
        await db.refresh(log)

        return log

    @staticmethod
    async def get_all(
        db: AsyncSession
    ) -> list[QueueLog]:

        result = await db.execute(
            select(QueueLog)
        )

        return list(result.scalars().all())

    @staticmethod
    async def get_by_ticket(
        db: AsyncSession,
        ticket_id: uuid.UUID,
    ) -> list[QueueLog]:

        result = await db.execute(
            select(QueueLog).where(
                QueueLog.ticket_id == ticket_id
            )
        )

        return list(result.scalars().all())
