import uuid
from types import SimpleNamespace

from app.api.auth import auth as auth_routes
from app.dependencies.auth import get_current_user
from app.main import app
from app.models.user import UserRole


def test_register_returns_created_user(client, monkeypatch):
    user_id = uuid.uuid4()

    async def register_user(db, email, password, full_name):
        return SimpleNamespace(id=user_id, email=email, full_name=full_name)

    monkeypatch.setattr(auth_routes, "register_user", register_user)

    response = client.post(
        "/auth/register",
        json={
            "email": "operator@example.com",
            "password": "password123",
            "full_name": "Operator User",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": str(user_id),
        "email": "operator@example.com",
        "full_name": "Operator User",
    }


def test_login_returns_tokens_for_valid_credentials(client, monkeypatch, operator_user):
    async def authenticate_user(db, email, password):
        assert email == "operator@example.com"
        assert password == "password123"
        return operator_user

    def login_user(user):
        assert user is operator_user
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "token_type": "bearer",
        }

    monkeypatch.setattr(auth_routes, "authenticate_user", authenticate_user)
    monkeypatch.setattr(auth_routes, "login_user", login_user)

    response = client.post(
        "/auth/login",
        json={"email": "operator@example.com", "password": "password123"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "access_token": "access-token",
        "refresh_token": "refresh-token",
        "token_type": "bearer",
    }


def test_login_rejects_invalid_credentials(client, monkeypatch):
    async def authenticate_user(db, email, password):
        return None

    monkeypatch.setattr(auth_routes, "authenticate_user", authenticate_user)

    response = client.post(
        "/auth/login",
        json={"email": "operator@example.com", "password": "bad-password"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials"}


def test_me_returns_current_user(client, operator_user):
    app.dependency_overrides[get_current_user] = lambda: operator_user

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(operator_user.id),
        "email": operator_user.email,
        "full_name": operator_user.full_name,
        "role": UserRole.OPERATOR.value,
        "is_active": True,
    }
