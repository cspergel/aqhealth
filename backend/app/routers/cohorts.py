"""
Dynamic Cohort Builder API endpoints.

Build, save, and track custom population segments.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.cohort_service import (
    build_cohort,
    save_cohort,
    list_cohorts,
    get_cohort_detail,
    get_cohort_trends,
)

logger = logging.getLogger(__name__)

# Cohort builder — population/intelligence section.
router = APIRouter(
    prefix="/api/cohorts",
    tags=["cohorts"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.outreach,
    ))],
)


# ---------------------------------------------------------------------------
# Pydantic request / response schemas
# ---------------------------------------------------------------------------

class CohortFilters(BaseModel):
    age_min: int | None = None
    age_max: int | None = None
    gender: str | None = None
    diagnoses_include: list[str] | None = None
    diagnoses_exclude: list[str] | None = None
    medications: list[str] | None = None
    risk_tier: str | None = None
    provider_id: int | None = None
    group_id: int | None = None
    er_visits_min: int | None = None
    admissions_min: int | None = None
    raf_min: float | None = None
    raf_max: float | None = None
    care_gaps: list[str] | None = None
    suspect_hccs: list[str] | None = None


class BuildRequest(BaseModel):
    filters: CohortFilters


class SaveRequest(BaseModel):
    name: str
    filters: CohortFilters


class CohortMember(BaseModel):
    id: str
    name: str
    age: int
    gender: str
    raf: float
    risk_tier: str
    provider: str
    group: str
    er_visits: int
    admissions: int
    total_spend: float
    top_diagnoses: list[str]
    open_gaps: int
    suspect_hccs: list[str]


class AggregateStats(BaseModel):
    avg_raf: float
    total_spend: float
    avg_spend: float
    avg_age: float
    avg_er_visits: float
    avg_admissions: float
    pct_high_risk: float
    total_open_gaps: int


class DiagnosisCount(BaseModel):
    code: str
    count: int


class CohortBuildOut(BaseModel):
    member_count: int
    filters_applied: dict
    aggregate_stats: AggregateStats
    top_diagnoses: list[DiagnosisCount]
    top_suspects: list[DiagnosisCount]
    members: list[CohortMember]


class CohortSummaryOut(BaseModel):
    id: int
    name: str
    filters: dict
    created_at: str
    member_count: int
    last_run: str
    trend_sparkline: list[int] | None = None


class SavedCohortOut(BaseModel):
    id: int
    name: str
    filters: dict
    created_at: str
    member_count: int
    last_run: str


class TrendMonth(BaseModel):
    month: str
    member_count: int
    avg_raf: float
    total_spend: float
    avg_spend: float
    gap_closure_rate: float


class CohortTrendsOut(BaseModel):
    cohort_id: int
    months: list[TrendMonth]


# ---------------------------------------------------------------------------
# POST /api/cohorts/build — build ad-hoc cohort from filters
# ---------------------------------------------------------------------------

@router.post("/build", response_model=CohortBuildOut)
async def cohort_build(
    body: BuildRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Build a cohort from filter criteria and return matching members + stats."""
    data = await build_cohort(db, body.filters.model_dump(exclude_none=True))
    return CohortBuildOut(**data)


# ---------------------------------------------------------------------------
# POST /api/cohorts/save — save a cohort
# ---------------------------------------------------------------------------

@router.post("/save", response_model=SavedCohortOut)
async def cohort_save(
    body: SaveRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Save a named cohort definition for tracking over time."""
    data = await save_cohort(db, body.name, body.filters.model_dump(exclude_none=True))
    return SavedCohortOut(**data)


# ---------------------------------------------------------------------------
# GET /api/cohorts — list saved cohorts
# ---------------------------------------------------------------------------

@router.get("", response_model=list[CohortSummaryOut])
async def cohort_list(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all saved cohorts."""
    data = await list_cohorts(db)
    return [CohortSummaryOut(**d) for d in data]


# ---------------------------------------------------------------------------
# GET /api/cohorts/{id} — cohort detail with members
# ---------------------------------------------------------------------------

@router.get("/{cohort_id}")
async def cohort_detail(
    cohort_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return cohort detail including members and stats."""
    data = await get_cohort_detail(db, cohort_id)
    if not data:
        raise HTTPException(status_code=404, detail="Cohort not found")
    return data


# ---------------------------------------------------------------------------
# GET /api/cohorts/{id}/trends — cohort trends over time
# ---------------------------------------------------------------------------

@router.get("/{cohort_id}/trends", response_model=CohortTrendsOut)
async def cohort_trends(
    cohort_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return monthly metric trends for a saved cohort."""
    data = await get_cohort_trends(db, cohort_id)
    return CohortTrendsOut(**data)
