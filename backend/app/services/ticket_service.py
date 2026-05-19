from app.models.ticket import Ticket
from app.repositories.ticket_repository import (
    TicketRepository
)


class TicketService:

    @staticmethod
    async def create_ticket(
        db,
        data
    ):

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