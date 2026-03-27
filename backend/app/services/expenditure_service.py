"""
Expenditure Analytics Service — aggregation, drill-downs, and insight retrieval.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from decimal import Decimal

from sqlalchemy import func, case, distinct, and_, or_, extract, literal_column, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.claim import Claim
from app.models.member import Member
from app.models.insight import Insight, InsightCategory, InsightStatus

logger = logging.getLogger(__name__)

SERVICE_CATEGORIES = [
    "inpatient",
    "ed_observation",
    "professional",
    "snf_postacute",
    "pharmacy",
    "home_health",
    "dme",
    "other",
]

CATEGORY_LABELS = {
    "inpatient": "Inpatient",
    "ed_observation": "ED / Observation",
    "professional": "Professional",
    "snf_postacute": "SNF / Post-Acute",
    "pharmacy": "Pharmacy",
    "home_health": "Home Health",
    "dme": "DME",
    "other": "Other",
}


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    return float(v)


def _safe_int(v) -> int:
    if v is None:
        return 0
    return int(v)


def _pct(part: float, total: float) -> float:
    if total == 0:
        return 0.0
    return round(part / total * 100, 1)


def _fmt_dollar(v: float) -> str:
    if v >= 1_000_000:
        return f"${v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"${v:,.0f}"
    return f"${v:.0f}"


def _fmt_pct(v: float) -> str:
    return f"{v:.1f}%"


async def _compute_member_months(db: AsyncSession, year_start) -> int:
    """Shared helper: compute total member-months from coverage periods.

    Uses year*12 + month extraction from PostgreSQL ``age()`` so multi-year
    spans are counted correctly.
    """
    result = await db.execute(
        select(
            func.sum(
                func.greatest(
                    func.extract(
                        "year",
                        func.age(
                            func.least(func.coalesce(Member.coverage_end, func.current_date()), func.current_date()),
                            func.greatest(func.coalesce(Member.coverage_start, year_start), year_start),
                        ),
                    ) * 12
                    + func.extract(
                        "month",
                        func.age(
                            func.least(func.coalesce(Member.coverage_end, func.current_date()), func.current_date()),
                            func.greatest(func.coalesce(Member.coverage_start, year_start), year_start),
                        ),
                    ) + 1,
                    0,
                )
            )
        ).where(
            or_(Member.coverage_end.is_(None), Member.coverage_end >= year_start)
        )
    )
    return max(_safe_int(result.scalar()), 1)


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

async def get_expenditure_overview(db: AsyncSession) -> dict:
    """Total spend, PMPM, MLR, and per-category breakdown."""

    # Total member months (from active members' actual coverage periods)
    from datetime import date as _date
    today = _date.today()
    year_start = _date(today.year, 1, 1)
    member_months = await _compute_member_months(db, year_start)

    member_count_result = await db.execute(
        select(func.count(Member.id)).where(
            or_(Member.coverage_end.is_(None), Member.coverage_end >= today)
        )
    )
    member_count = _safe_int(member_count_result.scalar())

    # Total spend
    total_result = await db.execute(select(func.sum(Claim.paid_amount)))
    total_spend = _safe_float(total_result.scalar())

    pmpm = round(total_spend / member_months, 2)

    # MLR = medical spend / capitation revenue
    mlr = None
    try:
        from sqlalchemy import text as sa_text
        cap_result = await db.execute(
            sa_text("SELECT COALESCE(SUM(total_payment), 0) as cap_revenue FROM capitation_payments")
        )
        cap_revenue = float(cap_result.scalar() or 0)
        if cap_revenue > 0:
            mlr = round(total_spend / cap_revenue, 4)
    except Exception:
        # capitation_payments table may not exist; leave mlr as None
        pass

    # Per-category aggregation
    cat_query = (
        select(
            Claim.service_category,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category.isnot(None))
        .group_by(Claim.service_category)
    )
    cat_result = await db.execute(cat_query)
    cat_rows = cat_result.all()

    # Calculate actual trend: compare current period (last 3 months) vs prior period (3-6 months ago)
    from datetime import date as date_cls, timedelta as td
    today = date_cls.today()
    current_period_start = today - td(days=90)
    prior_period_start = today - td(days=180)
    prior_period_end = current_period_start - td(days=1)

    # Query spend by category for current and prior periods
    trend_query = (
        select(
            Claim.service_category,
            func.sum(case(
                (and_(Claim.service_date >= current_period_start, Claim.service_date <= today), Claim.paid_amount),
                else_=0,
            )).label("current_spend"),
            func.sum(case(
                (and_(Claim.service_date >= prior_period_start, Claim.service_date <= prior_period_end), Claim.paid_amount),
                else_=0,
            )).label("prior_spend"),
        )
        .where(Claim.service_category.isnot(None))
        .group_by(Claim.service_category)
    )
    trend_result = await db.execute(trend_query)
    trend_by_cat: dict[str, float] = {}
    for trow in trend_result.all():
        prior = _safe_float(trow.prior_spend)
        current = _safe_float(trow.current_spend)
        if prior > 0:
            trend_by_cat[trow.service_category] = round((current - prior) / prior * 100, 1)
        else:
            trend_by_cat[trow.service_category] = 0.0

    categories = []
    for row in cat_rows:
        cat_spend = _safe_float(row.total_spend)
        categories.append({
            "key": row.service_category,
            "label": CATEGORY_LABELS.get(row.service_category, row.service_category),
            "total_spend": cat_spend,
            "pmpm": round(cat_spend / member_months, 2),
            "pct_of_total": _pct(cat_spend, total_spend),
            "claim_count": _safe_int(row.claim_count),
            "trend_vs_prior": trend_by_cat.get(row.service_category, 0.0),
        })

    # Ensure all categories are represented
    existing_keys = {c["key"] for c in categories}
    for key in SERVICE_CATEGORIES:
        if key not in existing_keys:
            categories.append({
                "key": key,
                "label": CATEGORY_LABELS.get(key, key),
                "total_spend": 0.0,
                "pmpm": 0.0,
                "pct_of_total": 0.0,
                "claim_count": 0,
                "trend_vs_prior": 0.0,
            })

    # Sort by spend descending
    categories.sort(key=lambda c: c["total_spend"], reverse=True)

    return {
        "total_spend": total_spend,
        "pmpm": pmpm,
        "mlr": mlr,
        "member_count": member_count,
        "categories": categories,
    }


# ---------------------------------------------------------------------------
# Category Drill-downs — deep, cross-module analysis
# ---------------------------------------------------------------------------

async def get_category_drilldown(db: AsyncSession, category: str) -> dict:
    """Deep cross-module analysis for a specific service category.

    Returns a structure with:
      - kpis: list of {label, value, benchmark?, status?}
      - sections: list of {id, title, type, columns?, rows?, items?}
        where type is 'table' or 'insights'
    """

    from datetime import date as _date
    _year_start = _date(_date.today().year, 1, 1)
    member_count_result = await db.execute(select(func.count(Member.id)))
    member_count = max(_safe_int(member_count_result.scalar()), 1)
    member_months = await _compute_member_months(db, _year_start)

    base_filter = Claim.service_category == category

    # Common aggregates
    total_result = await db.execute(
        select(
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
            func.count(distinct(Claim.member_id)).label("unique_members"),
        ).where(base_filter)
    )
    totals = total_result.one()
    total_spend = _safe_float(totals.total_spend)
    claim_count = _safe_int(totals.claim_count)
    unique_members = _safe_int(totals.unique_members)

    result: dict = {
        "category": category,
        "label": CATEGORY_LABELS.get(category, category),
        "total_spend": total_spend,
        "pmpm": round(total_spend / member_months, 2),
        "claim_count": claim_count,
        "unique_members": unique_members,
        "kpis": [],
        "sections": [],
    }

    # Category-specific analysis
    if category == "inpatient":
        extra = await _drilldown_inpatient(db, base_filter, member_count, total_spend)
    elif category == "ed_observation":
        extra = await _drilldown_ed(db, base_filter, member_count, total_spend)
    elif category == "professional":
        extra = await _drilldown_professional(db, base_filter, member_count, total_spend)
    elif category == "snf_postacute":
        extra = await _drilldown_snf(db, base_filter, member_count, total_spend)
    elif category == "pharmacy":
        extra = await _drilldown_pharmacy(db, base_filter, member_count, total_spend)
    elif category in ("home_health", "dme"):
        extra = await _drilldown_home_dme(db, base_filter, member_count, total_spend, category)
    else:
        extra = {
            "kpis": [
                {"label": "Total Spend", "value": _fmt_dollar(total_spend)},
                {"label": "Claims", "value": f"{claim_count:,}"},
                {"label": "Unique Members", "value": f"{unique_members:,}"},
            ],
            "sections": [],
        }

    result["kpis"] = extra.get("kpis", [])
    result["sections"] = extra.get("sections", [])
    return result


# ---------------------------------------------------------------------------
# Inpatient — facility, provider patterns, DRG analysis, AI recs
# ---------------------------------------------------------------------------

async def _drilldown_inpatient(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    # --- Facility breakdown ---
    facility_query = (
        select(
            Claim.facility_name,
            func.count(distinct(Claim.claim_id)).label("admits"),
            func.sum(Claim.paid_amount).label("total_cost"),
            func.count(Claim.id).label("claim_lines"),
            func.count(distinct(Claim.member_id)).label("unique_patients"),
        )
        .where(base_filter)
        .where(Claim.facility_name.isnot(None))
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    fac_result = await db.execute(facility_query)
    facility_rows = []
    for row in fac_result.all():
        admits = max(_safe_int(row.admits), 1)
        cost = _safe_float(row.total_cost)
        facility_rows.append({
            "name": row.facility_name or "Unknown",
            "admits": admits,
            "alos": 0.0,  # Would come from admission/discharge dates
            "cost_per_admit": round(cost / admits, 0),
            "readmit_rate": 0.0,  # Would come from readmission logic
            "hcc_capture_rate": 0.0,  # Would come from HCC engine cross-reference
            "top_drgs": "",
        })

    # --- Top DRGs ---
    drg_query = (
        select(
            Claim.drg_code,
            func.count(Claim.id).label("cases"),
            func.sum(Claim.paid_amount).label("total_cost"),
            func.avg(Claim.paid_amount).label("avg_cost"),
        )
        .where(and_(base_filter, Claim.drg_code.isnot(None)))
        .group_by(Claim.drg_code)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    drg_result = await db.execute(drg_query)
    drg_rows = []
    for row in drg_result.all():
        avg = round(_safe_float(row.avg_cost), 0)
        drg_rows.append({
            "drg": row.drg_code,
            "description": "",  # Would come from DRG reference table
            "cases": _safe_int(row.cases),
            "avg_cost": avg,
            "benchmark_cost": None,  # Real benchmarks require CMS DRG weight data
            "excess_spend": None,  # Cannot calculate without real DRG benchmarks
        })

    # --- Provider patterns (admitting PCP breakdown) ---
    provider_query = (
        select(
            Claim.rendering_provider_id,
            func.count(distinct(Claim.claim_id)).label("admits"),
            func.sum(Claim.paid_amount).label("total_cost"),
            func.count(distinct(Claim.member_id)).label("patients"),
        )
        .where(and_(base_filter, Claim.rendering_provider_id.isnot(None)))
        .group_by(Claim.rendering_provider_id)
        .order_by(func.count(distinct(Claim.claim_id)).desc())
        .limit(10)
    )
    prov_result = await db.execute(provider_query)
    provider_rows = []
    for row in prov_result.all():
        admits = max(_safe_int(row.admits), 1)
        provider_rows.append({
            "pcp": f"Provider #{row.rendering_provider_id}",
            "panel_size": 0,  # Would come from provider panel data
            "admits": admits,
            "admit_rate_per_1k": 0.0,
            "preferred_facility": "",
            "avg_cost_per_admit": round(_safe_float(row.total_cost) / admits, 0),
            "readmit_rate": 0.0,
        })

    total_admits_result = await db.execute(
        select(func.count(distinct(Claim.claim_id))).where(base_filter)
    )
    total_admits = max(_safe_int(total_admits_result.scalar()), 1)
    admits_per_1k = round(total_admits / member_count * 1000, 1)
    cost_per_admit = round(total_spend / total_admits, 0)

    return {
        "kpis": [
            {"label": "Admits / 1K", "value": str(admits_per_1k), "benchmark": "72.0", "status": "over" if admits_per_1k > 72 else None},
            {"label": "Cost / Admit", "value": _fmt_dollar(cost_per_admit), "benchmark": "$12,800", "status": "over" if cost_per_admit > 12800 else None},
            {"label": "ALOS", "value": "-- days"},
            {"label": "Readmit Rate (30d)", "value": "--%"},
            {"label": "HCC Capture During Admit", "value": "--%"},
            {"label": "Total Spend", "value": _fmt_dollar(total_spend)},
        ],
        "sections": [
            {
                "id": "facilities",
                "title": "Facility Comparison",
                "type": "table",
                "columns": [
                    {"key": "name", "label": "Facility"},
                    {"key": "admits", "label": "Admits", "numeric": True},
                    {"key": "alos", "label": "ALOS", "numeric": True},
                    {"key": "cost_per_admit", "label": "Cost/Admit", "numeric": True, "format": "dollar"},
                    {"key": "readmit_rate", "label": "Readmit %", "numeric": True, "format": "pct", "benchmark": 11.0},
                    {"key": "hcc_capture_rate", "label": "HCC Capture %", "numeric": True, "format": "pct", "benchmark": 75.0, "invertBenchmark": True},
                    {"key": "top_drgs", "label": "Top DRGs"},
                ],
                "rows": facility_rows,
            },
            {
                "id": "provider_patterns",
                "title": "Admitting Provider Patterns",
                "type": "table",
                "columns": [
                    {"key": "pcp", "label": "PCP"},
                    {"key": "panel_size", "label": "Panel", "numeric": True},
                    {"key": "admits", "label": "Admits", "numeric": True},
                    {"key": "admit_rate_per_1k", "label": "Admits/1K", "numeric": True, "benchmark": 72.0},
                    {"key": "preferred_facility", "label": "Primary Facility"},
                    {"key": "avg_cost_per_admit", "label": "Avg Cost", "numeric": True, "format": "dollar"},
                    {"key": "readmit_rate", "label": "Readmit %", "numeric": True, "format": "pct", "benchmark": 11.0},
                ],
                "rows": provider_rows,
            },
            {
                "id": "drg_analysis",
                "title": "Top DRGs by Cost",
                "type": "table",
                "columns": [
                    {"key": "drg", "label": "DRG"},
                    {"key": "description", "label": "Description"},
                    {"key": "cases", "label": "Cases", "numeric": True},
                    {"key": "avg_cost", "label": "Avg Cost", "numeric": True, "format": "dollar"},
                    {"key": "benchmark_cost", "label": "Benchmark", "numeric": True, "format": "dollar"},
                    {"key": "excess_spend", "label": "Excess Spend", "numeric": True, "format": "dollar"},
                ],
                "rows": drg_rows,
            },
            {
                "id": "ai_recommendations",
                "title": "AI Recommendations",
                "type": "insights",
                "items": [
                    {
                        "title": "Facility redirection opportunity",
                        "description": "Analyze facility cost variance and redirect non-emergent admissions to lower-cost, higher-quality facilities. Cross-reference with HCC capture rates during admission.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Readmission reduction program",
                        "description": "Target high-readmission DRGs with post-discharge care transition programs. Focus on CHF and COPD patients.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "HCC capture during inpatient stays",
                        "description": "Embed coding review during discharge to capture documented but uncoded HCCs. Cross-reference with suspect inventory.",
                        "dollar_impact": None,
                        "category": "revenue",
                    },
                ],
            },
        ],
    }


# ---------------------------------------------------------------------------
# ED / Observation
# ---------------------------------------------------------------------------

async def _drilldown_ed(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    visits_result = await db.execute(
        select(
            func.count(distinct(Claim.claim_id)).label("visits"),
            func.count(distinct(Claim.member_id)).label("unique_members"),
        ).where(base_filter)
    )
    row = visits_result.one()
    visits = max(_safe_int(row.visits), 1)
    cost_per_visit = round(total_spend / visits, 0)
    visits_per_1k = round(visits / member_count * 1000, 1)

    # Frequent utilizers (3+ visits)
    freq_query = (
        select(
            Claim.member_id,
            func.count(distinct(Claim.claim_id)).label("visit_count"),
            func.sum(Claim.paid_amount).label("total_cost"),
        )
        .where(base_filter)
        .group_by(Claim.member_id)
        .having(func.count(distinct(Claim.claim_id)) >= 3)
        .order_by(func.count(distinct(Claim.claim_id)).desc())
        .limit(20)
    )
    freq_result = await db.execute(freq_query)
    freq_rows = [
        {
            "member_name": f"Member #{r.member_id}",
            "member_id": str(r.member_id),
            "visits": _safe_int(r.visit_count),
            "total_cost": _safe_float(r.total_cost),
            "top_diagnoses": "",
            "pcp": "",
            "has_care_plan": "Unknown",
        }
        for r in freq_result.all()
    ]

    return {
        "kpis": [
            {"label": "ED Visits / 1K", "value": str(visits_per_1k), "benchmark": "310.0", "status": "over" if visits_per_1k > 310 else None},
            {"label": "Cost / Visit", "value": _fmt_dollar(cost_per_visit), "benchmark": "$1,280", "status": "over" if cost_per_visit > 1280 else None},
            {"label": "Avoidable ED %", "value": "--%"},
            {"label": "Obs Rate", "value": "--%"},
            {"label": "2-Midnight Compliance", "value": "--%"},
            {"label": "Total Spend", "value": _fmt_dollar(total_spend)},
        ],
        "sections": [
            {
                "id": "frequent_utilizers",
                "title": "Frequent ED Utilizers (3+ visits)",
                "type": "table",
                "columns": [
                    {"key": "member_name", "label": "Member"},
                    {"key": "member_id", "label": "ID"},
                    {"key": "visits", "label": "ED Visits", "numeric": True},
                    {"key": "total_cost", "label": "Total Cost", "numeric": True, "format": "dollar"},
                    {"key": "top_diagnoses", "label": "Top Diagnoses"},
                    {"key": "pcp", "label": "PCP"},
                    {"key": "has_care_plan", "label": "Care Plan"},
                ],
                "rows": freq_rows,
            },
            {
                "id": "ai_recommendations",
                "title": "AI Recommendations",
                "type": "insights",
                "items": [
                    {
                        "title": "Nurse triage line for high-ED PCP panels",
                        "description": "PCPs without after-hours access drive higher ED utilization. Implement a shared nurse triage line to divert avoidable visits.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Frequent utilizer care management",
                        "description": "Assign dedicated care coordinators to top ED utilizers with ED alert notifications.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Urgent care steerage for avoidable diagnoses",
                        "description": "URI, UTI, and back pain ED visits could be managed in urgent care settings at 85% lower cost.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                ],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Professional / Specialist
# ---------------------------------------------------------------------------

async def _drilldown_professional(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    provider_query = (
        select(
            Claim.facility_name,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claims"),
            func.count(distinct(Claim.member_id)).label("unique_members"),
        )
        .where(and_(base_filter, Claim.facility_name.isnot(None)))
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    prov_result = await db.execute(provider_query)
    specialty_rows = [
        {
            "specialty": r.facility_name,  # In real system, from provider specialty field
            "total_spend": _safe_float(r.total_spend),
            "visits": _safe_int(r.claims),
            "avg_cost_per_visit": round(_safe_float(r.total_spend) / max(_safe_int(r.claims), 1), 0),
            "benchmark_cost": 0,
            "unique_members": _safe_int(r.unique_members),
            "oon_pct": 0.0,
        }
        for r in prov_result.all()
    ]

    unique_providers_result = await db.execute(
        select(func.count(distinct(Claim.rendering_provider_id))).where(base_filter)
    )
    unique_providers = _safe_int(unique_providers_result.scalar())
    total_claims_result = await db.execute(select(func.count(Claim.id)).where(base_filter))
    total_claims = max(_safe_int(total_claims_result.scalar()), 1)
    avg_cost = round(total_spend / total_claims, 0)

    return {
        "kpis": [
            {"label": "Total Spend", "value": _fmt_dollar(total_spend)},
            {"label": "PMPM", "value": _fmt_dollar(round(total_spend / max(member_count * 12, 1), 2)), "benchmark": "$195", "status": "over" if round(total_spend / max(member_count * 12, 1), 2) > 195 else None},
            {"label": "Unique Providers", "value": f"{unique_providers:,}"},
            {"label": "Avg Cost / Visit", "value": _fmt_dollar(avg_cost), "benchmark": "$198", "status": "over" if avg_cost > 198 else None},
            {"label": "OON Leakage", "value": "--%"},
            {"label": "Referral Loop Closure", "value": "--%"},
        ],
        "sections": [
            {
                "id": "specialty_spend",
                "title": "Spend by Specialty",
                "type": "table",
                "columns": [
                    {"key": "specialty", "label": "Specialty"},
                    {"key": "total_spend", "label": "Total Spend", "numeric": True, "format": "dollar"},
                    {"key": "visits", "label": "Visits", "numeric": True},
                    {"key": "avg_cost_per_visit", "label": "Avg/Visit", "numeric": True, "format": "dollar"},
                    {"key": "benchmark_cost", "label": "Benchmark", "numeric": True, "format": "dollar"},
                    {"key": "unique_members", "label": "Members", "numeric": True},
                    {"key": "oon_pct", "label": "OON %", "numeric": True, "format": "pct", "benchmark": 10.0},
                ],
                "rows": specialty_rows,
            },
            {
                "id": "ai_recommendations",
                "title": "AI Recommendations",
                "type": "insights",
                "items": [
                    {
                        "title": "Specialist steerage to preferred in-network providers",
                        "description": "Reduce OON leakage by steering referrals to high-value in-network specialists. Focus on cardiology and orthopedics.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "eConsult program for low-acuity referrals",
                        "description": "Many specialty referrals result in a single visit with no procedure. An eConsult platform could resolve these virtually.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Referral loop closure automation",
                        "description": "Implement automated consult note routing to improve PCP-specialist coordination and reduce duplicate testing.",
                        "dollar_impact": None,
                        "category": "quality",
                    },
                ],
            },
        ],
    }


# ---------------------------------------------------------------------------
# SNF / Post-Acute
# ---------------------------------------------------------------------------

async def _drilldown_snf(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    facility_query = (
        select(
            Claim.facility_name,
            func.count(distinct(Claim.claim_id)).label("episodes"),
            func.sum(Claim.paid_amount).label("total_cost"),
            func.count(distinct(Claim.member_id)).label("unique_patients"),
        )
        .where(and_(base_filter, Claim.facility_name.isnot(None)))
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    fac_result = await db.execute(facility_query)
    facility_rows = []
    for r in fac_result.all():
        episodes = max(_safe_int(r.episodes), 1)
        cost = _safe_float(r.total_cost)
        facility_rows.append({
            "name": r.facility_name,
            "episodes": episodes,
            "avg_los": 0.0,  # Would come from admission/discharge dates
            "cost_per_episode": round(cost / episodes, 0),
            "rehospitalization_rate": 0.0,  # Would come from readmission logic
            "discharge_home_pct": 0.0,  # Would come from discharge disposition
            "hcc_capture_rate": 0.0,  # Would come from HCC engine
        })

    total_episodes_result = await db.execute(
        select(func.count(distinct(Claim.claim_id))).where(base_filter)
    )
    total_episodes = max(_safe_int(total_episodes_result.scalar()), 1)
    cost_per_episode = round(total_spend / total_episodes, 0)

    return {
        "kpis": [
            {"label": "Total Episodes", "value": f"{total_episodes:,}"},
            {"label": "Cost / Episode", "value": _fmt_dollar(cost_per_episode), "benchmark": "$5,800", "status": "over" if cost_per_episode > 5800 else None},
            {"label": "Avg LOS", "value": "-- days"},
            {"label": "Rehospitalization Rate", "value": "--%"},
            {"label": "Discharge to Home %", "value": "--%"},
            {"label": "HCC Capture Rate", "value": "--%"},
        ],
        "sections": [
            {
                "id": "facility_comparison",
                "title": "SNF Facility Comparison",
                "type": "table",
                "columns": [
                    {"key": "name", "label": "Facility"},
                    {"key": "episodes", "label": "Episodes", "numeric": True},
                    {"key": "avg_los", "label": "Avg LOS", "numeric": True, "benchmark": 18.0},
                    {"key": "cost_per_episode", "label": "Cost/Episode", "numeric": True, "format": "dollar"},
                    {"key": "rehospitalization_rate", "label": "Rehosp %", "numeric": True, "format": "pct", "benchmark": 14.0},
                    {"key": "discharge_home_pct", "label": "Home %", "numeric": True, "format": "pct", "benchmark": 72.0, "invertBenchmark": True},
                    {"key": "hcc_capture_rate", "label": "HCC Capture %", "numeric": True, "format": "pct", "benchmark": 65.0, "invertBenchmark": True},
                ],
                "rows": facility_rows,
            },
            {
                "id": "ai_recommendations",
                "title": "AI Recommendations",
                "type": "insights",
                "items": [
                    {
                        "title": "Preferred SNF network with quality tiers",
                        "description": "Steer patients to SNFs with lower rehospitalization rates, shorter LOS, and higher HCC capture rates.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Home health diversion for eligible patients",
                        "description": "Identify SNF patients who could safely go home with home health services instead. Focus on functional joint replacement and stable chronic conditions.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "HCC capture improvement at SNF facilities",
                        "description": "SNF stays are an opportunity to capture documented but uncoded HCCs. Embed coding support at high-volume SNFs.",
                        "dollar_impact": None,
                        "category": "revenue",
                    },
                ],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Pharmacy
# ---------------------------------------------------------------------------

async def _drilldown_pharmacy(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    # By drug class
    class_query = (
        select(
            Claim.drug_class,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claims"),
            func.count(distinct(Claim.member_id)).label("unique_members"),
        )
        .where(and_(base_filter, Claim.drug_class.isnot(None)))
        .group_by(Claim.drug_class)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    class_result = await db.execute(class_query)
    drug_class_rows = [
        {
            "drug_class": r.drug_class,
            "total_spend": _safe_float(r.total_spend),
            "fills": _safe_int(r.claims),
            "unique_members": _safe_int(r.unique_members),
            "avg_cost_per_fill": round(_safe_float(r.total_spend) / max(_safe_int(r.claims), 1), 0),
            "brand_pct": 0.0,  # Would come from brand/generic flag on claims
            "trend_vs_prior": 0.0,
        }
        for r in class_result.all()
    ]

    # Top cost drugs
    drug_query = (
        select(
            Claim.drug_name,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("fills"),
            func.avg(Claim.paid_amount).label("avg_cost"),
        )
        .where(and_(base_filter, Claim.drug_name.isnot(None)))
        .group_by(Claim.drug_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    drug_result = await db.execute(drug_query)
    brand_generic_rows = [
        {
            "brand_drug": r.drug_name,
            "generic_alternative": "",  # Would come from formulary data
            "members_on_brand": 0,
            "annual_brand_cost": round(_safe_float(r.avg_cost) * 12, 0),
            "annual_generic_cost": 0,
            "savings_per_member": 0,
            "total_potential_savings": 0,
        }
        for r in drug_result.all()
    ]

    total_fills_result = await db.execute(select(func.count(Claim.id)).where(base_filter))
    total_fills = max(_safe_int(total_fills_result.scalar()), 1)

    return {
        "kpis": [
            {"label": "Total Spend", "value": _fmt_dollar(total_spend)},
            {"label": "PMPM", "value": _fmt_dollar(round(total_spend / max(member_count * 12, 1), 2)), "benchmark": "$175", "status": "over" if round(total_spend / max(member_count * 12, 1), 2) > 175 else None},
            {"label": "Generic Dispense Rate", "value": "--%"},
            {"label": "Total Fills", "value": f"{total_fills:,}"},
            {"label": "Members Below 80% PDC", "value": "--"},
            {"label": "Rx Without Matching Dx", "value": "--"},
        ],
        "sections": [
            {
                "id": "drug_class_spend",
                "title": "Top Drug Classes by Spend",
                "type": "table",
                "columns": [
                    {"key": "drug_class", "label": "Drug Class"},
                    {"key": "total_spend", "label": "Total Spend", "numeric": True, "format": "dollar"},
                    {"key": "fills", "label": "Fills", "numeric": True},
                    {"key": "unique_members", "label": "Members", "numeric": True},
                    {"key": "avg_cost_per_fill", "label": "Avg/Fill", "numeric": True, "format": "dollar"},
                    {"key": "brand_pct", "label": "Brand %", "numeric": True, "format": "pct"},
                    {"key": "trend_vs_prior", "label": "Trend", "numeric": True, "format": "pct"},
                ],
                "rows": drug_class_rows,
            },
            {
                "id": "ai_recommendations",
                "title": "AI Recommendations",
                "type": "insights",
                "items": [
                    {
                        "title": "Generic substitution campaign",
                        "description": "Identify brand drugs with available generic/biosimilar alternatives for pharmacy-led therapeutic interchange.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Statin adherence intervention for Stars",
                        "description": "Monitor PDC for statin adherence measures and target pharmacist outreach to members below 80% PDC threshold.",
                        "dollar_impact": None,
                        "category": "quality",
                    },
                    {
                        "title": "Drug-diagnosis gap capture for HCC revenue",
                        "description": "Flag members on medications without matching diagnoses as HCC suspects. Cross-reference with the suspect inventory.",
                        "dollar_impact": None,
                        "category": "revenue",
                    },
                    {
                        "title": "90-day supply and mail order optimization",
                        "description": "Convert chronic medication fills from 30-day retail to 90-day mail order for cost and adherence improvement.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                ],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Home Health / DME
# ---------------------------------------------------------------------------

async def _drilldown_home_dme(db: AsyncSession, base_filter, member_count: int, total_spend: float, category: str) -> dict:
    vendor_query = (
        select(
            Claim.facility_name,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(distinct(Claim.claim_id)).label("episodes"),
            func.count(distinct(Claim.member_id)).label("unique_members"),
        )
        .where(and_(base_filter, Claim.facility_name.isnot(None)))
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    vendor_result = await db.execute(vendor_query)
    vendor_rows = []
    for r in vendor_result.all():
        episodes = max(_safe_int(r.episodes), 1)
        vendor_rows.append({
            "name": r.facility_name,
            "episodes" if category == "home_health" else "claims": episodes,
            "cost_per_episode" if category == "home_health" else "total_spend": round(_safe_float(r.total_spend) / episodes, 0) if category == "home_health" else _safe_float(r.total_spend),
            "avg_visits" if category == "home_health" else "avg_cost_per_claim": 0,
            "readmission_rate" if category == "home_health" else "top_items": 0.0 if category == "home_health" else "",
        })

    # Provider ordering patterns
    provider_query = (
        select(
            Claim.rendering_provider_id,
            func.count(distinct(Claim.claim_id)).label("orders"),
            func.sum(Claim.paid_amount).label("total_cost"),
        )
        .where(and_(base_filter, Claim.rendering_provider_id.isnot(None)))
        .group_by(Claim.rendering_provider_id)
        .order_by(func.count(distinct(Claim.claim_id)).desc())
        .limit(10)
    )
    prov_result = await db.execute(provider_query)
    provider_rows = [
        {
            "provider": f"Provider #{r.rendering_provider_id}",
            "orders": _safe_int(r.orders),
            "total_cost": _safe_float(r.total_cost),
            "avg_cost": round(_safe_float(r.total_cost) / max(_safe_int(r.orders), 1), 0),
            "preferred_vendor": "",
        }
        for r in prov_result.all()
    ]

    total_episodes_result = await db.execute(
        select(func.count(distinct(Claim.claim_id))).where(base_filter)
    )
    total_episodes = max(_safe_int(total_episodes_result.scalar()), 1)

    label = "Home Health" if category == "home_health" else "DME"
    cost_per_ep = round(total_spend / total_episodes, 0)

    return {
        "kpis": [
            {"label": "Total Spend", "value": _fmt_dollar(total_spend)},
            {"label": "Episodes" if category == "home_health" else "Claims", "value": f"{total_episodes:,}"},
            {"label": "Cost / Episode" if category == "home_health" else "Avg Cost / Claim", "value": _fmt_dollar(cost_per_ep)},
            {"label": "PMPM", "value": _fmt_dollar(round(total_spend / max(member_count * 12, 1), 2))},
        ],
        "sections": [
            {
                "id": "vendor_comparison",
                "title": f"{label} Vendor Comparison",
                "type": "table",
                "columns": [
                    {"key": "name", "label": "Vendor"},
                    {"key": "episodes" if category == "home_health" else "claims", "label": "Episodes" if category == "home_health" else "Claims", "numeric": True},
                    {"key": "cost_per_episode" if category == "home_health" else "total_spend", "label": "Cost/Episode" if category == "home_health" else "Total Spend", "numeric": True, "format": "dollar"},
                ],
                "rows": vendor_rows,
            },
            {
                "id": "ordering_providers",
                "title": "Ordering Provider Patterns",
                "type": "table",
                "columns": [
                    {"key": "provider", "label": "Provider"},
                    {"key": "orders", "label": "Orders", "numeric": True},
                    {"key": "total_cost", "label": "Total Cost", "numeric": True, "format": "dollar"},
                    {"key": "avg_cost", "label": "Avg Cost", "numeric": True, "format": "dollar"},
                    {"key": "preferred_vendor", "label": "Preferred Vendor"},
                ],
                "rows": provider_rows,
            },
            {
                "id": "ai_recommendations",
                "title": "AI Recommendations",
                "type": "insights",
                "items": [
                    {
                        "title": f"Preferred vendor network for {label.lower()}",
                        "description": f"Compare vendor costs, outcomes, and satisfaction scores. Steer orders to higher-value {label.lower()} vendors.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                    {
                        "title": "Utilization review for high-ordering providers",
                        "description": f"Identify providers ordering significantly more {label.lower()} services than peers. Implement concurrent utilization review.",
                        "dollar_impact": None,
                        "category": "cost",
                    },
                ],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------

async def get_expenditure_insights(db: AsyncSession, category: str | None = None) -> list[dict]:
    """Retrieve AI-generated cost insights, optionally filtered by category."""

    query = (
        select(Insight)
        .where(
            Insight.category == InsightCategory.cost.value,
            Insight.status == InsightStatus.active.value,
        )
        .order_by(Insight.dollar_impact.desc().nulls_last())
        .limit(10)
    )

    # Filter by surface_on if category specified
    if category:
        query = query.where(
            or_(
                Insight.surface_on.op("@>")(f'["expenditure.{category}"]'),
                Insight.surface_on.op("@>")(f'["expenditure"]'),
            )
        )

    result = await db.execute(query)
    insights = result.scalars().all()

    return [
        {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "dollar_impact": float(i.dollar_impact) if i.dollar_impact else None,
            "recommended_action": i.recommended_action,
            "confidence": i.confidence,
            "category": i.category,
        }
        for i in insights
    ]


# ---------------------------------------------------------------------------
# Medicare Part A/B/C/D Analysis
# ---------------------------------------------------------------------------

# Part mapping: service categories -> Medicare parts
PART_MAPPING = {
    "A": ["inpatient", "snf_postacute", "home_health"],  # Inpatient, SNF, hospice, home health
    "B": ["professional", "ed_observation", "dme", "other"],  # Outpatient, professional, DME, lab
    "D": ["pharmacy"],  # Pharmacy
}


async def get_part_analysis(db: AsyncSession, period: str | None = None) -> dict:
    """Medicare Part A/B/C/D cost breakdown."""
    from app.models.risk_accounting import CapitationPayment

    member_count_result = await db.execute(select(func.count(Member.id)))
    member_count = _safe_int(member_count_result.scalar())
    member_months = max(member_count * 12, 1)

    # Aggregate claims by service category
    cat_query = select(
        Claim.service_category,
        func.sum(Claim.paid_amount).label("total_spend"),
        func.count(Claim.id).label("claim_count"),
        func.count(distinct(Claim.member_id)).label("member_count"),
    ).where(Claim.service_category.isnot(None)).group_by(Claim.service_category)

    cat_result = await db.execute(cat_query)
    cat_data = {row.service_category: row for row in cat_result.all()}

    parts = {}
    for part_letter, categories in PART_MAPPING.items():
        total_spend = 0.0
        claim_count = 0
        members = 0
        for cat in categories:
            row = cat_data.get(cat)
            if row:
                total_spend += _safe_float(row.total_spend)
                claim_count += _safe_int(row.claim_count)
                members += _safe_int(row.member_count)

        pmpm = round(total_spend / member_months, 2) if member_months > 0 else 0
        parts[f"part_{part_letter.lower()}"] = {
            "part": part_letter,
            "label": {"A": "Part A (Inpatient/SNF/Home Health)", "B": "Part B (Outpatient/Professional/DME)", "D": "Part D (Pharmacy)"}[part_letter],
            "total_spend": round(total_spend, 2),
            "pmpm": pmpm,
            "claim_count": claim_count,
            "member_count": members,
            "trend": 0.0,  # computed below from period-over-period actuals
        }

    # Part C (MA plan admin) — from capitation payments
    cap_result = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.total_payment), 0))
    )
    cap_total = _safe_float(cap_result.scalar())
    parts["part_c"] = {
        "part": "C",
        "label": "Part C (Medicare Advantage Admin)",
        "total_spend": round(cap_total, 2),
        "pmpm": round(cap_total / member_months, 2) if member_months > 0 else 0,
        "claim_count": 0,
        "member_count": member_count,
        "trend": 0.0,
    }

    # Compute actual period-over-period trend for Parts A/B/D from recent vs prior 6 months
    from datetime import date as _dt, timedelta as _td
    _today = _dt.today()
    _six_months_ago = _today - _td(days=182)
    _twelve_months_ago = _today - _td(days=365)
    for part_letter, categories in PART_MAPPING.items():
        key = f"part_{part_letter.lower()}"
        if key not in parts:
            continue
        recent_q = await db.execute(
            select(func.coalesce(func.sum(Claim.paid_amount), 0)).where(
                Claim.service_category.in_(categories),
                Claim.service_date >= _six_months_ago,
                Claim.service_date <= _today,
            )
        )
        prior_q = await db.execute(
            select(func.coalesce(func.sum(Claim.paid_amount), 0)).where(
                Claim.service_category.in_(categories),
                Claim.service_date >= _twelve_months_ago,
                Claim.service_date < _six_months_ago,
            )
        )
        recent_spend = _safe_float(recent_q.scalar())
        prior_spend = _safe_float(prior_q.scalar())
        if prior_spend > 0:
            parts[key]["trend"] = round((recent_spend - prior_spend) / prior_spend * 100, 1)

    total_all_parts = sum(p["total_spend"] for p in parts.values())

    return {
        "parts": parts,
        "total_spend": round(total_all_parts, 2),
        "member_count": member_count,
        "member_months": member_months,
    }


async def get_expenditure_by_period(
    db: AsyncSession, group_by: str = "month"
) -> list[dict]:
    """Group expenditure by month, quarter, or year with Part breakdown."""
    member_count_result = await db.execute(select(func.count(Member.id)))
    member_count = max(_safe_int(member_count_result.scalar()), 1)

    if group_by == "year":
        period_expr = extract("year", Claim.service_date)
    elif group_by == "quarter":
        # Format as "YYYY-QN"
        period_expr = func.concat(
            extract("year", Claim.service_date),
            literal_column("'-Q'"),
            func.ceil(extract("month", Claim.service_date) / 3),
        )
    else:
        # month: "YYYY-MM"
        period_expr = func.concat(
            extract("year", Claim.service_date),
            literal_column("'-'"),
            func.lpad(func.cast(extract("month", Claim.service_date), String), 2, "0"),
        )

    query = (
        select(
            period_expr.label("period"),
            Claim.service_category,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_date.isnot(None), Claim.service_category.isnot(None))
        .group_by(period_expr, Claim.service_category)
        .order_by(period_expr)
    )

    result = await db.execute(query)
    rows = result.all()

    # Aggregate into periods
    period_data: dict[str, dict] = {}
    for row in rows:
        period_key = str(row.period)
        if period_key not in period_data:
            period_data[period_key] = {
                "period": period_key,
                "total_spend": 0.0,
                "by_category": {},
                "by_part": {"A": 0.0, "B": 0.0, "C": 0.0, "D": 0.0},
            }
        spend = _safe_float(row.total_spend)
        period_data[period_key]["total_spend"] += spend
        period_data[period_key]["by_category"][row.service_category] = spend

        # Map to parts
        for part_letter, categories in PART_MAPPING.items():
            if row.service_category in categories:
                period_data[period_key]["by_part"][part_letter] += spend

    # Calculate PMPM for each period
    result_list = []
    for pd in period_data.values():
        pd["pmpm"] = round(pd["total_spend"] / member_count, 2)
        pd["total_spend"] = round(pd["total_spend"], 2)
        for part in pd["by_part"]:
            pd["by_part"][part] = round(pd["by_part"][part], 2)
        result_list.append(pd)

    return result_list
