"""
Member Roster / Panel Management API endpoints.

Paginated member list with extensive filters including RAF score ranges,
days since last visit, risk tier, and more.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.member_service import (
    get_member_list,
    get_member_detail,
    get_member_stats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/members", tags=["members"])


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class MemberRow(BaseModel):
    member_id: str
    name: str
    dob: str
    pcp: str = ""
    pcp_id: int | None = None
    group: str = ""
    group_id: int | None = None
    current_raf: float = 0.0
    risk_tier: str | None = None
    last_visit_date: str = ""
    days_since_visit: int | None = None
    suspect_count: int = 0
    gap_count: int = 0
    total_spend_12mo: float = 0.0
    plan: str = ""
    has_suspects: bool = False
    has_gaps: bool = False
    er_visits_12mo: int = 0
    admissions_12mo: int = 0
    snf_days_12mo: int = 0  # TODO: not yet populated by member_service


class MemberListOut(BaseModel):
    items: list[MemberRow]
    total: int
    page: int
    page_size: int
    total_pages: int


class MemberStatsOut(BaseModel):
    count: int
    avg_raf: float
    total_suspects: int
    total_gaps: int


# ---------------------------------------------------------------------------
# GET /api/members/stats — aggregate stats for current filter
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=MemberStatsOut)
async def member_stats(
    raf_min: Optional[float] = Query(None),
    raf_max: Optional[float] = Query(None),
    days_not_seen: Optional[int] = Query(None),
    risk_tier: Optional[str] = Query(None),
    provider_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    has_suspects: Optional[bool] = Query(None),
    has_gaps: Optional[bool] = Query(None),
    plan: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_er_visits: Optional[int] = Query(None),
    min_admissions: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return aggregate stats for the filtered member population."""
    filters = {
        k: v for k, v in {
            "raf_min": raf_min,
            "raf_max": raf_max,
            "days_not_seen": days_not_seen,
            "risk_tier": risk_tier,
            "provider_id": provider_id,
            "group_id": group_id,
            "has_suspects": has_suspects,
            "has_gaps": has_gaps,
            "plan": plan,
            "search": search,
            "min_er_visits": min_er_visits,
            "min_admissions": min_admissions,
        }.items() if v is not None
    }
    data = await get_member_stats(db, filters)
    return MemberStatsOut(**data)


# ---------------------------------------------------------------------------
# GET /api/members/{member_id} — full member detail
# ---------------------------------------------------------------------------

@router.get("/{member_id}")
async def member_detail(
    member_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return full member detail (demographics, RAF, suspects, gaps, claims, meds)."""
    data = await get_member_detail(db, member_id)
    if not data:
        raise HTTPException(status_code=404, detail="Member not found")
    return data


# ---------------------------------------------------------------------------
# GET /api/members — paginated member list with extensive filters
# ---------------------------------------------------------------------------

@router.get("", response_model=MemberListOut)
async def member_list(
    raf_min: Optional[float] = Query(None),
    raf_max: Optional[float] = Query(None),
    days_not_seen: Optional[int] = Query(None),
    risk_tier: Optional[str] = Query(None),
    provider_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    has_suspects: Optional[bool] = Query(None),
    has_gaps: Optional[bool] = Query(None),
    plan: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_er_visits: Optional[int] = Query(None),
    min_admissions: Optional[int] = Query(None),
    sort_by: str = Query("raf", pattern="^(raf|name|last_visit|suspect_count|gap_count|spend)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return paginated member list with all filters applied."""
    filters = {
        k: v for k, v in {
            "raf_min": raf_min,
            "raf_max": raf_max,
            "days_not_seen": days_not_seen,
            "risk_tier": risk_tier,
            "provider_id": provider_id,
            "group_id": group_id,
            "has_suspects": has_suspects,
            "has_gaps": has_gaps,
            "plan": plan,
            "search": search,
            "min_er_visits": min_er_visits,
            "min_admissions": min_admissions,
            "sort_by": sort_by,
            "order": order,
            "page": page,
            "page_size": page_size,
        }.items() if v is not None
    }
    data = await get_member_list(db, filters)
    return MemberListOut(**data)
