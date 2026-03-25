"""
Dual Data Tier Reconciliation API endpoints.

Provides signal-to-record reconciliation, IBNR estimates, and accuracy reporting.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.reconciliation_service import (
    get_ibnr_estimate,
    get_reconciliation_report,
    reconcile_signals,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reconciliation", tags=["reconciliation"])


# ---------------------------------------------------------------------------
# POST /api/reconciliation/run — trigger reconciliation
# ---------------------------------------------------------------------------

@router.post("/run")
async def run_reconciliation(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Run the signal-to-record reconciliation engine."""
    result = await reconcile_signals(db)
    return result


# ---------------------------------------------------------------------------
# GET /api/reconciliation/report — accuracy report
# ---------------------------------------------------------------------------

@router.get("/report")
async def reconciliation_report(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return reconciliation accuracy report with breakdowns."""
    return await get_reconciliation_report(db)


# ---------------------------------------------------------------------------
# GET /api/reconciliation/ibnr — current IBNR estimate
# ---------------------------------------------------------------------------

@router.get("/ibnr")
async def ibnr_estimate(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return current IBNR (Incurred But Not Reported) estimate."""
    return await get_ibnr_estimate(db)
