"""
Temporal Playback / Time Machine API endpoints.

Provides population snapshots at any point in time, period comparisons,
metric timelines, and chronological change logs.  All endpoints are
tenant-scoped via JWT auth.
"""

import logging
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import temporal_service

logger = logging.getLogger(__name__)

# Temporal playback / time machine — data / intelligence.
router = APIRouter(
    prefix="/api/temporal",
    tags=["temporal"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.auditor,
    ))],
)


def _validate_iso_date(value: str, param_name: str) -> str:
    """Validate that a string is a valid ISO date (YYYY-MM-DD)."""
    try:
        date_type.fromisoformat(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid ISO date for '{param_name}': {value!r}. Expected format: YYYY-MM-DD",
        )
    return value


@router.get("/snapshot")
async def get_snapshot(
    date: str = Query(..., description="ISO date, e.g. 2026-01-01"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return a population snapshot as of a specific date."""
    _validate_iso_date(date, "date")
    return await temporal_service.get_population_snapshot(db, date)


@router.get("/compare")
async def compare_periods(
    period_a: str = Query(..., description="Start period ISO date, e.g. 2025-10-01"),
    period_b: str = Query(..., description="End period ISO date, e.g. 2026-03-01"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Compare two time periods and return deltas for every metric."""
    _validate_iso_date(period_a, "period_a")
    _validate_iso_date(period_b, "period_b")
    return await temporal_service.compare_periods(db, period_a, period_b)


@router.get("/timeline")
async def get_timeline(
    metric: str = Query(..., description="Metric name: avg_raf, total_pmpm, total_members, suspect_count, gap_closure_rate, capture_rate"),
    months: int = Query(12, description="Number of months to look back"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list:
    """Return monthly values for a specific metric over time."""
    allowed_metrics = {
        "avg_raf", "total_pmpm", "total_members",
        "suspect_count", "gap_closure_rate", "capture_rate",
    }
    if metric not in allowed_metrics:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid metric: {metric!r}. Must be one of: {', '.join(sorted(allowed_metrics))}",
        )
    return await temporal_service.get_metric_timeline(db, metric, months)


@router.get("/changes")
async def get_changes(
    start: str = Query(..., description="Start date ISO, e.g. 2025-10-01"),
    end: str = Query(..., description="End date ISO, e.g. 2026-03-01"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list:
    """Return significant change events between two dates."""
    _validate_iso_date(start, "start")
    _validate_iso_date(end, "end")
    return await temporal_service.get_change_log(db, start, end)
