"""
Action Tracking API endpoints.

Provides CRUD for action items, creation from insights/alerts, stats, and
outcome measurement. All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import action_service

logger = logging.getLogger(__name__)

# "Care ops / operations" section — business roles + care manager.
router = APIRouter(
    prefix="/api/actions",
    tags=["actions"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.auditor,
        UserRole.outreach,
        UserRole.financial,
        UserRole.provider,
    ))],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ActionCreateRequest(BaseModel):
    title: str
    description: str | None = None
    action_type: str = "other"
    source_type: str | None = "manual"
    source_id: int | None = None
    assigned_to: int | None = None
    assigned_to_name: str | None = None
    priority: str = "medium"
    due_date: str | None = None
    member_id: int | None = None
    provider_id: int | None = None
    group_id: int | None = None
    expected_impact: str | None = None


class ActionUpdateRequest(BaseModel):
    status: str | None = None
    priority: str | None = None
    assigned_to: int | None = None
    assigned_to_name: str | None = None
    due_date: str | None = None
    description: str | None = None
    actual_outcome: str | None = None
    resolution_notes: str | None = None
    expected_impact: str | None = None


class FromSourceRequest(BaseModel):
    assigned_to: int | None = None
    assigned_to_name: str | None = None


class ActionOut(BaseModel):
    id: int
    source_type: str | None = None
    source_id: int | None = None
    title: str
    description: str | None = None
    action_type: str
    assigned_to: int | None = None
    assigned_to_name: str | None = None
    priority: str
    status: str
    due_date: str | None = None
    completed_date: str | None = None
    member_id: int | None = None
    provider_id: int | None = None
    group_id: int | None = None
    expected_impact: str | None = None
    actual_outcome: str | None = None
    outcome_measured: bool = False
    resolution_notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ActionStatsOut(BaseModel):
    total: int
    open: int
    in_progress: int
    completed: int
    cancelled: int
    overdue: int
    completion_rate: float


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=ActionStatsOut)
async def get_action_stats(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get summary statistics for action items."""
    return await action_service.get_action_stats(db)


@router.get("", response_model=list[ActionOut])
async def list_actions(
    status: str | None = Query(None),
    priority: str | None = Query(None),
    assigned_to: int | None = Query(None),
    action_type: str | None = Query(None),
    source_type: str | None = Query(None),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List action items with optional filters."""
    filters = {}
    if status:
        filters["status"] = status
    if priority:
        filters["priority"] = priority
    if assigned_to:
        filters["assigned_to"] = assigned_to
    if action_type:
        filters["action_type"] = action_type
    if source_type:
        filters["source_type"] = source_type
    return await action_service.get_actions(db, filters if filters else None)


@router.post("", response_model=ActionOut)
async def create_action(
    body: ActionCreateRequest,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new action item."""
    return await action_service.create_action(db, body.model_dump())


@router.patch("/{action_id}", response_model=ActionOut)
async def update_action(
    action_id: int,
    body: ActionUpdateRequest,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an action item."""
    updates = body.model_dump(exclude_unset=True)
    try:
        return await action_service.update_action(db, action_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/from-insight/{insight_id}", response_model=ActionOut)
async def create_from_insight(
    insight_id: int,
    body: FromSourceRequest | None = None,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create an action item from an insight."""
    try:
        return await action_service.create_from_insight(
            db,
            insight_id,
            assigned_to=body.assigned_to if body else None,
            assigned_to_name=body.assigned_to_name if body else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/from-alert/{alert_id}", response_model=ActionOut)
async def create_from_alert(
    alert_id: int,
    body: FromSourceRequest | None = None,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create an action item from a care alert."""
    try:
        return await action_service.create_from_alert(
            db,
            alert_id,
            assigned_to=body.assigned_to if body else None,
            assigned_to_name=body.assigned_to_name if body else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
