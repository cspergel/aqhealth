"""
Provider Scorecard API endpoints.

Provides provider list with metrics/tiers, individual scorecards,
peer comparison benchmarks, target management, and CSV export.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.provider_service import (
    get_provider_list,
    get_provider_scorecard,
    get_peer_comparison,
    update_provider_targets,
    get_provider_insights,
)
from app.services.export_service import export_to_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/providers", tags=["providers"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PercentileOut(BaseModel):
    panel_size: int | None = None
    capture_rate: int | None = None
    recapture_rate: int | None = None
    avg_raf: int | None = None
    panel_pmpm: int | None = None
    gap_closure_rate: int | None = None


class ProviderListItem(BaseModel):
    id: int
    npi: str
    name: str
    first_name: str
    last_name: str
    specialty: str | None = None
    practice_name: str | None = None
    panel_size: int = 0
    capture_rate: float | None = None
    recapture_rate: float | None = None
    avg_raf: float | None = None
    panel_pmpm: float | None = None
    gap_closure_rate: float | None = None
    tier: str = "gray"
    percentiles: PercentileOut = PercentileOut()


class MetricDetail(BaseModel):
    key: str
    label: str
    value: float | None = None
    target: float | None = None
    tier: str = "gray"
    percentile: int | None = None
    trend: float | None = None


class ScorecardOut(BaseModel):
    id: int
    npi: str
    name: str
    first_name: str
    last_name: str
    specialty: str | None = None
    practice_name: str | None = None
    panel_size: int = 0
    capture_rate: float | None = None
    recapture_rate: float | None = None
    avg_raf: float | None = None
    panel_pmpm: float | None = None
    gap_closure_rate: float | None = None
    tier: str = "gray"
    metrics: list[MetricDetail] = []
    targets: dict = {}


class ComparisonMetric(BaseModel):
    provider_value: float | None = None
    network_avg: float | None = None
    top_quartile: float | None = None
    bottom_quartile: float | None = None


class PeerComparisonOut(BaseModel):
    provider_id: int
    name: str
    comparisons: dict[str, ComparisonMetric] = {}


class InsightOut(BaseModel):
    id: int
    title: str
    description: str
    dollar_impact: float | None = None
    recommended_action: str | None = None
    confidence: int | None = None
    category: str


class TargetsIn(BaseModel):
    capture_rate: float | None = None
    recapture_rate: float | None = None
    gap_closure_rate: float | None = None
    avg_raf: float | None = None
    panel_pmpm: float | None = None


# ---------------------------------------------------------------------------
# GET /api/providers — sortable/filterable provider list
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ProviderListItem])
async def list_providers(
    sort_by: str = Query("name", description="Sort column"),
    order: str = Query("asc", regex="^(asc|desc)$"),
    specialty: str | None = Query(None),
    tier: str | None = Query(None, regex="^(green|amber|red)$"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return all providers with computed metrics and performance tiers."""
    rows = await get_provider_list(
        db,
        sort_by=sort_by,
        order=order,
        specialty_filter=specialty,
        tier_filter=tier,
    )
    return [ProviderListItem(**r) for r in rows]


# ---------------------------------------------------------------------------
# GET /api/providers/export — CSV export (must be before {id} route)
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_providers(
    sort_by: str = Query("name"),
    order: str = Query("asc"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Export provider list as CSV."""
    rows = await get_provider_list(db, sort_by=sort_by, order=order)
    export_rows = []
    for r in rows:
        export_rows.append({
            "Name": r["name"],
            "NPI": r["npi"],
            "Specialty": r.get("specialty", ""),
            "Panel Size": r.get("panel_size", 0),
            "Capture Rate": r.get("capture_rate"),
            "Recapture Rate": r.get("recapture_rate"),
            "Avg RAF": r.get("avg_raf"),
            "PMPM": r.get("panel_pmpm"),
            "Gap Closure Rate": r.get("gap_closure_rate"),
            "Tier": r.get("tier", ""),
        })
    return export_to_csv(export_rows, filename="providers.csv")


# ---------------------------------------------------------------------------
# GET /api/providers/{id} — full scorecard
# ---------------------------------------------------------------------------

@router.get("/{provider_id}", response_model=ScorecardOut)
async def provider_scorecard(
    provider_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return full provider scorecard with metrics, targets, and tiers."""
    data = await get_provider_scorecard(db, provider_id)
    if not data:
        raise HTTPException(status_code=404, detail="Provider not found")
    return ScorecardOut(**data)


# ---------------------------------------------------------------------------
# GET /api/providers/{id}/comparison — peer benchmarking
# ---------------------------------------------------------------------------

@router.get("/{provider_id}/comparison", response_model=PeerComparisonOut)
async def provider_comparison(
    provider_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return anonymized peer comparison benchmarks."""
    data = await get_peer_comparison(db, provider_id)
    if not data:
        raise HTTPException(status_code=404, detail="Provider not found")
    return PeerComparisonOut(**data)


# ---------------------------------------------------------------------------
# GET /api/providers/{id}/insights — AI coaching suggestions
# ---------------------------------------------------------------------------

@router.get("/{provider_id}/insights", response_model=list[InsightOut])
async def provider_insights(
    provider_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return AI coaching insights for this provider."""
    insights = await get_provider_insights(db, provider_id)
    return [InsightOut(**i) for i in insights]


# ---------------------------------------------------------------------------
# PATCH /api/providers/{id}/targets — update targets (mso_admin only)
# ---------------------------------------------------------------------------

@router.patch("/{provider_id}/targets")
async def patch_provider_targets(
    provider_id: int,
    body: TargetsIn,
    current_user: dict = Depends(require_role(UserRole.superadmin, UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update configurable target thresholds for a provider."""
    targets = {k: v for k, v in body.model_dump().items() if v is not None}
    if not targets:
        raise HTTPException(status_code=400, detail="No targets provided")
    result = await update_provider_targets(db, provider_id, targets)
    if not result:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"status": "ok", "provider": result}
