"""
Group / Office Scorecard API endpoints.

Provides group list with metrics/tiers, individual group scorecards,
side-by-side comparison, trend analysis, and cross-group AI insights.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.group_service import (
    get_group_list,
    get_group_scorecard,
    get_group_comparison,
    get_group_trends,
    get_group_providers,
    get_intergroup_analysis,
)

logger = logging.getLogger(__name__)

# Groups — network section.
router = APIRouter(
    prefix="/api/groups",
    tags=["groups"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.financial,
        UserRole.auditor,
    ))],
)


# ---------------------------------------------------------------------------
# GET /api/groups — list all groups with metrics
# ---------------------------------------------------------------------------

@router.get("")
async def list_groups(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return all practice groups with computed metrics and performance tiers."""
    return await get_group_list(db)


# ---------------------------------------------------------------------------
# GET /api/groups/compare — side-by-side comparison (before {id} routes)
# ---------------------------------------------------------------------------

@router.get("/compare")
async def compare_groups(
    a: int = Query(..., description="First group ID"),
    b: int = Query(..., description="Second group ID"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Side-by-side comparison of two groups."""
    data = await get_group_comparison(db, a, b)
    if not data:
        raise HTTPException(status_code=404, detail="One or both groups not found")
    return data


# ---------------------------------------------------------------------------
# GET /api/groups/insights — cross-group AI insights
# ---------------------------------------------------------------------------

@router.get("/insights")
async def group_insights(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return AI-generated cross-group insights."""
    return await get_intergroup_analysis(db)


# ---------------------------------------------------------------------------
# GET /api/groups/{id} — group scorecard
# ---------------------------------------------------------------------------

@router.get("/{group_id}")
async def group_scorecard(
    group_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return full group scorecard with per-metric detail."""
    data = await get_group_scorecard(db, group_id)
    if not data:
        raise HTTPException(status_code=404, detail="Group not found")
    return data


# ---------------------------------------------------------------------------
# GET /api/groups/{id}/trends — trend analysis
# ---------------------------------------------------------------------------

@router.get("/{group_id}/trends")
async def group_trends(
    group_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return trend data for a group."""
    data = await get_group_trends(db, group_id)
    if not data:
        raise HTTPException(status_code=404, detail="Group not found")
    return data


# ---------------------------------------------------------------------------
# GET /api/groups/{id}/providers — providers in this group
# ---------------------------------------------------------------------------

@router.get("/{group_id}/providers")
async def group_provider_list(
    group_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return providers belonging to this group."""
    return await get_group_providers(db, group_id)
