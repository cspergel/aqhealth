"""
Expenditure Analytics Service — aggregation, drill-downs, and insight retrieval.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from decimal import Decimal

from sqlalchemy import func, case, distinct, and_, or_, extract
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


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

async def get_expenditure_overview(db: AsyncSession) -> dict:
    """Total spend, PMPM, MLR, and per-category breakdown."""

    # Total member months (active members)
    member_count_result = await db.execute(select(func.count(Member.id)))
    member_count = _safe_int(member_count_result.scalar())
    member_months = max(member_count * 12, 1)  # annualized

    # Total spend
    total_result = await db.execute(select(func.sum(Claim.paid_amount)))
    total_spend = _safe_float(total_result.scalar())

    pmpm = round(total_spend / member_months, 2)

    # MLR = medical spend / premium revenue (approximate as 85% standard)
    # In a real system this would come from premium data; we use a placeholder
    mlr = 0.85

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
            "trend_vs_prior": round((cat_spend * 0.03) / max(cat_spend, 1) * 100, 1),  # placeholder trend
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
# Category Drill-downs
# ---------------------------------------------------------------------------

async def get_category_drilldown(db: AsyncSession, category: str) -> dict:
    """Deep analysis for a specific service category."""

    member_count_result = await db.execute(select(func.count(Member.id)))
    member_count = max(_safe_int(member_count_result.scalar()), 1)
    member_months = member_count * 12

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
        "tables": [],
    }

    # Category-specific analysis
    if category == "inpatient":
        result = {**result, **(await _drilldown_inpatient(db, base_filter, member_count, total_spend))}
    elif category == "ed_observation":
        result = {**result, **(await _drilldown_ed(db, base_filter, member_count, total_spend))}
    elif category == "professional":
        result = {**result, **(await _drilldown_professional(db, base_filter, member_count, total_spend))}
    elif category == "snf_postacute":
        result = {**result, **(await _drilldown_snf(db, base_filter, member_count, total_spend))}
    elif category == "pharmacy":
        result = {**result, **(await _drilldown_pharmacy(db, base_filter, member_count, total_spend))}
    elif category in ("home_health", "dme"):
        result = {**result, **(await _drilldown_home_dme(db, base_filter, member_count, total_spend, category))}
    else:
        result["kpis"] = [
            {"label": "Total Spend", "value": f"${total_spend:,.0f}"},
            {"label": "Claims", "value": f"{claim_count:,}"},
            {"label": "Unique Members", "value": f"{unique_members:,}"},
        ]

    return result


async def _drilldown_inpatient(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    """Inpatient: facility breakdown, top DRGs, KPIs."""

    # Facility breakdown
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
    facilities = []
    for row in fac_result.all():
        admits = max(_safe_int(row.admits), 1)
        facilities.append({
            "name": row.facility_name or "Unknown",
            "admits": admits,
            "total_cost": _safe_float(row.total_cost),
            "cost_per_admit": round(_safe_float(row.total_cost) / admits, 0),
            "unique_patients": _safe_int(row.unique_patients),
        })

    # Top DRGs
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
    drgs = []
    for row in drg_result.all():
        drgs.append({
            "code": row.drg_code,
            "cases": _safe_int(row.cases),
            "total_cost": _safe_float(row.total_cost),
            "avg_cost": round(_safe_float(row.avg_cost), 0),
        })

    # KPIs
    total_admits_result = await db.execute(
        select(func.count(distinct(Claim.claim_id))).where(base_filter)
    )
    total_admits = max(_safe_int(total_admits_result.scalar()), 1)
    admits_per_1k = round(total_admits / member_count * 1000, 1)
    cost_per_admit = round(total_spend / total_admits, 0)

    return {
        "kpis": [
            {"label": "Admits / 1K", "value": f"{admits_per_1k}"},
            {"label": "Cost / Admit", "value": f"${cost_per_admit:,.0f}"},
            {"label": "Total Admits", "value": f"{total_admits:,}"},
            {"label": "Total Spend", "value": f"${total_spend:,.0f}"},
        ],
        "tables": [
            {"title": "Top Facilities", "columns": ["Facility", "Admits", "Total Cost", "Cost/Admit", "Patients"], "rows": facilities},
            {"title": "Top DRGs", "columns": ["DRG Code", "Cases", "Total Cost", "Avg Cost"], "rows": drgs},
        ],
    }


async def _drilldown_ed(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    """ED / Observation drilldown."""

    visits_result = await db.execute(
        select(
            func.count(distinct(Claim.claim_id)).label("visits"),
            func.count(distinct(Claim.member_id)).label("unique_members"),
        ).where(base_filter)
    )
    row = visits_result.one()
    visits = max(_safe_int(row.visits), 1)
    unique_members = _safe_int(row.unique_members)
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
        .limit(10)
    )
    freq_result = await db.execute(freq_query)
    frequent_utilizers = [
        {"member_id": r.member_id, "visits": _safe_int(r.visit_count), "total_cost": _safe_float(r.total_cost)}
        for r in freq_result.all()
    ]

    return {
        "kpis": [
            {"label": "ED Visits / 1K", "value": f"{visits_per_1k}"},
            {"label": "Cost / Visit", "value": f"${cost_per_visit:,.0f}"},
            {"label": "Total Visits", "value": f"{visits:,}"},
            {"label": "Frequent Utilizers", "value": f"{len(frequent_utilizers)}"},
        ],
        "tables": [
            {"title": "Frequent Utilizers (3+ visits)", "columns": ["Member ID", "Visits", "Total Cost"], "rows": frequent_utilizers},
        ],
    }


async def _drilldown_professional(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    """Professional services drilldown."""

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
    providers = [
        {
            "name": r.facility_name,
            "total_spend": _safe_float(r.total_spend),
            "claims": _safe_int(r.claims),
            "unique_members": _safe_int(r.unique_members),
        }
        for r in prov_result.all()
    ]

    unique_providers_result = await db.execute(
        select(func.count(distinct(Claim.rendering_provider_id))).where(base_filter)
    )
    unique_providers = _safe_int(unique_providers_result.scalar())

    total_claims_result = await db.execute(
        select(func.count(Claim.id)).where(base_filter)
    )
    total_claims = max(_safe_int(total_claims_result.scalar()), 1)

    return {
        "kpis": [
            {"label": "Total Spend", "value": f"${total_spend:,.0f}"},
            {"label": "PMPM", "value": f"${round(total_spend / max(member_count * 12, 1), 2):,.2f}"},
            {"label": "Unique Providers", "value": f"{unique_providers:,}"},
            {"label": "Avg Cost / Claim", "value": f"${round(total_spend / total_claims, 0):,.0f}"},
        ],
        "tables": [
            {"title": "Top Providers by Spend", "columns": ["Provider", "Total Spend", "Claims", "Patients"], "rows": providers},
        ],
    }


async def _drilldown_snf(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    """SNF / Post-Acute drilldown."""

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
    facilities = []
    for r in fac_result.all():
        episodes = max(_safe_int(r.episodes), 1)
        facilities.append({
            "name": r.facility_name,
            "episodes": episodes,
            "total_cost": _safe_float(r.total_cost),
            "cost_per_episode": round(_safe_float(r.total_cost) / episodes, 0),
            "unique_patients": _safe_int(r.unique_patients),
        })

    total_episodes_result = await db.execute(
        select(func.count(distinct(Claim.claim_id))).where(base_filter)
    )
    total_episodes = max(_safe_int(total_episodes_result.scalar()), 1)

    return {
        "kpis": [
            {"label": "Total Episodes", "value": f"{total_episodes:,}"},
            {"label": "Cost / Episode", "value": f"${round(total_spend / total_episodes, 0):,.0f}"},
            {"label": "Total Spend", "value": f"${total_spend:,.0f}"},
            {"label": "PMPM", "value": f"${round(total_spend / max(member_count * 12, 1), 2):,.2f}"},
        ],
        "tables": [
            {"title": "Facility Comparison", "columns": ["Facility", "Episodes", "Total Cost", "Cost/Episode", "Patients"], "rows": facilities},
        ],
    }


async def _drilldown_pharmacy(db: AsyncSession, base_filter, member_count: int, total_spend: float) -> dict:
    """Pharmacy drilldown."""

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
    drug_classes = [
        {
            "drug_class": r.drug_class,
            "total_spend": _safe_float(r.total_spend),
            "claims": _safe_int(r.claims),
            "unique_members": _safe_int(r.unique_members),
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
    top_drugs = [
        {
            "drug_name": r.drug_name,
            "total_spend": _safe_float(r.total_spend),
            "fills": _safe_int(r.fills),
            "avg_cost": round(_safe_float(r.avg_cost), 2),
        }
        for r in drug_result.all()
    ]

    total_fills_result = await db.execute(select(func.count(Claim.id)).where(base_filter))
    total_fills = max(_safe_int(total_fills_result.scalar()), 1)

    return {
        "kpis": [
            {"label": "Total Spend", "value": f"${total_spend:,.0f}"},
            {"label": "PMPM", "value": f"${round(total_spend / max(member_count * 12, 1), 2):,.2f}"},
            {"label": "Total Fills", "value": f"{total_fills:,}"},
            {"label": "Avg Cost / Fill", "value": f"${round(total_spend / total_fills, 2):,.2f}"},
        ],
        "tables": [
            {"title": "Spend by Drug Class", "columns": ["Drug Class", "Total Spend", "Claims", "Members"], "rows": drug_classes},
            {"title": "Top Cost Drugs", "columns": ["Drug Name", "Total Spend", "Fills", "Avg Cost"], "rows": top_drugs},
        ],
    }


async def _drilldown_home_dme(db: AsyncSession, base_filter, member_count: int, total_spend: float, category: str) -> dict:
    """Home Health / DME drilldown."""

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
    vendors = []
    for r in vendor_result.all():
        episodes = max(_safe_int(r.episodes), 1)
        vendors.append({
            "name": r.facility_name,
            "total_spend": _safe_float(r.total_spend),
            "episodes": episodes,
            "cost_per_episode": round(_safe_float(r.total_spend) / episodes, 0),
            "unique_members": _safe_int(r.unique_members),
        })

    total_episodes_result = await db.execute(
        select(func.count(distinct(Claim.claim_id))).where(base_filter)
    )
    total_episodes = max(_safe_int(total_episodes_result.scalar()), 1)

    label = "Home Health" if category == "home_health" else "DME"
    return {
        "kpis": [
            {"label": "Total Spend", "value": f"${total_spend:,.0f}"},
            {"label": "Episodes", "value": f"{total_episodes:,}"},
            {"label": "Cost / Episode", "value": f"${round(total_spend / total_episodes, 0):,.0f}"},
            {"label": "PMPM", "value": f"${round(total_spend / max(member_count * 12, 1), 2):,.2f}"},
        ],
        "tables": [
            {"title": f"{label} Vendor Comparison", "columns": ["Vendor", "Total Spend", "Episodes", "Cost/Episode", "Members"], "rows": vendors},
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
            Insight.category == InsightCategory.cost,
            Insight.status == InsightStatus.active,
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
            "category": i.category.value,
        }
        for i in insights
    ]
