"""
Scenario Modeling / What-If Analysis Service.

Accepts scenario definitions and calculates financial, quality, and
operational impact projections.  Supports pre-built and custom scenarios.
"""

import logging
from datetime import date
from decimal import Decimal

from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.care_gap import MemberGap, GapStatus, GapMeasure
from app.models.provider import Provider

logger = logging.getLogger(__name__)

from app.constants import CMS_PMPM_BASE as CMS_MONTHLY_BASE


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _safe_int(v) -> int:
    return int(v) if v is not None else 0


# ---------------------------------------------------------------------------
# Pre-built scenarios
# ---------------------------------------------------------------------------

PREBUILT_SCENARIOS = [
    {
        "id": "capture_improvement",
        "name": "Improve HCC Capture Rate",
        "description": "Model the revenue impact of improving your HCC suspect capture rate from the current level to a target percentage.",
        "type": "capture_improvement",
        "icon": "trending-up",
        "default_params": {"from_rate": 65, "to_rate": 80},
        "category": "revenue",
    },
    {
        "id": "facility_redirect",
        "name": "Facility Redirection",
        "description": "Calculate cost savings from redirecting patients away from high-cost facilities to preferred network facilities.",
        "type": "facility_redirect",
        "icon": "building",
        "default_params": {"patient_count": 50, "from_facility": "High-Cost Hospital", "to_facility": "Preferred Network Hospital"},
        "category": "cost",
    },
    {
        "id": "gap_closure",
        "name": "Care Gap Closure Campaign",
        "description": "Estimate the Stars rating and revenue impact of closing a target number of care gaps on a specific measure.",
        "type": "gap_closure",
        "icon": "check-circle",
        "default_params": {"measure": "CDC-HbA1c", "gaps_to_close": 100},
        "category": "quality",
    },
    {
        "id": "membership_change",
        "name": "Membership Growth/Decline",
        "description": "Project revenue impact of gaining or losing members with a specific average RAF score.",
        "type": "membership_change",
        "icon": "users",
        "default_params": {"member_delta": 500, "avg_raf": 1.2},
        "category": "revenue",
    },
    {
        "id": "cost_reduction",
        "name": "Cost Category Reduction",
        "description": "Model the impact of reducing spend in a specific service category by a target percentage.",
        "type": "cost_reduction",
        "icon": "scissors",
        "default_params": {"category": "inpatient", "reduction_pct": 10},
        "category": "cost",
    },
    {
        "id": "provider_education",
        "name": "Provider Performance Improvement",
        "description": "Calculate the impact if bottom-quartile providers improve their capture and gap closure rates to the network median.",
        "type": "provider_education",
        "icon": "graduation-cap",
        "default_params": {},
        "category": "provider",
    },
]


# ---------------------------------------------------------------------------
# Scenario runner
# ---------------------------------------------------------------------------

async def get_prebuilt_scenarios() -> list[dict]:
    """Return the list of pre-built scenario definitions."""
    return PREBUILT_SCENARIOS


async def run_scenario(db: AsyncSession, scenario: dict) -> dict:
    """
    Execute a scenario and return the projected impact.
    Dispatches to the appropriate handler based on scenario type.
    """
    scenario_type = scenario.get("type", "")
    params = scenario.get("params", {})

    handlers = {
        "capture_improvement": _scenario_capture_improvement,
        "facility_redirect": _scenario_facility_redirect,
        "gap_closure": _scenario_gap_closure,
        "membership_change": _scenario_membership_change,
        "cost_reduction": _scenario_cost_reduction,
        "provider_education": _scenario_provider_education,
    }

    handler = handlers.get(scenario_type)
    if not handler:
        return {
            "error": f"Unknown scenario type: {scenario_type}",
            "available_types": list(handlers.keys()),
        }

    return await handler(db, params)


# ---------------------------------------------------------------------------
# Individual scenario handlers
# ---------------------------------------------------------------------------

