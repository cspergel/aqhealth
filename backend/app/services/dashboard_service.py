"""
Dashboard aggregation service.

Provides population-level metrics, RAF distribution, revenue opportunities,
cost hotspots, provider leaderboards, and care gap summaries for the
Population Dashboard (Phase 5.1).
"""

from datetime import date, datetime
from sqlalchemy import select, func, case, and_, extract, literal_column, text
from sqlalchemy.ext.asyncio import AsyncSession

from datetime import timedelta

from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.provider import Provider
from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.insight import Insight, InsightStatus
from app.models.care_plan import CarePlan, CarePlanGoal
from app.models.case_management import CaseAssignment
from app.models.prior_auth import PriorAuth
from app.models.adt import CareAlert
from app.models.alert_rule import AlertRuleTrigger
from app.constants import PMPM_BENCHMARKS


async def get_dashboard_metrics(db: AsyncSession) -> dict:
    """Return top-level KPIs for the population dashboard.

    Consolidates the 6 previously-serial aggregate queries into a single
    round-trip built on CTEs. Each CTE runs once; the final SELECT
    cross-joins them into one wide row.
    """

    today = date.today()
    current_year = today.year
    captured_value = SuspectStatus.captured.value
    open_value = SuspectStatus.open.value

    # Single SQL statement: 4 CTEs, 1 scalar SELECT.
    # Postgres treats CTEs as independent subqueries, which in practice
    # gives us the same plan as 6 separate SELECTs but in 1 roundtrip.
    #
    # Every CTE excludes soft-deleted rows (deleted_at IS NULL) so retracted
    # PHI never inflates the dashboard KPIs — matches ORM-level filters
    # applied elsewhere in this service.
    stmt = text(
        """
        WITH active_members AS (
            SELECT id, current_raf
            FROM members
            WHERE deleted_at IS NULL
              AND (coverage_end IS NULL OR coverage_end >= :today)
        ),
        lives_and_raf AS (
            SELECT
                COUNT(*)                                AS total_lives,
                COALESCE(AVG(current_raf), 0)           AS avg_raf
            FROM active_members
        ),
        recapture_counts AS (
            SELECT
                COUNT(*)                                                           AS total,
                COUNT(*) FILTER (WHERE status = :captured_status)                  AS captured
            FROM hcc_suspects
            WHERE payment_year = :current_year
              AND suspect_type = 'recapture'
              AND deleted_at IS NULL
        ),
        suspect_inventory AS (
            SELECT
                COUNT(*)                                 AS count,
                COALESCE(SUM(raf_value), 0)              AS total_raf_value,
                COALESCE(SUM(annual_value), 0)           AS total_annual_value
            FROM hcc_suspects
            WHERE status = :open_status
              AND deleted_at IS NULL
        ),
        claims_range AS (
            SELECT
                MIN(service_date)                        AS min_date,
                MAX(service_date)                        AS max_date,
                COALESCE(SUM(paid_amount), 0)            AS total_paid
            FROM claims
            WHERE deleted_at IS NULL
        )
        SELECT
            lr.total_lives,
            lr.avg_raf,
            rc.total                AS recapture_total,
            rc.captured             AS recapture_captured,
            si.count                AS suspect_count,
            si.total_raf_value      AS suspect_total_raf,
            si.total_annual_value   AS suspect_total_annual,
            cr.min_date,
            cr.max_date,
            cr.total_paid
        FROM lives_and_raf lr
        CROSS JOIN recapture_counts rc
        CROSS JOIN suspect_inventory si
        CROSS JOIN claims_range cr
        """
    )
    row = (
        await db.execute(
            stmt,
            {
                "today": today,
                "current_year": current_year,
                "captured_status": captured_value,
                "open_status": open_value,
            },
        )
    ).one()

    total_lives = int(row.total_lives or 0)
    avg_raf = float(row.avg_raf or 0)
    prior_year_total = int(row.recapture_total or 0)
    prior_year_captured = int(row.recapture_captured or 0)
    recapture_rate = (
        (prior_year_captured / prior_year_total * 100) if prior_year_total > 0 else 0
    )

    suspect_inventory = {
        "count": int(row.suspect_count or 0),
        "total_raf_value": float(row.suspect_total_raf or 0),
        "total_annual_value": float(row.suspect_total_annual or 0),
    }

    total_paid = float(row.total_paid or 0)
    min_date = row.min_date
    max_date = row.max_date

    if min_date and max_date and total_lives > 0:
        months = max(
            (max_date.year - min_date.year) * 12 + (max_date.month - min_date.month) + 1,
            1,
        )
        total_pmpm = total_paid / total_lives / months
    else:
        total_pmpm = 0
        months = 1

    # MLR: medical spend / premium estimate (premium ~ RAF * monthly_base * lives * months)
    # Using CMS average base rate of ~$1,100/month as a rough estimate
    from app.constants import CMS_PMPM_BASE; base_rate_monthly = CMS_PMPM_BASE
    premium_estimate = avg_raf * base_rate_monthly * total_lives * months if avg_raf > 0 else 0
    mlr = round(total_paid / premium_estimate, 4) if premium_estimate > 0 else 0

    return {
        "total_lives": total_lives,
        "avg_raf": round(avg_raf, 3),
        "recapture_rate": round(recapture_rate, 1),
        "suspect_inventory": suspect_inventory,
        "total_pmpm": round(total_pmpm, 2),
        "mlr": round(mlr, 4),
    }


