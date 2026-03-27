"""
Care Plan Service — CRUD and analytics for care plans, goals, and interventions.
"""

import logging
from datetime import date

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care_plan import CarePlan, CarePlanGoal, CarePlanIntervention

logger = logging.getLogger(__name__)


async def get_care_plans(db: AsyncSession, member_id: int | None = None) -> list[dict]:
    """Return care plans, optionally filtered by member.

    Uses a single query with outerjoin + GROUP BY to avoid N+1 per-plan goal fetches.
    """
    query = (
        select(
            CarePlan,
            func.count(CarePlanGoal.id).label("total_goals"),
            func.sum(case((CarePlanGoal.status == "met", 1), else_=0)).label("met_goals"),
        )
        .outerjoin(CarePlanGoal, CarePlanGoal.care_plan_id == CarePlan.id)
        .group_by(CarePlan.id)
        .order_by(CarePlan.created_at.desc())
    )
    if member_id is not None:
        query = query.where(CarePlan.member_id == member_id)
    result = await db.execute(query)

    out = []
    for row in result.all():
        p = row[0]
        total_goals = row.total_goals or 0
        met_goals = int(row.met_goals or 0)
        completion_pct = round((met_goals / total_goals * 100) if total_goals > 0 else 0, 1)

        out.append({
            "id": p.id,
            "member_id": p.member_id,
            "title": p.title,
            "status": p.status,
            "created_by": p.created_by,
            "care_manager_id": p.care_manager_id,
            "start_date": str(p.start_date) if p.start_date else None,
            "target_end_date": str(p.target_end_date) if p.target_end_date else None,
            "actual_end_date": str(p.actual_end_date) if p.actual_end_date else None,
            "notes": p.notes,
            "goals_count": total_goals,
            "goals_met": met_goals,
            "completion_pct": completion_pct,
        })
    return out


async def get_care_plan_detail(db: AsyncSession, plan_id: int) -> dict | None:
    """Return a care plan with full goals and interventions."""
    result = await db.execute(select(CarePlan).where(CarePlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        return None

    goals_result = await db.execute(
        select(CarePlanGoal).where(CarePlanGoal.care_plan_id == plan_id)
    )
    goals = goals_result.scalars().all()

    # Batch-fetch all interventions for this plan's goals in one query
    goal_ids = [g.id for g in goals]
    interventions_by_goal: dict[int, list] = {gid: [] for gid in goal_ids}
    if goal_ids:
        intv_result = await db.execute(
            select(CarePlanIntervention).where(CarePlanIntervention.goal_id.in_(goal_ids))
        )
        for i in intv_result.scalars().all():
            interventions_by_goal.setdefault(i.goal_id, []).append(i)

    goals_out = []
    for g in goals:
        interventions = interventions_by_goal.get(g.id, [])

        goals_out.append({
            "id": g.id,
            "care_plan_id": g.care_plan_id,
            "description": g.description,
            "target_metric": g.target_metric,
            "target_value": g.target_value,
            "baseline_value": g.baseline_value,
            "current_value": g.current_value,
            "status": g.status,
            "target_date": str(g.target_date) if g.target_date else None,
            "interventions": [
                {
                    "id": i.id,
                    "goal_id": i.goal_id,
                    "description": i.description,
                    "intervention_type": i.intervention_type,
                    "assigned_to": i.assigned_to,
                    "due_date": str(i.due_date) if i.due_date else None,
                    "completed_date": str(i.completed_date) if i.completed_date else None,
                    "status": i.status,
                    "notes": i.notes,
                }
                for i in interventions
            ],
        })

    total_goals = len(goals_out)
    met_goals = sum(1 for g in goals_out if g["status"] == "met")
    completion_pct = round((met_goals / total_goals * 100) if total_goals > 0 else 0, 1)

    return {
        "id": plan.id,
        "member_id": plan.member_id,
        "title": plan.title,
        "status": plan.status,
        "created_by": plan.created_by,
        "care_manager_id": plan.care_manager_id,
        "start_date": str(plan.start_date) if plan.start_date else None,
        "target_end_date": str(plan.target_end_date) if plan.target_end_date else None,
        "actual_end_date": str(plan.actual_end_date) if plan.actual_end_date else None,
        "notes": plan.notes,
        "goals": goals_out,
        "goals_count": total_goals,
        "goals_met": met_goals,
        "completion_pct": completion_pct,
    }


async def create_care_plan(db: AsyncSession, data: dict) -> dict:
    """Create a new care plan."""
    data.pop("id", None)
    plan = CarePlan(**data)
    db.add(plan)
    await db.flush()
    await db.refresh(plan)
    return {"id": plan.id, "status": "created"}


async def update_care_plan(db: AsyncSession, plan_id: int, data: dict) -> dict | None:
    """Update an existing care plan."""
    result = await db.execute(select(CarePlan).where(CarePlan.id == plan_id))
    plan = result.scalar_one_or_none()
    if not plan:
        return None
    for key, value in data.items():
        if hasattr(plan, key):
            setattr(plan, key, value)
    await db.flush()
    return {"id": plan.id, "status": "updated"}


async def add_goal(db: AsyncSession, plan_id: int, data: dict) -> dict:
    """Add a goal to a care plan."""
    goal = CarePlanGoal(care_plan_id=plan_id, **data)
    db.add(goal)
    await db.flush()
    await db.refresh(goal)
    return {"id": goal.id, "status": "created"}


async def add_intervention(db: AsyncSession, goal_id: int, data: dict) -> dict:
    """Add an intervention to a goal."""
    intervention = CarePlanIntervention(goal_id=goal_id, **data)
    db.add(intervention)
    await db.flush()
    await db.refresh(intervention)
    return {"id": intervention.id, "status": "created"}


async def update_intervention(db: AsyncSession, intervention_id: int, data: dict) -> dict | None:
    """Update an intervention's status."""
    result = await db.execute(
        select(CarePlanIntervention).where(CarePlanIntervention.id == intervention_id)
    )
    intervention = result.scalar_one_or_none()
    if not intervention:
        return None
    for key, value in data.items():
        if hasattr(intervention, key):
            setattr(intervention, key, value)
    await db.flush()
    return {"id": intervention.id, "status": "updated"}


async def get_care_plan_summary(db: AsyncSession) -> dict:
    """Summary of all active care plans with completion metrics."""
    today = date.today()

    # Single aggregate query instead of N+1 per-plan goal fetches
    summary_q = await db.execute(
        select(
            func.count(func.distinct(CarePlan.id)).label("active_plans"),
            func.count(CarePlanGoal.id).label("total_goals"),
            func.sum(case((CarePlanGoal.status == "met", 1), else_=0)).label("met_goals"),
            func.sum(
                case(
                    (
                        and_(
                            CarePlanGoal.status.in_(["in_progress", "not_started"]),
                            CarePlanGoal.target_date.isnot(None),
                            CarePlanGoal.target_date < today,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("past_due_goals"),
        )
        .select_from(CarePlan)
        .outerjoin(CarePlanGoal, CarePlanGoal.care_plan_id == CarePlan.id)
        .where(CarePlan.status == "active")
    )
    row = summary_q.one()
    total_plans = row.active_plans or 0
    total_goals = row.total_goals or 0
    met_goals = int(row.met_goals or 0)
    past_due_goals = int(row.past_due_goals or 0)

    return {
        "active_plans": total_plans,
        "total_goals": total_goals,
        "met_goals": met_goals,
        "past_due_goals": past_due_goals,
        "overall_completion_pct": round(
            (met_goals / total_goals * 100) if total_goals > 0 else 0, 1
        ),
    }
