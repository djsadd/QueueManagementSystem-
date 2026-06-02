import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.enums import TicketStatus
from app.models.applicant import Applicant
from app.models.education import AcademicDegree, EducationalProgram
from app.models.operator import Operator, OperatorStatus
from app.models.service import Service
from app.models.ticket import Ticket
from app.models.window import Window
from app.models.ticket_event import TicketEvent
from app.models.user import User
from app.repositories.ticket_repository import (
    TicketRepository
)
from app.realtime import realtime_manager
from app.schemas.ticket import StudyLanguage, TicketServiceReassign, TicketUpdate
from app.services.assignment_service import AssignmentService
from app.services.kafka_event_service import KafkaEventService
from app.services.service_service import ServiceService


class TicketService:
    STATUS_EVENT_TYPES = {
        TicketStatus.CALLED.value: "TICKET_CALLED",
        TicketStatus.SKIPPED.value: "TICKET_SKIPPED",
        TicketStatus.COMPLETED.value: "TICKET_COMPLETED",
    }

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

        await TicketService.validate_educational_program(db, service, data.educational_program_id)

        applicant_id = await TicketService.resolve_applicant_id(db, data)

        last_queue = await (
            TicketRepository.get_last_queue_number(db)
        )

        queue_number = last_queue + 1

        ticket_number = f"A-{queue_number}"
        academic_degree_id, routing_key = await AssignmentService.prepare_ticket_routing(
            db,
            data.service_id,
            data.educational_program_id,
        )

        ticket = Ticket(
            ticket_number=ticket_number,
            queue_number=queue_number,
            applicant_id=applicant_id,
            service_id=data.service_id,
            educational_program_id=data.educational_program_id,
            academic_degree_id=academic_degree_id,
            routing_key=routing_key,
            priority=service.priority,
            estimated_wait=15
        )

        ticket = await TicketRepository.create(
            db,
            ticket
        )

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_CREATED",
            old_status=None,
            new_status=ticket.status,
            operator_id=ticket.operator_id,
        )

        assigned_operator = await AssignmentService.assign_ticket_to_best_window(db, ticket)
        if assigned_operator is not None:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type="TICKET_ASSIGNED",
                old_status=ticket.status,
                new_status=ticket.status,
                operator_id=assigned_operator.id,
            )

        await KafkaEventService.publish(
            "tickets.created",
            await TicketService.build_ticket_response(db, ticket),
        )
        if assigned_operator is not None:
            await KafkaEventService.publish(
                "tickets.assigned",
                await TicketService.build_ticket_response(db, ticket),
            )
            await realtime_manager.broadcast_my_window_update(
                ticket.window_id,
                "ticket_assigned",
                {"ticket_id": str(ticket.id)},
            )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def find_available_operator_for_ticket(
        db,
        service_id: int,
        educational_program_id: int | None,
    ) -> Operator | None:
        academic_degree_id, routing_key = await AssignmentService.prepare_ticket_routing(
            db,
            service_id,
            educational_program_id,
        )
        ticket = Ticket(
            service_id=service_id,
            educational_program_id=educational_program_id,
            academic_degree_id=academic_degree_id,
            routing_key=routing_key,
            ticket_number="",
            queue_number=0,
            priority=0,
            estimated_wait=0,
        )
        candidates = await AssignmentService.get_assignable_operator_profiles(db)
        scored_candidates = [
            (AssignmentService.score_operator_for_ticket(profile, ticket), profile)
            for profile in candidates
            if service_id in profile.service_ids
            and AssignmentService.operator_can_handle_ticket(profile, ticket)
        ]

        if not scored_candidates:
            return None

        return max(scored_candidates, key=lambda item: item[0])[1].operator
    
    @staticmethod
    async def get_all_tickets(
        db
    ):

        return await TicketRepository.get_all(db)

    @staticmethod
    async def get_my_window_tickets(
        db,
        user_id: uuid.UUID,
        search: str | None = None,
        status_filter: str | None = None,
        service_id: int | None = None,
        educational_program_id: str | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict:
        result = await db.execute(
            select(Operator).where(Operator.user_id == user_id)
        )
        operator = result.scalar_one_or_none()

        if operator is None:
            raise HTTPException(status_code=404, detail="Operator profile not found")

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Operator window is not assigned")

        result = await db.execute(select(Window).where(Window.id == operator.window_id))
        window = result.scalar_one_or_none()

        conditions = [Ticket.window_id == operator.window_id]
        normalized_search = search.strip() if search else ""

        if status_filter:
            conditions.append(Ticket.status == status_filter)

        if service_id is not None:
            conditions.append(Ticket.service_id == service_id)

        if educational_program_id == "none":
            conditions.append(Ticket.educational_program_id.is_(None))
        elif educational_program_id:
            try:
                conditions.append(Ticket.educational_program_id == int(educational_program_id))
            except ValueError:
                conditions.append(Ticket.educational_program_id == -1)

        if normalized_search:
            search_pattern = f"%{normalized_search}%"
            conditions.append(
                or_(
                    Ticket.ticket_number.ilike(search_pattern),
                    Ticket.status.ilike(search_pattern),
                    Applicant.full_name.ilike(search_pattern),
                    Applicant.iin.ilike(search_pattern),
                    Applicant.phone.ilike(search_pattern),
                    Service.name.ilike(search_pattern),
                    Service.name_kk.ilike(search_pattern),
                    Service.name_en.ilike(search_pattern),
                    EducationalProgram.name.ilike(search_pattern),
                    EducationalProgram.name_kk.ilike(search_pattern),
                    EducationalProgram.name_en.ilike(search_pattern),
                    EducationalProgram.code.ilike(search_pattern),
                )
            )

        total_result = await db.execute(
            select(func.count(Ticket.id))
            .outerjoin(Applicant, Applicant.id == Ticket.applicant_id)
            .outerjoin(Service, Service.id == Ticket.service_id)
            .outerjoin(EducationalProgram, EducationalProgram.id == Ticket.educational_program_id)
            .where(*conditions)
        )
        total = total_result.scalar() or 0
        total_pages = max(1, (total + page_size - 1) // page_size)
        current_page = min(page, total_pages)
        offset = (current_page - 1) * page_size

        tickets_result = await db.execute(
            select(Ticket)
            .outerjoin(Applicant, Applicant.id == Ticket.applicant_id)
            .outerjoin(Service, Service.id == Ticket.service_id)
            .outerjoin(EducationalProgram, EducationalProgram.id == Ticket.educational_program_id)
            .where(*conditions)
            .order_by(
                case((Ticket.status == TicketStatus.WAITING.value, 0), else_=1),
                Ticket.created_at.desc(),
            )
            .offset(offset)
            .limit(page_size)
        )
        tickets = list(tickets_result.scalars().all())
        global_waiting_count_result = await db.execute(
            select(func.count(Ticket.id)).where(Ticket.status == TicketStatus.WAITING.value)
        )

        return {
            "operator_id": operator.id,
            "operator_status": operator.status,
            "window_id": operator.window_id,
            "window_name": window.name if window else None,
            "window_status": window.status if window else None,
            "global_waiting_count": global_waiting_count_result.scalar() or 0,
            "page": current_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "tickets": [
                await TicketService.build_ticket_response(db, ticket)
                for ticket in tickets
            ],
        }

    @staticmethod
    async def update_my_operator_status(
        db,
        user_id: uuid.UUID,
        operator_status: OperatorStatus,
    ) -> dict:
        result = await db.execute(
            select(Operator).where(Operator.user_id == user_id)
        )
        operator = result.scalar_one_or_none()

        if operator is None:
            raise HTTPException(status_code=404, detail="Operator profile not found")

        operator.status = operator_status
        await db.commit()
        await db.refresh(operator)

        if operator.status == OperatorStatus.ONLINE:
            await TicketService.assign_waiting_tickets_to_operator(db, operator)

        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "operator_status_changed",
            {"operator_id": str(operator.id), "status": operator.status.value},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"operator_id": str(operator.id)},
        )

        return await TicketService.get_my_window_tickets(db, user_id)

    @staticmethod
    async def update_my_window_status(
        db,
        user_id: uuid.UUID,
        window_status: str,
    ) -> dict:
        result = await db.execute(
            select(Operator).where(Operator.user_id == user_id)
        )
        operator = result.scalar_one_or_none()

        if operator is None:
            raise HTTPException(status_code=404, detail="Operator profile not found")

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Operator window is not assigned")

        result = await db.execute(select(Window).where(Window.id == operator.window_id))
        window = result.scalar_one_or_none()

        if window is None:
            raise HTTPException(status_code=404, detail="Window not found")

        window.status = window_status
        await db.commit()
        await db.refresh(window)

        if window.status in {"OPEN", "AVAILABLE"} and operator.status == OperatorStatus.ONLINE:
            await TicketService.assign_waiting_tickets_to_operator(db, operator)

        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "window_status_changed",
            {"status": window.status},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"window_id": operator.window_id},
        )

        return await TicketService.get_my_window_tickets(db, user_id)

    @staticmethod
    async def get_operator_for_user(db, user_id: uuid.UUID) -> Operator:
        result = await db.execute(
            select(Operator).where(Operator.user_id == user_id)
        )
        operator = result.scalar_one_or_none()

        if operator is None:
            raise HTTPException(status_code=404, detail="Operator profile not found")

        return operator

    @staticmethod
    async def get_owned_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID) -> tuple[Operator, Ticket]:
        operator = await TicketService.get_operator_for_user(db, user_id)
        ticket = await TicketRepository.get_by_id(db, ticket_id)

        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Operator window is not assigned")

        if ticket.window_id != operator.window_id:
            raise HTTPException(status_code=403, detail="Ticket is not assigned to current window")

        return operator, ticket

    @staticmethod
    async def accept_my_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID, iin: str | None) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)
        old_status = ticket.status

        if iin is not None:
            ticket.applicant_id = await TicketService.resolve_applicant_id_by_iin(db, iin)
        ticket.operator_id = operator.id
        ticket.status = TicketStatus.CALLED.value
        now = datetime.utcnow()
        if ticket.called_at is None:
            ticket.called_at = now
        if ticket.started_at is None:
            ticket.started_at = now

        ticket = await TicketRepository.update(db, ticket)

        if ticket.status != old_status:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type=TicketService.get_event_type_for_status(ticket.status),
                old_status=old_status,
                new_status=ticket.status,
                operator_id=operator.id,
            )

        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "ticket_accepted",
            {"ticket_id": str(ticket.id)},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def resolve_applicant_id_by_iin(db, iin: str) -> uuid.UUID:
        result = await db.execute(select(Applicant).where(Applicant.iin == iin))
        applicant = result.scalar_one_or_none()

        if applicant is None:
            applicant = Applicant(iin=iin)
            db.add(applicant)
            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()
                raise HTTPException(status_code=409, detail="Applicant IIN already exists")

        return applicant.id

    @staticmethod
    async def complete_my_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)

        if ticket.status != TicketStatus.CALLED.value:
            raise HTTPException(status_code=409, detail="Only an accepted ticket can be completed")

        old_status = ticket.status
        ticket.status = TicketStatus.COMPLETED.value
        ticket.completed_at = datetime.utcnow()
        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type=TicketService.get_event_type_for_status(ticket.status),
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
        )

        if operator.status == OperatorStatus.ONLINE:
            await TicketService.assign_waiting_tickets_to_operator(db, operator)

        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "ticket_completed",
            {"ticket_id": str(ticket.id)},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def skip_my_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)

        if ticket.status != TicketStatus.CALLED.value:
            raise HTTPException(status_code=409, detail="Only an accepted ticket can be skipped")

        old_status = ticket.status
        ticket.status = TicketStatus.SKIPPED.value
        ticket.completed_at = datetime.utcnow()
        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type=TicketService.get_event_type_for_status(ticket.status),
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
        )

        if operator.status == OperatorStatus.ONLINE:
            await TicketService.assign_waiting_tickets_to_operator(db, operator)

        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "ticket_skipped",
            {"ticket_id": str(ticket.id)},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def decline_my_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)

        if ticket.status != TicketStatus.WAITING.value:
            raise HTTPException(status_code=409, detail="Only a waiting ticket can be declined")

        previous_window_id = ticket.window_id
        old_status = ticket.status
        ticket.operator_id = None
        ticket.window_id = None
        ticket.assignment_score = None
        ticket.called_at = None
        ticket.started_at = None
        ticket.completed_at = None

        ticket = await TicketRepository.update(db, ticket)
        assigned_operator = await AssignmentService.assign_ticket_to_best_window(
            db,
            ticket,
            excluded_operator_ids={operator.id},
        )

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_DECLINED",
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
        )

        if assigned_operator is not None:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type="TICKET_ASSIGNED",
                old_status=ticket.status,
                new_status=ticket.status,
                operator_id=assigned_operator.id,
            )
            await KafkaEventService.publish(
                "tickets.assigned",
                await TicketService.build_ticket_response(db, ticket),
            )

        window = await db.get(Window, previous_window_id)
        if window is not None and window.status != "BUSY":
            window.status = "BUSY"
            await db.commit()
            await db.refresh(window)

        await realtime_manager.broadcast_my_window_update(
            previous_window_id,
            "ticket_declined",
            {"ticket_id": str(ticket.id)},
        )
        if ticket.window_id != previous_window_id:
            await realtime_manager.broadcast_my_window_update(
                ticket.window_id,
                "ticket_assigned",
                {"ticket_id": str(ticket.id)},
            )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def reassign_my_ticket_service(
        db,
        user_id: uuid.UUID,
        ticket_id: uuid.UUID,
        data: TicketServiceReassign,
    ) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)
        service = await ServiceService.get_by_id(db, data.service_id)

        if service is None:
            raise HTTPException(status_code=404, detail="Service not found")

        previous_window_id = ticket.window_id

        await TicketService.validate_educational_program(db, service, data.educational_program_id)

        old_status = ticket.status
        ticket.service_id = data.service_id
        ticket.educational_program_id = data.educational_program_id
        ticket.priority = service.priority
        ticket.status = TicketStatus.WAITING.value
        ticket.called_at = None
        ticket.started_at = None

        academic_degree_id, routing_key = await AssignmentService.prepare_ticket_routing(
            db,
            data.service_id,
            data.educational_program_id,
        )
        ticket.academic_degree_id = academic_degree_id
        ticket.routing_key = routing_key
        ticket.operator_id = None
        ticket.window_id = None
        ticket.assignment_score = None

        ticket = await TicketRepository.update(db, ticket)
        assigned_operator = await AssignmentService.assign_ticket_to_best_window(db, ticket)
        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="SERVICE_CHANGED",
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
        )

        if assigned_operator is not None:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type="TICKET_ASSIGNED",
                old_status=ticket.status,
                new_status=ticket.status,
                operator_id=assigned_operator.id,
            )
            await KafkaEventService.publish(
                "tickets.assigned",
                await TicketService.build_ticket_response(db, ticket),
            )

        if operator.status == OperatorStatus.ONLINE:
            await TicketService.assign_waiting_tickets_to_operator(db, operator)

        await realtime_manager.broadcast_my_window_update(
            previous_window_id,
            "ticket_reassigned",
            {"ticket_id": str(ticket.id)},
        )
        if ticket.window_id != previous_window_id:
            await realtime_manager.broadcast_my_window_update(
                ticket.window_id,
                "ticket_assigned",
                {"ticket_id": str(ticket.id)},
            )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def update_my_ticket_study_language(
        db,
        user_id: uuid.UUID,
        ticket_id: uuid.UUID,
        study_language: StudyLanguage | None,
    ) -> dict:
        _, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)
        ticket.study_language = study_language
        ticket = await TicketRepository.update(db, ticket)

        await realtime_manager.broadcast_my_window_update(
            ticket.window_id,
            "ticket_updated",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def assign_waiting_tickets_to_operator(db, operator: Operator) -> None:
        ticket = await AssignmentService.assign_best_waiting_ticket_to_window(db, operator)

        if ticket is None:
            return

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_ASSIGNED",
            old_status=ticket.status,
            new_status=ticket.status,
            operator_id=operator.id,
        )
        await KafkaEventService.publish(
            "tickets.assigned",
            await TicketService.build_ticket_response(db, ticket),
        )
        await realtime_manager.broadcast_my_window_update(
            ticket.window_id,
            "ticket_assigned",
            {"ticket_id": str(ticket.id)},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

    @staticmethod
    async def get_ticket(
        db,
        ticket_id: uuid.UUID,
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

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def update_ticket(
        db,
        ticket_id: uuid.UUID,
        data: TicketUpdate
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

        old_status = ticket.status
        old_window_id = ticket.window_id
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
        else:
            service = await ServiceService.get_by_id(db, ticket.service_id)

        if "service_id" in update_data or "educational_program_id" in update_data:
            await TicketService.validate_educational_program(
                db,
                service,
                update_data.get("educational_program_id", ticket.educational_program_id),
            )
            academic_degree_id, routing_key = await AssignmentService.prepare_ticket_routing(
                db,
                update_data.get("service_id", ticket.service_id),
                update_data.get("educational_program_id", ticket.educational_program_id),
            )
            update_data["academic_degree_id"] = academic_degree_id
            update_data["routing_key"] = routing_key

        if update_data.get("applicant_id") is not None:
            await TicketService.ensure_applicant_exists(db, update_data["applicant_id"])

        if update_data.get("operator_id") is not None:
            await TicketService.ensure_operator_exists(db, update_data["operator_id"])

        new_status = update_data.get("status")
        if new_status == TicketStatus.CALLED.value and "called_at" not in update_data:
            update_data["called_at"] = datetime.utcnow()
        elif new_status == TicketStatus.COMPLETED.value and "completed_at" not in update_data:
            update_data["completed_at"] = datetime.utcnow()

        for field, value in update_data.items():
            setattr(ticket, field, value)

        ticket = await TicketRepository.update(
            db,
            ticket
        )

        status_changed = "status" in update_data and ticket.status != old_status

        if status_changed:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type=TicketService.get_event_type_for_status(ticket.status),
                old_status=old_status,
                new_status=ticket.status,
                operator_id=ticket.operator_id,
            )

        if status_changed and ticket.status in {
            TicketStatus.COMPLETED.value,
            TicketStatus.SKIPPED.value,
            TicketStatus.CANCELLED.value,
        } and ticket.operator_id is not None:
            operator = await db.get(Operator, ticket.operator_id)
            if operator is not None and operator.status == OperatorStatus.ONLINE:
                await TicketService.assign_waiting_tickets_to_operator(db, operator)

        await realtime_manager.broadcast_my_window_update(
            old_window_id,
            "ticket_updated",
            {"ticket_id": str(ticket.id)},
        )
        if ticket.window_id != old_window_id:
            await realtime_manager.broadcast_my_window_update(
                ticket.window_id,
                "ticket_updated",
                {"ticket_id": str(ticket.id)},
            )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def delete_ticket(
        db,
        ticket_id: uuid.UUID,
    ) -> None:

        ticket = await TicketRepository.get_by_id(
            db,
            ticket_id
        )

        if ticket is None:
            raise HTTPException(
                status_code=404,
                detail="Ticket not found"
            )

        window_id = ticket.window_id
        try:
            await TicketRepository.delete(
                db,
                ticket
            )
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Ticket has audit events and cannot be deleted",
            )

        await realtime_manager.broadcast_my_window_update(
            window_id,
            "ticket_deleted",
            {"ticket_id": str(ticket_id)},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket_id)},
        )

    @staticmethod
    async def resolve_applicant_id(db, data) -> uuid.UUID | None:
        if data.applicant_id is not None:
            await TicketService.ensure_applicant_exists(db, data.applicant_id)
            return data.applicant_id

        if data.full_name is None and data.iin is None and data.phone is None:
            return None

        applicant = None
        if data.iin is not None:
            result = await db.execute(select(Applicant).where(Applicant.iin == data.iin))
            applicant = result.scalar_one_or_none()

        if applicant is None:
            applicant = Applicant(
                full_name=data.full_name,
                iin=data.iin,
                phone=data.phone,
            )
            db.add(applicant)
            try:
                await db.flush()
            except IntegrityError:
                await db.rollback()
                raise HTTPException(status_code=409, detail="Applicant IIN already exists")

        return applicant.id

    @staticmethod
    async def ensure_applicant_exists(db, applicant_id: uuid.UUID) -> None:
        result = await db.execute(select(Applicant.id).where(Applicant.id == applicant_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Applicant not found")

    @staticmethod
    async def ensure_operator_exists(db, operator_id: uuid.UUID) -> None:
        result = await db.execute(select(Operator.id).where(Operator.id == operator_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Operator not found")

    @staticmethod
    async def validate_educational_program(
        db,
        service: Service | None,
        educational_program_id: int | None,
    ) -> None:
        if service is None:
            return

        requires_program = service.requires_educational_program

        if requires_program and educational_program_id is None:
            raise HTTPException(
                status_code=422,
                detail="Educational program is required for this service",
            )

        if educational_program_id is None:
            return

        result = await db.execute(
            select(EducationalProgram.id).where(
                EducationalProgram.id == educational_program_id,
                EducationalProgram.is_active.is_(True),
            )
        )

        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=404,
                detail="Educational program not found",
            )

    @staticmethod
    async def create_ticket_event(
        db,
        ticket_id: uuid.UUID,
        event_type: str,
        old_status: str | None,
        new_status: str | None,
        operator_id: uuid.UUID | None,
    ) -> None:
        db.add(
            TicketEvent(
                ticket_id=ticket_id,
                event_type=event_type,
                old_status=old_status,
                new_status=new_status,
                operator_id=operator_id,
            )
        )
        await db.commit()

    @staticmethod
    def get_event_type_for_status(status: str) -> str:
        return TicketService.STATUS_EVENT_TYPES.get(status, "STATUS_CHANGED")

    @staticmethod
    async def build_ticket_response(db, ticket: Ticket) -> dict:
        applicant = None
        if ticket.applicant_id is not None:
            result = await db.execute(
                select(Applicant).where(Applicant.id == ticket.applicant_id)
            )
            applicant = result.scalar_one_or_none()

        result = await db.execute(
            select(Service).where(Service.id == ticket.service_id)
        )
        service = result.scalar_one_or_none()

        educational_program = None
        academic_degree = None
        if ticket.educational_program_id is not None:
            result = await db.execute(
                select(EducationalProgram).where(
                    EducationalProgram.id == ticket.educational_program_id
                )
            )
            educational_program = result.scalar_one_or_none()

        if ticket.academic_degree_id is not None:
            result = await db.execute(
                select(AcademicDegree).where(AcademicDegree.id == ticket.academic_degree_id)
            )
            academic_degree = result.scalar_one_or_none()

        assigned_operator = None
        assigned_operator_user = None
        if ticket.operator_id is not None:
            result = await db.execute(select(Operator).where(Operator.id == ticket.operator_id))
            assigned_operator = result.scalar_one_or_none()

        if assigned_operator is not None:
            result = await db.execute(select(User).where(User.id == assigned_operator.user_id))
            assigned_operator_user = result.scalar_one_or_none()

        window = None
        if ticket.window_id is not None:
            result = await db.execute(select(Window).where(Window.id == ticket.window_id))
            window = result.scalar_one_or_none()

        return {
            "id": ticket.id,
            "applicant_id": ticket.applicant_id,
            "service_id": ticket.service_id,
            "educational_program_id": ticket.educational_program_id,
            "study_language": ticket.study_language,
            "full_name": applicant.full_name if applicant else None,
            "iin": applicant.iin if applicant else None,
            "phone": applicant.phone if applicant else None,
            "service_name": service.name if service else None,
            "service_name_kk": service.name_kk if service else None,
            "service_name_en": service.name_en if service else None,
            "educational_program_name": educational_program.name if educational_program else None,
            "educational_program_name_kk": educational_program.name_kk if educational_program else None,
            "educational_program_name_en": educational_program.name_en if educational_program else None,
            "educational_program_code": educational_program.code if educational_program else None,
            "academic_degree_id": ticket.academic_degree_id,
            "academic_degree_name": academic_degree.name if academic_degree else None,
            "academic_degree_code": academic_degree.code if academic_degree else None,
            "operator_id": ticket.operator_id,
            "operator_name": assigned_operator_user.full_name if assigned_operator_user else None,
            "operator_email": assigned_operator_user.email if assigned_operator_user else None,
            "window_id": ticket.window_id,
            "window_name": window.name if window else None,
            "ticket_number": ticket.ticket_number,
            "queue_number": ticket.queue_number,
            "priority": ticket.priority,
            "routing_key": ticket.routing_key,
            "assignment_score": ticket.assignment_score,
            "status": ticket.status,
            "estimated_wait": ticket.estimated_wait,
            "created_at": ticket.created_at,
            "called_at": ticket.called_at,
            "started_at": ticket.started_at,
            "completed_at": ticket.completed_at,
        }
