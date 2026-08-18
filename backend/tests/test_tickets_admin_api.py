import uuid
from datetime import datetime

from app.api.tickets import routes as ticket_routes
from app.dependencies.auth import require_admin
from app.main import app


def ticket_response(ticket_id, **overrides):
    response = {
        "id": ticket_id,
        "applicant_id": None,
        "service_id": 1,
        "educational_program_id": None,
        "academic_degree_id": None,
        "study_language": None,
        "service_language": None,
        "full_name": "Test User",
        "iin": "010101010101",
        "born_date": "2000-01-01",
        "phone": "+77010000000",
        "service_name": "Documents",
        "service_code": "DOC",
        "service_name_kk": "Documents",
        "service_name_en": "Documents",
        "educational_program_name": None,
        "educational_program_name_kk": None,
        "educational_program_name_en": None,
        "educational_program_code": None,
        "academic_degree_name": None,
        "academic_degree_code": None,
        "operator_id": None,
        "operator_name": None,
        "operator_email": None,
        "window_id": None,
        "window_name": None,
        "window_floor": None,
        "ticket_number": "A-15",
        "queue_number": 15,
        "priority": 1,
        "routing_key": None,
        "assignment_score": None,
        "status": "WAITING",
        "estimated_wait": 10,
        "created_at": datetime(2026, 1, 1, 12, 0, 0),
        "called_at": None,
        "started_at": None,
        "completed_at": None,
    }
    response.update(overrides)
    return response


def test_admin_can_update_ticket_with_admin_endpoint(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    ticket_id = uuid.uuid4()

    async def update_ticket_as_admin(db, requested_ticket_id, data):
        assert requested_ticket_id == ticket_id
        assert data.full_name == "Updated User"
        assert data.iin == "020202020202"
        assert data.ticket_number == "B-20"
        assert data.queue_number == 20
        return ticket_response(
            ticket_id,
            full_name=data.full_name,
            iin=data.iin,
            ticket_number=data.ticket_number,
            queue_number=data.queue_number,
        )

    monkeypatch.setattr(ticket_routes.TicketService, "update_ticket_as_admin", update_ticket_as_admin)

    response = client.patch(
        f"/tickets/admin/{ticket_id}",
        json={
            "full_name": "Updated User",
            "iin": "020202020202",
            "ticket_number": "B-20",
            "queue_number": 20,
        },
    )

    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated User"
    assert response.json()["ticket_number"] == "B-20"
