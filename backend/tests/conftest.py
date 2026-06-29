import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("KAFKA_ENABLED", "false")

from app.dependencies.db import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import UserRole  # noqa: E402


@pytest.fixture
def admin_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="admin@example.com",
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_active=True,
    )


@pytest.fixture
def operator_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        email="operator@example.com",
        full_name="Operator User",
        role=UserRole.OPERATOR,
        is_active=True,
    )


@pytest.fixture
def db_session():
    return SimpleNamespace(name="test-db-session")


@pytest.fixture
def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
