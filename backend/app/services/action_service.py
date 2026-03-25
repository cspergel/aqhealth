"""
Action Tracking service.

Closes the loop: insight -> action -> outcome. Creates, lists, updates,
and measures outcomes for tracked action items.
"""

import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.action import ActionItem
from app.models.insight import Insight
from app.models.adt import CareAlert

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

async def create_action(db: AsyncSession, data: dict) -> dict:
    """Create an action item from any source."""
    action = ActionItem(
        source_type=data.get("source_type", "manual"),
        source_id=data.get("source_id"),
        title=data["title"],
        description=data.get("description"),
        action_type=data.get("action_type", "other"),
        assigned_to=data.get("assigned_to"),
        assigned_to_name=data.get("assigned_to_name"),
        priority=data.get("priority", "medium"),
        status="open",
        due_date=_parse_date(data.get("due_date")),
        member_id=data.get("member_id"),
        provider_id=data.get("provider_id"),
        group_id=data.get("group_id"),
        expected_impact=data.get("expected_impact"),
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return _action_to_dict(action)


async def create_from_insight(db: AsyncSession, insight_id: int, assigned_to: int | None = None, assigned_to_name: str | None = None) -> dict:
    """Create an action item auto-populated from an insight."""
    insight = await db.get(Insight, insight_id)
    if not insight:
        raise ValueError(f"Insight {insight_id} not found")

    action = ActionItem(
        source_type="insight",
        source_id=insight_id,
        title=insight.title,
        description=insight.description,
        action_type=_infer_action_type(insight.category.value if hasattr(insight.category, "value") else str(insight.category)),
        assigned_to=assigned_to,
        assigned_to_name=assigned_to_name,
        priority=_infer_priority(insight.dollar_impact),
        status="open",
        expected_impact=f"${int(insight.dollar_impact):,} estimated impact" if insight.dollar_impact else None,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return _action_to_dict(action)


async def create_from_alert(db: AsyncSession, alert_id: int, assigned_to: int | None = None, assigned_to_name: str | None = None) -> dict:
    """Create an action item auto-populated from a care alert."""
    alert = await db.get(CareAlert, alert_id)
    if not alert:
        raise ValueError(f"Alert {alert_id} not found")

    action = ActionItem(
        source_type="alert",
        source_id=alert_id,
        title=alert.title,
        description=alert.description,
        action_type=_alert_type_to_action_type(alert.alert_type),
        assigned_to=assigned_to,
        assigned_to_name=assigned_to_name,
        priority=alert.priority or "medium",
        status="open",
        member_id=alert.member_id,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return _action_to_dict(action)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

async def get_actions(db: AsyncSession, filters: dict | None = None) -> list[dict]:
    """List action items with optional filters."""
    query = select(ActionItem).order_by(ActionItem.created_at.desc())

    if filters:
        if filters.get("status"):
            query = query.where(ActionItem.status == filters["status"])
        if filters.get("priority"):
            query = query.where(ActionItem.priority == filters["priority"])
        if filters.get("assigned_to"):
            query = query.where(ActionItem.assigned_to == int(filters["assigned_to"]))
        if filters.get("action_type"):
            query = query.where(ActionItem.action_type == filters["action_type"])
        if filters.get("source_type"):
            query = query.where(ActionItem.source_type == filters["source_type"])

    result = await db.execute(query.limit(200))
    actions = result.scalars().all()
    return [_action_to_dict(a) for a in actions]


async def get_action(db: AsyncSession, action_id: int) -> dict | None:
    """Get a single action item."""
    action = await db.get(ActionItem, action_id)
    if not action:
        return None
    return _action_to_dict(action)


async def get_action_stats(db: AsyncSession) -> dict:
    """Summary statistics for action items."""
    today = date.today()
    result = await db.execute(
        select(
            func.count(ActionItem.id).label("total"),
            func.sum(case((ActionItem.status == "open", 1), else_=0)).label("open"),
            func.sum(case((ActionItem.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((ActionItem.status == "completed", 1), else_=0)).label("completed"),
            func.sum(case((ActionItem.status == "cancelled", 1), else_=0)).label("cancelled"),
            func.sum(case(
                (and_(ActionItem.status.in_(["open", "in_progress"]), ActionItem.due_date < today), 1),
                else_=0,
            )).label("overdue"),
        )
    )
    row = result.one()
    total = row.total or 0
    completed = row.completed or 0
    completion_rate = round((completed / total * 100), 1) if total > 0 else 0

    return {
        "total": total,
        "open": row.open or 0,
        "in_progress": row.in_progress or 0,
        "completed": completed,
        "cancelled": row.cancelled or 0,
        "overdue": row.overdue or 0,
        "completion_rate": completion_rate,
    }


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

async def update_action(db: AsyncSession, action_id: int, updates: dict) -> dict:
    """Update an action item (status, assignment, completion, etc.)."""
    action = await db.get(ActionItem, action_id)
    if not action:
        raise ValueError(f"Action {action_id} not found")

    for key in ["status", "priority", "assigned_to", "assigned_to_name", "due_date",
                 "description", "actual_outcome", "resolution_notes", "expected_impact"]:
        if key in updates:
            value = updates[key]
            if key == "due_date" and isinstance(value, str):
                value = _parse_date(value)
            setattr(action, key, value)

    # Auto-set completed_date when status changes to completed
    if updates.get("status") == "completed" and not action.completed_date:
        action.completed_date = date.today()

    # Mark outcome_measured when actual_outcome is provided
    if updates.get("actual_outcome"):
        action.outcome_measured = True

    await db.commit()
    await db.refresh(action)
    return _action_to_dict(action)


# ---------------------------------------------------------------------------
# Outcome measurement
# ---------------------------------------------------------------------------

async def measure_outcomes(db: AsyncSession) -> list[dict]:
    """For completed actions, check if expected impact was achieved."""
    result = await db.execute(
        select(ActionItem).where(
            ActionItem.status == "completed",
            ActionItem.expected_impact.is_not(None),
            ActionItem.outcome_measured == False,
        )
    )
    actions = result.scalars().all()
    measured = []
    for action in actions:
        # In production, this would compare expected vs actual using real data.
        # For now, mark as measured.
        action.outcome_measured = True
        measured.append(_action_to_dict(action))

    if measured:
        await db.commit()

    return measured


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            return None
    return None


def _infer_action_type(category: str) -> str:
    mapping = {
        "revenue": "coding_education",
        "cost": "investigation",
        "quality": "outreach",
        "provider": "coding_education",
        "trend": "investigation",
        "cross_module": "care_plan",
    }
    return mapping.get(category, "other")


def _infer_priority(dollar_impact: float | None) -> str:
    if dollar_impact is None:
        return "medium"
    val = abs(float(dollar_impact))
    if val >= 500_000:
        return "critical"
    if val >= 100_000:
        return "high"
    if val >= 25_000:
        return "medium"
    return "low"


def _alert_type_to_action_type(alert_type: str) -> str:
    mapping = {
        "admission": "care_plan",
        "er_visit": "outreach",
        "discharge_planning": "scheduling",
        "readmission_risk": "care_plan",
        "snf_placement": "referral",
        "hcc_opportunity": "coding_education",
    }
    return mapping.get(alert_type, "other")


def _action_to_dict(a: ActionItem) -> dict:
    return {
        "id": a.id,
        "source_type": a.source_type,
        "source_id": a.source_id,
        "title": a.title,
        "description": a.description,
        "action_type": a.action_type,
        "assigned_to": a.assigned_to,
        "assigned_to_name": a.assigned_to_name,
        "priority": a.priority,
        "status": a.status,
        "due_date": a.due_date.isoformat() if a.due_date else None,
        "completed_date": a.completed_date.isoformat() if a.completed_date else None,
        "member_id": a.member_id,
        "provider_id": a.provider_id,
        "group_id": a.group_id,
        "expected_impact": a.expected_impact,
        "actual_outcome": a.actual_outcome,
        "outcome_measured": a.outcome_measured,
        "resolution_notes": a.resolution_notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }
