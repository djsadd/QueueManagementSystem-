from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import TicketStatus
from app.models.education import (
    AcademicDegree,
    EducationalProgram,
    OperatorAcademicDegree,
    OperatorEducationalProgram,
)
from app.models.operator import Operator, OperatorStatus
from app.models.service import OperatorService as OperatorServiceLink
from app.models.service import Service
from app.models.ticket import Ticket
from app.models.window import Window


ASSIGNABLE_WINDOW_STATUSES = {"OPEN", "AVAILABLE"}
ACTIVE_TICKET_STATUSES = {TicketStatus.WAITING.value, TicketStatus.CALLED.value}
DEFAULT_SERVICE_LANGUAGES = {"KAZAKH", "RUSSIAN", "ENGLISH"}


@dataclass(frozen=True)
class OperatorProfile:
    operator: Operator
    active_ticket_count: int
    service_ids: set[int]
    service_languages_by_service: dict[int, set[str]]
    program_ids: set[int]
    degree_ids: set[int]


class AssignmentService:
    @staticmethod
    async def prepare_ticket_routing(
        db: AsyncSession,
        service_id: int,
        educational_program_id: int | None,
    ) -> tuple[int | None, str]:
        service = await db.get(Service, service_id)
        program = None
        degree = None

        if educational_program_id is not None:
            program = await db.get(EducationalProgram, educational_program_id)

            if program is not None:
                degree = await db.get(AcademicDegree, program.academic_degree_id)

        degree_code = AssignmentService.normalize_route_part(degree.code if degree else "any_degree")
        program_code = AssignmentService.normalize_route_part(program.code if program else "any_program")
        service_code = AssignmentService.normalize_route_part(
            service.code if service and service.code else f"service_{service_id}"
        )

        return (
            program.academic_degree_id if program is not None else None,
            f"{degree_code}.{program_code}.{service_code}",
        )

    @staticmethod
    async def assign_ticket_to_best_window(
        db: AsyncSession,
        ticket: Ticket,
        excluded_operator_ids: set[uuid.UUID] | None = None,
    ) -> Operator | None:
        excluded_operator_ids = excluded_operator_ids or set()
        candidates = await AssignmentService.get_assignable_operator_profiles(db)
        scored_candidates = [
            (AssignmentService.score_operator_for_ticket(profile, ticket), profile)
            for profile in candidates
            if profile.operator.id not in excluded_operator_ids
            and ticket.service_id in profile.service_ids
            and AssignmentService.operator_can_handle_ticket(profile, ticket)
        ]
        scored_candidates = [(score, profile) for score, profile in scored_candidates if score > 0]

        if not scored_candidates:
            return None

        score, profile = max(
            scored_candidates,
            key=lambda item: (
                item[0],
                -item[1].active_ticket_count,
                -AssignmentService.datetime_timestamp(item[1].operator.created_at),
            ),
        )
        ticket.window_id = profile.operator.window_id
        ticket.operator_id = profile.operator.id
        ticket.assignment_score = score

        await db.commit()
        await db.refresh(ticket)
        return profile.operator

    @staticmethod
    async def assign_best_waiting_ticket_to_window(
        db: AsyncSession,
        operator: Operator,
    ) -> Ticket | None:
        if operator.window_id is None:
            return None

        profile = await AssignmentService.get_operator_profile_if_assignable(db, operator)

        if profile is None:
            return None

        result = await db.execute(
            select(Ticket)
            .where(
                Ticket.window_id.is_(None),
                Ticket.status == TicketStatus.WAITING.value,
                Ticket.service_id.in_(profile.service_ids),
            )
            .order_by(Ticket.priority.desc(), Ticket.created_at.asc())
            .with_for_update(skip_locked=True)
        )
        tickets = list(result.scalars().all())
        scored_tickets = [
            (AssignmentService.score_ticket_for_operator(ticket, profile), ticket)
            for ticket in tickets
            if AssignmentService.operator_can_handle_ticket(profile, ticket)
        ]
        scored_tickets = [(score, ticket) for score, ticket in scored_tickets if score > 0]

        if not scored_tickets:
            return None

        score, ticket = max(scored_tickets, key=lambda item: (item[0], -item[1].queue_number))
        ticket.window_id = operator.window_id
        ticket.operator_id = operator.id
        ticket.assignment_score = score

        await db.commit()
        await db.refresh(ticket)
        return ticket

    @staticmethod
    async def get_assignable_operator_profiles(db: AsyncSession) -> list[OperatorProfile]:
        active_ticket_count = func.count(Ticket.id).label("active_ticket_count")
        result = await db.execute(
            select(Operator, active_ticket_count)
            .join(Window, Window.id == Operator.window_id)
            .outerjoin(
                Ticket,
                and_(
                    Ticket.window_id == Operator.window_id,
                    Ticket.status.in_(ACTIVE_TICKET_STATUSES),
                ),
            )
            .where(
                Operator.status == OperatorStatus.ONLINE,
                Operator.window_id.is_not(None),
                Window.status.in_(ASSIGNABLE_WINDOW_STATUSES),
            )
            .group_by(Operator.id)
            .having(func.count(Ticket.id) == 0)
            .order_by(active_ticket_count.asc(), Operator.created_at.asc())
        )
        rows = result.all()

        return [
            await AssignmentService.build_operator_profile(db, operator, active_count)
            for operator, active_count in rows
        ]

    @staticmethod
    async def get_operator_profile_if_assignable(
        db: AsyncSession,
        operator: Operator,
    ) -> OperatorProfile | None:
        result = await db.execute(
            select(Window.status).where(Window.id == operator.window_id)
        )
        window_status = result.scalar_one_or_none()

        if (
            operator.status != OperatorStatus.ONLINE
            or operator.window_id is None
            or window_status not in ASSIGNABLE_WINDOW_STATUSES
        ):
            return None

        result = await db.execute(
            select(func.count(Ticket.id)).where(
                Ticket.window_id == operator.window_id,
                Ticket.status.in_(ACTIVE_TICKET_STATUSES),
            )
        )
        active_count = result.scalar() or 0

        if active_count > 0:
            return None

        profile = await AssignmentService.build_operator_profile(db, operator, active_count)
        return profile if profile.service_ids else None

    @staticmethod
    async def build_operator_profile(
        db: AsyncSession,
        operator: Operator,
        active_ticket_count: int,
    ) -> OperatorProfile:
        result = await db.execute(
            select(OperatorServiceLink).where(OperatorServiceLink.operator_id == operator.id)
        )
        service_links = list(result.scalars().all())
        service_ids = {link.service_id for link in service_links}
        service_languages_by_service = {
            link.service_id: AssignmentService.normalize_service_languages(link.service_languages)
            for link in service_links
        }

        result = await db.execute(
            select(OperatorEducationalProgram.educational_program_id).where(
                OperatorEducationalProgram.operator_id == operator.id
            )
        )
        program_ids = set(result.scalars().all())

        result = await db.execute(
            select(OperatorAcademicDegree.academic_degree_id).where(
                OperatorAcademicDegree.operator_id == operator.id
            )
        )
        degree_ids = set(result.scalars().all())

        return OperatorProfile(
            operator=operator,
            active_ticket_count=active_ticket_count,
            service_ids=service_ids,
            service_languages_by_service=service_languages_by_service,
            program_ids=program_ids,
            degree_ids=degree_ids,
        )

    @staticmethod
    def operator_can_handle_ticket(profile: OperatorProfile, ticket: Ticket) -> bool:
        if ticket.service_language is not None:
            service_languages = profile.service_languages_by_service.get(
                ticket.service_id,
                DEFAULT_SERVICE_LANGUAGES,
            )
            if ticket.service_language not in service_languages:
                return False

        if ticket.educational_program_id is not None:
            return ticket.educational_program_id in profile.program_ids

        if ticket.academic_degree_id is not None:
            return ticket.academic_degree_id in profile.degree_ids

        return True

    @staticmethod
    def normalize_service_languages(service_languages: list[str] | None) -> set[str]:
        if not service_languages:
            return DEFAULT_SERVICE_LANGUAGES.copy()

        normalized = DEFAULT_SERVICE_LANGUAGES.intersection(service_languages)
        return normalized or DEFAULT_SERVICE_LANGUAGES.copy()

    @staticmethod
    def score_operator_for_ticket(profile: OperatorProfile, ticket: Ticket) -> int:
        return (
            ticket.priority * 100
            + AssignmentService.waiting_minutes(ticket) * 3
            + AssignmentService.match_score(profile, ticket)
            - profile.active_ticket_count * 30
        )

    @staticmethod
    def score_ticket_for_operator(ticket: Ticket, profile: OperatorProfile) -> int:
        return (
            ticket.priority * 100
            + AssignmentService.waiting_minutes(ticket) * 3
            + AssignmentService.match_score(profile, ticket)
            - (ticket.estimated_wait or 0) * 2
        )

    @staticmethod
    def match_score(profile: OperatorProfile, ticket: Ticket) -> int:
        score = 50

        if ticket.educational_program_id is not None and ticket.educational_program_id in profile.program_ids:
            score += 60
        elif ticket.academic_degree_id is not None and ticket.academic_degree_id in profile.degree_ids:
            score += 40

        return score

    @staticmethod
    def waiting_minutes(ticket: Ticket) -> int:
        created_at = ticket.created_at
        if created_at is None:
            return 0

        if created_at.tzinfo is not None:
            created_at = created_at.replace(tzinfo=None)

        return max(0, int((datetime.utcnow() - created_at).total_seconds() // 60))

    @staticmethod
    def normalize_route_part(value: str) -> str:
        return value.strip().lower().replace(" ", "_").replace(".", "_")

    @staticmethod
    def datetime_timestamp(value) -> float:
        if value is None:
            return 0

        return value.timestamp()
