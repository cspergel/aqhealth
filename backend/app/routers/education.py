"""
Provider Education Engine API endpoints.

Serves targeted education recommendations, the module library,
and completion tracking.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import education_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/education", tags=["education"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class EducationModuleOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    estimated_minutes: int
    relevance_score: float | None = None
    completed: bool = False
    completed_date: str | None = None


class CompletionIn(BaseModel):
    provider_id: int
    module_id: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/recommendations", response_model=list[EducationModuleOut])
async def education_recommendations(
    provider_id: int = Query(..., description="Provider to get recommendations for"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """AI-generated targeted education modules for a specific provider."""
    return await education_service.get_education_recommendations(db, provider_id)


@router.get("/library", response_model=list[EducationModuleOut])
async def education_library(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Full education module library."""
    return await education_service.get_education_library(db)


@router.post("/complete")
async def complete_module(
    body: CompletionIn,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Record module completion for a provider."""
    return await education_service.track_completion(db, body.provider_id, body.module_id)
