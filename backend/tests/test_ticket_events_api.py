import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.api.ticket_events import routes as ticket_event_routes
from app.dependencies.auth import require_admin
from app.main import app
from app.services.ticket_event_service import TicketEventService


def test_admin_can_filter_ticket_event_analytics_by_operator(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    operator_id = uuid.uuid4()

    async def get_operator_analytics(db, requested_operator_id=None, date_from=None, date_to=None):
        assert requested_operator_id == operator_id
        assert date_from == date(2026, 6, 1)
        assert date_to == date(2026, 6, 30)
        return []

    monkeypatch.setattr(
        ticket_event_routes.TicketEventService,
        "get_operator_analytics",
        get_operator_analytics,
    )

    response = client.get(
        f"/ticket-events/analytics?operator_id={operator_id}&date_from=2026-06-01&date_to=2026-06-30",
    )

    assert response.status_code == 200
    assert response.json() == []


def test_admin_can_load_ticket_events_without_metadata(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user

    async def get_all(db, date_from=None, date_to=None, include_metadata=True):
        assert date_from == date(2026, 6, 1)
        assert date_to == date(2026, 6, 30)
        assert include_metadata is False
        return []

    monkeypatch.setattr(ticket_event_routes.TicketEventService, "get_all", get_all)

    response = client.get(
        "/ticket-events/?date_from=2026-06-01&date_to=2026-06-30&include_metadata=false",
    )

    assert response.status_code == 200
    assert response.json() == []


def test_admin_can_load_paginated_ticket_events_with_filters(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    operator_id = uuid.uuid4()

    async def get_page(
        db,
        page=1,
        page_size=20,
        search=None,
        event_type=None,
        operator_id=None,
        status=None,
        date_from=None,
        date_to=None,
        include_metadata=True,
    ):
        assert page == 2
        assert page_size == 25
        assert search == "A-15"
        assert event_type == "TICKET_COMPLETED"
        assert operator_id == expected_operator_id
        assert status == "COMPLETED"
        assert date_from == date(2026, 6, 1)
        assert date_to == date(2026, 6, 30)
        assert include_metadata is True
        return {
            "items": [],
            "page": page,
            "page_size": page_size,
            "total": 0,
            "total_pages": 1,
        }

    expected_operator_id = operator_id
    monkeypatch.setattr(ticket_event_routes.TicketEventService, "get_page", get_page)

    response = client.get(
        "/ticket-events/page?"
        f"operator_id={operator_id}&"
        "page=2&page_size=25&search=A-15&event_type=TICKET_COMPLETED&"
        "status=COMPLETED&date_from=2026-06-01&date_to=2026-06-30",
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "page": 2,
        "page_size": 25,
        "total": 0,
        "total_pages": 1,
    }


def test_admin_can_load_paginated_ticket_event_tickets(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    ticket_id = uuid.uuid4()
    event_id = uuid.uuid4()
    operator_id = uuid.uuid4()
    created_at = datetime(2026, 6, 10, 12, 30, tzinfo=timezone.utc)

    latest_event = SimpleNamespace(
        id=event_id,
        ticket_id=ticket_id,
        event_type="SERVICE_CHANGED",
        old_status="WAITING",
        new_status="WAITING",
        operator_id=None,
        metadata_={"ticket_snapshot": {"ticket_number": "A-15"}},
        created_at=created_at,
    )

    async def get_ticket_page(
        db,
        page=1,
        page_size=20,
        search=None,
        event_type=None,
        operator_id=None,
        status=None,
        date_from=None,
        date_to=None,
    ):
        assert page == 3
        assert page_size == 10
        assert search == "A-15"
        assert event_type == "SERVICE_CHANGED"
        assert operator_id == expected_operator_id
        assert status == "WAITING"
        assert date_from == date(2026, 6, 1)
        assert date_to == date(2026, 6, 30)
        return {
            "items": [
                {
                    "ticket_id": ticket_id,
                    "ticket_number": "A-15",
                    "iin": "010101010101",
                    "full_name": "Test Applicant",
                    "service_label": "Admissions",
                    "status": "WAITING",
                    "latest_event": latest_event,
                    "first_event_at": created_at,
                    "last_event_at": created_at,
                    "events_count": 4,
                    "change_events_count": 2,
                }
            ],
            "page": page,
            "page_size": page_size,
            "total": 1,
            "total_pages": 1,
        }

    expected_operator_id = operator_id
    monkeypatch.setattr(ticket_event_routes.TicketEventService, "get_ticket_page", get_ticket_page)

    response = client.get(
        "/ticket-events/tickets/page?"
        f"operator_id={operator_id}&"
        "page=3&page_size=10&search=A-15&event_type=SERVICE_CHANGED&"
        "status=WAITING&date_from=2026-06-01&date_to=2026-06-30",
    )

    assert response.status_code == 200
    response_json = response.json()
    assert response_json["page"] == 3
    assert response_json["total"] == 1
    assert response_json["items"][0]["ticket_id"] == str(ticket_id)
    assert response_json["items"][0]["ticket_number"] == "A-15"
    assert response_json["items"][0]["events_count"] == 4
    assert response_json["items"][0]["change_events_count"] == 2
    assert response_json["items"][0]["latest_event"]["id"] == str(event_id)


def test_operator_service_analytics_uses_ticket_event_snapshots():
    ticket_id = uuid.uuid4()
    service_id = 10
    current_ticket = SimpleNamespace(
        id=ticket_id,
        service_id=99,
        status="WAITING",
        created_at=datetime(2026, 6, 1, 9, 0),
        called_at=None,
        started_at=None,
        completed_at=None,
    )
    service = SimpleNamespace(name="Admissions", code="ADM")
    called_at = datetime(2026, 6, 1, 9, 5, tzinfo=timezone.utc)
    completed_at = datetime(2026, 6, 1, 9, 20, tzinfo=timezone.utc)
    base_snapshot = {
        "service_id": service_id,
        "created_at": "2026-06-01T09:00:00+00:00",
        "called_at": "2026-06-01T09:05:00+00:00",
        "started_at": "2026-06-01T09:05:00+00:00",
    }
    events = [
        SimpleNamespace(
            id=uuid.uuid4(),
            ticket_id=ticket_id,
            event_type="TICKET_CALLED",
            old_status="WAITING",
            new_status="CALLED",
            metadata_={"ticket_snapshot": base_snapshot},
            created_at=called_at,
        ),
        SimpleNamespace(
            id=uuid.uuid4(),
            ticket_id=ticket_id,
            event_type="TICKET_COMPLETED",
            old_status="CALLED",
            new_status="COMPLETED",
            metadata_={
                "ticket_snapshot": {
                    **base_snapshot,
                    "completed_at": "2026-06-01T09:20:00+00:00",
                    "status": "COMPLETED",
                }
            },
            created_at=completed_at,
        ),
    ]

    rows = TicketEventService.get_service_analytics_from_events(
        events,
        {ticket_id: current_ticket},
        {service_id: service},
    )
    daily_rows = TicketEventService.get_daily_analytics_from_events(events)
    processing_seconds = TicketEventService.get_event_processing_seconds(
        events,
        {ticket_id: current_ticket},
    )

    assert rows == [
        {
            "service_id": service_id,
            "service_name": "Admissions",
            "service_code": "ADM",
            "tickets_count": 1,
            "completed": 1,
            "skipped": 0,
            "active": 0,
            "processed": 1,
            "completion_rate": 100,
            "share_percent": 100,
            "average_processing_seconds": 900,
            "total_processing_seconds": 900,
            "fastest_processing_seconds": 900,
            "slowest_processing_seconds": 900,
            "average_wait_seconds": 300,
            "last_ticket_at": completed_at,
        }
    ]
    assert daily_rows == [
        {
            "date": "2026-06-01",
            "tickets_count": 1,
            "completed": 1,
            "skipped": 0,
            "active": 0,
        }
    ]
    assert processing_seconds == [900]


def test_operator_service_analytics_sums_only_waiting_status_intervals():
    ticket_id = uuid.uuid4()
    service_id = 10
    current_ticket = SimpleNamespace(
        id=ticket_id,
        service_id=service_id,
        status="COMPLETED",
        created_at=datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc),
        called_at=None,
        started_at=None,
        completed_at=None,
    )
    service = SimpleNamespace(name="Admissions", code="ADM")
    events = [
        SimpleNamespace(
            id=uuid.uuid4(),
            ticket_id=ticket_id,
            event_type="TICKET_CALLED",
            old_status="WAITING",
            new_status="CALLED",
            metadata_={
                "ticket_snapshot": {
                    "service_id": service_id,
                    "created_at": "2026-06-01T09:00:00+00:00",
                }
            },
            created_at=datetime(2026, 6, 1, 9, 5, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=uuid.uuid4(),
            ticket_id=ticket_id,
            event_type="SERVICE_CHANGED",
            old_status="CALLED",
            new_status="WAITING",
            metadata_={
                "ticket_snapshot": {
                    "service_id": service_id,
                    "created_at": "2026-06-01T09:00:00+00:00",
                }
            },
            created_at=datetime(2026, 6, 1, 9, 7, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=uuid.uuid4(),
            ticket_id=ticket_id,
            event_type="TICKET_CALLED",
            old_status="WAITING",
            new_status="CALLED",
            metadata_={
                "ticket_snapshot": {
                    "service_id": service_id,
                    "created_at": "2026-06-01T09:00:00+00:00",
                    "called_at": "2026-06-01T09:10:00+00:00",
                    "started_at": "2026-06-01T09:10:00+00:00",
                }
            },
            created_at=datetime(2026, 6, 1, 9, 10, tzinfo=timezone.utc),
        ),
        SimpleNamespace(
            id=uuid.uuid4(),
            ticket_id=ticket_id,
            event_type="TICKET_COMPLETED",
            old_status="CALLED",
            new_status="COMPLETED",
            metadata_={
                "ticket_snapshot": {
                    "service_id": service_id,
                    "created_at": "2026-06-01T09:00:00+00:00",
                    "called_at": "2026-06-01T09:10:00+00:00",
                    "started_at": "2026-06-01T09:10:00+00:00",
                    "completed_at": "2026-06-01T09:20:00+00:00",
                    "status": "COMPLETED",
                }
            },
            created_at=datetime(2026, 6, 1, 9, 20, tzinfo=timezone.utc),
        ),
    ]

    rows = TicketEventService.get_service_analytics_from_events(
        events,
        {ticket_id: current_ticket},
        {service_id: service},
    )

    assert rows[0]["average_wait_seconds"] == 480
