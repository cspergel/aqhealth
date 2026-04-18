"""
Predictive Risk Scoring API endpoints.

Provides hospitalization risk predictions, cost trajectory projections,
and RAF impact scenarios.  All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import risk_prediction_service

logger = logging.getLogger(__name__)

# Predictions — intelligence / quality section.
router = APIRouter(
    prefix="/api/predictions",
    tags=["predictions"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.provider,
        UserRole.care_manager,
        UserRole.auditor,
    ))],
)


@router.get("/hospitalization-risk")
async def hospitalization_risk(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Return top members at risk of 30-day hospitalization."""
    return await risk_prediction_service.predict_hospitalization_risk(db)


@router.get("/cost-trajectory")
async def cost_trajectory(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return projected spend by service category for next quarter."""
    return await risk_prediction_service.predict_cost_trajectory(db)


@router.get("/raf-impact")
async def raf_impact(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return RAF projection scenarios (current, all captured, 80% recapture)."""
    return await risk_prediction_service.predict_raf_impact(db)
