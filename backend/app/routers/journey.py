"""
Member Journey / Timeline API endpoints.

Provides a patient-level chronological view of every healthcare touchpoint:
ER visits, admissions, discharges, SNF stays, home health episodes,
PCP/specialist visits, pharmacy fills, HCC captures, and care gap closures.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.journey_service import (
    get_member_journey,
    get_member_risk_trajectory,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/journey", tags=["journey"])


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class EventFlag(BaseModel):
    type: str  # "success" | "missed"
    message: str


class TimelineEvent(BaseModel):
    date: str
    type: str
    title: str
    provider: str
    facility: str
    diagnoses: list[str]
    cost: float
    description: str
    flags: list[EventFlag]


class MemberSummary(BaseModel):
    id: int
    member_id: str
    name: str
    dob: str
    age: int
    gender: str
    health_plan: str | None = None
    pcp: str | None = None
    current_raf: float
    projected_raf: float
    risk_tier: str | None = None
    total_spend_12m: float | None = None
    open_suspects: int | None = None
    open_gaps: int | None = None


class JourneyOut(BaseModel):
    member: MemberSummary
    timeline: list[TimelineEvent]
    narrative: str


class TrajectoryPoint(BaseModel):
    date: str
    raf: float
    disease_raf: float | None = None
    demographic_raf: float | None = None
    hcc_count: int | None = None


# ---------------------------------------------------------------------------
# GET /api/journey/{member_id} — full member journey timeline
# ---------------------------------------------------------------------------

@router.get("/{member_id}", response_model=JourneyOut)
async def get_journey(
    member_id: int,
    months: int = Query(24, ge=1, le=120),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return the full chronological journey for a single member."""
    result = await get_member_journey(db, member_id, months)
    return JourneyOut(**result)


# ---------------------------------------------------------------------------
# GET /api/journey/{member_id}/trajectory — risk/cost trajectory
# ---------------------------------------------------------------------------

@router.get("/{member_id}/trajectory", response_model=list[TrajectoryPoint])
async def get_trajectory(
    member_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return monthly RAF score and cost trajectory with intervention markers."""
    result = await get_member_risk_trajectory(db, member_id)
    return [TrajectoryPoint(**pt) for pt in result]
