"""
BOI (Benefit of Investment) Analytics API endpoints.

Tracks ROI of clinical and operational interventions.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import boi_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/boi", tags=["boi"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class BOIDashboardOut(BaseModel):
    interventions: list[dict[str, Any]]
    total_invested: float
    total_returned: float
    avg_roi: float
    intervention_count: int


class InterventionCreateIn(BaseModel):
    name: str
    description: str | None = None
    intervention_type: str
    target: str | None = None
    investment_amount: float
    investment_period: str | None = None
    start_date: date
    end_date: date | None = None
    baseline_metric: float | None = None
    current_metric: float | None = None
    metric_name: str | None = None
    estimated_return: float | None = None
    actual_return: float | None = None
    roi_percentage: float | None = None
    affected_members: int | None = None
    affected_providers: int | None = None
    practice_group_id: int | None = None
    status: str = "active"


class InterventionUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None
    current_metric: float | None = None
    actual_return: float | None = None
    roi_percentage: float | None = None
    status: str | None = None
    end_date: date | None = None
    affected_members: int | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=BOIDashboardOut)
async def boi_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return BOI dashboard with all interventions and aggregate metrics."""
    return await boi_service.get_boi_dashboard(db)


@router.get("/interventions")
async def list_interventions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all interventions."""
    dashboard = await boi_service.get_boi_dashboard(db)
    return dashboard["interventions"]


@router.post("/interventions")
async def create_intervention(
    payload: InterventionCreateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a new intervention."""
    return await boi_service.create_intervention(db, payload.model_dump())


@router.patch("/interventions/{intervention_id}")
async def update_intervention(
    intervention_id: int,
    payload: InterventionUpdateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an existing intervention."""
    data = payload.model_dump(exclude_unset=True)
    result = await boi_service.update_intervention(db, intervention_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Intervention not found")
    return result


@router.get("/interventions/{intervention_id}")
async def get_intervention(
    intervention_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get intervention detail."""
    result = await boi_service.get_intervention_detail(db, intervention_id)
    if not result:
        raise HTTPException(status_code=404, detail="Intervention not found")
    return result


@router.post("/calculate-roi/{intervention_id}")
async def calculate_roi(
    intervention_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Auto-calculate ROI for an intervention."""
    result = await boi_service.calculate_roi(db, intervention_id)
    if not result:
        raise HTTPException(status_code=404, detail="Intervention not found")
    return result


@router.get("/recommendations")
async def get_recommendations(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get AI-recommended interventions based on platform data."""
    return await boi_service.get_recommended_interventions(db)
