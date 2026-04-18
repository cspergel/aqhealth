"""
Financial P&L API endpoints.

Provides profit & loss statements, plan/group breakdowns, and revenue forecasting.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.financial_service import (
    get_pnl,
    get_pnl_by_plan,
    get_pnl_by_group,
    get_revenue_forecast,
)

logger = logging.getLogger(__name__)

# Financial P&L — finance section. Provider/care_manager/outreach excluded
# (frontend hidePages "/financial").
router = APIRouter(
    prefix="/api/financial",
    tags=["financial"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.financial,
        UserRole.auditor,
    ))],
)

VALID_PERIODS = {"ytd", "q1", "q2", "q3", "q4", "prior_year"}


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class RevenueOut(BaseModel):
    capitation: float
    raf_adjustment: float
    quality_bonus: float = 0.0
    per_capture_fees: float = 0.0
    total: float


class ExpensesOut(BaseModel):
    """Expense breakdown by service category.

    Only ``total`` is guaranteed; individual category keys are present when
    claims exist for that category.
    """
    model_config = {"extra": "allow"}

    total: float


class ComparisonPeriod(BaseModel):
    revenue: float
    expenses: float
    surplus: float
    mlr: float | None = None


class ComparisonOut(BaseModel):
    """Comparison periods.  Only ``prior_year`` is always present;
    ``budget`` and ``prior_quarter`` are optional until those data sources
    are implemented."""
    budget: ComparisonPeriod | None = None
    prior_year: ComparisonPeriod | None = None
    prior_quarter: ComparisonPeriod | None = None


class PnlOut(BaseModel):
    period: str
    revenue: RevenueOut
    expenses: ExpensesOut
    surplus: float
    mlr: float | None = None
    member_count: int
    per_member_margin: float
    comparison: ComparisonOut


class PlanPnlOut(BaseModel):
    plan: str
    members: int
    revenue: float
    expenses: float
    surplus: float
    mlr: float | None = None
    per_member_margin: float


class GroupPnlOut(BaseModel):
    group: str
    providers: int
    members: int
    revenue: float
    expenses: float
    surplus: float
    mlr: float | None = None
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
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"Invalid period '{period}'. Must be one of: {', '.join(sorted(VALID_PERIODS))}")
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
