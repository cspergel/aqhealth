"""
Stars Rating Simulator API endpoints.

Provides current projected Star rating, simulation of interventions,
and AI-ranked highest-impact opportunities.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import stars_simulator_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stars", tags=["stars"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class InterventionIn(BaseModel):
    measure_code: str
    gaps_to_close: int | None = None
    rate_improvement_pct: float | None = None


class SimulateIn(BaseModel):
    interventions: list[InterventionIn] = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# GET /api/stars/projection
# ---------------------------------------------------------------------------

@router.get("/projection")
async def star_projection(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Current projected Star rating based on all measures."""
    return await stars_simulator_service.get_current_star_projection(db)


# ---------------------------------------------------------------------------
# POST /api/stars/simulate
# ---------------------------------------------------------------------------

@router.post("/simulate")
async def simulate(
    body: SimulateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Simulate interventions and compute new projected rating."""
    interventions = [i.model_dump(exclude_none=True) for i in body.interventions]
    return await stars_simulator_service.simulate_scenario(db, interventions)


# ---------------------------------------------------------------------------
# GET /api/stars/opportunities
# ---------------------------------------------------------------------------

@router.get("/opportunities")
async def opportunities(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """AI-ranked highest-impact interventions for Stars improvement."""
    return await stars_simulator_service.get_highest_impact_interventions(db)
