"""
Care Plan Builder API endpoints.

CRUD for care plans, goals, interventions, and summary metrics.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.care_plan_service import (
    get_care_plans,
    get_care_plan_detail,
    create_care_plan,
    update_care_plan,
    add_goal,
    add_intervention,
    update_intervention,
    get_care_plan_summary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/care-plans", tags=["care-plans"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CarePlanCreate(BaseModel):
    member_id: int
    title: str
    status: str = "draft"
    created_by: int
    care_manager_id: int | None = None
    start_date: str
    target_end_date: str | None = None
    notes: str | None = None


class CarePlanUpdate(BaseModel):
    title: str | None = None
    status: str | None = None
    care_manager_id: int | None = None
    target_end_date: str | None = None
    actual_end_date: str | None = None
    notes: str | None = None


class GoalCreate(BaseModel):
    description: str
    target_metric: str | None = None
    target_value: str | None = None
    baseline_value: str | None = None
    current_value: str | None = None
    status: str = "not_started"
    target_date: str | None = None


class InterventionCreate(BaseModel):
    description: str
    intervention_type: str
    assigned_to: str | None = None
    due_date: str | None = None
    status: str = "pending"
    notes: str | None = None


class InterventionUpdate(BaseModel):
    status: str | None = None
    completed_date: str | None = None
    notes: str | None = None
    assigned_to: str | None = None


# ---------------------------------------------------------------------------
# GET /api/care-plans/summary — must be above /{id} to avoid route conflict
# ---------------------------------------------------------------------------

@router.get("/summary")
async def care_plan_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """All active plans with completion metrics."""
    return await get_care_plan_summary(db)


# ---------------------------------------------------------------------------
# GET /api/care-plans — list plans, optionally by member
# ---------------------------------------------------------------------------

@router.get("")
async def list_care_plans(
    member_id: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return care plans, optionally filtered by member_id."""
    return await get_care_plans(db, member_id=member_id)


# ---------------------------------------------------------------------------
# GET /api/care-plans/{id} — full plan with goals and interventions
# ---------------------------------------------------------------------------

@router.get("/{plan_id}")
async def care_plan_detail(
    plan_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return a care plan with all goals and interventions."""
    result = await get_care_plan_detail(db, plan_id)
    if not result:
        raise HTTPException(status_code=404, detail="Care plan not found")
    return result


# ---------------------------------------------------------------------------
# POST /api/care-plans — create plan
# ---------------------------------------------------------------------------

@router.post("")
async def create_plan(
    body: CarePlanCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a new care plan."""
    return await create_care_plan(db, body.model_dump())


# ---------------------------------------------------------------------------
# PATCH /api/care-plans/{id} — update plan
# ---------------------------------------------------------------------------

@router.patch("/{plan_id}")
async def update_plan(
    plan_id: int,
    body: CarePlanUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update a care plan."""
    data = body.model_dump(exclude_unset=True)
    result = await update_care_plan(db, plan_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Care plan not found")
    return result


# ---------------------------------------------------------------------------
# POST /api/care-plans/{id}/goals — add goal
# ---------------------------------------------------------------------------

@router.post("/{plan_id}/goals")
async def create_goal(
    plan_id: int,
    body: GoalCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Add a goal to a care plan."""
    return await add_goal(db, plan_id, body.model_dump())


# ---------------------------------------------------------------------------
# POST /api/care-plans/goals/{goal_id}/interventions — add intervention
# ---------------------------------------------------------------------------

@router.post("/goals/{goal_id}/interventions")
async def create_intervention(
    goal_id: int,
    body: InterventionCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Add an intervention to a goal."""
    return await add_intervention(db, goal_id, body.model_dump())


# ---------------------------------------------------------------------------
# PATCH /api/care-plans/interventions/{intervention_id} — update intervention
# ---------------------------------------------------------------------------

@router.patch("/interventions/{intervention_id}")
async def patch_intervention(
    intervention_id: int,
    body: InterventionUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an intervention status."""
    data = body.model_dump(exclude_unset=True)
    result = await update_intervention(db, intervention_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Intervention not found")
    return result
