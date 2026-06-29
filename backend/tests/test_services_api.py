from types import SimpleNamespace

from app.api.services import routes as service_routes
from app.dependencies.auth import require_admin
from app.main import app


def service(
    service_id=1,
    name="Documents",
    code="DOC",
    priority=0,
    is_active=True,
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


def service_payload(**overrides):
    payload = {
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
    payload.update(overrides)
    return payload


def test_services_require_authentication(client):
    response = client.get("/services/")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_admin_can_create_service(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user

    async def create(db, data):
        assert data.name == "Documents"
        assert data.code == "DOC"
        return service()

    monkeypatch.setattr(service_routes.ServiceService, "create", create)

    response = client.post("/services/", json=service_payload())

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["code"] == "DOC"


def test_admin_can_list_services(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user

    async def get_all(db):
        return [
            service(1, "Documents", "DOC"),
            service(2, "Consulting", "CON", priority=5),
        ]

    monkeypatch.setattr(service_routes.ServiceService, "get_all", get_all)

    response = client.get("/services/")

    assert response.status_code == 200
    assert [item["code"] for item in response.json()] == ["DOC", "CON"]


def test_get_service_returns_404_when_missing(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user

    async def get_by_id(db, service_id):
        return None

    monkeypatch.setattr(service_routes.ServiceService, "get_by_id", get_by_id)

    response = client.get("/services/404")

    assert response.status_code == 404
    assert response.json() == {"detail": "Service not found"}


def test_admin_can_update_service(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    existing_service = service()

    async def get_by_id(db, service_id):
        assert service_id == 1
        return existing_service

    async def update(db, service_obj, data):
        assert service_obj is existing_service
        assert data.priority == 3
        return service(priority=3)

    monkeypatch.setattr(service_routes.ServiceService, "get_by_id", get_by_id)
    monkeypatch.setattr(service_routes.ServiceService, "update", update)

    response = client.patch("/services/1", json={"priority": 3})

    assert response.status_code == 200
    assert response.json()["priority"] == 3


def test_admin_can_delete_service(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    existing_service = service()
    deleted = {"called": False}

    async def get_by_id(db, service_id):
        assert service_id == 1
        return existing_service

    async def delete(db, service_obj):
        assert service_obj is existing_service
        deleted["called"] = True

    monkeypatch.setattr(service_routes.ServiceService, "get_by_id", get_by_id)
    monkeypatch.setattr(service_routes.ServiceService, "delete", delete)

    response = client.delete("/services/1")

    assert response.status_code == 204
    assert response.content == b""
    assert deleted["called"] is True
