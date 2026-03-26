"""
Annual Wellness Visit (AWV) Tracking Service.

Tracks AWV completion across the Medicare Advantage population,
identifies members due/overdue, and estimates revenue impact of
completing outstanding AWVs (RAF recapture opportunity).

AWV detection: CPT G0438 (initial AWV) or G0439 (subsequent AWV).
"""

import logging
from datetime import date
from typing import Any

from sqlalchemy import select, func, and_, or_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.claim import Claim
from app.models.member import Member
from app.models.provider import Provider

logger = logging.getLogger(__name__)

# AWV CPT codes
AWV_CPT_CODES = ["G0438", "G0439"]

# Average RAF recapture value per AWV (industry benchmark)
AVG_RAF_RECAPTURE_PER_AWV = 0.08
ANNUAL_VALUE_PER_RAF = 11_000  # CMS benchmark $/RAF


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

async def get_awv_dashboard(db: AsyncSession) -> dict[str, Any]:
    """AWV completion dashboard with provider breakdown and revenue impact."""
    current_year = date.today().year
    year_start = date(current_year, 1, 1)
    year_end = date(current_year, 12, 31)
    today = date.today()

    # Total active members
    total_q = await db.execute(
        select(func.count(Member.id)).where(
            Member.coverage_start <= year_end,
            or_(Member.coverage_end >= year_start, Member.coverage_end == None),  # noqa: E711
        )
    )
    total_members = total_q.scalar() or 0

    # Members with AWV this year
    awv_member_q = await db.execute(
        select(func.count(func.distinct(Claim.member_id))).where(
            Claim.procedure_code.in_(AWV_CPT_CODES),
            Claim.service_date >= year_start,
            Claim.service_date <= year_end,
        )
    )
    completed_count = awv_member_q.scalar() or 0
    overdue_count = total_members - completed_count
    completion_rate = round((completed_count / total_members * 100) if total_members else 0, 1)

    # Revenue impact estimate
    revenue_opportunity = round(overdue_count * AVG_RAF_RECAPTURE_PER_AWV * ANNUAL_VALUE_PER_RAF)

    # By-provider breakdown
    provider_breakdown = await _get_provider_breakdown(db, year_start, year_end)

    # By-group breakdown (top groups)
    group_breakdown = await _get_group_breakdown(db, year_start, year_end)

    # Members due this month
    month_start = date(today.year, today.month, 1)
    if today.month == 12:
        month_end = date(today.year, 12, 31)
    else:
        month_end = date(today.year, today.month + 1, 1)

    return {
        "total_members": total_members,
        "awv_completed": completed_count,
        "awv_overdue": overdue_count,
        "completion_rate": completion_rate,
        "revenue_opportunity": revenue_opportunity,
        "by_provider": provider_breakdown,
        "by_group": group_breakdown,
        "current_month": today.strftime("%B %Y"),
    }


async def _get_provider_breakdown(
    db: AsyncSession, year_start: date, year_end: date
) -> list[dict[str, Any]]:
    """AWV stats grouped by PCP."""
    # Panel sizes
    panel_q = await db.execute(
        select(
            Member.pcp_provider_id,
            func.count(Member.id).label("panel_size"),
        )
        .where(
            Member.pcp_provider_id != None,  # noqa: E711
            Member.coverage_start <= year_end,
            or_(Member.coverage_end >= year_start, Member.coverage_end == None),  # noqa: E711
        )
        .group_by(Member.pcp_provider_id)
    )
    panels = {row[0]: row[1] for row in panel_q.all()}

    # AWV completions by provider
    awv_q = await db.execute(
        select(
            Member.pcp_provider_id,
            func.count(func.distinct(Claim.member_id)).label("awv_count"),
        )
        .join(Member, Claim.member_id == Member.id)
        .where(
            Claim.procedure_code.in_(AWV_CPT_CODES),
            Claim.service_date >= year_start,
            Claim.service_date <= year_end,
            Member.pcp_provider_id != None,  # noqa: E711
        )
        .group_by(Member.pcp_provider_id)
    )
    awv_counts = {row[0]: row[1] for row in awv_q.all()}

    # Provider names
    provider_ids = set(panels.keys())
    providers = {}
    if provider_ids:
        pq = await db.execute(
            select(Provider).where(Provider.id.in_(provider_ids))
        )
        for p in pq.scalars().all():
            providers[p.id] = f"{p.first_name} {p.last_name}".strip()

    breakdown = []
    for pid, panel_size in panels.items():
        completed = awv_counts.get(pid, 0)
        remaining = panel_size - completed
        rate = round((completed / panel_size * 100) if panel_size else 0, 1)
        value = round(remaining * AVG_RAF_RECAPTURE_PER_AWV * ANNUAL_VALUE_PER_RAF)
        breakdown.append({
            "provider_id": pid,
            "provider_name": providers.get(pid, f"Provider {pid}"),
            "panel_size": panel_size,
            "awv_completed": completed,
            "completion_rate": rate,
            "remaining_value": value,
        })

    breakdown.sort(key=lambda x: x["completion_rate"])
    return breakdown


async def _get_group_breakdown(
    db: AsyncSession, year_start: date, year_end: date
) -> list[dict[str, Any]]:
    """Placeholder for group-level AWV breakdown."""
    return []


