import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.api.applicant_reports import routes as applicant_report_routes
from app.dependencies.auth import require_admin
from app.main import app


def applicant_report(**overrides):
    report = {
        "id": uuid.uuid4(),
        "report_date": date(2026, 6, 29),
        "file_name": "applicants.csv",
        "content": "iin,status\n123456789012,accepted",
        "uploaded_by_id": uuid.uuid4(),
        "created_at": datetime(2026, 6, 29, 9, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 6, 29, 9, 5, tzinfo=timezone.utc),
    }
    report.update(overrides)
    return SimpleNamespace(**report)


def test_current_applicant_report_requires_authentication(client):
    response = client.get("/applicant-reports/current?report_date=2026-06-29")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_admin_can_get_applicant_report_for_date(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    report = applicant_report()

    async def get_current(db, report_date):
        assert report_date == date(2026, 6, 29)
        return report, False

    monkeypatch.setattr(applicant_report_routes.ApplicantReportService, "get_current", get_current)

    response = client.get("/applicant-reports/current?report_date=2026-06-29")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(report.id)
    assert body["report_date"] == "2026-06-29"
    assert body["file_name"] == "applicants.csv"
    assert body["content"] == "iin,status\n123456789012,accepted"
    assert body["uploaded_by_id"] == str(report.uploaded_by_id)
    assert body["is_latest_fallback"] is False


def test_admin_gets_latest_applicant_report_as_fallback(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user
    latest_report = applicant_report(report_date=date(2026, 6, 29))

    async def get_current(db, report_date):
        assert report_date == date(2026, 6, 28)
        return latest_report, True

    monkeypatch.setattr(applicant_report_routes.ApplicantReportService, "get_current", get_current)

    response = client.get("/applicant-reports/current?report_date=2026-06-28")

    assert response.status_code == 200
    body = response.json()
    assert body["report_date"] == "2026-06-29"
    assert body["is_latest_fallback"] is True


def test_current_applicant_report_returns_404_when_missing(client, monkeypatch, admin_user):
    app.dependency_overrides[require_admin] = lambda: admin_user

    async def get_current(db, report_date):
        return None, report_date is not None

    monkeypatch.setattr(applicant_report_routes.ApplicantReportService, "get_current", get_current)

    response = client.get("/applicant-reports/current?report_date=2026-06-29")

    assert response.status_code == 404
    assert response.json() == {"detail": "Applicant report not found"}
