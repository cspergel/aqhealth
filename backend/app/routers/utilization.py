"""
Utilization Command Center API endpoints.

Real-time operational dashboard: census, facility intelligence, admission
calendar, admission patterns, and follow-up tracking.
"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.utilization_service import (
    get_utilization_dashboard,
    get_facility_intelligence,
    get_admission_calendar,
    get_admission_patterns,
    get_follow_up_needed,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/utilization", tags=["utilization"])


@router.get("/dashboard")
async def dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Full utilization command center payload."""
    return await get_utilization_dashboard(db)


@router.get("/facilities")
async def facilities(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Facility intelligence: profiles, types, aliases, cost comparison."""
    return await get_facility_intelligence(db)


@router.get("/calendar")
async def calendar(
    months: int = Query(3, ge=1, le=12),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Daily admission counts for calendar view."""
    return await get_admission_calendar(db, months=months)


@router.get("/patterns")
async def patterns(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Admission patterns: time-of-day, day-of-week, seasonal trends."""
    return await get_admission_patterns(db)


@router.get("/follow-up-needed")
async def follow_up_needed(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Discharged members needing follow-up within 7 days."""
    return await get_follow_up_needed(db)
