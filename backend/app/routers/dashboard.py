"""
Population Dashboard API endpoints.

Returns aggregated metrics, RAF distribution, revenue opportunities,
cost hotspots, provider leaderboards, care gap summaries, and AI insights.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.dashboard_service import (
    get_dashboard_metrics,
    get_raf_distribution,
    get_revenue_opportunities,
    get_cost_hotspots,
    get_provider_leaderboard,
    get_care_gap_summary,
    get_dashboard_insights,
    get_dashboard_actions,
)

logger = logging.getLogger(__name__)

# Dashboard — overview section, visible to all authenticated roles.
router = APIRouter(
    prefix="/api/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.provider,
        UserRole.care_manager,
        UserRole.outreach,
        UserRole.auditor,
        UserRole.financial,
    ))],
)


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class SuspectInventoryOut(BaseModel):
    count: int
    total_raf_value: float
    total_annual_value: float


class MetricsOut(BaseModel):
    total_lives: int
    avg_raf: float
    recapture_rate: float
    suspect_inventory: SuspectInventoryOut
    total_pmpm: float
    mlr: float


class RafBucketOut(BaseModel):
    range: str
    count: int


class RevenueOpportunityOut(BaseModel):
    hcc_code: int
    hcc_label: str
    member_count: int
    total_raf: float
    total_value: float


class CostHotspotOut(BaseModel):
    category: str
    total_spend: float
    claim_count: int
    pmpm: float
    benchmark_pmpm: float
    variance_pct: float


class ProviderRow(BaseModel):
    id: int
    name: str
    specialty: str | None = None
    panel_size: int | None = None
    capture_rate: float


class ProviderLeaderboardOut(BaseModel):
    top: list[ProviderRow]
    bottom: list[ProviderRow]


class CareGapSummaryOut(BaseModel):
    measure_code: str
    measure_name: str
    category: str | None = None
    total_gaps: int
    open_count: int
    closed_count: int
    closure_rate: float


class DashboardOut(BaseModel):
    metrics: MetricsOut
    raf_distribution: list[RafBucketOut]
    revenue_opportunities: list[RevenueOpportunityOut]
    cost_hotspots: list[CostHotspotOut]
    provider_leaderboard: ProviderLeaderboardOut
    care_gap_summary: list[CareGapSummaryOut]


class InsightOut(BaseModel):
    id: int
    category: str
    title: str
    description: str
    dollar_impact: float | None = None
    recommended_action: str | None = None
    confidence: int | None = None
    source_modules: list[str] | None = None


# ---------------------------------------------------------------------------
# GET /api/dashboard — full dashboard payload
# ---------------------------------------------------------------------------

@router.get("", response_model=DashboardOut)
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return all dashboard data in a single call."""
    metrics = await get_dashboard_metrics(db)
    raf_dist = await get_raf_distribution(db)
    rev_opps = await get_revenue_opportunities(db)
    cost_spots = await get_cost_hotspots(db)
    providers = await get_provider_leaderboard(db)
    care_gaps = await get_care_gap_summary(db)

    return DashboardOut(
        metrics=MetricsOut(**metrics),
        raf_distribution=[RafBucketOut(**b) for b in raf_dist],
        revenue_opportunities=[RevenueOpportunityOut(**r) for r in rev_opps],
        cost_hotspots=[CostHotspotOut(**c) for c in cost_spots],
        provider_leaderboard=ProviderLeaderboardOut(**providers),
        care_gap_summary=[CareGapSummaryOut(**g) for g in care_gaps],
    )


@router.get("/summary")
async def get_dashboard_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Lightweight summary for onboarding wizard and quick status checks."""
    from sqlalchemy import func, select
    from app.models.care_gap import MemberGap, GapStatus

    metrics = await get_dashboard_metrics(db)
    suspect_inv = metrics.get("suspect_inventory") or {}

    open_gaps_q = await db.execute(
        select(func.count(MemberGap.id)).where(MemberGap.status == GapStatus.open.value)
    )
    open_gaps = open_gaps_q.scalar() or 0

    return {
        "total_members": metrics.get("total_lives", 0),
        "hcc_suspects": suspect_inv.get("count", 0),
        "dollar_opportunity": suspect_inv.get("total_annual_value", 0),
        "care_gaps": open_gaps,
    }


# ---------------------------------------------------------------------------
# GET /api/dashboard/actions — pending action items across modules
# ---------------------------------------------------------------------------

@router.get("/actions")
async def get_actions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return pending action items across all modules."""
    return await get_dashboard_actions(db)


# ---------------------------------------------------------------------------
# GET /api/dashboard/insights — top 5 active insights
# ---------------------------------------------------------------------------

@router.get("/insights", response_model=list[InsightOut])
async def get_insights(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return top 5 active insights for the dashboard."""
    insights = await get_dashboard_insights(db)
    return [InsightOut(**i) for i in insights]
