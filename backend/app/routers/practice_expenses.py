"""
Practice Expense Management API endpoints.

Tracks MSO operational costs: staffing, supplies, rent, software, equipment.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import practice_expense_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/expenses", tags=["practice-expenses"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ExpenseDashboardOut(BaseModel):
    total_budget: float
    total_actual: float
    budget_utilization: float
    staffing_cost: float
    categories: list[dict[str, Any]]


class StaffingAnalysisOut(BaseModel):
    total_staff: int
    total_cost: float
    provider_count: int
    staff_to_provider_ratio: float
    by_role: list[dict[str, Any]]


class EfficiencyMetricsOut(BaseModel):
    total_staff: int
    total_expenses: float
    expense_per_staff: float


class StaffCreateIn(BaseModel):
    name: str
    role: str
    practice_group_id: int | None = None
    salary: float
    benefits_cost: float | None = None
    fte: float = 1.0
    hire_date: date | None = None
    is_active: bool = True


class ExpenseCreateIn(BaseModel):
    category_id: int
    description: str
    amount: float
    expense_date: date
    practice_group_id: int | None = None
    vendor: str | None = None
    recurring: bool = False
    recurring_frequency: str | None = None
    notes: str | None = None
    entered_by: int | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=ExpenseDashboardOut)
async def expense_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return expense overview with category breakdown and budget vs actual."""
    return await practice_expense_service.get_expense_dashboard(db)


@router.get("/staffing", response_model=StaffingAnalysisOut)
async def staffing_analysis(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return staffing analysis with ratios and benchmarks."""
    return await practice_expense_service.get_staffing_analysis(db)


@router.get("/trends")
async def expense_trends(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return monthly expense trends by category."""
    return await practice_expense_service.get_expense_trends(db)


@router.get("/efficiency", response_model=EfficiencyMetricsOut)
async def efficiency_metrics(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return efficiency metrics: revenue per staff, cost per member, overhead ratio."""
    return await practice_expense_service.get_efficiency_metrics(db)


@router.get("/hiring-analysis")
async def hiring_analysis(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return hiring analysis: can we afford to hire?"""
    return await practice_expense_service.get_hiring_analysis(db)


@router.post("/entries")
async def create_expense(
    payload: ExpenseCreateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Add a new expense entry."""
    return await practice_expense_service.create_expense(db, payload.model_dump())


@router.get("/entries")
async def list_expenses(
    category_id: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List expense entries, optionally filtered by category."""
    return await practice_expense_service.list_expenses(db, category_id)


@router.post("/staff")
async def create_staff(
    payload: StaffCreateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Add a new staff member."""
    return await practice_expense_service.create_staff(db, payload.model_dump())


@router.get("/staff")
async def list_staff(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all staff members."""
    return await practice_expense_service.list_staff(db)
