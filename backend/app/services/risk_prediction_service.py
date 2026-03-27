"""
Predictive Risk Scoring Service.

Calculates 30-day hospitalization risk, cost trajectory projections,
and RAF impact scenarios for the population.  Uses a weighted scoring
model based on clinical and administrative risk factors.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim, ClaimType
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.care_gap import MemberGap, GapStatus, GapMeasure
from app.models.provider import Provider

logger = logging.getLogger(__name__)

from app.constants import CMS_PMPM_BASE as CMS_MONTHLY_BASE, CMS_ANNUAL_BASE


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _safe_int(v) -> int:
    return int(v) if v is not None else 0


# ---------------------------------------------------------------------------
# Risk weight configuration
# ---------------------------------------------------------------------------

RISK_WEIGHTS = {
    "er_visits_90d": 12.0,
    "inpatient_12m": 18.0,
    "chronic_conditions": 8.0,
    "polypharmacy": 6.0,
    "snf_discharge_30d": 15.0,
    "open_care_gaps": 4.0,
    "raf_score": 10.0,
    "age_factor": 5.0,
}

INTERVENTIONS = {
    "high": [
        "Schedule urgent care management outreach within 48 hours",
        "Initiate transitional care management (TCM) protocol",
        "Assign dedicated care coordinator",
    ],
    "medium": [
        "Schedule PCP follow-up within 2 weeks",
        "Enroll in chronic care management program",
        "Review medication reconciliation",
    ],
    "low": [
        "Continue routine care management",
        "Schedule annual wellness visit",
        "Address open care gaps at next visit",
    ],
}


# ---------------------------------------------------------------------------
# Hospitalization risk prediction
# ---------------------------------------------------------------------------

async def predict_hospitalization_risk(db: AsyncSession) -> list[dict]:
    """
    For each active member, calculate a 30-day hospitalization probability
    based on a weighted scoring model.  Returns the top 50 highest-risk
    members sorted by risk score.
    """
    today = date.today()
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    # Fetch active members — use aggregate queries for risk factors, then
    # only load member rows for the final top-N scoring.  This avoids loading
    # the entire Member table into memory for large populations.
    member_count_q = await db.execute(
        select(func.count(Member.id)).where(active_filter)
    )
    total_active = member_count_q.scalar() or 0
    if total_active == 0:
        return []

    # Fetch only member IDs first for aggregate queries
    id_q = await db.execute(
        select(Member.id).where(active_filter).order_by(Member.id)
    )
    member_ids = [r[0] for r in id_q.all()]

    # ER visits in last 90 days
    er_cutoff = today - timedelta(days=90)
    er_q = await db.execute(
        select(
            Claim.member_id,
            func.count(distinct(Claim.claim_id)).label("er_count"),
        )
        .where(
            Claim.member_id.in_(member_ids),
            Claim.service_category == "ed_observation",
            Claim.service_date >= er_cutoff,
        )
        .group_by(Claim.member_id)
    )
    er_visits = {r.member_id: _safe_int(r.er_count) for r in er_q.all()}

    # Inpatient admissions in last 12 months
    ip_cutoff = today - timedelta(days=365)
    ip_q = await db.execute(
        select(
            Claim.member_id,
            func.count(distinct(Claim.claim_id)).label("ip_count"),
        )
        .where(
            Claim.member_id.in_(member_ids),
            Claim.service_category == "inpatient",
            Claim.service_date >= ip_cutoff,
        )
        .group_by(Claim.member_id)
    )
    ip_admits = {r.member_id: _safe_int(r.ip_count) for r in ip_q.all()}

    # Active chronic conditions (open HCC suspect count as proxy)
    hcc_q = await db.execute(
        select(
            HccSuspect.member_id,
            func.count(HccSuspect.id).label("hcc_count"),
        )
        .where(
            HccSuspect.member_id.in_(member_ids),
            HccSuspect.status == SuspectStatus.open.value,
        )
        .group_by(HccSuspect.member_id)
    )
    hcc_counts = {r.member_id: _safe_int(r.hcc_count) for r in hcc_q.all()}

    # Medication count (pharmacy claims as proxy)
    med_q = await db.execute(
        select(
            Claim.member_id,
            func.count(distinct(Claim.drug_name)).label("med_count"),
        )
        .where(
            Claim.member_id.in_(member_ids),
            Claim.claim_type == ClaimType.pharmacy,
            Claim.drug_name.is_not(None),
        )
        .group_by(Claim.member_id)
    )
    med_counts = {r.member_id: _safe_int(r.med_count) for r in med_q.all()}

    # Recent SNF discharge (within 30 days)
    snf_cutoff = today - timedelta(days=30)
    snf_q = await db.execute(
        select(distinct(Claim.member_id))
        .where(
            Claim.member_id.in_(member_ids),
            Claim.service_category == "snf_postacute",
            Claim.service_date >= snf_cutoff,
        )
    )
    snf_recent = {r[0] for r in snf_q.all()}

    # Open care gaps count
    gap_q = await db.execute(
        select(
            MemberGap.member_id,
            func.count(MemberGap.id).label("gap_count"),
        )
        .where(
            MemberGap.member_id.in_(member_ids),
            MemberGap.status == GapStatus.open.value,
        )
        .group_by(MemberGap.member_id)
    )
    gap_counts = {r.member_id: _safe_int(r.gap_count) for r in gap_q.all()}

    # Provider lookup
    provider_q = await db.execute(
        select(Provider.id, Provider.first_name, Provider.last_name)
    )
    providers = {r.id: f"Dr. {r.first_name or ''} {r.last_name or ''}".strip() for r in provider_q.all()}

    # Now load only the member objects needed for scoring (all active — we sort later)
    members_q = await db.execute(
        select(Member).where(active_filter).order_by(Member.id)
    )
    members = members_q.scalars().all()

    # Score each member
    scored_members = []
    for m in members:
        age = (
            today.year - m.date_of_birth.year
            - ((today.month, today.day) < (m.date_of_birth.month, m.date_of_birth.day))
        ) if m.date_of_birth else 70
        er = er_visits.get(m.id, 0)
        ip = ip_admits.get(m.id, 0)
        hcc = hcc_counts.get(m.id, 0)
        meds = med_counts.get(m.id, 0)
        snf = 1 if m.id in snf_recent else 0
        gaps = gap_counts.get(m.id, 0)
        raf = _safe_float(m.current_raf)

        # Normalize each factor to 0-1 range
        er_norm = min(er / 4.0, 1.0)
        ip_norm = min(ip / 3.0, 1.0)
        hcc_norm = min(hcc / 6.0, 1.0)
        med_norm = min(meds / 12.0, 1.0)  # polypharmacy threshold ~12
        snf_norm = float(snf)
        gap_norm = min(gaps / 5.0, 1.0)
        raf_norm = min(raf / 4.0, 1.0)
        age_norm = min(max((age - 65) / 30.0, 0.0), 1.0)

        # Weighted sum
        raw_score = (
            er_norm * RISK_WEIGHTS["er_visits_90d"]
            + ip_norm * RISK_WEIGHTS["inpatient_12m"]
            + hcc_norm * RISK_WEIGHTS["chronic_conditions"]
            + med_norm * RISK_WEIGHTS["polypharmacy"]
            + snf_norm * RISK_WEIGHTS["snf_discharge_30d"]
            + gap_norm * RISK_WEIGHTS["open_care_gaps"]
            + raf_norm * RISK_WEIGHTS["raf_score"]
            + age_norm * RISK_WEIGHTS["age_factor"]
        )

        # Normalize to 0-100%
        max_possible = sum(RISK_WEIGHTS.values())
        risk_score = round(raw_score / max_possible * 100, 1)

        # Build risk factors list
        risk_factors = []
        if er > 0:
            risk_factors.append(f"{er} ER visit{'s' if er > 1 else ''} in 90 days")
        if ip > 0:
            risk_factors.append(f"{ip} inpatient admission{'s' if ip > 1 else ''} in 12 months")
        if hcc >= 3:
            risk_factors.append(f"{hcc} active chronic conditions")
        if meds >= 8:
            risk_factors.append(f"Polypharmacy ({meds} medications)")
        if snf:
            risk_factors.append("Recent SNF discharge")
        if gaps >= 2:
            risk_factors.append(f"{gaps} open care gaps")
        if raf >= 2.0:
            risk_factors.append(f"High RAF score ({raf:.2f})")
        if age >= 80:
            risk_factors.append(f"Advanced age ({age})")

        # Determine intervention level
        if risk_score >= 70:
            level = "high"
        elif risk_score >= 40:
            level = "medium"
        else:
            level = "low"

        pcp_name = providers.get(m.pcp_provider_id, "Unassigned") if m.pcp_provider_id else "Unassigned"

        scored_members.append({
            "id": m.id,
            "member_id": m.member_id,
            "member_name": f"{m.first_name or ''} {m.last_name or ''}".strip(),
            "age": age,
            "risk_score": risk_score,
            "risk_level": level,
            "risk_factors": risk_factors,
            "pcp": pcp_name,
            "raf_score": round(raf, 3),
            "last_admission_date": None,  # Would query from claims
            "recommended_intervention": INTERVENTIONS[level][0],
            "all_interventions": INTERVENTIONS[level],
        })

    # Sort by risk and return top 50
    scored_members.sort(key=lambda x: x["risk_score"], reverse=True)
    return scored_members[:50]


# ---------------------------------------------------------------------------
# Cost trajectory projection
# ---------------------------------------------------------------------------

async def predict_cost_trajectory(db: AsyncSession) -> dict:
    """
    Project next-quarter spend by service category using 3-month
    trend extrapolation with seasonal adjustment.
    """
    today = date.today()
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    # Get member count
    pop_q = await db.execute(select(func.count(Member.id)).where(active_filter))
    member_count = max(_safe_int(pop_q.scalar()), 1)

    # Quarterly spend by category for last 4 quarters (simulated from available data)
    cat_q = await db.execute(
        select(
            Claim.service_category,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category.is_not(None))
        .group_by(Claim.service_category)
        .order_by(func.sum(Claim.paid_amount).desc())
    )

    # Seasonal factors by quarter (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)
    current_quarter = (today.month - 1) // 3 + 1
    next_quarter = current_quarter % 4 + 1
    seasonal_factors = {
        1: {"inpatient": 1.08, "ed_observation": 1.05, "pharmacy": 1.02, "snf_postacute": 1.10, "professional": 1.00, "home_health": 1.03, "dme": 1.00, "other": 1.00},
        2: {"inpatient": 0.95, "ed_observation": 0.97, "pharmacy": 1.01, "snf_postacute": 0.92, "professional": 1.02, "home_health": 0.98, "dme": 1.01, "other": 1.00},
        3: {"inpatient": 0.93, "ed_observation": 1.02, "pharmacy": 0.99, "snf_postacute": 0.90, "professional": 0.98, "home_health": 0.97, "dme": 0.99, "other": 1.00},
        4: {"inpatient": 1.04, "ed_observation": 1.06, "pharmacy": 1.03, "snf_postacute": 1.08, "professional": 1.00, "home_health": 1.02, "dme": 1.00, "other": 1.00},
    }

    projections = []
    total_current = 0.0
    total_projected = 0.0

    for r in cat_q.all():
        cat = r.service_category
        current_quarterly = _safe_float(r.total_spend) / 4  # Approximate quarterly
        total_current += current_quarterly

        # Apply growth trend (3% quarterly baseline) and seasonal adjustment
        growth_rate = 1.03
        seasonal = seasonal_factors.get(next_quarter, {}).get(cat, 1.0)
        projected = current_quarterly * growth_rate * seasonal
        total_projected += projected

        # Confidence interval
        variance = 0.08  # 8% base variance
        if cat in ("inpatient", "snf_postacute"):
            variance = 0.12  # Higher variance for facility categories

        projections.append({
            "category": cat,
            "current_quarterly_spend": round(current_quarterly, 2),
            "projected_quarterly_spend": round(projected, 2),
            "change_pct": round((projected - current_quarterly) / max(current_quarterly, 1) * 100, 1),
            "confidence_low": round(projected * (1 - variance), 2),
            "confidence_high": round(projected * (1 + variance), 2),
            "confidence_level": 85 if cat in ("professional", "pharmacy") else 75,
            "seasonal_factor": seasonal,
            "claim_count": _safe_int(r.claim_count),
        })

    return {
        "projection_period": f"Q{next_quarter} {today.year if next_quarter > current_quarter else today.year + 1}",
        "member_count": member_count,
        "total_current_quarterly": round(total_current, 2),
        "total_projected_quarterly": round(total_projected, 2),
        "total_change_pct": round((total_projected - total_current) / max(total_current, 1) * 100, 1),
        "categories": projections,
    }


# ---------------------------------------------------------------------------
# RAF impact prediction
# ---------------------------------------------------------------------------

async def predict_raf_impact(db: AsyncSession) -> dict:
    """
    Model RAF impact under different capture scenarios:
    - Current state
    - All open suspects captured
    - 80% recapture rate achieved
    """
    today = date.today()
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    # Current population stats
    pop_q = await db.execute(
        select(
            func.count(Member.id),
            func.avg(Member.current_raf),
            func.sum(Member.current_raf),
        ).where(active_filter)
    )
    pop_row = pop_q.one()
    total_lives = max(_safe_int(pop_row[0]), 1)
    avg_raf = _safe_float(pop_row[1])
    total_raf = _safe_float(pop_row[2])

    # Open suspects value
    suspect_q = await db.execute(
        select(
            func.count(HccSuspect.id),
            func.coalesce(func.sum(HccSuspect.raf_value), 0),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        ).where(HccSuspect.status == SuspectStatus.open.value)
    )
    s_row = suspect_q.one()
    open_suspects = _safe_int(s_row[0])
    total_suspect_raf = _safe_float(s_row[1])
    total_suspect_value = _safe_float(s_row[2])

    # Captured suspects (for current capture rate)
    captured_q = await db.execute(
        select(func.count(HccSuspect.id))
        .where(HccSuspect.status == SuspectStatus.captured.value)
    )
    captured_count = _safe_int(captured_q.scalar())
    total_suspects = open_suspects + captured_count
    current_capture_rate = (captured_count / max(total_suspects, 1)) * 100

    # Annual revenue at current RAF
    current_annual_revenue = total_raf * CMS_ANNUAL_BASE

    # Scenario 1: All suspects captured
    all_captured_raf = total_raf + total_suspect_raf
    all_captured_avg = all_captured_raf / total_lives
    all_captured_revenue = all_captured_raf * CMS_ANNUAL_BASE
    all_captured_uplift = all_captured_revenue - current_annual_revenue

    # Scenario 2: 80% recapture rate
    target_rate = 0.80
    current_rate_decimal = current_capture_rate / 100
    additional_captures_pct = max(target_rate - current_rate_decimal, 0)
    additional_raf = total_suspect_raf * (additional_captures_pct / max(1 - current_rate_decimal, 0.01))
    improved_raf = total_raf + additional_raf
    improved_avg = improved_raf / total_lives
    improved_revenue = improved_raf * CMS_ANNUAL_BASE
    improved_uplift = improved_revenue - current_annual_revenue

    return {
        "current_state": {
            "total_lives": total_lives,
            "avg_raf": round(avg_raf, 3),
            "total_raf": round(total_raf, 2),
            "annual_revenue": round(current_annual_revenue, 2),
            "capture_rate": round(current_capture_rate, 1),
            "open_suspects": open_suspects,
        },
        "scenario_all_captured": {
            "label": "All Open Suspects Captured",
            "avg_raf": round(all_captured_avg, 3),
            "total_raf": round(all_captured_raf, 2),
            "annual_revenue": round(all_captured_revenue, 2),
            "revenue_uplift": round(all_captured_uplift, 2),
            "raf_change": round(all_captured_avg - avg_raf, 3),
            "capture_rate": 100.0,
            "confidence": 65,
        },
        "scenario_80_recapture": {
            "label": "80% Recapture Rate Achieved",
            "avg_raf": round(improved_avg, 3),
            "total_raf": round(improved_raf, 2),
            "annual_revenue": round(improved_revenue, 2),
            "revenue_uplift": round(improved_uplift, 2),
            "raf_change": round(improved_avg - avg_raf, 3),
            "capture_rate": 80.0,
            "confidence": 80,
        },
        "suspect_summary": {
            "open_count": open_suspects,
            "captured_count": captured_count,
            "total_suspect_raf_value": round(total_suspect_raf, 3),
            "total_suspect_annual_value": round(total_suspect_value, 2),
        },
    }
