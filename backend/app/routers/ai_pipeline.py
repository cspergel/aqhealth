"""
AI-Driven Data Pipeline API endpoints.

Provides endpoints for submitting raw data for AI-powered processing,
viewing pipeline health, managing learned transformation rules, and
reviewing processing history.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.ai_pipeline_service import (
    get_pipeline_dashboard,
    learn_from_correction,
    process_incoming_data,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pipeline", tags=["ai_pipeline"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProcessRequest(BaseModel):
    raw_data: str
    source_name: str | None = None
    format_hint: str | None = None


class LearnRuleRequest(BaseModel):
    source_name: str = "universal"
    field: str
    original_value: str
    corrected_value: str
    rule_type: str = "value_map"


class RuleUpdate(BaseModel):
    is_active: bool | None = None
    condition: dict | None = None
    transformation: dict | None = None


# ---------------------------------------------------------------------------
# Pipeline endpoints
# ---------------------------------------------------------------------------

@router.post("/process")
async def process_data(
    body: ProcessRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Submit raw data for AI-powered processing. Accepts any format."""
    source_info = {
        "source_name": body.source_name or "manual_upload",
        "format_hint": body.format_hint,
    }
    result = await process_incoming_data(db, body.raw_data, source_info)
    return result


@router.get("/dashboard")
async def pipeline_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get pipeline health metrics and stats."""
    return await get_pipeline_dashboard(db)


@router.get("/rules")
async def list_rules(
    source: str | None = Query(default=None),
    field: str | None = Query(default=None),
    active_only: bool = Query(default=True),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List learned transformation rules with optional filtering."""
    from sqlalchemy import select
    from app.models.transformation_rule import TransformationRule

    q = select(TransformationRule)
    if source:
        q = q.where(TransformationRule.source_name == source)
    if field:
        q = q.where(TransformationRule.field == field)
    if active_only:
        q = q.where(TransformationRule.is_active == True)
    q = q.order_by(TransformationRule.times_applied.desc())

    result = await db.execute(q)
    rules = result.scalars().all()

    return [
        {
            "id": r.id,
            "source_name": r.source_name,
            "data_type": r.data_type,
            "field": r.field,
            "rule_type": r.rule_type,
            "condition": r.condition,
            "transformation": r.transformation,
            "created_from": r.created_from,
            "times_applied": r.times_applied,
            "times_overridden": r.times_overridden,
            "accuracy": float(r.accuracy) if r.accuracy else None,
            "is_active": r.is_active,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rules
    ]


@router.patch("/rules/{rule_id}")
async def update_rule(
    rule_id: int,
    body: RuleUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Edit or disable a learned transformation rule."""
    from sqlalchemy import select, update
    from app.models.transformation_rule import TransformationRule

    result = await db.execute(select(TransformationRule).where(TransformationRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for key, val in updates.items():
        setattr(rule, key, val)
    await db.flush()
    await db.commit()

    return {"id": rule.id, "updated": list(updates.keys())}


@router.get("/runs")
async def list_runs(
    limit: int = Query(default=20, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List recent pipeline processing runs."""
    from sqlalchemy import select
    from app.models.transformation_rule import PipelineRun

    result = await db.execute(
        select(PipelineRun).order_by(PipelineRun.created_at.desc()).limit(limit)
    )
    runs = result.scalars().all()

    return [
        {
            "id": r.id,
            "source_name": r.source_name,
            "interface_id": r.interface_id,
            "format_detected": r.format_detected,
            "data_type_detected": r.data_type_detected,
            "total_records": r.total_records,
            "clean_records": r.clean_records,
            "quarantined_records": r.quarantined_records,
            "ai_cleaned": r.ai_cleaned,
            "rules_applied": r.rules_applied,
            "rules_created": r.rules_created,
            "entities_matched": r.entities_matched,
            "processing_time_ms": r.processing_time_ms,
            "errors": r.errors,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


@router.get("/runs/{run_id}")
async def get_run_detail(
    run_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get detailed info for a specific pipeline run."""
    from sqlalchemy import select
    from app.models.transformation_rule import PipelineRun

    result = await db.execute(select(PipelineRun).where(PipelineRun.id == run_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")

    return {
        "id": r.id,
        "source_name": r.source_name,
        "interface_id": r.interface_id,
        "format_detected": r.format_detected,
        "data_type_detected": r.data_type_detected,
        "total_records": r.total_records,
        "clean_records": r.clean_records,
        "quarantined_records": r.quarantined_records,
        "ai_cleaned": r.ai_cleaned,
        "rules_applied": r.rules_applied,
        "rules_created": r.rules_created,
        "entities_matched": r.entities_matched,
        "processing_time_ms": r.processing_time_ms,
        "errors": r.errors,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.post("/learn")
async def teach_rule(
    body: LearnRuleRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Manually teach the pipeline a new transformation rule."""
    result = await learn_from_correction(
        db,
        source_name=body.source_name,
        field=body.field,
        original_value=body.original_value,
        corrected_value=body.corrected_value,
        rule_type=body.rule_type,
    )
    return result
