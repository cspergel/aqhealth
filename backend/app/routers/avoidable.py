"""
Avoidable Admission Analysis API endpoints.

AI-driven classification of ER visits and admissions by avoidability,
education opportunities, and dollar-impact estimates.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.avoidable_service import (
    analyze_avoidable_admissions,
    get_avoidable_er_detail,
    get_education_opportunities,
)

logger = logging.getLogger(__name__)

# Avoidable admissions — cost / population. Care manager + analyst roles.
router = APIRouter(
    prefix="/api/avoidable",
    tags=["avoidable"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.financial,
    ))],
)


@router.get("/analysis")
async def analysis(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Full avoidable admission analysis report."""
    return await analyze_avoidable_admissions(db)


@router.get("/er-detail")
async def er_detail(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """ER visit classification detail."""
    return await get_avoidable_er_detail(db)


@router.get("/education")
async def education(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Education opportunity recommendations."""
    return await get_education_opportunities(db)
