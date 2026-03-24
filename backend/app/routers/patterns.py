"""
Success Pattern Learning System API endpoints.

Provides code utilization analysis, success pattern extraction,
AI-generated playbooks, intervention outcome tracking, and internal benchmarks.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.pattern_service import (
    analyze_code_utilization,
    extract_success_patterns,
    generate_playbooks,
    track_intervention_outcomes,
    get_network_benchmarks,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/patterns", tags=["patterns"])


@router.get("/code-utilization")
async def code_utilization(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> dict[str, Any]:
    """Code usage comparison across practice groups."""
    return await analyze_code_utilization(db)


@router.get("/success")
async def success_patterns(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[dict[str, Any]]:
    """Extracted success patterns from top performers."""
    return await extract_success_patterns(db)


@router.get("/playbooks")
async def playbooks(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[dict[str, Any]]:
    """AI-generated actionable playbooks."""
    return await generate_playbooks(db)


@router.get("/outcomes")
async def outcomes(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> list[dict[str, Any]]:
    """Intervention outcome tracking — what worked."""
    return await track_intervention_outcomes(db)


@router.get("/benchmarks")
async def benchmarks(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> dict[str, Any]:
    """Internal network benchmarks from your own best performers."""
    return await get_network_benchmarks(db)
