from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.db import get_db
from app.models.user import User
from app.schemas.applicant_report import ApplicantReportCreate, ApplicantReportResponse
from app.services.applicant_report_service import ApplicantReportService


applicant_reports_router = APIRouter(
    prefix="/applicant-reports",
    tags=["applicant-reports"],
    dependencies=[Depends(require_admin)],
)


def serialize_applicant_report(report, is_latest_fallback: bool = False) -> dict:
    return {
        "id": report.id,
        "report_date": report.report_date,
        "file_name": report.file_name,
        "content": report.content,
        "uploaded_by_id": report.uploaded_by_id,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
        "is_latest_fallback": is_latest_fallback,
    }


@applicant_reports_router.post("/", response_model=ApplicantReportResponse)
async def save_applicant_report(
    data: ApplicantReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await ApplicantReportService.upsert(db, data, current_user.id)
    return serialize_applicant_report(report)


@applicant_reports_router.get("/current", response_model=ApplicantReportResponse)
async def get_current_applicant_report(
    report_date: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    report, is_latest_fallback = await ApplicantReportService.get_current(db, report_date)

    if report is None:
        raise HTTPException(status_code=404, detail="Applicant report not found")

    return serialize_applicant_report(report, is_latest_fallback)
