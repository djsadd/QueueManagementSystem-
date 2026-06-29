import uuid

from app.api.ticket_events import routes as ticket_event_routes
from app.dependencies.auth import require_admin
from app.main import app


def test_admin_can_filter_ticket_event_analytics_by_operator(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    operator_id = uuid.uuid4()

    async def get_operator_analytics(db, requested_operator_id=None):
        assert requested_operator_id == operator_id
        return []

    monkeypatch.setattr(
        ticket_event_routes.TicketEventService,
        "get_operator_analytics",
        get_operator_analytics,
    )

    response = client.get(f"/ticket-events/analytics?operator_id={operator_id}")

    assert response.status_code == 200
    assert response.json() == []
