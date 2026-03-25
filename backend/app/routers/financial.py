"""
Financial P&L API endpoints.

Provides profit & loss statements, plan/group breakdowns, and revenue forecasting.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.financial_service import (
    get_pnl,
    get_pnl_by_plan,
    get_pnl_by_group,
    get_revenue_forecast,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/financial", tags=["financial"])


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class RevenueOut(BaseModel):
    capitation: float
    raf_adjustment: float
    quality_bonus: float
    per_capture_fees: float
    total: float


class ExpensesOut(BaseModel):
    inpatient: float
    pharmacy: float
    professional: float
    ed_observation: float
    snf_postacute: float
    home_health: float
    dme: float
    administrative: float
    care_management: float
    total: float


class ComparisonPeriod(BaseModel):
    revenue: float
    expenses: float
    surplus: float
    mlr: float


class ComparisonOut(BaseModel):
    budget: ComparisonPeriod
    prior_year: ComparisonPeriod
    prior_quarter: ComparisonPeriod


class PnlOut(BaseModel):
    period: str
    revenue: RevenueOut
    expenses: ExpensesOut
    surplus: float
    mlr: float
    member_count: int
    per_member_margin: float
    comparison: ComparisonOut


class PlanPnlOut(BaseModel):
    plan: str
    members: int
    revenue: float
    expenses: float
    surplus: float
    mlr: float
    per_member_margin: float


class GroupPnlOut(BaseModel):
    group: str
    providers: int
    members: int
    revenue: float
    expenses: float
    surplus: float
    mlr: float
    per_member_margin: float


class MonthProjection(BaseModel):
    month_offset: int
    label: str
    revenue: float
    expense: float
    margin: float
    revenue_low: float
    revenue_high: float
    expense_low: float
    expense_high: float


class ForecastSummary(BaseModel):
    total_projected_revenue: float
    total_projected_expense: float
    total_projected_margin: float
    avg_monthly_margin: float


class ForecastOut(BaseModel):
    months: int
    projections: list[MonthProjection]
    summary: ForecastSummary


# ---------------------------------------------------------------------------
# GET /api/financial/pnl — P&L statement
# ---------------------------------------------------------------------------

@router.get("/pnl", response_model=PnlOut)
async def financial_pnl(
    period: str = Query("ytd", description="Period: ytd, q1, q2, q3, q4, prior_year"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return a full profit & loss statement for the current period."""
    data = await get_pnl(db, period)
    return PnlOut(**data)


# ---------------------------------------------------------------------------
# GET /api/financial/pnl/by-plan — P&L by health plan
# ---------------------------------------------------------------------------

@router.get("/pnl/by-plan", response_model=list[PlanPnlOut])
async def financial_pnl_by_plan(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return P&L broken out by health plan."""
    data = await get_pnl_by_plan(db)
    return [PlanPnlOut(**d) for d in data]


# ---------------------------------------------------------------------------
# GET /api/financial/pnl/by-group — P&L by provider group
# ---------------------------------------------------------------------------

@router.get("/pnl/by-group", response_model=list[GroupPnlOut])
async def financial_pnl_by_group(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return P&L broken out by provider group."""
    data = await get_pnl_by_group(db)
    return [GroupPnlOut(**d) for d in data]


# ---------------------------------------------------------------------------
# GET /api/financial/forecast — revenue forecast
# ---------------------------------------------------------------------------

@router.get("/forecast", response_model=ForecastOut)
async def financial_forecast(
    months: int = Query(12, ge=1, le=36, description="Months to project"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return revenue, expense, and margin projections."""
    data = await get_revenue_forecast(db, months)
    return ForecastOut(**data)
