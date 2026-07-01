import uuid
from datetime import date

from app.api.ticket_events import routes as ticket_event_routes
from app.dependencies.auth import require_admin
from app.main import app


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
