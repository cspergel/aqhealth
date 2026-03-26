"""
Dashboard aggregation service.

Provides population-level metrics, RAF distribution, revenue opportunities,
cost hotspots, provider leaderboards, and care gap summaries for the
Population Dashboard (Phase 5.1).
"""

from datetime import date, datetime
from sqlalchemy import select, func, case, and_, extract, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.provider import Provider
from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.insight import Insight, InsightStatus


async def get_dashboard_metrics(db: AsyncSession) -> dict:
    """Return top-level KPIs for the population dashboard."""

    current_year = date.today().year

    # Total active lives (members with no coverage_end or coverage_end in the future)
    today = date.today()
    total_lives_q = await db.execute(
        select(func.count(Member.id)).where(
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)
        )
    )
    total_lives = total_lives_q.scalar() or 0

    # Average RAF score
    avg_raf_q = await db.execute(
        select(func.avg(Member.current_raf)).where(
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)
        )
    )
    avg_raf = float(avg_raf_q.scalar() or 0)

    # Recapture rate: suspects with status=captured in current year / total prior-year suspects
    prior_year_total_q = await db.execute(
        select(func.count(HccSuspect.id)).where(
            HccSuspect.payment_year == current_year,
            HccSuspect.suspect_type == "recapture",
        )
    )
    prior_year_total = prior_year_total_q.scalar() or 0

    prior_year_captured_q = await db.execute(
        select(func.count(HccSuspect.id)).where(
            HccSuspect.payment_year == current_year,
            HccSuspect.suspect_type == "recapture",
            HccSuspect.status == SuspectStatus.captured.value,
        )
    )
    prior_year_captured = prior_year_captured_q.scalar() or 0

    recapture_rate = (
        (prior_year_captured / prior_year_total * 100) if prior_year_total > 0 else 0
    )

    # Suspect inventory: open suspects
    suspect_inv_q = await db.execute(
        select(
            func.count(HccSuspect.id),
            func.coalesce(func.sum(HccSuspect.raf_value), 0),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        ).where(HccSuspect.status == SuspectStatus.open.value)
    )
    inv_row = suspect_inv_q.one()
    suspect_inventory = {
        "count": inv_row[0] or 0,
        "total_raf_value": float(inv_row[1]),
        "total_annual_value": float(inv_row[2]),
    }

    # Total PMPM: sum of paid_amount / total_lives / months of data
    # Determine months span from claims
    date_range_q = await db.execute(
        select(
            func.min(Claim.service_date),
            func.max(Claim.service_date),
            func.coalesce(func.sum(Claim.paid_amount), 0),
        )
    )
    date_row = date_range_q.one()
    total_paid = float(date_row[2])
    min_date = date_row[0]
    max_date = date_row[1]

    if min_date and max_date and total_lives > 0:
        months = max(
            (max_date.year - min_date.year) * 12 + (max_date.month - min_date.month) + 1,
            1,
        )
        total_pmpm = total_paid / total_lives / months
    else:
        total_pmpm = 0
        months = 1

    # MLR: medical spend / premium estimate (premium ~ RAF * base rate * lives * months / 12)
    # Using CMS average base rate of ~$1,100/month as a rough estimate
    base_rate_monthly = 1100.0
    premium_estimate = avg_raf * base_rate_monthly * total_lives * (months / 12) if avg_raf > 0 else 0
    mlr = (total_paid / premium_estimate * 100) if premium_estimate > 0 else 0

    return {
        "total_lives": total_lives,
        "avg_raf": round(avg_raf, 3),
        "recapture_rate": round(recapture_rate, 1),
        "suspect_inventory": suspect_inventory,
        "total_pmpm": round(total_pmpm, 2),
        "mlr": round(mlr, 1),
    }


async def get_raf_distribution(db: AsyncSession) -> list[dict]:
    """Return histogram buckets of member RAF scores."""

    today = date.today()
    # Get all active member RAF scores
    result = await db.execute(
        select(Member.current_raf).where(
            Member.current_raf.is_not(None),
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= today),
        )
    )
    scores = [float(row[0]) for row in result.all()]

    # Build histogram buckets: 0-0.5, 0.5-1.0, 1.0-1.5, ..., 4.0+
    buckets = [
        {"range": "0-0.5", "min": 0, "max": 0.5},
        {"range": "0.5-1.0", "min": 0.5, "max": 1.0},
        {"range": "1.0-1.5", "min": 1.0, "max": 1.5},
        {"range": "1.5-2.0", "min": 1.5, "max": 2.0},
        {"range": "2.0-2.5", "min": 2.0, "max": 2.5},
        {"range": "2.5-3.0", "min": 2.5, "max": 3.0},
        {"range": "3.0-3.5", "min": 3.0, "max": 3.5},
        {"range": "3.5-4.0", "min": 3.5, "max": 4.0},
        {"range": "4.0+", "min": 4.0, "max": float("inf")},
    ]

    distribution = []
    for bucket in buckets:
        count = sum(1 for s in scores if bucket["min"] <= s < bucket["max"])
        # Handle the 4.0+ bucket to include exactly 4.0
        if bucket["max"] == float("inf"):
            count = sum(1 for s in scores if s >= bucket["min"])
        distribution.append({"range": bucket["range"], "count": count})

    return distribution


async def get_revenue_opportunities(db: AsyncSession) -> list[dict]:
    """Return top 10 HCC categories by aggregate dollar impact (open suspects)."""

    result = await db.execute(
        select(
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            func.count(HccSuspect.id).label("member_count"),
            func.coalesce(func.sum(HccSuspect.raf_value), 0).label("total_raf"),
            func.coalesce(func.sum(HccSuspect.annual_value), 0).label("total_value"),
        )
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.hcc_code, HccSuspect.hcc_label)
        .order_by(func.sum(HccSuspect.annual_value).desc())
        .limit(10)
    )

    return [
        {
            "hcc_code": row.hcc_code,
            "hcc_label": row.hcc_label or f"HCC {row.hcc_code}",
            "member_count": row.member_count,
            "total_raf": float(row.total_raf),
            "total_value": float(row.total_value),
        }
        for row in result.all()
    ]


async def get_cost_hotspots(db: AsyncSession) -> list[dict]:
    """Return service categories with spend totals, sorted descending."""

    # Benchmark PMPM by category (rough industry benchmarks for MA)
    benchmarks = {
        "inpatient": 450,
        "ed_observation": 85,
        "professional": 200,
        "snf_postacute": 120,
        "pharmacy": 350,
        "home_health": 60,
        "dme": 40,
        "other": 50,
    }

    today = date.today()
    # Count active lives for PMPM calc
    lives_q = await db.execute(
        select(func.count(Member.id)).where(
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)
        )
    )
    total_lives = lives_q.scalar() or 1

    # Date range for months
    date_range_q = await db.execute(
        select(func.min(Claim.service_date), func.max(Claim.service_date))
    )
    dr = date_range_q.one()
    if dr[0] and dr[1]:
        months = max(
            (dr[1].year - dr[0].year) * 12 + (dr[1].month - dr[0].month) + 1, 1
        )
    else:
        months = 1

    result = await db.execute(
        select(
            Claim.service_category,
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category.is_not(None))
        .group_by(Claim.service_category)
        .order_by(func.sum(Claim.paid_amount).desc())
    )

    hotspots = []
    for row in result.all():
        category = row.service_category
        total_spend = float(row.total_spend)
        pmpm = total_spend / total_lives / months if total_lives > 0 else 0
        benchmark = benchmarks.get(category, 50)
        variance_pct = ((pmpm - benchmark) / benchmark * 100) if benchmark > 0 else 0

        hotspots.append({
            "category": category,
            "total_spend": round(total_spend, 2),
            "claim_count": row.claim_count,
            "pmpm": round(pmpm, 2),
            "benchmark_pmpm": benchmark,
            "variance_pct": round(variance_pct, 1),
        })

    return hotspots


async def get_provider_leaderboard(db: AsyncSession) -> dict:
    """Return top 5 and bottom 5 providers by capture rate."""

    # Only include providers with meaningful panel sizes
    result = await db.execute(
        select(
            Provider.id,
            Provider.first_name,
            Provider.last_name,
            Provider.specialty,
            Provider.panel_size,
            Provider.capture_rate,
        )
        .where(
            Provider.capture_rate.is_not(None),
            Provider.panel_size.is_not(None),
            Provider.panel_size > 0,
        )
        .order_by(Provider.capture_rate.desc())
    )
    all_providers = result.all()

    def format_provider(row):
        return {
            "id": row.id,
            "name": f"{row.first_name} {row.last_name}".strip(),
            "specialty": row.specialty,
            "panel_size": row.panel_size,
            "capture_rate": float(row.capture_rate) if row.capture_rate is not None else 0,
        }

    top_5 = [format_provider(p) for p in all_providers[:5]]
    bottom_5 = [format_provider(p) for p in all_providers[-5:]] if len(all_providers) > 5 else []

    return {"top": top_5, "bottom": bottom_5}


async def get_care_gap_summary(db: AsyncSession) -> list[dict]:
    """Return gap counts by measure with closure rates."""

    current_year = date.today().year

    result = await db.execute(
        select(
            GapMeasure.code,
            GapMeasure.name,
            GapMeasure.category,
            func.count(MemberGap.id).label("total_gaps"),
            func.sum(
                case((MemberGap.status == GapStatus.closed.value, 1), else_=0)
            ).label("closed_count"),
            func.sum(
                case((MemberGap.status == GapStatus.open.value, 1), else_=0)
            ).label("open_count"),
        )
        .join(MemberGap, MemberGap.measure_id == GapMeasure.id)
        .where(MemberGap.measurement_year == current_year)
        .group_by(GapMeasure.code, GapMeasure.name, GapMeasure.category)
        .order_by(func.count(MemberGap.id).desc())
    )

    gaps = []
    for row in result.all():
        total = row.total_gaps or 0
        closed = row.closed_count or 0
        closure_rate = (closed / total * 100) if total > 0 else 0

        gaps.append({
            "measure_code": row.code,
            "measure_name": row.name,
            "category": row.category,
            "total_gaps": total,
            "open_count": row.open_count or 0,
            "closed_count": closed,
            "closure_rate": round(closure_rate, 1),
        })

    return gaps


async def get_dashboard_insights(db: AsyncSession) -> list[dict]:
    """Return top 5 active insights for the dashboard."""

    result = await db.execute(
        select(Insight)
        .where(
            Insight.status == InsightStatus.active.value,
        )
        .order_by(Insight.dollar_impact.desc().nulls_last())
        .limit(5)
    )
    insights = result.scalars().all()

    return [
        {
            "id": i.id,
            "category": str(i.category),
            "title": i.title,
            "description": i.description,
            "dollar_impact": float(i.dollar_impact) if i.dollar_impact is not None else None,
            "recommended_action": i.recommended_action,
            "confidence": i.confidence,
            "source_modules": i.source_modules,
        }
        for i in insights
    ]