async def _scenario_capture_improvement(db: AsyncSession, params: dict) -> dict:
    """If capture rate goes from X% to Y%, what's the RAF/revenue impact?"""
    from_rate = params.get("from_rate", 65) / 100
    to_rate = params.get("to_rate", 80) / 100

    today = date.today()
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    # Population
    pop_q = await db.execute(
        select(func.count(Member.id), func.sum(Member.current_raf)).where(active_filter)
    )
    pop_row = pop_q.one()
    total_lives = max(_safe_int(pop_row[0]), 1)
    current_total_raf = _safe_float(pop_row[1])

    # Suspect value
    suspect_q = await db.execute(
        select(
            func.count(HccSuspect.id),
            func.coalesce(func.sum(HccSuspect.raf_value), 0),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        ).where(HccSuspect.status == SuspectStatus.open.value)
    )
    s_row = suspect_q.one()
    total_suspect_raf = _safe_float(s_row[1])
    total_suspect_value = _safe_float(s_row[2])

    # Current state (at from_rate)
    current_captured_raf = total_suspect_raf * from_rate
    current_revenue = (current_total_raf + current_captured_raf) * CMS_MONTHLY_BASE * 12

    # Projected state (at to_rate)
    projected_captured_raf = total_suspect_raf * to_rate
    additional_raf = projected_captured_raf - current_captured_raf
    projected_revenue = (current_total_raf + projected_captured_raf) * CMS_MONTHLY_BASE * 12

    return {
        "scenario_name": "HCC Capture Rate Improvement",
        "scenario_type": "capture_improvement",
        "current_state": {
            "capture_rate": round(from_rate * 100, 1),
            "population_raf": round(current_total_raf / total_lives, 3),
            "annual_revenue": round(current_revenue, 2),
        },
        "projected_state": {
            "capture_rate": round(to_rate * 100, 1),
            "population_raf": round((current_total_raf + projected_captured_raf) / total_lives, 3),
            "annual_revenue": round(projected_revenue, 2),
        },
        "financial_impact": {
            "annual_revenue_change": round(projected_revenue - current_revenue, 2),
            "additional_raf_captured": round(additional_raf, 3),
            "monthly_revenue_change": round((projected_revenue - current_revenue) / 12, 2),
        },
        "timeline": "6-12 months to full realization",
        "assumptions": [
            f"Current capture rate: {from_rate*100:.0f}%",
            f"Target capture rate: {to_rate*100:.0f}%",
            f"Total suspect RAF opportunity: {total_suspect_raf:.1f}",
            f"CMS base rate: ${CMS_MONTHLY_BASE}/member/month",
        ],
        "confidence": 78,
    }


