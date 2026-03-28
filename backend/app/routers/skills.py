"""
Skills / Automation API endpoints.

Provides endpoints for managing reusable workflow automations (skills),
executing them, viewing execution history, and getting AI suggestions.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.skill_service import (
    create_skill,
    delete_skill,
    execute_skill,
    get_preset_skills,
    get_skill,
    get_skill_executions,
    get_skills,
    suggest_skills,
    update_skill,
    AVAILABLE_ACTIONS,
    _execute_step,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/skills", tags=["skills"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SkillCreate(BaseModel):
    name: str
    description: str | None = None
    trigger_type: str = "manual"
    trigger_config: dict | None = None
    steps: list[dict] = []
    is_active: bool = True
    scope: str = "tenant"


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    trigger_config: dict | None = None
    steps: list[dict] | None = None
    is_active: bool | None = None


class SkillExecuteRequest(BaseModel):
    triggered_by: str = "manual"


class SkillExecuteByNameRequest(BaseModel):
    action: str = Field(..., description="Action name to execute (e.g. hcc_analysis)")
    params: dict = Field(default_factory=dict, description="Optional parameters")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def list_skills(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all skills."""
    return await get_skills(db)


@router.get("/presets")
async def list_presets(
    current_user: dict = Depends(get_current_user),
):
    """List built-in preset skill templates."""
    return get_preset_skills()


@router.get("/actions")
async def list_actions(
    current_user: dict = Depends(get_current_user),
):
    """List available step actions for building skills."""
    return AVAILABLE_ACTIONS


# Mapping from frontend pipeline names to backend action names
_PIPELINE_ACTION_MAP = {
    "data_load": "run_quality_checks",
    "hcc_analysis": "run_hcc_engine",
    "provider_scorecards": "refresh_provider_scorecards",
    "care_gap_detection": "detect_care_gaps",
    "ai_insights": "generate_insights",
    "refresh_scorecards": "refresh_provider_scorecards",
    "discovery": "run_discovery",
    "alert_rules": "evaluate_alert_rules",
}


@router.post("/execute-by-name")
async def execute_skill_by_name(
    body: SkillExecuteByNameRequest,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
):
    """Execute a system-level pipeline action by name.

    This endpoint is for system pipeline actions (onboarding wizard, scheduled
    pipelines) that don't require a persisted skill record.  The action name
    is mapped to an internal _execute_step action and dispatched directly.
    """
    # Resolve alias → canonical action name
    action = _PIPELINE_ACTION_MAP.get(body.action, body.action)

    # Validate that the action is known
    known_actions = {a["action"] for a in AVAILABLE_ACTIONS}
    if action not in known_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action '{body.action}'. Available: {sorted(known_actions)}",
        )

    tenant_schema = current_user.get("tenant_schema", "public")
    result = await _execute_step(db, action, body.params, tenant_schema)
    return {
        "action": body.action,
        "resolved_action": action,
        "summary": result.get("message") or result.get("status", "completed"),
        **result,
    }


@router.get("/suggest")
async def get_suggestions(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get AI-suggested skills based on usage patterns."""
    return await suggest_skills(db, tenant_schema=current_user["tenant_schema"])


@router.post("")
async def create_new_skill(
    body: SkillCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a new skill."""
    skill_data = body.model_dump()
    skill_data["created_by"] = current_user["user_id"]
    return await create_skill(db, skill_data)


@router.get("/executions")
async def list_all_executions(
    limit: int = Query(default=20, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List recent execution history across all skills."""
    return await get_skill_executions(db, skill_id=None, limit=limit)


@router.get("/{skill_id}")
async def get_skill_detail(
    skill_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get a single skill by ID."""
    skill = await get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.patch("/{skill_id}")
async def update_existing_skill(
    skill_id: int,
    body: SkillUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update a skill."""
    updates = body.model_dump(exclude_unset=True)
    result = await update_skill(db, skill_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Skill not found")
    return result


@router.delete("/{skill_id}")
async def delete_existing_skill(
    skill_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Delete a skill."""
    success = await delete_skill(db, skill_id)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found")
    return {"deleted": True, "id": skill_id}


@router.post("/{skill_id}/execute")
async def run_skill(
    skill_id: int,
    body: SkillExecuteRequest | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Execute a skill."""
    triggered_by = body.triggered_by if body else "manual"
    try:
        result = await execute_skill(
            db,
            skill_id,
            triggered_by=triggered_by,
            executed_by=current_user["user_id"],
            tenant_schema=current_user["tenant_schema"],
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{skill_id}/executions")
async def list_skill_executions(
    skill_id: int,
    limit: int = Query(default=20, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get execution history for a specific skill."""
    return await get_skill_executions(db, skill_id=skill_id, limit=limit)
