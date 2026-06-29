import uuid
from datetime import datetime
from types import SimpleNamespace

from app.api.public import routes as public_routes


def service(
    service_id,
    name,
    code,
    is_active=True,
    priority=0,
    requires_educational_program=False,
    requires_reception_desk=False,
    requires_service_language=False,
):
    return SimpleNamespace(
        id=service_id,
        name=name,
        name_kk=name,
        name_en=name,
        code=code,
        priority=priority,
        is_active=is_active,
        requires_educational_program=requires_educational_program,
        requires_reception_desk=requires_reception_desk,
        requires_service_language=requires_service_language,
    )


def ticket_response(**overrides):
    response = {
        "id": uuid.uuid4(),
        "applicant_id": None,
        "service_id": 1,
        "educational_program_id": None,
        "academic_degree_id": None,
        "study_language": None,
        "service_language": None,
        "full_name": None,
        "iin": None,
        "phone": None,
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
        "ticket_number": "D001",
        "queue_number": 1,
        "priority": 0,
        "routing_key": None,
        "assignment_score": None,
        "status": "WAITING",
        "estimated_wait": None,
        "created_at": datetime(2026, 1, 1, 12, 0, 0),
        "called_at": None,
        "started_at": None,
        "completed_at": None,
    }
    response.update(overrides)
    return response


def test_public_services_returns_only_active_services(client, monkeypatch):
    async def get_all(db):
        return [
            service(1, "Documents", "DOC", is_active=True),
            service(2, "Inactive", "OFF", is_active=False),
        ]

    monkeypatch.setattr(public_routes.ServiceService, "get_all", get_all)

    response = client.get("/public/services")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": 1,
            "name": "Documents",
            "name_kk": "Documents",
            "name_en": "Documents",
            "code": "DOC",
            "priority": 0,
            "is_active": True,
            "requires_educational_program": False,
            "requires_reception_desk": False,
            "requires_service_language": False,
        }
    ]


def test_public_ticket_creation_requires_desktop_terminal_header(client, monkeypatch):
    async def create_ticket(db, data):
        raise AssertionError("TicketService.create_ticket must not be called")

    monkeypatch.setattr(public_routes.TicketService, "create_ticket", create_ticket)

    response = client.post("/public/tickets", json={"service_id": 1})

    assert response.status_code == 403
    assert response.json() == {"detail": "Онлайн получение талона через сайт закрыто"}


def test_public_ticket_creation_allows_desktop_terminal(client, monkeypatch):
    async def create_ticket(db, data):
        assert data.service_id == 1
        return ticket_response()

    monkeypatch.setattr(public_routes.TicketService, "create_ticket", create_ticket)

    response = client.post(
        "/public/tickets",
        headers={"X-Queue-Client": "desktop-terminal"},
        json={"service_id": 1},
    )

    assert response.status_code == 200
    assert response.json()["ticket_number"] == "D001"
    assert response.json()["status"] == "WAITING"
