from fastapi import HTTPException

from app.models.ticket import Ticket
from app.repositories.ticket_repository import (
    TicketRepository
)
from app.schemas.ticket import TicketUpdate
from app.services.service_service import ServiceService


class TicketService:

    @staticmethod
    async def create_ticket(
        db,
        data
    ):
        service = await ServiceService.get_by_id(
            db,
            data.service_id
        )

        if service is None:
            raise HTTPException(
                status_code=404,
                detail="Service not found"
            )

        last_queue = await (
            TicketRepository.get_last_queue_number(db)
        )

        queue_number = last_queue + 1

        ticket_number = f"A-{queue_number}"

        ticket = Ticket(
            ticket_number=ticket_number,
            queue_number=queue_number,
            service_id=data.service_id,
            full_name=data.full_name,
            iin=data.iin,
            phone=data.phone,
            estimated_wait=15
        )

        return await TicketRepository.create(
            db,
            ticket
        )
    
    @staticmethod
    async def get_all_tickets(
        db
    ):

        return await TicketRepository.get_all(db)

    @staticmethod
    async def get_ticket(
        db,
        ticket_id: int
    ):

        ticket = await TicketRepository.get_by_id(
            db,
            ticket_id
        )

        if ticket is None:
            raise HTTPException(
                status_code=404,
                detail="Ticket not found"
            )

        return ticket

    @staticmethod
    async def update_ticket(
        db,
        ticket_id: int,
        data: TicketUpdate
    ):

        ticket = await TicketService.get_ticket(
            db,
            ticket_id
        )

        update_data = data.model_dump(
            exclude_unset=True
        )

        service_id = update_data.get("service_id")
        if service_id is not None:
            service = await ServiceService.get_by_id(
                db,
                service_id
            )

            if service is None:
                raise HTTPException(
                    status_code=404,
                    detail="Service not found"
                )

        for field, value in update_data.items():
            setattr(ticket, field, value)

        return await TicketRepository.update(
            db,
            ticket
        )

    @staticmethod
    async def delete_ticket(
        db,
        ticket_id: int
    ) -> None:

        ticket = await TicketService.get_ticket(
            db,
            ticket_id
        )

        await TicketRepository.delete(
            db,
            ticket
        )
