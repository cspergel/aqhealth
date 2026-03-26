"""
Alert Rules API endpoints.

User-defined alerting rules engine with automated evaluation and notifications.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import alert_rules_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alert-rules", tags=["alert-rules"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AlertRuleCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = None
    entity_type: str = Field(..., description="member, provider, group, measure, population")
    metric: str
    operator: str = Field(..., description="gt, lt, gte, lte, eq, change_gt, change_lt")
    threshold: float
    scope_filter: dict | None = None
    notify_channels: dict = Field(default_factory=lambda: {"in_app": True})
    severity: str = "medium"


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    entity_type: str | None = None
    metric: str | None = None
    operator: str | None = None
    threshold: float | None = None
    scope_filter: dict | None = None
    notify_channels: dict | None = None
    severity: str | None = None
    is_active: bool | None = None


class AlertRuleOut(BaseModel):
    id: int
    name: str
    description: str | None
    entity_type: str
    metric: str
    operator: str
    threshold: float
    scope_filter: dict | None
    notify_channels: dict
    severity: str
    is_active: bool
    created_by: int
    last_evaluated: str | None
    last_triggered: str | None
    trigger_count: int
    created_at: str


class AlertTriggerOut(BaseModel):
    id: int
    rule_id: int
    entity_type: str
    entity_id: int | None
    entity_name: str | None
    metric_value: float
    threshold: float
    message: str
    acknowledged: bool
    acknowledged_by: int | None
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[AlertRuleOut])
async def list_rules(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List all alert rules for the current user."""
    rules = await alert_rules_service.get_rules(db, current_user["user_id"])
    return [_rule_to_dict(r) for r in rules]


@router.post("", response_model=AlertRuleOut, status_code=201)
async def create_rule(
    body: AlertRuleCreate,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new alert rule."""
    rule = await alert_rules_service.create_rule(db, {
        **body.model_dump(),
        "created_by": current_user["user_id"],
    })
    return _rule_to_dict(rule)


@router.patch("/{rule_id}", response_model=AlertRuleOut)
async def update_rule(
    rule_id: int,
    body: AlertRuleUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing alert rule."""
    updates = body.model_dump(exclude_unset=True)
    rule = await alert_rules_service.update_rule(db, rule_id, updates)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return _rule_to_dict(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> None:
    """Delete an alert rule."""
    success = await alert_rules_service.delete_rule(db, rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Rule not found")


@router.post("/evaluate", response_model=list[AlertTriggerOut])
async def evaluate_rules(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Trigger evaluation of all active rules."""
    triggers = await alert_rules_service.evaluate_rules(db)
    return [_trigger_to_dict(t) for t in triggers]


@router.get("/triggers", response_model=list[AlertTriggerOut])
async def get_triggers(
    acknowledged: bool | None = Query(None),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Get triggered alerts with optional acknowledged filter."""
    triggers = await alert_rules_service.get_triggered_alerts(db, acknowledged)
    return [_trigger_to_dict(t) for t in triggers]


@router.patch("/triggers/{trigger_id}/acknowledge", response_model=AlertTriggerOut)
async def acknowledge_trigger(
    trigger_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Acknowledge a triggered alert."""
    trigger = await alert_rules_service.acknowledge_trigger(
        db, trigger_id, current_user["user_id"]
    )
    if not trigger:
        raise HTTPException(status_code=404, detail="Trigger not found")
    return _trigger_to_dict(trigger)


@router.get("/presets", response_model=list[dict])
async def get_presets(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Get preset rule templates."""
    return alert_rules_service.get_preset_rules()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rule_to_dict(r) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "entity_type": r.entity_type,
        "metric": r.metric,
        "operator": r.operator,
        "threshold": float(r.threshold),
        "scope_filter": r.scope_filter,
        "notify_channels": r.notify_channels,
        "severity": r.severity,
        "is_active": r.is_active,
        "created_by": r.created_by,
        "last_evaluated": r.last_evaluated.isoformat() if r.last_evaluated else None,
        "last_triggered": r.last_triggered.isoformat() if r.last_triggered else None,
        "trigger_count": r.trigger_count or 0,
        "created_at": r.created_at.isoformat() if r.created_at else "",
    }


def _trigger_to_dict(t) -> dict:
    return {
        "id": t.id,
        "rule_id": t.rule_id,
        "entity_type": t.entity_type,
        "entity_id": t.entity_id,
        "entity_name": t.entity_name,
        "metric_value": float(t.metric_value),
        "threshold": float(t.threshold),
        "message": t.message,
        "acknowledged": t.acknowledged,
        "acknowledged_by": t.acknowledged_by,
        "created_at": t.created_at.isoformat() if t.created_at else "",
    }