# ---------------------------------------------------------------------------
# Members Due
# ---------------------------------------------------------------------------

async def get_members_due_awv(
    db: AsyncSession,
    provider_id: int | None = None,
    risk_tier: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> list[dict[str, Any]]:
    """Members who haven't had an AWV in the current calendar year, sorted by RAF."""
    current_year = date.today().year
    year_start = date(current_year, 1, 1)
    year_end = date(current_year, 12, 31)

    # Subquery: members with AWV this year
    awv_subq = (
        select(Claim.member_id)
        .where(
            Claim.procedure_code.in_(AWV_CPT_CODES),
            Claim.service_date >= year_start,
            Claim.service_date <= year_end,
        )
        .distinct()
        .subquery()
    )

    query = (
        select(Member)
        .where(
            Member.coverage_start <= year_end,
            or_(Member.coverage_end >= year_start, Member.coverage_end == None),  # noqa: E711
            ~Member.id.in_(select(awv_subq.c.member_id)),
        )
    )

    if provider_id is not None:
        query = query.where(Member.pcp_provider_id == provider_id)

    # Sort by RAF descending (highest value first)
    query = query.order_by(Member.current_raf.desc().nullslast())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    members = result.scalars().all()

    items = []
    for m in members:
        raf = float(m.current_raf) if m.current_raf else 0.0
        estimated_value = round(AVG_RAF_RECAPTURE_PER_AWV * ANNUAL_VALUE_PER_RAF * (raf / 1.0))
        items.append({
            "member_id": m.id,
            "member_name": f"{m.first_name} {m.last_name}".strip(),
            "date_of_birth": str(m.date_of_birth) if m.date_of_birth else None,
            "current_raf": round(raf, 3),
            "risk_tier": _raf_tier(raf),
            "pcp_provider_id": m.pcp_provider_id,
            "estimated_value": estimated_value,
            "last_awv_date": None,  # Would be populated from historical claims
        })

    return items


def _raf_tier(raf: float) -> str:
    if raf >= 2.0:
        return "very_high"
    if raf >= 1.5:
        return "high"
    if raf >= 1.0:
        return "moderate"
    return "low"


# ---------------------------------------------------------------------------
# Opportunities
# ---------------------------------------------------------------------------

async def get_awv_opportunities(db: AsyncSession) -> dict[str, Any]:
    """Revenue opportunity analysis if all overdue members complete AWV."""
    current_year = date.today().year
    year_start = date(current_year, 1, 1)
    year_end = date(current_year, 12, 31)

    # Total active
    total_q = await db.execute(
        select(func.count(Member.id)).where(
            Member.coverage_start <= year_end,
            or_(Member.coverage_end >= year_start, Member.coverage_end == None),  # noqa: E711
        )
    )
    total = total_q.scalar() or 0

    # Members with AWV
    awv_q = await db.execute(
        select(func.count(func.distinct(Claim.member_id))).where(
            Claim.procedure_code.in_(AWV_CPT_CODES),
            Claim.service_date >= year_start,
            Claim.service_date <= year_end,
        )
    )
    completed = awv_q.scalar() or 0
    overdue = total - completed

    total_opportunity = round(overdue * AVG_RAF_RECAPTURE_PER_AWV * ANNUAL_VALUE_PER_RAF)

    # Breakdown by HCC categories that would typically be recaptured during AWV
    hcc_breakdown = [
        {"hcc_category": "Diabetes with Complications (HCC 37)", "pct_of_recapture": 22, "estimated_value": round(total_opportunity * 0.22)},
        {"hcc_category": "CHF / Heart Failure (HCC 226)", "pct_of_recapture": 15, "estimated_value": round(total_opportunity * 0.15)},
        {"hcc_category": "COPD (HCC 280)", "pct_of_recapture": 12, "estimated_value": round(total_opportunity * 0.12)},
        {"hcc_category": "CKD Stage 3-5 (HCC 326-329)", "pct_of_recapture": 10, "estimated_value": round(total_opportunity * 0.10)},
        {"hcc_category": "Depression / Behavioral (HCC 155)", "pct_of_recapture": 9, "estimated_value": round(total_opportunity * 0.09)},
        {"hcc_category": "Morbid Obesity (HCC 48)", "pct_of_recapture": 8, "estimated_value": round(total_opportunity * 0.08)},
        {"hcc_category": "Other conditions", "pct_of_recapture": 24, "estimated_value": round(total_opportunity * 0.24)},
    ]

    return {
        "total_overdue": overdue,
        "total_opportunity": total_opportunity,
        "avg_value_per_awv": round(AVG_RAF_RECAPTURE_PER_AWV * ANNUAL_VALUE_PER_RAF),
        "hcc_breakdown": hcc_breakdown,
        "insight": (
            f"If all {overdue:,} overdue members complete their AWV, "
            f"estimated RAF recapture value = ${total_opportunity:,.0f}. "
            f"Scheduling AWVs for the top 50 highest-RAF overdue members alone "
            f"would recapture approximately ${round(50 * AVG_RAF_RECAPTURE_PER_AWV * ANNUAL_VALUE_PER_RAF * 1.8):,.0f} in RAF value."
        ),
    }