async def _scenario_facility_redirect(db: AsyncSession, params: dict) -> dict:
    """If we redirect N patients from facility A to B, cost savings?"""
    patient_count = params.get("patient_count", 50)
    from_facility = params.get("from_facility", "High-Cost Hospital")
    to_facility = params.get("to_facility", "Preferred Network Hospital")

    # Get facility spend data
    facility_q = await db.execute(
        select(
            Claim.facility_name,
            func.avg(Claim.paid_amount).label("avg_cost"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(
            Claim.facility_name.is_not(None),
            Claim.service_category == "inpatient",
        )
        .group_by(Claim.facility_name)
        .order_by(func.avg(Claim.paid_amount).desc())
    )
    facilities = {r.facility_name: _safe_float(r.avg_cost) for r in facility_q.all()}

    avg_high_cost = max(facilities.values()) if facilities else 18000
    avg_low_cost = min(facilities.values()) if facilities else 12000
    cost_per_redirect = avg_high_cost - avg_low_cost
    total_savings = cost_per_redirect * patient_count

    return {
        "scenario_name": "Facility Redirection",
        "scenario_type": "facility_redirect",
        "current_state": {
            "from_facility": from_facility,
            "avg_cost_per_admission": round(avg_high_cost, 2),
            "redirected_patients": patient_count,
        },
        "projected_state": {
            "to_facility": to_facility,
            "avg_cost_per_admission": round(avg_low_cost, 2),
            "cost_per_redirect_saved": round(cost_per_redirect, 2),
        },
        "financial_impact": {
            "annual_savings": round(total_savings, 2),
            "monthly_savings": round(total_savings / 12, 2),
            "savings_per_patient": round(cost_per_redirect, 2),
        },
        "timeline": "3-6 months for network steering",
        "assumptions": [
            f"Redirecting {patient_count} patients annually",
            f"Average high-cost facility charge: ${avg_high_cost:,.0f}",
            f"Average preferred facility charge: ${avg_low_cost:,.0f}",
            "Assumes clinical equivalency between facilities",
        ],
        "confidence": 72,
    }


async def _scenario_gap_closure(db: AsyncSession, params: dict) -> dict:
    """If we close N gaps on measure X, Stars impact + revenue?"""
    measure_code = params.get("measure", "CDC-HbA1c")
    gaps_to_close = params.get("gaps_to_close", 100)

    # Get measure data
    measure_q = await db.execute(
        select(GapMeasure).where(GapMeasure.code == measure_code)
    )
    measure = measure_q.scalar()

    # Get current gap stats for this measure
    gap_stats_q = await db.execute(
        select(
            func.count(MemberGap.id).label("total"),
            func.sum(case((MemberGap.status == GapStatus.open.value, 1), else_=0)).label("open_ct"),
            func.sum(case((MemberGap.status == GapStatus.closed.value, 1), else_=0)).label("closed_ct"),
        )
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .where(GapMeasure.code == measure_code)
    )
    stats = gap_stats_q.one()
    total_eligible = _safe_int(stats.total) or 500
    current_open = _safe_int(stats.open_ct) or 200
    current_closed = _safe_int(stats.closed_ct) or 300

    current_rate = current_closed / max(total_eligible, 1) * 100
    new_closed = current_closed + min(gaps_to_close, current_open)
    new_rate = new_closed / max(total_eligible, 1) * 100

    # Stars bonus estimate ($40 per member per star for MA plans)
    stars_weight = measure.stars_weight if measure else 3
    stars_revenue_per_member = 40 * stars_weight
    total_lives_q = await db.execute(
        select(func.count(Member.id)).where(
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= date.today())
        )
    )
    total_lives = max(_safe_int(total_lives_q.scalar()), 1)

    # Stars improvement estimate
    rate_improvement = new_rate - current_rate
    stars_impact = rate_improvement * 0.01  # Simplified: 1% gap closure ~ 0.01 star
    annual_stars_revenue = stars_impact * stars_revenue_per_member * total_lives

    return {
        "scenario_name": f"Gap Closure: {measure.name if measure else measure_code}",
        "scenario_type": "gap_closure",
        "current_state": {
            "measure": measure_code,
            "measure_name": measure.name if measure else measure_code,
            "total_eligible": total_eligible,
            "current_open": current_open,
            "current_closed": current_closed,
            "closure_rate": round(current_rate, 1),
            "stars_weight": stars_weight,
        },
        "projected_state": {
            "gaps_closed": min(gaps_to_close, current_open),
            "new_closure_rate": round(new_rate, 1),
            "rate_improvement": round(rate_improvement, 1),
            "estimated_stars_impact": round(stars_impact, 2),
        },
        "financial_impact": {
            "annual_stars_revenue": round(annual_stars_revenue, 2),
            "per_gap_value": round(annual_stars_revenue / max(gaps_to_close, 1), 2),
            "quality_bonus_impact": round(annual_stars_revenue, 2),
        },
        "timeline": "3-9 months for outreach and closure",
        "assumptions": [
            f"Closing {min(gaps_to_close, current_open)} of {current_open} open gaps",
            f"Stars weight: {stars_weight}x",
            f"Total eligible members: {total_eligible}",
            "Stars revenue estimate based on $40/member/star weight",
        ],
        "confidence": 75,
    }


async def _scenario_membership_change(db: AsyncSession, params: dict) -> dict:
    """If we gain/lose N members with avg RAF X, revenue impact?"""
    member_delta = params.get("member_delta", 500)
    avg_raf = params.get("avg_raf", 1.2)

    today = date.today()
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    pop_q = await db.execute(
        select(
            func.count(Member.id),
            func.avg(Member.current_raf),
            func.sum(Member.current_raf),
        ).where(active_filter)
    )
    pop_row = pop_q.one()
    current_lives = max(_safe_int(pop_row[0]), 1)
    current_avg_raf = _safe_float(pop_row[1])
    current_total_raf = _safe_float(pop_row[2])

    current_revenue = current_total_raf * CMS_MONTHLY_BASE * 12

    new_lives = current_lives + member_delta
    new_total_raf = current_total_raf + (member_delta * avg_raf)
    new_avg_raf = new_total_raf / max(new_lives, 1)
    new_revenue = new_total_raf * CMS_MONTHLY_BASE * 12

    return {
        "scenario_name": f"Membership {'Growth' if member_delta > 0 else 'Decline'}",
        "scenario_type": "membership_change",
        "current_state": {
            "total_lives": current_lives,
            "avg_raf": round(current_avg_raf, 3),
            "annual_revenue": round(current_revenue, 2),
        },
        "projected_state": {
            "total_lives": new_lives,
            "avg_raf": round(new_avg_raf, 3),
            "annual_revenue": round(new_revenue, 2),
            "member_delta": member_delta,
        },
        "financial_impact": {
            "annual_revenue_change": round(new_revenue - current_revenue, 2),
            "monthly_revenue_change": round((new_revenue - current_revenue) / 12, 2),
            "revenue_per_new_member": round(avg_raf * CMS_MONTHLY_BASE * 12, 2),
        },
        "timeline": "Immediate upon membership change",
        "assumptions": [
            f"{'Adding' if member_delta > 0 else 'Losing'} {abs(member_delta)} members",
            f"Average RAF of new members: {avg_raf}",
            f"CMS base rate: ${CMS_MONTHLY_BASE}/member/month",
        ],
        "confidence": 85,
    }


async def _scenario_cost_reduction(db: AsyncSession, params: dict) -> dict:
    """If we reduce category X spend by Y%, total savings?"""
    category = params.get("category", "inpatient")
    reduction_pct = params.get("reduction_pct", 10) / 100

    cat_q = await db.execute(
        select(
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category == category)
    )
    cat_row = cat_q.one()
    current_spend = _safe_float(cat_row.total_spend)
    claim_count = _safe_int(cat_row.claim_count)

    total_q = await db.execute(
        select(func.sum(Claim.paid_amount)).where(Claim.service_category.is_not(None))
    )
    total_spend = _safe_float(total_q.scalar())

    savings = current_spend * reduction_pct
    new_spend = current_spend - savings
    new_total = total_spend - savings

    return {
        "scenario_name": f"Reduce {category.replace('_', ' ').title()} Spend",
        "scenario_type": "cost_reduction",
        "current_state": {
            "category": category,
            "category_spend": round(current_spend, 2),
            "total_spend": round(total_spend, 2),
            "pct_of_total": round(current_spend / max(total_spend, 1) * 100, 1),
            "claim_count": claim_count,
        },
        "projected_state": {
            "category_spend": round(new_spend, 2),
            "total_spend": round(new_total, 2),
            "reduction_pct": round(reduction_pct * 100, 1),
        },
        "financial_impact": {
            "annual_savings": round(savings, 2),
            "monthly_savings": round(savings / 12, 2),
            "mlr_impact_pct": round(savings / max(total_spend, 1) * 100, 2),
        },
        "timeline": "6-12 months for utilization management programs",
        "assumptions": [
            f"Reducing {category} spend by {reduction_pct*100:.0f}%",
            f"Current {category} spend: ${current_spend:,.0f}",
            "Assumes no shift to other categories",
        ],
        "confidence": 70,
    }


async def _scenario_provider_education(db: AsyncSession, params: dict) -> dict:
    """If bottom quartile providers improve to median, impact?"""
    prov_q = await db.execute(
        select(
            Provider.id,
            Provider.first_name,
            Provider.last_name,
            Provider.panel_size,
            Provider.capture_rate,
            Provider.recapture_rate,
            Provider.gap_closure_rate,
            Provider.panel_pmpm,
        )
        .where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
        .order_by(Provider.capture_rate.asc().nulls_last())
    )
    all_providers = prov_q.all()

    if not all_providers:
        return {"error": "No provider data available"}

    # Calculate quartiles
    capture_rates = sorted([_safe_float(p.capture_rate) for p in all_providers if p.capture_rate])
    gap_rates = sorted([_safe_float(p.gap_closure_rate) for p in all_providers if p.gap_closure_rate])

    def _percentile(vals, p):
        if not vals:
            return 0
        idx = int(len(vals) * p)
        return vals[min(idx, len(vals) - 1)]

    median_capture = _percentile(capture_rates, 0.5)
    q25_capture = _percentile(capture_rates, 0.25)
    median_gap = _percentile(gap_rates, 0.5)

    # Bottom quartile providers
    bottom_q_providers = [
        p for p in all_providers
        if _safe_float(p.capture_rate) <= q25_capture
    ]

    # Calculate improvement impact
    total_additional_captures = 0
    total_panel_affected = 0
    for p in bottom_q_providers:
        current_rate = _safe_float(p.capture_rate) / 100
        target_rate = median_capture / 100
        panel = _safe_int(p.panel_size)
        improvement = (target_rate - current_rate) * panel
        total_additional_captures += max(improvement, 0)
        total_panel_affected += panel

    # Estimate RAF per additional capture
    avg_suspect_raf_q = await db.execute(
        select(func.avg(HccSuspect.raf_value))
        .where(HccSuspect.status == SuspectStatus.open.value)
    )
    avg_suspect_raf = _safe_float(avg_suspect_raf_q.scalar()) or 0.15

    additional_raf = total_additional_captures * avg_suspect_raf
    additional_revenue = additional_raf * CMS_MONTHLY_BASE * 12

    return {
        "scenario_name": "Provider Education Initiative",
        "scenario_type": "provider_education",
        "current_state": {
            "bottom_quartile_count": len(bottom_q_providers),
            "bottom_quartile_avg_capture": round(q25_capture, 1),
            "median_capture_rate": round(median_capture, 1),
            "total_panel_affected": total_panel_affected,
        },
        "projected_state": {
            "target_capture_rate": round(median_capture, 1),
            "additional_captures": round(total_additional_captures),
            "additional_raf": round(additional_raf, 2),
        },
        "financial_impact": {
            "annual_revenue_uplift": round(additional_revenue, 2),
            "monthly_revenue_uplift": round(additional_revenue / 12, 2),
            "per_provider_impact": round(additional_revenue / max(len(bottom_q_providers), 1), 2),
        },
        "timeline": "6-12 months for training and behavior change",
        "assumptions": [
            f"{len(bottom_q_providers)} bottom-quartile providers improving to median",
            f"Median capture rate: {median_capture:.1f}%",
            f"Avg suspect RAF value: {avg_suspect_raf:.3f}",
            f"Total panel members affected: {total_panel_affected}",
        ],
        "confidence": 68,
    }
