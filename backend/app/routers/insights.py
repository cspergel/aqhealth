"""
AI Insights API endpoints.

Provides population-level, member-level, and provider-level AI insights,
status management (dismiss, bookmark, acted_on), and manual regeneration.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.models.insight import Insight, InsightCategory, InsightStatus
from app.services import insight_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/insights", tags=["insights"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class InsightOut(BaseModel):
    id: int
    category: str
    title: str
    description: str
    dollar_impact: float | None = None
    recommended_action: str | None = None
    confidence: int | None = None
    status: str
    affected_members: list | dict | None = None
    affected_providers: list | dict | None = None
    surface_on: list[str] | None = None
    connections: dict | None = None
    source_modules: list[str] | None = None


class InsightStatusUpdate(BaseModel):
    status: str = Field(..., description="One of: dismissed, bookmarked, acted_on, active")


class RegenerateResponse(BaseModel):
    insights_created: int
    insights: list[dict] = []


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[InsightOut])
async def list_insights(
    category: str | None = Query(None, description="Filter by category"),
    surface_on: str | None = Query(None, description="Filter by surface location"),
    status: str | None = Query(None, description="Filter by status (default: active)"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List active insights, filterable by category and surface_on."""
    query = select(Insight)

    # Default to active status
    if status:
        status_map = {s.value: s for s in InsightStatus}
        if status in status_map:
            query = query.where(Insight.status == status_map[status])
    else:
        query = query.where(Insight.status == InsightStatus.active)

    if category:
        cat_map = {c.value: c for c in InsightCategory}
        if category in cat_map:
            query = query.where(Insight.category == cat_map[category])

    if surface_on:
        # JSONB array contains check
        query = query.where(
            Insight.surface_on.op("@>")(f'["{surface_on}"]')
        )

    query = query.order_by(Insight.dollar_impact.desc().nulls_last()).limit(50)
    result = await db.execute(query)
    insights = result.scalars().all()

    return [_insight_to_dict(i) for i in insights]


@router.get("/member/{member_id}", response_model=list[dict])
async def member_insights(
    member_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Generate on-demand member-specific insights via LLM."""
    results = await insight_service.generate_member_insights(db, member_id)
    return results


@router.get("/provider/{provider_id}", response_model=list[dict])
async def provider_insights(
    provider_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Generate on-demand provider coaching insights via LLM."""
    results = await insight_service.generate_provider_insights(db, provider_id)
    return results


@router.patch("/{insight_id}", response_model=InsightOut)
async def update_insight_status(
    insight_id: int,
    body: InsightStatusUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update insight status (dismiss, bookmark, acted_on)."""
    insight = await db.get(Insight, insight_id)
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")

    status_map = {s.value: s for s in InsightStatus}
    if body.status not in status_map:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {list(status_map.keys())}")

    insight.status = status_map[body.status]
    await db.commit()
    await db.refresh(insight)

    return _insight_to_dict(insight)


@router.post("/regenerate", response_model=RegenerateResponse)
async def regenerate_insights(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Force re-run of population insight generation."""
    results = await insight_service.generate_insights(db)
    return {"insights_created": len(results), "insights": results}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _insight_to_dict(i: Insight) -> dict:
    return {
        "id": i.id,
        "category": i.category.value if hasattr(i.category, "value") else str(i.category),
        "title": i.title,
        "description": i.description,
        "dollar_impact": float(i.dollar_impact) if i.dollar_impact is not None else None,
        "recommended_action": i.recommended_action,
        "confidence": i.confidence,
        "status": i.status.value if hasattr(i.status, "value") else str(i.status),
        "affected_members": i.affected_members,
        "affected_providers": i.affected_providers,
        "surface_on": i.surface_on,
        "connections": i.connections,
        "source_modules": i.source_modules,
    }