async def get_raf_distribution(db: AsyncSession) -> list[dict]:
    """Return histogram buckets of member RAF scores."""

    today = date.today()
    # Get all active member RAF scores — live members only (soft-deleted
    # rows must not appear in the histogram).
    result = await db.execute(
        select(Member.current_raf).where(
            Member.current_raf.is_not(None),
            Member.deleted_at.is_(None),
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

    # Live open suspects only — retracted suspects must not appear on the
    # revenue-opportunities tile.
    result = await db.execute(
        select(
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            func.count(HccSuspect.id).label("member_count"),
            func.coalesce(func.sum(HccSuspect.raf_value), 0).label("total_raf"),
            func.coalesce(func.sum(HccSuspect.annual_value), 0).label("total_value"),
        )
        .where(
            HccSuspect.status == SuspectStatus.open.value,
            HccSuspect.deleted_at.is_(None),
        )
        .group_by(HccSuspect.hcc_code, HccSuspect.hcc_label)
        .order_by(func.sum(HccSuspect.annual_value).desc())
        .limit(10)
    )

    return [
        {
            "hcc_code": row.hcc_code,
            "hcc_label": row.hcc_label or f"HCC {row.hcc_code}",
            "member_count": row.member_count,
            "total_raf": float(row.total_raf or 0),
            "total_value": float(row.total_value or 0),
        }
        for row in result.all()
    ]


async def get_cost_hotspots(db: AsyncSession) -> list[dict]:
    """Return service categories with spend totals, sorted descending."""

    benchmarks = PMPM_BENCHMARKS

    today = date.today()
    # Count active lives for PMPM calc — live members only.
    lives_q = await db.execute(
        select(func.count(Member.id)).where(
            Member.deleted_at.is_(None),
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= today),
        )
    )
    total_lives = lives_q.scalar() or 1

    # Date range for months — live claims only.
    date_range_q = await db.execute(
        select(func.min(Claim.service_date), func.max(Claim.service_date))
        .where(Claim.deleted_at.is_(None))
    )
    dr = date_range_q.one()
    if dr[0] and dr[1]:
        months = max(
            (dr[1].year - dr[0].year) * 12 + (dr[1].month - dr[0].month) + 1, 1
        )
    else:
        months = 1

    # Cost hotspots — aggregate live claims only.
    result = await db.execute(
        select(
            Claim.service_category,
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(
            Claim.service_category.is_not(None),
            Claim.deleted_at.is_(None),
        )
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
            "name": f"{row.first_name or ''} {row.last_name or ''}".strip(),
            "specialty": row.specialty,
            "panel_size": row.panel_size,
            "capture_rate": float(row.capture_rate) if row.capture_rate is not None else 0,
        }

    top_5 = [format_provider(p) for p in all_providers[:5]]
    # Show bottom 5 only when there are enough providers that the lists don't overlap
    if len(all_providers) > 5:
        bottom_5 = [format_provider(p) for p in all_providers[-5:]]
    elif len(all_providers) > 1:
        # With 2-5 providers, show all except the top performer as the bottom list
        bottom_5 = [format_provider(p) for p in all_providers[1:]]
    else:
        bottom_5 = []

    return {"top": top_5, "bottom": bottom_5}


async def get_care_gap_summary(db: AsyncSession) -> list[dict]:
    """Return gap counts by measure with closure rates."""

    current_year = date.today().year

    # Care gap summary — live gaps only (soft-deleted gaps shouldn't affect
    # closure rates).
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
        .where(
            MemberGap.measurement_year == current_year,
            MemberGap.deleted_at.is_(None),
        )
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


async def get_dashboard_actions(db: AsyncSession) -> dict:
    """Return actionable items across all modules for the dashboard action bar.

    Consolidates 6 serial aggregates into a single CTE that cross-joins
    per-table counts into one scalar row — 1 roundtrip instead of 6.
    """
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)
    urgent_cutoff = today - timedelta(days=3)
    standard_cutoff = today - timedelta(days=14)
    open_gap_status = GapStatus.open.value

    stmt = text(
        """
        WITH pa AS (
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') AS pending,
                COUNT(*) FILTER (
                    WHERE status = 'pending' AND (
                        (urgency = 'urgent'   AND request_date <= :urgent_cutoff) OR
                        (urgency = 'standard' AND request_date <= :standard_cutoff)
                    )
                ) AS overdue
            FROM prior_authorizations
        ),
        goals AS (
            SELECT COUNT(*) AS past_due
            FROM care_plan_goals
            WHERE status IN ('in_progress', 'not_started')
              AND target_date IS NOT NULL
              AND target_date < :today
        ),
        cases AS (
            SELECT COUNT(*) AS no_contact
            FROM case_assignments
            WHERE status = 'active'
              AND (last_contact_date IS NULL OR last_contact_date < :thirty_days_ago)
        ),
        gaps AS (
            SELECT COUNT(*) AS critical
            FROM member_gaps mg
            JOIN gap_measures gm ON gm.id = mg.measure_id
            WHERE mg.status = :open_gap
              AND gm.stars_weight = 3
              AND mg.deleted_at IS NULL
        ),
        alerts AS (
            SELECT COUNT(*) AS unack
            FROM care_alerts
            WHERE status = 'open'
              AND deleted_at IS NULL
        ),
        rule_triggers AS (
            SELECT COUNT(*) AS triggered
            FROM alert_rule_triggers
            WHERE acknowledged = FALSE
        )
        SELECT
            pa.pending         AS pending_auths,
            pa.overdue         AS overdue_auths,
            goals.past_due     AS past_due_goals,
            cases.no_contact   AS no_contact,
            gaps.critical      AS critical_gaps,
            alerts.unack       AS unack_alerts,
            rule_triggers.triggered AS triggered_rules
        FROM pa, goals, cases, gaps, alerts, rule_triggers
        """
    )
    row = (
        await db.execute(
            stmt,
            {
                "today": today,
                "thirty_days_ago": thirty_days_ago,
                "urgent_cutoff": urgent_cutoff,
                "standard_cutoff": standard_cutoff,
                "open_gap": open_gap_status,
            },
        )
    ).one()

    pending_auths = int(row.pending_auths or 0)
    overdue_auths = int(row.overdue_auths or 0)
    past_due_goals = int(row.past_due_goals or 0)
    no_contact_count = int(row.no_contact or 0)
    critical_gaps = int(row.critical_gaps or 0)
    unack_alerts = int(row.unack_alerts or 0)
    triggered_rules = int(row.triggered_rules or 0)

    return {
        "pending_auths": pending_auths,
        "overdue_auths": overdue_auths,
        "past_due_care_plan_goals": past_due_goals,
        "members_not_contacted": no_contact_count,
        "critical_care_gaps": critical_gaps,
        "unacknowledged_adt_alerts": unack_alerts,
        "triggered_alert_rules": triggered_rules,
        "total_action_items": (
            overdue_auths + past_due_goals + no_contact_count
            + critical_gaps + unack_alerts + triggered_rules
        ),
    }
