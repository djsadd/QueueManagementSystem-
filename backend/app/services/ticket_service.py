import uuid
import enum
from datetime import date, datetime
from typing import Any

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
from app.schemas.ticket import ServiceLanguage, StudyLanguage, TicketServiceReassign, TicketUpdate
from app.services.assignment_service import AssignmentService
from app.services.kafka_event_service import KafkaEventService
from app.services.service_service import ServiceService


class TicketService:
    TICKET_PREFIX_ALPHABET = "ABCDEFGHIKLMNOPRSTUVXYZ"
    CYRILLIC_TO_LATIN_PREFIX = {
        "А": "A",
        "Б": "B",
        "В": "V",
        "Г": "G",
        "Д": "D",
        "Е": "E",
        "Ё": "E",
        "Ж": "Z",
        "З": "Z",
        "И": "I",
        "Й": "Y",
        "К": "K",
        "Л": "L",
        "М": "M",
        "Н": "N",
        "О": "O",
        "П": "P",
        "Р": "R",
        "С": "S",
        "Т": "T",
        "У": "U",
        "Ф": "F",
        "Х": "H",
        "Ц": "C",
        "Ч": "C",
        "Ш": "S",
        "Щ": "S",
        "Ы": "Y",
        "Э": "E",
        "Ю": "Y",
        "Я": "Y",
    }

    WINDOW_OPERATOR_STATUS_MAP = {
        "OPEN": OperatorStatus.ONLINE,
        "AVAILABLE": OperatorStatus.ONLINE,
        "BUSY": OperatorStatus.BUSY,
        "CLOSED": OperatorStatus.OFFLINE,
    }

    ACTIVE_MY_WINDOW_TICKET_STATUSES = {
        TicketStatus.WAITING.value,
        TicketStatus.CALLED.value,
    }
    ACTIVE_RECEPTION_TICKET_STATUSES = {
        TicketStatus.WAITING.value,
        TicketStatus.CALLED.value,
    }
    SERVICE_LANGUAGES = {"KAZAKH", "RUSSIAN", "ENGLISH"}

    STATUS_EVENT_TYPES = {
        TicketStatus.CALLED.value: "TICKET_CALLED",
        TicketStatus.SKIPPED.value: "TICKET_SKIPPED",
        TicketStatus.COMPLETED.value: "TICKET_COMPLETED",
    }

    TICKET_STATE_FIELDS = {
        "applicant_id",
        "service_id",
        "educational_program_id",
        "academic_degree_id",
        "study_language",
        "service_language",
        "operator_id",
        "window_id",
        "ticket_number",
        "routing_key",
        "assignment_score",
        "queue_number",
        "priority",
        "status",
        "estimated_wait",
        "called_at",
        "started_at",
        "completed_at",
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
                detail="Услуга не найдена"
            )

        educational_program = await TicketService.validate_educational_program(db, service, data.educational_program_id)
        study_language = TicketService.validate_study_language(educational_program, data.study_language)
        service_language = TicketService.validate_service_language(service, data.service_language)

        applicant_id = await TicketService.resolve_applicant_id(db, data)

        ticket_prefix = await TicketService.build_ticket_number_prefix(db, service)
        academic_degree_id, routing_key = await AssignmentService.prepare_ticket_routing(
            db,
            data.service_id,
            data.educational_program_id,
        )
        ticket = None
        for attempt in range(5):
            queue_number = await TicketService.build_next_queue_number(
                db,
                data.service_id,
                ticket_prefix,
                offset=attempt,
            )
            ticket = Ticket(
                ticket_number=f"{ticket_prefix}-{queue_number}",
                queue_number=queue_number,
                applicant_id=applicant_id,
                service_id=data.service_id,
                educational_program_id=data.educational_program_id,
                academic_degree_id=academic_degree_id,
                study_language=study_language,
                service_language=service_language,
                routing_key=routing_key,
                priority=service.priority,
                estimated_wait=15
            )

            try:
                ticket = await TicketRepository.create(
                    db,
                    ticket
                )
                break
            except IntegrityError:
                await db.rollback()
                ticket = None

        if ticket is None:
            raise HTTPException(
                status_code=409,
                detail="Не удалось создать уникальный номер талона. Повторите попытку.",
            )

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_CREATED",
            old_status=None,
            new_status=ticket.status,
            operator_id=ticket.operator_id,
        )

        await KafkaEventService.publish(
            "tickets.created",
            await TicketService.build_ticket_response(db, ticket),
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def build_next_queue_number(
        db,
        service_id: int,
        ticket_prefix: str,
        offset: int = 0,
    ) -> int:
        last_service_queue = await TicketRepository.get_last_queue_number_for_service(db, service_id)
        last_prefix_queue = await TicketRepository.get_last_queue_number_for_ticket_prefix(db, ticket_prefix)
        return max(last_service_queue, last_prefix_queue) + 1 + offset

    @staticmethod
    async def build_ticket_number_prefix(db, service: Service) -> str:
        services = await ServiceService.get_all(db)
        prefixes_by_service_id = TicketService.build_service_prefix_map(services)

        return prefixes_by_service_id.get(
            service.id,
            TicketService.get_service_name_prefix(service),
        )

    @staticmethod
    def build_service_prefix_map(services: list[Service]) -> dict[int, str]:
        service_prefixes = {
            service.id: TicketService.get_service_name_prefix(service)
            for service in services
        }
        services_by_prefix: dict[str, list[Service]] = {}

        for service in services:
            services_by_prefix.setdefault(service_prefixes[service.id], []).append(service)

        assigned_prefixes = {
            prefix
            for prefix, prefix_services in services_by_prefix.items()
            if len(prefix_services) == 1
        }
        prefixes_by_service_id: dict[int, str] = {}

        for prefix, prefix_services in services_by_prefix.items():
            if len(prefix_services) == 1:
                prefixes_by_service_id[prefix_services[0].id] = prefix

        for prefix, prefix_services in sorted(services_by_prefix.items()):
            if len(prefix_services) == 1:
                continue

            for duplicate_service in sorted(prefix_services, key=lambda item: item.id):
                generated_prefix = TicketService.pick_duplicate_service_prefix(
                    duplicate_service,
                    blocked_prefixes=assigned_prefixes | {prefix},
                )
                prefixes_by_service_id[duplicate_service.id] = generated_prefix
                assigned_prefixes.add(generated_prefix)

        return prefixes_by_service_id

    @staticmethod
    def get_service_name_prefix(service: Service) -> str:
        for value in (service.name, service.name_kk, service.name_en):
            if not value:
                continue

            for character in value.strip():
                if character.isalpha():
                    return TicketService.normalize_ticket_prefix_letter(character)

        return "A"

    @staticmethod
    def normalize_ticket_prefix_letter(character: str) -> str:
        upper_character = character.upper()
        latin_prefix = TicketService.CYRILLIC_TO_LATIN_PREFIX.get(upper_character, upper_character)

        if latin_prefix in TicketService.TICKET_PREFIX_ALPHABET:
            return latin_prefix

        return "A"

    @staticmethod
    def pick_duplicate_service_prefix(
        service: Service,
        blocked_prefixes: set[str],
    ) -> str:
        available_prefixes = [
            prefix
            for prefix in TicketService.TICKET_PREFIX_ALPHABET
            if prefix not in blocked_prefixes
        ]

        if not available_prefixes:
            return f"{TicketService.get_service_name_prefix(service)}{service.id}"

        offset = sum(ord(character) for character in f"{service.id}:{service.name}") % len(available_prefixes)
        return available_prefixes[offset]

    @staticmethod
    async def find_available_operator_for_ticket(
        db,
        service_id: int,
        educational_program_id: int | None,
        study_language: StudyLanguage | None = None,
        service_language: ServiceLanguage | None = None,
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
            study_language=study_language,
            service_language=service_language,
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
    async def get_export_tickets(
        db,
        operator_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict]:
        conditions = []

        if operator_id is not None:
            await TicketService.ensure_operator_exists(db, operator_id)
            conditions.append(Ticket.operator_id == operator_id)

        if date_from is not None:
            conditions.append(func.date(Ticket.created_at) >= date_from)

        if date_to is not None:
            conditions.append(func.date(Ticket.created_at) <= date_to)

        result = await db.execute(
            select(Ticket)
            .where(*conditions)
            .order_by(Ticket.created_at.desc(), Ticket.queue_number.desc())
        )
        tickets = list(result.scalars().all())

        return [
            await TicketService.build_ticket_response(db, ticket)
            for ticket in tickets
        ]

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
            raise HTTPException(status_code=404, detail="Профиль оператора не найден")

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Оператору не назначено окно")

        result = await db.execute(select(Window).where(Window.id == operator.window_id))
        window = result.scalar_one_or_none()

        conditions = [Service.requires_reception_desk.is_(False)]
        normalized_search = search.strip() if search else ""

        if status_filter:
            conditions.append(Ticket.status == status_filter)
        else:
            conditions.append(Ticket.status.in_(TicketService.ACTIVE_MY_WINDOW_TICKET_STATUSES))

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
                case(
                    (Ticket.status == TicketStatus.CALLED.value, 0),
                    (Ticket.status == TicketStatus.WAITING.value, 1),
                    else_=2,
                ),
                Ticket.created_at.asc(),
                Ticket.queue_number.asc(),
            )
            .offset(offset)
            .limit(page_size)
        )
        tickets = list(tickets_result.scalars().all())
        global_waiting_count_result = await db.execute(
            select(func.count(Ticket.id))
            .select_from(Ticket)
            .join(Service, Service.id == Ticket.service_id)
            .where(
                Ticket.status == TicketStatus.WAITING.value,
                Service.requires_reception_desk.is_(False),
            )
        )

        return {
            "operator_id": operator.id,
            "operator_status": operator.status,
            "window_id": operator.window_id,
            "window_name": window.name if window else None,
            "window_floor": window.floor if window else None,
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
    async def get_reception_tickets(
        db,
        search: str | None = None,
        service_id: int | None = None,
        page: int = 1,
        page_size: int = 10,
    ) -> dict:
        base_conditions = [
            Service.requires_reception_desk.is_(True),
        ]
        normalized_search = search.strip() if search else ""

        if service_id is not None:
            base_conditions.append(Ticket.service_id == service_id)

        if normalized_search:
            search_pattern = f"%{normalized_search}%"
            base_conditions.append(
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
        conditions = [
            *base_conditions,
            Ticket.status.in_(TicketService.ACTIVE_RECEPTION_TICKET_STATUSES),
        ]

        total_result = await db.execute(
            select(func.count(Ticket.id))
            .select_from(Ticket)
            .join(Service, Service.id == Ticket.service_id)
            .outerjoin(Applicant, Applicant.id == Ticket.applicant_id)
            .outerjoin(EducationalProgram, EducationalProgram.id == Ticket.educational_program_id)
            .where(*conditions)
        )
        total = total_result.scalar() or 0
        total_pages = max(1, (total + page_size - 1) // page_size)
        current_page = min(page, total_pages)
        offset = (current_page - 1) * page_size

        tickets_result = await db.execute(
            select(Ticket)
            .join(Service, Service.id == Ticket.service_id)
            .outerjoin(Applicant, Applicant.id == Ticket.applicant_id)
            .outerjoin(EducationalProgram, EducationalProgram.id == Ticket.educational_program_id)
            .where(*conditions)
            .order_by(
                case((Ticket.status == TicketStatus.WAITING.value, 0), else_=1),
                Ticket.created_at.asc(),
            )
            .offset(offset)
            .limit(page_size)
        )
        tickets = list(tickets_result.scalars().all())
        waiting_count_result = await db.execute(
            select(func.count(Ticket.id))
            .select_from(Ticket)
            .join(Service, Service.id == Ticket.service_id)
            .where(
                *base_conditions,
                Ticket.status == TicketStatus.WAITING.value,
            )
        )
        called_count_result = await db.execute(
            select(func.count(Ticket.id))
            .select_from(Ticket)
            .join(Service, Service.id == Ticket.service_id)
            .where(
                *base_conditions,
                Ticket.status == TicketStatus.CALLED.value,
            )
        )

        return {
            "waiting_count": waiting_count_result.scalar() or 0,
            "called_count": called_count_result.scalar() or 0,
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
            raise HTTPException(status_code=404, detail="Профиль оператора не найден")

        old_status = operator.status
        operator.status = operator_status

        if old_status != operator_status:
            db.add(
                TicketEvent(
                    ticket_id=None,
                    event_type="OPERATOR_STATUS_CHANGED",
                    old_status=old_status.value,
                    new_status=operator_status.value,
                    operator_id=operator.id,
                    metadata_={
                        "old_status": old_status.value,
                        "new_status": operator_status.value,
                    },
                )
            )

        await db.commit()
        await db.refresh(operator)

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
            raise HTTPException(status_code=404, detail="Профиль оператора не найден")

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Оператору не назначено окно")

        result = await db.execute(select(Window).where(Window.id == operator.window_id))
        window = result.scalar_one_or_none()

        if window is None:
            raise HTTPException(status_code=404, detail="Окно не найдено")

        old_operator_status = operator.status
        operator_status = TicketService.WINDOW_OPERATOR_STATUS_MAP.get(window_status)

        window.status = window_status
        if operator_status is not None:
            operator.status = operator_status
            if old_operator_status != operator_status:
                db.add(
                    TicketEvent(
                        ticket_id=None,
                        event_type="OPERATOR_STATUS_CHANGED",
                        old_status=old_operator_status.value,
                        new_status=operator_status.value,
                        operator_id=operator.id,
                        metadata_={
                            "old_status": old_operator_status.value,
                            "new_status": operator_status.value,
                            "source": "window_status",
                            "window_status": window_status,
                        },
                    )
                )

        await db.commit()
        await db.refresh(window)
        await db.refresh(operator)

        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "window_status_changed",
            {"status": window.status},
        )
        if old_operator_status != operator.status:
            await realtime_manager.broadcast_my_window_update(
                operator.window_id,
                "operator_status_changed",
                {"operator_id": str(operator.id), "status": operator.status.value},
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
            raise HTTPException(status_code=404, detail="Профиль оператора не найден")

        return operator

    @staticmethod
    async def get_owned_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID) -> tuple[Operator, Ticket]:
        operator = await TicketService.get_operator_for_user(db, user_id)
        ticket = await TicketRepository.get_by_id(db, ticket_id)

        if ticket is None:
            raise HTTPException(status_code=404, detail="Талон не найден")

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Оператору не назначено окно")

        if ticket.window_id != operator.window_id:
            raise HTTPException(status_code=403, detail="Талон не назначен текущему окну")

        return operator, ticket

    @staticmethod
    async def get_reception_ticket(db, ticket_id: uuid.UUID) -> Ticket:
        ticket = await TicketRepository.get_by_id(db, ticket_id)

        if ticket is None:
            raise HTTPException(status_code=404, detail="Талон не найден")

        service = await db.get(Service, ticket.service_id)
        if service is None or not service.requires_reception_desk:
            raise HTTPException(status_code=403, detail="Талон не относится к услугам регистратуры")

        if ticket.status not in TicketService.ACTIVE_RECEPTION_TICKET_STATUSES:
            raise HTTPException(status_code=409, detail="Талон уже завершен или недоступен")

        return ticket

    @staticmethod
    async def call_next_my_ticket(db, user_id: uuid.UUID) -> dict:
        operator = await TicketService.get_operator_for_user(db, user_id)

        if operator.window_id is None:
            raise HTTPException(status_code=404, detail="Оператору не назначено окно")

        window = await db.get(Window, operator.window_id)
        if window is None:
            raise HTTPException(status_code=404, detail="Окно не найдено")

        if window.status not in {"OPEN", "AVAILABLE"}:
            raise HTTPException(status_code=409, detail="Чтобы вызвать следующий талон, окно должно быть открыто")

        if operator.status != OperatorStatus.ONLINE:
            old_operator_status = operator.status
            operator.status = OperatorStatus.ONLINE
            db.add(
                TicketEvent(
                    ticket_id=None,
                    event_type="OPERATOR_STATUS_CHANGED",
                    old_status=old_operator_status.value,
                    new_status=OperatorStatus.ONLINE.value,
                    operator_id=operator.id,
                    metadata_={
                        "old_status": old_operator_status.value,
                        "new_status": OperatorStatus.ONLINE.value,
                        "source": "window_status",
                        "window_status": window.status,
                    },
                )
            )
            await db.flush()

        active_result = await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.window_id == operator.window_id,
                Ticket.status == TicketStatus.CALLED.value,
            )
        )
        if (active_result.scalar() or 0) > 0:
            raise HTTPException(
                status_code=409,
                detail="Завершите или пропустите текущий талон перед вызовом следующего",
            )

        profile = await AssignmentService.build_operator_profile(db, operator, 0)
        if not profile.service_ids:
            raise HTTPException(status_code=409, detail="Оператору не назначены услуги")

        existing_result = await db.execute(
            select(Ticket)
            .where(
                Ticket.window_id == operator.window_id,
                Ticket.operator_id == operator.id,
                Ticket.status == TicketStatus.WAITING.value,
                Ticket.service_id.in_(profile.service_ids),
            )
            .order_by(Ticket.priority.desc(), Ticket.created_at.asc())
            .with_for_update(skip_locked=True)
        )
        existing_tickets = list(existing_result.scalars().all())
        scored_existing_tickets = [
            (AssignmentService.score_ticket_for_operator(ticket, profile), ticket)
            for ticket in existing_tickets
            if AssignmentService.operator_can_handle_ticket(profile, ticket)
        ]
        scored_existing_tickets = [
            (score, ticket)
            for score, ticket in scored_existing_tickets
            if score > 0
        ]
        assigned_during_request = False

        if scored_existing_tickets:
            _, ticket = max(scored_existing_tickets, key=lambda item: (item[0], -item[1].queue_number))
        else:
            ticket = await AssignmentService.assign_best_waiting_ticket_to_window(db, operator)
            assigned_during_request = ticket is not None

        if ticket is None:
            raise HTTPException(status_code=404, detail="Нет ожидающих талонов по услугам и ОП этого оператора")

        if assigned_during_request:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type="TICKET_ASSIGNED",
                old_status=ticket.status,
                new_status=ticket.status,
                operator_id=operator.id,
            )

        old_status = ticket.status
        now = datetime.utcnow()
        ticket.operator_id = operator.id
        ticket.window_id = operator.window_id
        ticket.status = TicketStatus.CALLED.value
        if ticket.called_at is None:
            ticket.called_at = now
        if ticket.started_at is None:
            ticket.started_at = now

        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type=TicketService.get_event_type_for_status(ticket.status),
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
        )
        await KafkaEventService.publish(
            "tickets.called",
            await TicketService.build_ticket_response(db, ticket),
        )
        await realtime_manager.broadcast_my_window_update(
            operator.window_id,
            "ticket_called",
            {"ticket_id": str(ticket.id)},
        )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def accept_my_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID, iin: str | None) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)
        old_status = ticket.status
        old_applicant_id = ticket.applicant_id

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

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type=(
                TicketService.get_event_type_for_status(ticket.status)
                if ticket.status != old_status
                else "TICKET_ACCEPTED"
            ),
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
            metadata_extra={
                "changes": TicketService.compact_changes(
                    {
                        "applicant_id": {
                            "old": old_applicant_id,
                            "new": ticket.applicant_id,
                        },
                        "status": {
                            "old": old_status,
                            "new": ticket.status,
                        },
                    }
                )
            },
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
    async def accept_reception_ticket(db, ticket_id: uuid.UUID, iin: str | None) -> dict:
        ticket = await TicketService.get_reception_ticket(db, ticket_id)
        old_status = ticket.status
        old_applicant_id = ticket.applicant_id

        if iin is not None:
            ticket.applicant_id = await TicketService.resolve_applicant_id_by_iin(db, iin)

        ticket.status = TicketStatus.CALLED.value
        now = datetime.utcnow()
        if ticket.called_at is None:
            ticket.called_at = now
        if ticket.started_at is None:
            ticket.started_at = now

        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type=(
                TicketService.get_event_type_for_status(ticket.status)
                if ticket.status != old_status
                else "TICKET_ACCEPTED"
            ),
            old_status=old_status,
            new_status=ticket.status,
            operator_id=None,
            metadata_extra={
                "source": "reception",
                "changes": TicketService.compact_changes(
                    {
                        "applicant_id": {
                            "old": old_applicant_id,
                            "new": ticket.applicant_id,
                        },
                        "status": {
                            "old": old_status,
                            "new": ticket.status,
                        },
                    }
                ),
            },
        )

        await realtime_manager.broadcast_my_window_update(
            ticket.window_id,
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
                raise HTTPException(status_code=409, detail="Абитуриент с таким ИИН уже существует")

        return applicant.id

    @staticmethod
    async def complete_my_ticket(db, user_id: uuid.UUID, ticket_id: uuid.UUID) -> dict:
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)

        if ticket.status != TicketStatus.CALLED.value:
            raise HTTPException(status_code=409, detail="Завершить можно только принятый талон")

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
    async def complete_reception_ticket(db, ticket_id: uuid.UUID) -> dict:
        ticket = await TicketService.get_reception_ticket(db, ticket_id)

        if ticket.status != TicketStatus.CALLED.value:
            raise HTTPException(status_code=409, detail="Завершить можно только принятый талон")

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
            operator_id=None,
            metadata_extra={"source": "reception"},
        )

        await realtime_manager.broadcast_my_window_update(
            ticket.window_id,
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
            raise HTTPException(status_code=409, detail="Пропустить можно только принятый талон")

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
    async def skip_reception_ticket(db, ticket_id: uuid.UUID) -> dict:
        ticket = await TicketService.get_reception_ticket(db, ticket_id)

        old_status = ticket.status
        ticket.status = TicketStatus.SKIPPED.value
        now = datetime.utcnow()
        if ticket.called_at is None:
            ticket.called_at = now
        if ticket.started_at is None:
            ticket.started_at = now
        ticket.completed_at = datetime.utcnow()
        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type=TicketService.get_event_type_for_status(ticket.status),
            old_status=old_status,
            new_status=ticket.status,
            operator_id=None,
            metadata_extra={"source": "reception"},
        )

        await realtime_manager.broadcast_my_window_update(
            ticket.window_id,
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
            raise HTTPException(status_code=409, detail="Отказать можно только ожидающему талону")

        previous_window_id = ticket.window_id
        old_status = ticket.status
        ticket.operator_id = None
        ticket.window_id = None
        ticket.assignment_score = None
        ticket.called_at = None
        ticket.started_at = None
        ticket.completed_at = None

        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_DECLINED",
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
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
            raise HTTPException(status_code=404, detail="Услуга не найдена")

        previous_window_id = ticket.window_id

        educational_program = await TicketService.validate_educational_program(db, service, data.educational_program_id)
        study_language = TicketService.validate_study_language(educational_program, data.study_language)
        service_language = TicketService.validate_service_language(service, data.service_language)

        old_status = ticket.status
        ticket.service_id = data.service_id
        ticket.educational_program_id = data.educational_program_id
        ticket.study_language = study_language
        ticket.service_language = service_language
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
        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="SERVICE_CHANGED",
            old_status=old_status,
            new_status=ticket.status,
            operator_id=operator.id,
        )

        await realtime_manager.broadcast_my_window_update(
            previous_window_id,
            "ticket_reassigned",
            {"ticket_id": str(ticket.id)},
        )
        if ticket.window_id != previous_window_id:
            await realtime_manager.broadcast_my_window_update(
                ticket.window_id,
                "ticket_reassigned",
                {"ticket_id": str(ticket.id)},
            )
        await realtime_manager.broadcast_all_my_windows_update(
            "global_waiting_count_changed",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def reassign_reception_ticket_service(
        db,
        ticket_id: uuid.UUID,
        data: TicketServiceReassign,
    ) -> dict:
        ticket = await TicketService.get_reception_ticket(db, ticket_id)
        service = await ServiceService.get_by_id(db, data.service_id)

        if service is None:
            raise HTTPException(status_code=404, detail="Услуга не найдена")

        previous_window_id = ticket.window_id

        educational_program = await TicketService.validate_educational_program(db, service, data.educational_program_id)
        study_language = TicketService.validate_study_language(educational_program, data.study_language)
        service_language = TicketService.validate_service_language(service, data.service_language)

        old_status = ticket.status
        ticket.service_id = data.service_id
        ticket.educational_program_id = data.educational_program_id
        ticket.study_language = study_language
        ticket.service_language = service_language
        ticket.priority = service.priority
        ticket.status = TicketStatus.WAITING.value
        ticket.called_at = None
        ticket.started_at = None
        ticket.completed_at = None

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
        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="SERVICE_CHANGED",
            old_status=old_status,
            new_status=ticket.status,
            operator_id=None,
            metadata_extra={"source": "reception"},
        )

        await realtime_manager.broadcast_my_window_update(
            previous_window_id,
            "ticket_reassigned",
            {"ticket_id": str(ticket.id)},
        )
        if ticket.window_id != previous_window_id:
            await realtime_manager.broadcast_my_window_update(
                ticket.window_id,
                "ticket_reassigned",
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
        operator, ticket = await TicketService.get_owned_ticket(db, user_id, ticket_id)
        old_study_language = ticket.study_language
        ticket.study_language = study_language
        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_STUDY_LANGUAGE_UPDATED",
            old_status=ticket.status,
            new_status=ticket.status,
            operator_id=operator.id,
            metadata_extra={
                "changes": TicketService.compact_changes(
                    {
                        "study_language": {
                            "old": old_study_language,
                            "new": ticket.study_language,
                        }
                    }
                )
            },
        )

        await realtime_manager.broadcast_my_window_update(
            ticket.window_id,
            "ticket_updated",
            {"ticket_id": str(ticket.id)},
        )

        return await TicketService.build_ticket_response(db, ticket)

    @staticmethod
    async def update_reception_ticket_study_language(
        db,
        ticket_id: uuid.UUID,
        study_language: StudyLanguage | None,
    ) -> dict:
        ticket = await TicketService.get_reception_ticket(db, ticket_id)
        old_study_language = ticket.study_language
        ticket.study_language = study_language
        ticket = await TicketRepository.update(db, ticket)

        await TicketService.create_ticket_event(
            db,
            ticket_id=ticket.id,
            event_type="TICKET_STUDY_LANGUAGE_UPDATED",
            old_status=ticket.status,
            new_status=ticket.status,
            operator_id=None,
            metadata_extra={
                "source": "reception",
                "changes": TicketService.compact_changes(
                    {
                        "study_language": {
                            "old": old_study_language,
                            "new": ticket.study_language,
                        }
                    }
                ),
            },
        )

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
                detail="Талон не найден"
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
                detail="Талон не найден"
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
                    detail="Услуга не найдена"
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

            if "service_id" in update_data and "window_id" not in update_data:
                update_data["operator_id"] = None
                update_data["window_id"] = None
                update_data["assignment_score"] = None

        if update_data.get("applicant_id") is not None:
            await TicketService.ensure_applicant_exists(db, update_data["applicant_id"])

        if update_data.get("operator_id") is not None:
            await TicketService.ensure_operator_exists(db, update_data["operator_id"])

        new_status = update_data.get("status")
        if new_status == TicketStatus.CALLED.value and "called_at" not in update_data:
            update_data["called_at"] = datetime.utcnow()
        elif new_status == TicketStatus.COMPLETED.value and "completed_at" not in update_data:
            update_data["completed_at"] = datetime.utcnow()

        tracked_update_fields = sorted(set(update_data) & TicketService.TICKET_STATE_FIELDS)
        old_values = {
            field: TicketService.to_metadata_value(getattr(ticket, field))
            for field in tracked_update_fields
        }

        for field, value in update_data.items():
            setattr(ticket, field, value)

        ticket = await TicketRepository.update(
            db,
            ticket
        )

        status_changed = "status" in update_data and ticket.status != old_status
        changes = TicketService.compact_changes(
            {
                field: {
                    "old": old_values[field],
                    "new": getattr(ticket, field),
                }
                for field in tracked_update_fields
            }
        )

        if status_changed or changes:
            await TicketService.create_ticket_event(
                db,
                ticket_id=ticket.id,
                event_type=(
                    TicketService.get_event_type_for_status(ticket.status)
                    if status_changed
                    else "TICKET_UPDATED"
                ),
                old_status=old_status,
                new_status=ticket.status,
                operator_id=ticket.operator_id,
                metadata_extra={"changes": changes},
            )

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
                detail="Талон не найден"
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
                detail="У талона есть история событий, поэтому его нельзя удалить",
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
                raise HTTPException(status_code=409, detail="Абитуриент с таким ИИН уже существует")

        return applicant.id

    @staticmethod
    async def ensure_applicant_exists(db, applicant_id: uuid.UUID) -> None:
        result = await db.execute(select(Applicant.id).where(Applicant.id == applicant_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Абитуриент не найден")

    @staticmethod
    async def ensure_operator_exists(db, operator_id: uuid.UUID) -> None:
        result = await db.execute(select(Operator.id).where(Operator.id == operator_id))

        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Оператор не найден")

    @staticmethod
    async def validate_educational_program(
        db,
        service: Service | None,
        educational_program_id: int | None,
    ) -> EducationalProgram | None:
        if service is None:
            return None

        requires_program = service.requires_educational_program

        if requires_program and educational_program_id is None:
            raise HTTPException(
                status_code=422,
                detail="Для этой услуги нужно выбрать ОП",
            )

        if educational_program_id is None:
            return None

        result = await db.execute(
            select(EducationalProgram).where(
                EducationalProgram.id == educational_program_id,
                EducationalProgram.is_active.is_(True),
            )
        )

        educational_program = result.scalar_one_or_none()

        if educational_program is None:
            raise HTTPException(
                status_code=404,
                detail="ОП не найдена",
            )

        return educational_program

    @staticmethod
    def validate_study_language(
        educational_program: EducationalProgram | None,
        study_language: StudyLanguage | None,
    ) -> str | None:
        if educational_program is None:
            return None

        if educational_program.requires_service_language and study_language is None:
            raise HTTPException(
                status_code=422,
                detail="Для выбранной ОП нужно выбрать язык обучения",
            )

        if study_language is None:
            return None

        if study_language not in TicketService.SERVICE_LANGUAGES:
            raise HTTPException(
                status_code=422,
                detail="Некорректный язык обучения",
            )

        return study_language if educational_program.requires_service_language else None

    @staticmethod
    def validate_service_language(
        service: Service | None,
        service_language: ServiceLanguage | None,
    ) -> str | None:
        if service is None:
            return None

        if service.requires_service_language and service_language is None:
            raise HTTPException(
                status_code=422,
                detail="Для этой услуги нужно выбрать язык обслуживания",
            )

        if service_language is None:
            return None

        if service_language not in TicketService.SERVICE_LANGUAGES:
            raise HTTPException(
                status_code=422,
                detail="Некорректный язык обслуживания",
            )

        return service_language if service.requires_service_language else None

    @staticmethod
    async def create_ticket_event(
        db,
        ticket_id: uuid.UUID,
        event_type: str | None,
        old_status: str | None,
        new_status: str | None,
        operator_id: uuid.UUID | None,
        metadata_extra: dict[str, Any] | None = None,
    ) -> None:
        metadata = await TicketService.build_ticket_event_metadata(
            db,
            ticket_id=ticket_id,
            event_type=event_type,
            old_status=old_status,
            new_status=new_status,
            operator_id=operator_id,
            metadata_extra=metadata_extra,
        )

        db.add(
            TicketEvent(
                ticket_id=ticket_id,
                event_type=event_type,
                old_status=old_status,
                new_status=new_status,
                operator_id=operator_id,
                metadata_=metadata,
            )
        )
        await db.commit()

    @staticmethod
    def get_event_type_for_status(status: str) -> str:
        return TicketService.STATUS_EVENT_TYPES.get(status, "STATUS_CHANGED")

    @staticmethod
    async def build_ticket_event_metadata(
        db,
        ticket_id: uuid.UUID,
        event_type: str | None,
        old_status: str | None,
        new_status: str | None,
        operator_id: uuid.UUID | None,
        metadata_extra: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ticket = await TicketRepository.get_by_id(db, ticket_id)
        ticket_snapshot = None
        assigned_operator = None
        assigned_window = None

        if ticket is not None:
            ticket_snapshot = await TicketService.build_ticket_response(db, ticket)
            assigned_operator = await TicketService.build_operator_snapshot(db, ticket.operator_id)
            assigned_window = await TicketService.build_window_snapshot(db, ticket.window_id)

        metadata: dict[str, Any] = {
            "event_type": event_type,
            "old_status": old_status,
            "new_status": new_status,
            "ticket_snapshot": ticket_snapshot,
            "assigned_operator": assigned_operator,
            "assigned_window": assigned_window,
            "actor_operator": await TicketService.build_operator_snapshot(db, operator_id),
        }

        if metadata_extra:
            reserved_keys = set(metadata)
            for key, value in metadata_extra.items():
                if key not in reserved_keys:
                    metadata[key] = value

        return TicketService.to_metadata_value(metadata)

    @staticmethod
    async def build_operator_snapshot(db, operator_id: uuid.UUID | None) -> dict[str, Any] | None:
        if operator_id is None:
            return None

        operator = await db.get(Operator, operator_id)
        if operator is None:
            return None

        user = await db.get(User, operator.user_id)
        window = await db.get(Window, operator.window_id) if operator.window_id is not None else None

        return {
            "id": operator.id,
            "user_id": operator.user_id,
            "status": operator.status,
            "window_id": operator.window_id,
            "window_name": window.name if window else None,
            "window_floor": window.floor if window else None,
            "window_status": window.status if window else None,
            "full_name": user.full_name if user else None,
            "email": user.email if user else None,
        }

    @staticmethod
    async def build_window_snapshot(db, window_id: int | None) -> dict[str, Any] | None:
        if window_id is None:
            return None

        window = await db.get(Window, window_id)
        if window is None:
            return None

        return {
            "id": window.id,
            "name": window.name,
            "floor": window.floor,
            "status": window.status,
            "current_operator_id": window.current_operator_id,
        }

    @staticmethod
    def compact_changes(changes: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
        compacted = {}
        for field, values in changes.items():
            old_value = TicketService.to_metadata_value(values.get("old"))
            new_value = TicketService.to_metadata_value(values.get("new"))
            if old_value != new_value:
                compacted[field] = {
                    "old": old_value,
                    "new": new_value,
                }

        return compacted

    @staticmethod
    def to_metadata_value(value: Any) -> Any:
        if isinstance(value, uuid.UUID):
            return str(value)

        if isinstance(value, datetime):
            return value.isoformat()

        if isinstance(value, enum.Enum):
            return value.value

        if isinstance(value, dict):
            return {
                str(key): TicketService.to_metadata_value(nested_value)
                for key, nested_value in value.items()
            }

        if isinstance(value, list):
            return [TicketService.to_metadata_value(item) for item in value]

        if isinstance(value, tuple):
            return [TicketService.to_metadata_value(item) for item in value]

        return value

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
            "service_language": ticket.service_language,
            "full_name": applicant.full_name if applicant else None,
            "iin": applicant.iin if applicant else None,
            "phone": applicant.phone if applicant else None,
            "service_name": service.name if service else None,
            "service_code": service.code if service else None,
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
            "window_floor": window.floor if window else None,
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
