from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.applicant_report import ApplicantReport
from app.schemas.applicant_report import ApplicantReportCreate


class ApplicantReportService:
    @staticmethod
    async def upsert(
        db: AsyncSession,
        data: ApplicantReportCreate,
        uploaded_by_id: UUID,
    ) -> ApplicantReport:
        report = await ApplicantReportService.get_by_date(db, data.report_date)

        if report is None:
            report = ApplicantReport(
                report_date=data.report_date,
                file_name=data.file_name,
                content=data.content,
                uploaded_by_id=uploaded_by_id,
            )
            db.add(report)
        else:
            report.file_name = data.file_name
            report.content = data.content
            report.uploaded_by_id = uploaded_by_id

        await db.commit()
        await db.refresh(report)
        return report

    @staticmethod
    async def get_by_date(db: AsyncSession, report_date: date) -> ApplicantReport | None:
        result = await db.execute(
            select(ApplicantReport).where(ApplicantReport.report_date == report_date)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_latest(db: AsyncSession) -> ApplicantReport | None:
        result = await db.execute(
            select(ApplicantReport).order_by(ApplicantReport.report_date.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_current(
        db: AsyncSession,
        report_date: date | None,
    ) -> tuple[ApplicantReport | None, bool]:
        if report_date is not None:
            report = await ApplicantReportService.get_by_date(db, report_date)

            if report is not None:
                return report, False

        return await ApplicantReportService.get_latest(db), report_date is not None
