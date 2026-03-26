"""
Annual Wellness Visit (AWV) Tracking API endpoints.

Provides AWV completion dashboards, members-due lists,
revenue opportunity analysis, and CSV export.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import awv_service
from app.services.export_service import export_to_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/awv", tags=["awv"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AWVDashboardOut(BaseModel):
    total_members: int
    awv_completed: int
    awv_overdue: int
    completion_rate: float
    revenue_opportunity: int
    by_provider: list[dict]
    by_group: list[dict]
    current_month: str


class MemberDueOut(BaseModel):
    member_id: int
    member_name: str
    date_of_birth: str | None = None
    current_raf: float
    risk_tier: str
    pcp_provider_id: int | None = None
    estimated_value: int
    last_awv_date: str | None = None


class AWVOpportunitiesOut(BaseModel):
    total_overdue: int
    total_opportunity: int
    avg_value_per_awv: int
    hcc_breakdown: list[dict]
    insight: str


# ---------------------------------------------------------------------------
# GET /api/awv/dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=AWVDashboardOut)
async def awv_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """AWV completion dashboard with provider breakdown and revenue impact."""
    data = await awv_service.get_awv_dashboard(db)
    return AWVDashboardOut(**data)


# ---------------------------------------------------------------------------
# GET /api/awv/due
# ---------------------------------------------------------------------------

@router.get("/due", response_model=list[MemberDueOut])
async def members_due(
    provider_id: int | None = Query(None),
    risk_tier: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Members who haven't had an AWV this year, sorted by RAF (highest first)."""
    members = await awv_service.get_members_due_awv(
        db, provider_id=provider_id, risk_tier=risk_tier,
        page=page, page_size=page_size,
    )
    return [MemberDueOut(**m) for m in members]


# ---------------------------------------------------------------------------
# GET /api/awv/opportunities
# ---------------------------------------------------------------------------

@router.get("/opportunities", response_model=AWVOpportunitiesOut)
async def awv_opportunities(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Revenue opportunity analysis for overdue AWVs."""
    data = await awv_service.get_awv_opportunities(db)
    return AWVOpportunitiesOut(**data)


# ---------------------------------------------------------------------------
# GET /api/awv/export
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_due_list(
    provider_id: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> StreamingResponse:
    """Export AWV due list as CSV."""
    members = await awv_service.get_members_due_awv(
        db, provider_id=provider_id, page=1, page_size=10000,
    )

    columns = [
        "member_id", "member_name", "date_of_birth",
        "current_raf", "risk_tier", "estimated_value", "last_awv_date",
    ]

    return export_to_csv(data=members, columns=columns, filename="awv_due_list.csv")
