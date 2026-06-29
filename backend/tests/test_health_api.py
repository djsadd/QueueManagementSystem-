from app import main


class SuccessfulConnection:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def execute(self, statement):
        self.statement = statement


class SuccessfulEngine:
    def connect(self):
        return SuccessfulConnection()


class FailedConnection:
    async def __aenter__(self):
        raise RuntimeError("database unavailable")

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FailedEngine:
    def connect(self):
        return FailedConnection()


def test_root_returns_ok(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_healthcheck_returns_connected_database(client, monkeypatch):
    monkeypatch.setattr(main, "engine", SuccessfulEngine())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}


def test_healthcheck_reports_database_errors(client, monkeypatch):
    monkeypatch.setattr(main, "engine", FailedEngine())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "error"
    assert response.json()["database"] == "disconnected"
    assert "database unavailable" in response.json()["details"]
