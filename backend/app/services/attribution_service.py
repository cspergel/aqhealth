"""
Attribution Management Service.

Tracks member attribution to the plan/ACO, monitors churn,
and quantifies the revenue impact of attribution changes.
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.constants import CMS_ANNUAL_BASE, CMS_PMPM_BASE

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Attribution Dashboard
# ---------------------------------------------------------------------------

async def get_attribution_dashboard(db: AsyncSession) -> dict[str, Any]:
    """
    Total attributed lives, new/lost this month, churn rate,
    and by-plan breakdown.
    """
    today = date.today()
    month_start = date(today.year, today.month, 1)

    # Active members: coverage_end IS NULL or coverage_end > today
    active_q = await db.execute(
        select(func.count(Member.id)).where(
            or_(Member.coverage_end == None, Member.coverage_end > today)  # noqa: E711
        )
    )
    total_attributed = active_q.scalar() or 0

    # New this month: created_at (coverage_start) in current month
    new_q = await db.execute(
        select(func.count(Member.id)).where(
            Member.coverage_start >= month_start,
            Member.coverage_start <= today,
        )
    )
    new_this_month = new_q.scalar() or 0

    # Lost this month: coverage_end in current month
    lost_q = await db.execute(
        select(func.count(Member.id)).where(
            Member.coverage_end >= month_start,
            Member.coverage_end <= today,
        )
    )
    lost_this_month = lost_q.scalar() or 0

    churn_rate = round(
        (lost_this_month / total_attributed * 100) if total_attributed else 0, 2
    )

    # By plan breakdown
    plan_q = await db.execute(
        select(
            Member.health_plan,
            func.count(Member.id),
        )
        .where(or_(Member.coverage_end == None, Member.coverage_end > today))  # noqa: E711
        .group_by(Member.health_plan)
        .order_by(func.count(Member.id).desc())
    )
    by_plan = [
        {"plan": row[0] or "Unknown", "count": row[1]}
        for row in plan_q.all()
    ]

    return {
        "total_attributed": total_attributed,
        "new_this_month": new_this_month,
        "lost_this_month": lost_this_month,
        "churn_rate": churn_rate,
        "by_plan": by_plan,
    }


# ---------------------------------------------------------------------------
# Attribution Changes
# ---------------------------------------------------------------------------

async def get_attribution_changes(
    db: AsyncSession,
    period: str = "30d",
) -> list[dict[str, Any]]:
    """
    Recent attribution changes: new, lost, transferred -- with reasons.
    """
    # Parse period string (e.g. "30d", "90d")
    days = 30
    if period.endswith("d"):
        try:
            days = int(period[:-1])
        except ValueError:
            days = 30

    cutoff = date.today() - timedelta(days=days)
    today = date.today()

    changes: list[dict[str, Any]] = []

    # New members (coverage_start in period)
    new_q = await db.execute(
        select(Member).where(
            Member.coverage_start >= cutoff,
            Member.coverage_start <= today,
        ).order_by(Member.coverage_start.desc())
    )
    for m in new_q.scalars().all():
        changes.append({
            "id": m.id,
            "member_id": m.member_id,
            "member_name": f"{m.first_name} {m.last_name}".strip(),
            "change_type": "new",
            "effective_date": str(m.coverage_start),
            "plan": m.health_plan,
        })

    # Lost members (coverage_end in period)
    lost_q = await db.execute(
        select(Member).where(
            Member.coverage_end >= cutoff,
            Member.coverage_end <= today,
        ).order_by(Member.coverage_end.desc())
    )
    for m in lost_q.scalars().all():
        changes.append({
            "id": m.id,
            "member_id": m.member_id,
            "member_name": f"{m.first_name} {m.last_name}".strip(),
            "change_type": "lost",
            "effective_date": str(m.coverage_end),
            "plan": m.health_plan,
        })

    # Sort by date descending
    changes.sort(key=lambda c: c["effective_date"], reverse=True)
    return changes


# ---------------------------------------------------------------------------
# Churn Risk
# ---------------------------------------------------------------------------

async def get_churn_risk(db: AsyncSession) -> list[dict[str, Any]]:
    """
    Members at risk of disenrollment: no claims in 180+ days.
    """
    today = date.today()
    cutoff_180 = today - timedelta(days=180)

    # Subquery: max service_date per member
    last_claim_sq = (
        select(
            Claim.member_id,
            func.max(Claim.service_date).label("last_service"),
        )
        .group_by(Claim.member_id)
        .subquery()
    )

    # Active members with no claim in 180+ days (or no claims at all)
    result = await db.execute(
        select(
            Member.id,
            Member.member_id,
            Member.first_name,
            Member.last_name,
            Member.health_plan,
            Member.current_raf,
            last_claim_sq.c.last_service,
        )
        .outerjoin(last_claim_sq, Member.id == last_claim_sq.c.member_id)
        .where(
            or_(Member.coverage_end == None, Member.coverage_end > today),  # noqa: E711
            or_(
                last_claim_sq.c.last_service == None,  # noqa: E711
                last_claim_sq.c.last_service < cutoff_180,
            ),
        )
        .order_by(Member.current_raf.desc().nullslast())
    )

    risk_list = []
    for row in result.all():
        last_svc = row.last_service
        days_inactive = (today - last_svc).days if last_svc else None
        raf = float(row.current_raf) if row.current_raf else 0.0
        risk_list.append({
            "id": row.id,
            "member_id": row.member_id,
            "member_name": f"{row.first_name} {row.last_name}".strip(),
            "plan": row.health_plan,
            "current_raf": round(raf, 3),
            "last_claim_date": str(last_svc) if last_svc else None,
            "days_inactive": days_inactive,
            "revenue_at_risk": round(raf * CMS_ANNUAL_BASE),
        })

    return risk_list


# ---------------------------------------------------------------------------
# Revenue Impact of Attribution Changes
# ---------------------------------------------------------------------------

async def get_attribution_revenue_impact(db: AsyncSession) -> dict[str, Any]:
    """
    Financial impact of recent attribution changes on projected RAF revenue.
    Lost members x their RAF x CMS_ANNUAL_BASE benchmark.
    """
    today = date.today()
    month_start = date(today.year, today.month, 1)

    # Lost this month with RAF
    lost_q = await db.execute(
        select(
            func.count(Member.id),
            func.coalesce(func.sum(Member.current_raf), 0),
        ).where(
            Member.coverage_end >= month_start,
            Member.coverage_end <= today,
        )
    )
    lost_row = lost_q.one()
    members_lost = lost_row[0] or 0
    lost_raf_sum = float(lost_row[1] or 0)
    revenue_at_risk = round(lost_raf_sum * CMS_ANNUAL_BASE)

    # Gained this month with RAF
    gained_q = await db.execute(
        select(
            func.count(Member.id),
            func.coalesce(func.sum(Member.current_raf), 0),
        ).where(
            Member.coverage_start >= month_start,
            Member.coverage_start <= today,
        )
    )
    gained_row = gained_q.one()
    members_gained = gained_row[0] or 0
    gained_raf_sum = float(gained_row[1] or 0)
    revenue_gained = round(gained_raf_sum * CMS_ANNUAL_BASE)

    return {
        "members_lost": members_lost,
        "revenue_at_risk": revenue_at_risk,
        "members_gained": members_gained,
        "revenue_gained": revenue_gained,
        "net_impact": revenue_gained - revenue_at_risk,
    }
