"""
BOI (Benefit of Investment) Service — intervention tracking, ROI calculation, recommendations.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.boi import Intervention

logger = logging.getLogger(__name__)


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    return float(v)


# ---------------------------------------------------------------------------
# BOI Dashboard
# ---------------------------------------------------------------------------

async def get_boi_dashboard(db: AsyncSession) -> dict:
    """All interventions with ROI, total invested, total returned, avg ROI."""

    result = await db.execute(
        select(Intervention).order_by(Intervention.start_date.desc())
    )
    interventions = result.scalars().all()

    items = []
    total_invested = 0.0
    total_returned = 0.0
    roi_sum = 0.0
    roi_count = 0

    for i in interventions:
        inv = _safe_float(i.investment_amount)
        ret = _safe_float(i.actual_return)
        roi = _safe_float(i.roi_percentage)
        total_invested += inv
        total_returned += ret
        if roi:
            roi_sum += roi
            roi_count += 1

        items.append({
            "id": i.id,
            "name": i.name,
            "description": i.description,
            "intervention_type": i.intervention_type,
            "target": i.target,
            "investment_amount": inv,
            "investment_period": i.investment_period,
            "start_date": str(i.start_date),
            "end_date": str(i.end_date) if i.end_date else None,
            "baseline_metric": _safe_float(i.baseline_metric),
            "current_metric": _safe_float(i.current_metric),
            "metric_name": i.metric_name,
            "estimated_return": _safe_float(i.estimated_return),
            "actual_return": ret,
            "roi_percentage": roi,
            "affected_members": i.affected_members,
            "affected_providers": i.affected_providers,
            "status": i.status,
        })

    return {
        "interventions": items,
        "total_invested": round(total_invested, 2),
        "total_returned": round(total_returned, 2),
        "avg_roi": round(roi_sum / roi_count, 1) if roi_count else 0,
        "intervention_count": len(items),
    }


# ---------------------------------------------------------------------------
# Intervention Detail
# ---------------------------------------------------------------------------

async def get_intervention_detail(db: AsyncSession, intervention_id: int) -> dict | None:
    """Full detail with metric progression."""

    result = await db.execute(
        select(Intervention).where(Intervention.id == intervention_id)
    )
    i = result.scalar_one_or_none()
    if not i:
        return None

    return {
        "id": i.id,
        "name": i.name,
        "description": i.description,
        "intervention_type": i.intervention_type,
        "target": i.target,
        "investment_amount": _safe_float(i.investment_amount),
        "investment_period": i.investment_period,
        "start_date": str(i.start_date),
        "end_date": str(i.end_date) if i.end_date else None,
        "baseline_metric": _safe_float(i.baseline_metric),
        "current_metric": _safe_float(i.current_metric),
        "metric_name": i.metric_name,
        "estimated_return": _safe_float(i.estimated_return),
        "actual_return": _safe_float(i.actual_return),
        "roi_percentage": _safe_float(i.roi_percentage),
        "affected_members": i.affected_members,
        "affected_providers": i.affected_providers,
        "practice_group_id": i.practice_group_id,
        "status": i.status,
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

async def create_intervention(db: AsyncSession, data: dict) -> dict:
    intervention = Intervention(**data)
    db.add(intervention)
    await db.commit()
    await db.refresh(intervention)
    return {"id": intervention.id, "name": intervention.name}


async def update_intervention(db: AsyncSession, intervention_id: int, data: dict) -> dict | None:
    result = await db.execute(
        select(Intervention).where(Intervention.id == intervention_id)
    )
    intervention = result.scalar_one_or_none()
    if not intervention:
        return None

    for key, value in data.items():
        if hasattr(intervention, key):
            setattr(intervention, key, value)

    await db.commit()
    await db.refresh(intervention)
    return {"id": intervention.id, "name": intervention.name}


# ---------------------------------------------------------------------------
# Calculate ROI
# ---------------------------------------------------------------------------

async def calculate_roi(db: AsyncSession, intervention_id: int) -> dict | None:
    """Auto-calculate ROI from platform data."""

    result = await db.execute(
        select(Intervention).where(Intervention.id == intervention_id)
    )
    i = result.scalar_one_or_none()
    if not i:
        return None

    investment = _safe_float(i.investment_amount)
    actual_return = _safe_float(i.actual_return)

    if investment > 0 and actual_return > 0:
        roi = round((actual_return - investment) / investment * 100, 1)
        i.roi_percentage = roi
        await db.commit()
        return {"roi_percentage": roi, "investment": investment, "actual_return": actual_return}

    return {"roi_percentage": 0, "investment": investment, "actual_return": actual_return}


# ---------------------------------------------------------------------------
# Top Interventions
# ---------------------------------------------------------------------------

async def get_top_interventions(db: AsyncSession) -> list:
    """Ranked by ROI percentage."""

    result = await db.execute(
        select(Intervention)
        .where(Intervention.roi_percentage.isnot(None))
        .order_by(Intervention.roi_percentage.desc())
        .limit(10)
    )
    items = result.scalars().all()

    return [
        {
            "id": i.id,
            "name": i.name,
            "investment_amount": _safe_float(i.investment_amount),
            "actual_return": _safe_float(i.actual_return),
            "roi_percentage": _safe_float(i.roi_percentage),
            "status": i.status,
        }
        for i in items
    ]


# ---------------------------------------------------------------------------
# Recommended Interventions
# ---------------------------------------------------------------------------

async def get_recommended_interventions(db: AsyncSession) -> list:
    """Suggest interventions based on current platform data (capture rates, gaps, etc.)."""
    from app.models.hcc import HccSuspect, SuspectStatus

    recommendations = []

    # Check HCC capture rate
    total_q = await db.execute(select(func.count(HccSuspect.id)))
    total_suspects = total_q.scalar() or 0
    captured_q = await db.execute(
        select(func.count(HccSuspect.id)).where(HccSuspect.status == SuspectStatus.captured.value)
    )
    captured = captured_q.scalar() or 0
    capture_rate = (captured / total_suspects * 100) if total_suspects > 0 else 0

    if total_suspects > 0 and capture_rate < 70:
        recommendations.append({
            "type": "education",
            "title": "Provider HCC Education Program",
            "description": (
                f"Based on your {capture_rate:.0f}% capture rate ({captured}/{total_suspects} suspects), "
                f"consider a provider education intervention to improve HCC documentation and coding."
            ),
            "estimated_roi": "3:1",
            "priority": "high" if capture_rate < 50 else "medium",
        })

    open_q = await db.execute(
        select(func.count(HccSuspect.id)).where(HccSuspect.status == SuspectStatus.open.value)
    )
    open_suspects = open_q.scalar() or 0
    if open_suspects > 50:
        recommendations.append({
            "type": "program",
            "title": "Targeted HCC Suspect Chase Campaign",
            "description": (
                f"You have {open_suspects} open suspects. A focused chase campaign "
                f"could close the highest-value suspects within one quarter."
            ),
            "estimated_roi": "4:1",
            "priority": "high",
        })

    # Check active interventions with negative ROI
    negative_roi_q = await db.execute(
        select(func.count(Intervention.id)).where(
            Intervention.status == "active",
            Intervention.roi_percentage < 0,
        )
    )
    negative_roi_count = negative_roi_q.scalar() or 0
    if negative_roi_count > 0:
        recommendations.append({
            "type": "review",
            "title": "Review Underperforming Interventions",
            "description": (
                f"{negative_roi_count} active intervention(s) have negative ROI. "
                f"Consider restructuring or reallocating investment."
            ),
            "estimated_roi": "N/A",
            "priority": "medium",
        })

    if not recommendations:
        recommendations.append({
            "type": "maintain",
            "title": "Continue Current Programs",
            "description": "Current capture rates and intervention performance are on track. No urgent recommendations.",
            "estimated_roi": "N/A",
            "priority": "low",
        })

    return recommendations


# ---------------------------------------------------------------------------
# Shared: feed HCC capture value into BOI tracking
# ---------------------------------------------------------------------------

async def feed_capture_to_boi(db: AsyncSession, suspect) -> None:
    """When a suspect is captured, check if there's an active BOI intervention
    targeting HCC capture.  If yes, increment its actual_return by the suspect's
    annual_value and recalculate ROI.

    NOTE: This does NOT commit. The caller is responsible for committing."""
    # Find active interventions that target HCC capture
    result = await db.execute(
        select(Intervention).where(
            Intervention.status == "active",
            Intervention.intervention_type.in_(["education", "program"]),
            Intervention.target.ilike("%capture%"),
        )
    )
    interventions = result.scalars().all()

    if not interventions:
        return

    capture_value = float(suspect.annual_value) if suspect.annual_value else 0.0
    if capture_value <= 0:
        return

    for intervention in interventions:
        current_return = float(intervention.actual_return) if intervention.actual_return else 0.0
        intervention.actual_return = current_return + capture_value

        # Recalculate ROI
        investment = float(intervention.investment_amount) if intervention.investment_amount else 0.0
        if investment > 0:
            intervention.roi_percentage = round(
                (float(intervention.actual_return) - investment) / investment * 100, 2
            )

    logger.info(
        "Fed HCC capture (suspect %d, $%.2f) to %d BOI interventions",
        suspect.id, capture_value, len(interventions),
    )
