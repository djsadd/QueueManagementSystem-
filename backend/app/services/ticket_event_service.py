import uuid
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.models.operator import Operator
from app.models.service import Service
from app.models.ticket import Ticket
from app.models.ticket_event import TicketEvent
from app.models.user import User
from app.models.window import Window
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

        if create_data.get("ticket_id") is not None:
            from app.services.ticket_service import TicketService

            metadata = await TicketService.build_ticket_event_metadata(
                db,
                ticket_id=create_data["ticket_id"],
                event_type=create_data.get("event_type"),
                old_status=create_data.get("old_status"),
                new_status=create_data.get("new_status"),
                operator_id=create_data.get("operator_id"),
                metadata_extra=metadata,
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
    async def get_all(
        db: AsyncSession,
        date_from: date | None = None,
        date_to: date | None = None,
        include_metadata: bool = True,
    ) -> list[TicketEvent]:
        query = TicketEventService.apply_created_at_date_filter(
            select(TicketEvent),
            date_from,
            date_to,
        )
        if not include_metadata:
            query = query.options(defer(TicketEvent.metadata_))

        result = await db.execute(query.order_by(TicketEvent.created_at.desc()))
        return list(result.scalars().all())

    @staticmethod
    async def get_page(
        db: AsyncSession,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        event_type: str | None = None,
        operator_id: uuid.UUID | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        include_metadata: bool = True,
    ) -> dict:
        conditions = TicketEventService.build_filter_conditions(
            search=search,
            event_type=event_type,
            operator_id=operator_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
        )
        total_result = await db.execute(select(func.count()).select_from(TicketEvent).where(*conditions))
        total = total_result.scalar_one()
        total_pages = max(1, (total + page_size - 1) // page_size)
        current_page = min(page, total_pages)
        offset = (current_page - 1) * page_size
        query = (
            select(TicketEvent)
            .where(*conditions)
            .order_by(TicketEvent.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )

        if not include_metadata:
            query = query.options(defer(TicketEvent.metadata_))

        result = await db.execute(query)
        return {
            "items": list(result.scalars().all()),
            "page": current_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        }

    @staticmethod
    def build_filter_conditions(
        search: str | None = None,
        event_type: str | None = None,
        operator_id: uuid.UUID | None = None,
        status: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list:
        conditions = []

        if date_from is not None:
            conditions.append(TicketEvent.created_at >= TicketEventService.get_aware_day_start(date_from))

        if date_to is not None:
            conditions.append(TicketEvent.created_at < TicketEventService.get_aware_next_day_start(date_to))

        if event_type:
            conditions.append(TicketEvent.event_type == event_type)

        if operator_id is not None:
            conditions.append(TicketEvent.operator_id == operator_id)

        if status:
            conditions.append(or_(TicketEvent.old_status == status, TicketEvent.new_status == status))

        normalized_search = (search or "").strip()
        if normalized_search:
            search_pattern = f"%{normalized_search}%"
            conditions.append(
                or_(
                    cast(TicketEvent.id, String).ilike(search_pattern),
                    cast(TicketEvent.ticket_id, String).ilike(search_pattern),
                    TicketEvent.event_type.ilike(search_pattern),
                    TicketEvent.old_status.ilike(search_pattern),
                    TicketEvent.new_status.ilike(search_pattern),
                    cast(TicketEvent.metadata_, String).ilike(search_pattern),
                )
            )

        return conditions

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
    async def get_operator_analytics(
        db: AsyncSession,
        operator_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> list[dict]:
        operator_query = select(Operator)
        if operator_id is not None:
            operator_query = operator_query.where(Operator.id == operator_id)

        operator_result = await db.execute(operator_query.order_by(Operator.created_at.asc()))
        operators = list(operator_result.scalars().all())
        operator_ids = [operator.id for operator in operators]

        user_ids = {operator.user_id for operator in operators}
        window_ids = {operator.window_id for operator in operators if operator.window_id is not None}
        users_by_id: dict[uuid.UUID, User] = {}
        windows_by_id: dict[int, Window] = {}

        if user_ids:
            user_result = await db.execute(select(User).where(User.id.in_(user_ids)))
            users_by_id = {user.id: user for user in user_result.scalars().all()}

        if window_ids:
            window_result = await db.execute(select(Window).where(Window.id.in_(window_ids)))
            windows_by_id = {window.id: window for window in window_result.scalars().all()}

        event_query = select(TicketEvent)
        if operator_id is not None:
            event_query = event_query.where(TicketEvent.operator_id == operator_id)
        event_query = TicketEventService.apply_created_at_date_filter(event_query, date_from, date_to)

        event_result = await db.execute(event_query.order_by(TicketEvent.created_at.desc()))
        events = list(event_result.scalars().all())
        events_by_operator: dict[uuid.UUID, list[TicketEvent]] = {}
        for event in events:
            if event.operator_id is None:
                continue

            events_by_operator.setdefault(event.operator_id, []).append(event)

        tickets_by_id: dict[uuid.UUID, Ticket] = {}
        services_by_id: dict[int, Service] = {}
        ticket_ids = {event.ticket_id for event in events if event.ticket_id is not None}
        if ticket_ids:
            ticket_result = await db.execute(select(Ticket).where(Ticket.id.in_(ticket_ids)))
            tickets_by_id = {ticket.id: ticket for ticket in ticket_result.scalars().all()}

        service_ids = {
            service_id
            for event in events
            if (service_id := TicketEventService.get_event_service_id(event, tickets_by_id)) is not None
        }
        if service_ids:
            service_result = await db.execute(select(Service).where(Service.id.in_(service_ids)))
            services_by_id = {service.id: service for service in service_result.scalars().all()}

        rows = []
        for operator in operators:
            operator_events = events_by_operator.get(operator.id, [])
            accepted = sum(
                1
                for event in operator_events
                if TicketEventService.is_accepted_event(event)
            )
            completed = sum(
                1
                for event in operator_events
                if TicketEventService.is_completed_event(event)
            )
            skipped = sum(
                1
                for event in operator_events
                if TicketEventService.is_skipped_event(event)
            )
            declined = sum(
                1
                for event in operator_events
                if TicketEventService.is_declined_event(event)
            )
            total_actions = accepted + completed + skipped + declined
            last_activity = operator_events[0].created_at if operator_events else None
            processing_seconds = TicketEventService.get_event_processing_seconds(
                operator_events,
                tickets_by_id,
            )
            total_processing_seconds = sum(processing_seconds)
            average_processing_seconds = (
                round(total_processing_seconds / len(processing_seconds))
                if processing_seconds
                else 0
            )
            status_work_seconds, break_seconds = TicketEventService.get_status_seconds(
                operator_events,
            )
            popular_service_id, popular_service_count = TicketEventService.get_popular_service_from_events(
                operator_events,
                tickets_by_id,
            )
            user = users_by_id.get(operator.user_id)
            window = windows_by_id.get(operator.window_id) if operator.window_id is not None else None
            popular_service = services_by_id.get(popular_service_id) if popular_service_id is not None else None

            rows.append(
                {
                    "operator_id": operator.id,
                    "operator_name": user.full_name if user else None,
                    "operator_email": user.email if user else None,
                    "window_id": operator.window_id,
                    "window_name": window.name if window else None,
                    "window_status": window.status if window else None,
                    "accepted": accepted,
                    "completed": completed,
                    "skipped": skipped,
                    "declined": declined,
                    "processed": completed + skipped,
                    "total_actions": total_actions,
                    "completion_rate": round((completed / accepted) * 100) if accepted else 0,
                    "average_processing_seconds": average_processing_seconds,
                    "total_processing_seconds": total_processing_seconds,
                    "worked_seconds": status_work_seconds if status_work_seconds > 0 else total_processing_seconds,
                    "break_seconds": break_seconds,
                    "popular_service_id": popular_service_id,
                    "popular_service_name": popular_service.name if popular_service else None,
                    "popular_service_count": popular_service_count,
                    "last_activity": last_activity,
                    "service_analytics": TicketEventService.get_service_analytics_from_events(
                        operator_events,
                        tickets_by_id,
                        services_by_id,
                    ),
                    "daily_analytics": TicketEventService.get_daily_analytics_from_events(operator_events),
                }
            )

        return rows

    @staticmethod
    def apply_created_at_date_filter(query, date_from: date | None, date_to: date | None):
        if date_from is not None:
            query = query.where(TicketEvent.created_at >= TicketEventService.get_aware_day_start(date_from))

        if date_to is not None:
            query = query.where(TicketEvent.created_at < TicketEventService.get_aware_next_day_start(date_to))

        return query

    @staticmethod
    def apply_ticket_created_at_date_filter(query, date_from: date | None, date_to: date | None):
        if date_from is not None:
            query = query.where(Ticket.created_at >= TicketEventService.get_naive_day_start(date_from))

        if date_to is not None:
            query = query.where(Ticket.created_at < TicketEventService.get_naive_next_day_start(date_to))

        return query

    @staticmethod
    def get_naive_day_start(value: date) -> datetime:
        return datetime.combine(value, time.min)

    @staticmethod
    def get_naive_next_day_start(value: date) -> datetime:
        return TicketEventService.get_naive_day_start(value) + timedelta(days=1)

    @staticmethod
    def get_aware_day_start(value: date) -> datetime:
        return datetime.combine(value, time.min, tzinfo=timezone.utc)

    @staticmethod
    def get_aware_next_day_start(value: date) -> datetime:
        return TicketEventService.get_aware_day_start(value) + timedelta(days=1)

    @staticmethod
    def event_matches(ticket_event: TicketEvent, event_type: str, new_status: str) -> bool:
        return ticket_event.event_type == event_type or ticket_event.new_status == new_status

    @staticmethod
    def is_accepted_event(ticket_event: TicketEvent) -> bool:
        return TicketEventService.event_matches(ticket_event, "TICKET_CALLED", "CALLED")

    @staticmethod
    def is_completed_event(ticket_event: TicketEvent) -> bool:
        return TicketEventService.event_matches(ticket_event, "TICKET_COMPLETED", "COMPLETED")

    @staticmethod
    def is_skipped_event(ticket_event: TicketEvent) -> bool:
        return TicketEventService.event_matches(ticket_event, "TICKET_SKIPPED", "SKIPPED")

    @staticmethod
    def is_declined_event(ticket_event: TicketEvent) -> bool:
        return ticket_event.event_type == "TICKET_DECLINED"

    @staticmethod
    def is_handling_event(ticket_event: TicketEvent) -> bool:
        return (
            TicketEventService.is_accepted_event(ticket_event)
            or TicketEventService.is_completed_event(ticket_event)
            or TicketEventService.is_skipped_event(ticket_event)
        )

    @staticmethod
    def get_event_ticket_key(ticket_event: TicketEvent) -> str:
        return str(ticket_event.ticket_id or ticket_event.id)

    @staticmethod
    def get_event_ticket_snapshot(ticket_event: TicketEvent) -> dict[str, Any] | None:
        metadata = ticket_event.metadata_
        if not isinstance(metadata, dict):
            return None

        snapshot = metadata.get("ticket_snapshot")
        return snapshot if isinstance(snapshot, dict) else None

    @staticmethod
    def get_event_service_id(
        ticket_event: TicketEvent,
        tickets_by_id: dict[uuid.UUID, Ticket],
    ) -> int | None:
        snapshot = TicketEventService.get_event_ticket_snapshot(ticket_event)
        service_id = snapshot.get("service_id") if snapshot else None

        if service_id is not None:
            try:
                return int(service_id)
            except (TypeError, ValueError):
                return None

        if ticket_event.ticket_id is None:
            return None

        ticket = tickets_by_id.get(ticket_event.ticket_id)
        return ticket.service_id if ticket is not None else None

    @staticmethod
    def parse_metadata_datetime(value: Any) -> datetime | None:
        if isinstance(value, datetime):
            return value

        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None

        return None

    @staticmethod
    def get_event_snapshot_datetime(ticket_event: TicketEvent, *fields: str) -> datetime | None:
        snapshot = TicketEventService.get_event_ticket_snapshot(ticket_event)
        if not snapshot:
            return None

        for field in fields:
            parsed_datetime = TicketEventService.parse_metadata_datetime(snapshot.get(field))
            if parsed_datetime is not None:
                return parsed_datetime

        return None

    @staticmethod
    def get_event_ticket_datetime(
        ticket_event: TicketEvent,
        tickets_by_id: dict[uuid.UUID, Ticket],
        *fields: str,
    ) -> datetime | None:
        snapshot_datetime = TicketEventService.get_event_snapshot_datetime(ticket_event, *fields)
        if snapshot_datetime is not None:
            return snapshot_datetime

        if ticket_event.ticket_id is None:
            return None

        ticket = tickets_by_id.get(ticket_event.ticket_id)
        if ticket is None:
            return None

        for field in fields:
            value = getattr(ticket, field, None)
            if isinstance(value, datetime):
                return value

        return None

    @staticmethod
    def get_event_processing_seconds(
        events: list[TicketEvent],
        tickets_by_id: dict[uuid.UUID, Ticket],
    ) -> list[int]:
        durations: list[int] = []
        start_times_by_ticket_key: dict[str, datetime] = {}

        for event in sorted(events, key=lambda event_item: event_item.created_at):
            if not TicketEventService.is_handling_event(event):
                continue

            ticket_key = TicketEventService.get_event_ticket_key(event)

            if TicketEventService.is_accepted_event(event):
                start_at = (
                    TicketEventService.get_event_ticket_datetime(
                        event,
                        tickets_by_id,
                        "started_at",
                        "called_at",
                    )
                    or event.created_at
                )
                start_times_by_ticket_key[ticket_key] = start_at

            if not (
                TicketEventService.is_completed_event(event)
                or TicketEventService.is_skipped_event(event)
            ):
                continue

            start_at = (
                TicketEventService.get_event_ticket_datetime(
                    event,
                    tickets_by_id,
                    "started_at",
                    "called_at",
                )
                or start_times_by_ticket_key.get(ticket_key)
            )
            end_at = (
                TicketEventService.get_event_ticket_datetime(
                    event,
                    tickets_by_id,
                    "completed_at",
                )
                or event.created_at
            )

            if start_at is not None:
                durations.append(TicketEventService.get_seconds_between(start_at, end_at))

        return durations

    @staticmethod
    def get_event_wait_seconds(
        ticket_event: TicketEvent,
        tickets_by_id: dict[uuid.UUID, Ticket],
    ) -> int | None:
        created_at = TicketEventService.get_event_ticket_datetime(
            ticket_event,
            tickets_by_id,
            "created_at",
        )
        queue_end_at = (
            TicketEventService.get_event_ticket_datetime(
                ticket_event,
                tickets_by_id,
                "started_at",
                "called_at",
                "completed_at",
            )
            or ticket_event.created_at
        )

        if created_at is None:
            return None

        return TicketEventService.get_seconds_between(created_at, queue_end_at)

    @staticmethod
    def get_service_analytics_from_events(
        events: list[TicketEvent],
        tickets_by_id: dict[uuid.UUID, Ticket],
        services_by_id: dict[int, Service],
    ) -> list[dict]:
        service_stats: dict[int, dict[str, Any]] = {}
        processing_seconds_by_ticket_key = TicketEventService.get_event_processing_seconds_by_ticket_key(
            events,
            tickets_by_id,
        )

        for event in events:
            if not TicketEventService.is_handling_event(event):
                continue

            service_id = TicketEventService.get_event_service_id(event, tickets_by_id)
            if service_id is None:
                continue

            ticket_key = TicketEventService.get_event_ticket_key(event)
            stats = service_stats.setdefault(
                service_id,
                {
                    "ticket_keys": set(),
                    "completed_keys": set(),
                    "skipped_keys": set(),
                    "processing_seconds": [],
                    "wait_seconds": [],
                    "wait_keys": set(),
                    "last_ticket_at": None,
                },
            )
            stats["ticket_keys"].add(ticket_key)

            last_ticket_at = stats["last_ticket_at"]
            if last_ticket_at is None or event.created_at > last_ticket_at:
                stats["last_ticket_at"] = event.created_at

            if ticket_key not in stats["wait_keys"]:
                wait_seconds = TicketEventService.get_event_wait_seconds(event, tickets_by_id)
                if wait_seconds is not None:
                    stats["wait_seconds"].append(wait_seconds)
                    stats["wait_keys"].add(ticket_key)

            if TicketEventService.is_completed_event(event):
                stats["completed_keys"].add(ticket_key)
                if ticket_key in processing_seconds_by_ticket_key:
                    stats["processing_seconds"].append(processing_seconds_by_ticket_key[ticket_key])
            elif TicketEventService.is_skipped_event(event):
                stats["skipped_keys"].add(ticket_key)
                if ticket_key in processing_seconds_by_ticket_key:
                    stats["processing_seconds"].append(processing_seconds_by_ticket_key[ticket_key])

        total_ticket_count = sum(len(stats["ticket_keys"]) for stats in service_stats.values())
        rows: list[dict] = []
        for service_id, stats in service_stats.items():
            service = services_by_id.get(service_id)
            ticket_count = len(stats["ticket_keys"])
            completed = len(stats["completed_keys"])
            skipped = len(stats["skipped_keys"])
            processed = completed + skipped
            active = max(0, ticket_count - processed)
            processing_seconds = stats["processing_seconds"]
            wait_seconds = stats["wait_seconds"]
            total_processing_seconds = sum(processing_seconds)

            rows.append(
                {
                    "service_id": service_id,
                    "service_name": service.name if service else None,
                    "service_code": service.code if service else None,
                    "tickets_count": ticket_count,
                    "completed": completed,
                    "skipped": skipped,
                    "active": active,
                    "processed": processed,
                    "completion_rate": round((completed / processed) * 100) if processed else 0,
                    "share_percent": round((ticket_count / total_ticket_count) * 100) if total_ticket_count else 0,
                    "average_processing_seconds": round(total_processing_seconds / len(processing_seconds))
                    if processing_seconds
                    else 0,
                    "total_processing_seconds": total_processing_seconds,
                    "fastest_processing_seconds": min(processing_seconds) if processing_seconds else 0,
                    "slowest_processing_seconds": max(processing_seconds) if processing_seconds else 0,
                    "average_wait_seconds": round(sum(wait_seconds) / len(wait_seconds)) if wait_seconds else 0,
                    "last_ticket_at": stats["last_ticket_at"],
                }
            )

        return sorted(
            rows,
            key=lambda row: (row["processed"], row["tickets_count"], row["total_processing_seconds"]),
            reverse=True,
        )

    @staticmethod
    def get_event_processing_seconds_by_ticket_key(
        events: list[TicketEvent],
        tickets_by_id: dict[uuid.UUID, Ticket],
    ) -> dict[str, int]:
        durations_by_ticket_key: dict[str, int] = {}
        start_times_by_ticket_key: dict[str, datetime] = {}

        for event in sorted(events, key=lambda event_item: event_item.created_at):
            if not TicketEventService.is_handling_event(event):
                continue

            ticket_key = TicketEventService.get_event_ticket_key(event)

            if TicketEventService.is_accepted_event(event):
                start_times_by_ticket_key[ticket_key] = (
                    TicketEventService.get_event_ticket_datetime(
                        event,
                        tickets_by_id,
                        "started_at",
                        "called_at",
                    )
                    or event.created_at
                )

            if not (
                TicketEventService.is_completed_event(event)
                or TicketEventService.is_skipped_event(event)
            ):
                continue

            start_at = (
                TicketEventService.get_event_ticket_datetime(
                    event,
                    tickets_by_id,
                    "started_at",
                    "called_at",
                )
                or start_times_by_ticket_key.get(ticket_key)
            )
            end_at = (
                TicketEventService.get_event_ticket_datetime(
                    event,
                    tickets_by_id,
                    "completed_at",
                )
                or event.created_at
            )

            if start_at is not None:
                durations_by_ticket_key[ticket_key] = TicketEventService.get_seconds_between(start_at, end_at)

        return durations_by_ticket_key

    @staticmethod
    def get_daily_analytics_from_events(events: list[TicketEvent]) -> list[dict]:
        stats_by_date: dict[str, dict[str, set[str]]] = {}

        for event in events:
            if not TicketEventService.is_handling_event(event):
                continue

            event_date = TicketEventService.normalize_datetime(event.created_at).date().isoformat()
            ticket_key = TicketEventService.get_event_ticket_key(event)
            stats = stats_by_date.setdefault(
                event_date,
                {
                    "ticket_keys": set(),
                    "completed_keys": set(),
                    "skipped_keys": set(),
                },
            )
            stats["ticket_keys"].add(ticket_key)

            if TicketEventService.is_completed_event(event):
                stats["completed_keys"].add(ticket_key)
            elif TicketEventService.is_skipped_event(event):
                stats["skipped_keys"].add(ticket_key)

        rows: list[dict] = []
        for event_date, stats in stats_by_date.items():
            tickets_count = len(stats["ticket_keys"])
            completed = len(stats["completed_keys"])
            skipped = len(stats["skipped_keys"])
            active = max(0, tickets_count - completed - skipped)

            rows.append(
                {
                    "date": event_date,
                    "tickets_count": tickets_count,
                    "completed": completed,
                    "skipped": skipped,
                    "active": active,
                }
            )

        return sorted(rows, key=lambda row: row["date"])

    @staticmethod
    def get_popular_service_from_events(
        events: list[TicketEvent],
        tickets_by_id: dict[uuid.UUID, Ticket],
    ) -> tuple[int | None, int]:
        processed_service_ids = [
            service_id
            for event in events
            if (
                TicketEventService.is_completed_event(event)
                or TicketEventService.is_skipped_event(event)
            )
            and (service_id := TicketEventService.get_event_service_id(event, tickets_by_id)) is not None
        ]
        handled_service_ids = [
            service_id
            for event in events
            if TicketEventService.is_handling_event(event)
            and (service_id := TicketEventService.get_event_service_id(event, tickets_by_id)) is not None
        ]
        counter = Counter(processed_service_ids or handled_service_ids)

        if not counter:
            return None, 0

        service_id, count = counter.most_common(1)[0]
        return service_id, count

    @staticmethod
    def get_processing_seconds(tickets: list[Ticket]) -> list[int]:
        durations: list[int] = []

        for ticket in tickets:
            start_at = ticket.started_at or ticket.called_at
            if start_at is None or ticket.completed_at is None:
                continue

            durations.append(TicketEventService.get_seconds_between(start_at, ticket.completed_at))

        return durations

    @staticmethod
    def get_service_analytics(tickets: list[Ticket], services_by_id: dict[int, Service]) -> list[dict]:
        tickets_by_service: dict[int, list[Ticket]] = {}
        for ticket in tickets:
            tickets_by_service.setdefault(ticket.service_id, []).append(ticket)

        total_ticket_count = len(tickets)
        rows: list[dict] = []
        for service_id, service_tickets in tickets_by_service.items():
            service = services_by_id.get(service_id)
            processing_seconds = TicketEventService.get_processing_seconds(service_tickets)
            total_processing_seconds = sum(processing_seconds)
            completed = sum(1 for ticket in service_tickets if ticket.status == "COMPLETED")
            skipped = sum(1 for ticket in service_tickets if ticket.status == "SKIPPED")
            active = sum(1 for ticket in service_tickets if ticket.status not in {"COMPLETED", "SKIPPED", "CANCELLED"})
            processed = completed + skipped
            wait_seconds = TicketEventService.get_wait_seconds(service_tickets)

            rows.append(
                {
                    "service_id": service_id,
                    "service_name": service.name if service else None,
                    "service_code": service.code if service else None,
                    "tickets_count": len(service_tickets),
                    "completed": completed,
                    "skipped": skipped,
                    "active": active,
                    "processed": processed,
                    "completion_rate": round((completed / processed) * 100) if processed else 0,
                    "share_percent": round((len(service_tickets) / total_ticket_count) * 100) if total_ticket_count else 0,
                    "average_processing_seconds": round(total_processing_seconds / len(processing_seconds))
                    if processing_seconds
                    else 0,
                    "total_processing_seconds": total_processing_seconds,
                    "fastest_processing_seconds": min(processing_seconds) if processing_seconds else 0,
                    "slowest_processing_seconds": max(processing_seconds) if processing_seconds else 0,
                    "average_wait_seconds": round(sum(wait_seconds) / len(wait_seconds)) if wait_seconds else 0,
                    "last_ticket_at": max((ticket.created_at for ticket in service_tickets), default=None),
                }
            )

        return sorted(
            rows,
            key=lambda row: (row["processed"], row["tickets_count"], row["total_processing_seconds"]),
            reverse=True,
        )

    @staticmethod
    def get_daily_analytics(tickets: list[Ticket]) -> list[dict]:
        tickets_by_date: dict[str, list[Ticket]] = {}
        for ticket in tickets:
            ticket_date = TicketEventService.normalize_datetime(ticket.created_at).date().isoformat()
            tickets_by_date.setdefault(ticket_date, []).append(ticket)

        rows: list[dict] = []
        for ticket_date, day_tickets in tickets_by_date.items():
            completed = sum(1 for ticket in day_tickets if ticket.status == "COMPLETED")
            skipped = sum(1 for ticket in day_tickets if ticket.status == "SKIPPED")
            active = sum(1 for ticket in day_tickets if ticket.status not in {"COMPLETED", "SKIPPED", "CANCELLED"})

            rows.append(
                {
                    "date": ticket_date,
                    "tickets_count": len(day_tickets),
                    "completed": completed,
                    "skipped": skipped,
                    "active": active,
                }
            )

        return sorted(rows, key=lambda row: row["date"])

    @staticmethod
    def get_wait_seconds(tickets: list[Ticket]) -> list[int]:
        durations: list[int] = []

        for ticket in tickets:
            queue_end_at = ticket.started_at or ticket.called_at or ticket.completed_at
            if queue_end_at is None:
                continue

            durations.append(TicketEventService.get_seconds_between(ticket.created_at, queue_end_at))

        return durations

    @staticmethod
    def get_popular_service(tickets: list[Ticket]) -> tuple[int | None, int]:
        processed_tickets = [
            ticket
            for ticket in tickets
            if ticket.status in {"COMPLETED", "SKIPPED"}
        ]
        counter = Counter(ticket.service_id for ticket in processed_tickets or tickets)

        if not counter:
            return None, 0

        service_id, count = counter.most_common(1)[0]
        return service_id, count

    @staticmethod
    def get_status_seconds(events: list[TicketEvent]) -> tuple[int, int]:
        status_events = sorted(
            [
                event
                for event in events
                if event.event_type == "OPERATOR_STATUS_CHANGED" and event.new_status is not None
            ],
            key=lambda event: event.created_at,
        )
        if not status_events:
            return 0, 0

        work_seconds = 0
        break_seconds = 0
        now = datetime.now(timezone.utc)

        for index, event in enumerate(status_events):
            next_event = status_events[index + 1] if index + 1 < len(status_events) else None
            end_at = next_event.created_at if next_event is not None else now
            seconds = TicketEventService.get_seconds_between(event.created_at, end_at)
            status = event.new_status

            if status in {"ONLINE", "BUSY"}:
                work_seconds += seconds
            elif status == "BREAK":
                break_seconds += seconds

        return work_seconds, break_seconds

    @staticmethod
    def get_seconds_between(start_at: datetime, end_at: datetime) -> int:
        normalized_start_at = TicketEventService.normalize_datetime(start_at)
        normalized_end_at = TicketEventService.normalize_datetime(end_at)
        return max(0, round((normalized_end_at - normalized_start_at).total_seconds()))

    @staticmethod
    def normalize_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)

        return value.astimezone(timezone.utc)

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

        if ticket_event.ticket_id is not None:
            from app.services.ticket_service import TicketService

            ticket_event.metadata_ = await TicketService.build_ticket_event_metadata(
                db,
                ticket_id=ticket_event.ticket_id,
                event_type=ticket_event.event_type,
                old_status=ticket_event.old_status,
                new_status=ticket_event.new_status,
                operator_id=ticket_event.operator_id,
                metadata_extra=ticket_event.metadata_,
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
