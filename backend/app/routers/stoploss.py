"""
Stop-Loss & Risk Corridor API endpoints.

Monitors high-cost members, stop-loss thresholds, and risk corridor position.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import stoploss_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stoploss", tags=["stoploss"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class StopLossDashboardOut(BaseModel):
    members_approaching: int
    members_exceeding: int
    total_exposure: float
    risk_corridor_position: float
    threshold: float
    actual_spend: float
    target_spend: float


class HighCostMemberOut(BaseModel):
    member_id: int
    first_name: str | None = None
    last_name: str | None = None
    health_plan: str | None = None
    total_spend: float
    claim_count: int
    pct_of_threshold: float
    exceeds_threshold: bool


class RiskCorridorOut(BaseModel):
    target_spend: float
    actual_spend: float
    ratio: float
    corridor_band: str
    shared_risk_exposure: float
    surplus_or_deficit: float


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=StopLossDashboardOut)
async def stoploss_dashboard(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Stop-loss summary: members approaching/exceeding, total exposure."""
    return await stoploss_service.get_stoploss_dashboard(db)


@router.get("/high-cost", response_model=list[HighCostMemberOut])
async def high_cost_members(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Members ranked by 12-month spend vs stop-loss threshold."""
    return await stoploss_service.get_high_cost_members(db)


@router.get("/risk-corridor", response_model=RiskCorridorOut)
async def risk_corridor(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Risk corridor analysis: position, band, shared risk exposure."""
    return await stoploss_service.get_risk_corridor_analysis(db)
