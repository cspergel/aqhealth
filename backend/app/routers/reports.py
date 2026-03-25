"""
Automated Report Generation API endpoints.

Provides report template management, report generation, listing, and download.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import report_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    template_id: int
    period: str = Field(..., description="Report period, e.g. 'Q1 2026', 'March 2026'")
    params: dict | None = None


class TemplateOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    report_type: str
    sections: list | dict
    schedule: str | None = None
    is_system: bool = False


class ReportOut(BaseModel):
    id: int
    template_id: int
    title: str
    period: str
    status: str
    content: dict | None = None
    ai_narrative: str | None = None
    generated_by: int
    file_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List all report templates."""
    return await report_service.get_templates(db)


@router.post("/generate", response_model=ReportOut)
async def generate_report(
    body: GenerateRequest,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Generate a report from a template."""
    try:
        return await report_service.generate_report(
            db,
            template_id=body.template_id,
            period=body.period,
            generated_by=current_user.get("id", 1),
            params=body.params,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("", response_model=list[ReportOut])
async def list_reports(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List all generated reports."""
    return await report_service.get_reports(db)


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a full generated report with content."""
    report = await report_service.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.get("/{report_id}/download")
async def download_report(
    report_id: int,
    format: str = Query("pdf", description="Download format: pdf or excel"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """Download a generated report as PDF or Excel."""
    report = await report_service.get_report(db, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] != "ready":
        raise HTTPException(status_code=400, detail="Report is not ready for download")
    # In production, this would generate and stream the file.
    return {"message": f"Download for report {report_id} in {format} format", "file_url": report.get("file_url")}
