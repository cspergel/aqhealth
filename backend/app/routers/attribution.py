"""
Attribution Management API endpoints.

Tracks member attribution, churn risk, and financial impact
of attribution changes.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import attribution_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attribution", tags=["attribution"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AttributionDashboardOut(BaseModel):
    total_attributed: int
    new_this_month: int
    lost_this_month: int
    churn_rate: float
    by_plan: list[dict[str, Any]]


class AttributionChangeOut(BaseModel):
    member_id: str
    member_name: str
    change_type: str
    previous_plan: str | None = None
    new_plan: str | None = None
    effective_date: str
    reason: str | None = None
    raf_score: float | None = None


class ChurnRiskOut(BaseModel):
    member_id: str
    member_name: str
    days_since_last_visit: int
    engagement_score: float
    raf_score: float
    annual_value: float
    risk_level: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=AttributionDashboardOut)
async def attribution_dashboard(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Attribution summary: total, new, lost, churn rate, by-plan."""
    return await attribution_service.get_attribution_dashboard(db)


@router.get("/changes", response_model=list[AttributionChangeOut])
async def attribution_changes(
    period: str = Query("30d", description="Lookback period: 7d, 30d, 90d"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Recent attribution changes with reasons."""
    return await attribution_service.get_attribution_changes(db, period)


@router.get("/churn-risk", response_model=list[ChurnRiskOut])
async def churn_risk(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Members at risk of disenrollment."""
    return await attribution_service.get_churn_risk(db)
