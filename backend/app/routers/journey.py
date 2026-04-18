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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.member import Member
from app.models.user import UserRole
from app.services.journey_service import (
    get_member_journey,
    get_member_risk_trajectory,
)

logger = logging.getLogger(__name__)

# Member journey — clinical/operations. Financial excluded (frontend
# hidePages "/journey").
router = APIRouter(
    prefix="/api/journey",
    tags=["journey"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.provider,
        UserRole.care_manager,
        UserRole.outreach,
        UserRole.auditor,
    ))],
)


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
    dob: str = ""
    age: int | None = None
    gender: str = ""
    health_plan: str | None = None
    pcp: str | None = None
    current_raf: float
    projected_raf: float
    risk_tier: str | None = None
    total_spend_12m: float = 0.0
    open_suspects: int = 0
    open_gaps: int = 0
    conditions: list[str] = []


class MemberSearchResult(BaseModel):
    id: int
    member_id: str
    name: str
    dob: str
    current_raf: float


class JourneyOut(BaseModel):
    member: MemberSummary
    timeline: list[TimelineEvent]
    narrative: str


class TrajectoryPoint(BaseModel):
    date: str
    raf: float
    cost: float = 0.0
    disease_raf: float = 0.0
    demographic_raf: float = 0.0
    hcc_count: int = 0
    event: str | None = None


# ---------------------------------------------------------------------------
# GET /api/journey/members — list members for the journey picker
# ---------------------------------------------------------------------------

@router.get("/members", response_model=list[MemberSearchResult])
async def list_journey_members(
    limit: int = Query(250, ge=1, le=1000),
    search: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return a lightweight member list for the Journey page picker."""
    stmt = select(Member).order_by(Member.current_raf.desc().nullslast()).limit(limit)
    if search:
        like = f"%{search.lower()}%"
        stmt = select(Member).where(
            (Member.first_name.ilike(like))
            | (Member.last_name.ilike(like))
            | (Member.member_id.ilike(like))
        ).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        MemberSearchResult(
            id=m.id,
            member_id=m.member_id,
            name=f"{m.first_name or ''} {m.last_name or ''}".strip(),
            dob=m.date_of_birth.isoformat() if m.date_of_birth else "",
            current_raf=float(m.current_raf or 0.0),
        )
        for m in rows
    ]


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
