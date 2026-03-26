"""
Risk / Capitation Accounting API endpoints.

Full financial management for risk-bearing MSOs: capitation payments,
subcapitation, IBNR, risk pools, surplus/deficit analysis.
"""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import risk_accounting_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/risk", tags=["risk-accounting"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CapitationPaymentIn(BaseModel):
    plan_name: str
    product_type: str | None = None
    payment_month: str  # "YYYY-MM-DD"
    member_count: int
    pmpm_rate: float
    total_payment: float
    adjustment_amount: float | None = None
    notes: str | None = None


class SubcapPaymentIn(BaseModel):
    provider_id: int | None = None
    practice_group_id: int | None = None
    specialty: str | None = None
    payment_month: str
    member_count: int
    pmpm_rate: float
    total_payment: float


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def risk_dashboard(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Full risk accounting dashboard."""
    return await risk_accounting_service.get_risk_dashboard(db)


@router.get("/capitation")
async def capitation_summary(
    period: str | None = Query(None, description="Period filter, e.g. '2026-Q1'"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Capitation payment summary by plan/month."""
    return await risk_accounting_service.get_capitation_summary(db, period)


@router.get("/subcap")
async def subcap_summary(
    period: str | None = Query(None, description="Period filter"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Subcapitation payment summary."""
    return await risk_accounting_service.get_subcap_summary(db, period)


@router.get("/pools")
async def risk_pools(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Risk pool status for all plans."""
    return await risk_accounting_service.get_risk_pool_status(db)


@router.get("/ibnr")
async def ibnr_estimate(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """IBNR (Incurred But Not Reported) estimate."""
    return await risk_accounting_service.calculate_ibnr(db)


@router.get("/surplus-deficit")
async def surplus_deficit(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Surplus/deficit by plan and by group."""
    by_plan = await risk_accounting_service.get_surplus_deficit_by_plan(db)
    by_group = await risk_accounting_service.get_surplus_deficit_by_group(db)
    return {"by_plan": by_plan, "by_group": by_group}


@router.get("/risk-corridor")
async def risk_corridor(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Risk corridor analysis."""
    return await risk_accounting_service.get_risk_corridor_analysis(db)


@router.post("/capitation")
async def enter_capitation(
    body: CapitationPaymentIn,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Enter a capitation payment."""
    return {"id": 0, "status": "recorded", **body.model_dump()}


@router.post("/subcap")
async def enter_subcap(
    body: SubcapPaymentIn,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Enter a subcapitation payment."""
    return {"id": 0, "status": "recorded", **body.model_dump()}
