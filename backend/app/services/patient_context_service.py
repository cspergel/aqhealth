"""
Patient Context Service — assembles the complete patient picture for the
Provider Clinical View (Mode 2).

Provides two main functions:
  - get_patient_context(): Everything about a single patient in one call
  - get_provider_worklist(): Provider's prioritized patient list
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care_gap import GapStatus, MemberGap, GapMeasure
from app.models.claim import Claim, ClaimType
from app.models.hcc import HccSuspect, RafHistory, SuspectStatus
from app.models.member import Member, RiskTier
from app.models.provider import Provider
from app.constants import CMS_ANNUAL_BASE, CMS_PMPM_BASE
from app.services.county_rate_service import get_member_annual_value as _county_annual_value
from app.services.hcc_engine import (
    DISEASE_INTERACTIONS,
    LOCAL_HCC_RAF,
    MED_DX_MAPPINGS,
    _calculate_age,
    _detect_near_miss_interactions,
    _extract_current_year_codes,
    _extract_diagnosis_codes,
    _extract_medications,
    ANNUAL_MULTIPLIER,
    get_current_payment_year,
)

logger = logging.getLogger(__name__)


def _annual_value(raf: float | Decimal, member: Any = None) -> float:
    """Convert RAF to annual dollar value, using county rate if member is provided."""
    if member is not None:
        try:
            year = get_current_payment_year()
            return _county_annual_value(year, member, float(raf))
        except Exception:
            pass  # fall back to national average
    return round(float(Decimal(str(raf)) * Decimal(str(CMS_ANNUAL_BASE))), 2)


# ---------------------------------------------------------------------------
# Patient context
# ---------------------------------------------------------------------------

async def get_patient_context(db: AsyncSession, member_id: int) -> dict[str, Any]:
    """
    Returns EVERYTHING about a patient in one call — demographics, RAF
    breakdown, suspects, confirmed HCCs, care gaps, interactions, medications,
    recent encounters, risk scores, and AI visit prep narrative.
    """
    member = await db.get(Member, member_id)
    if not member:
        return {"error": "Member not found"}

    age = _calculate_age(member.date_of_birth)

    # ---- Provider info ----
    pcp_name = None
    if member.pcp_provider_id:
        pcp = await db.get(Provider, member.pcp_provider_id)
        if pcp:
            pcp_name = f"Dr. {pcp.first_name or ''} {pcp.last_name or ''}".strip()

    # ---- Demographics ----
    demographics = {
        "id": member.id,
        "member_id": member.member_id,
        "first_name": member.first_name,
        "last_name": member.last_name,
        "name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
        "age": age,
        "dob": member.date_of_birth.isoformat() if member.date_of_birth else None,
        "gender": member.gender,
        "insurance": member.health_plan or "Unknown",
        "plan_product": member.plan_product,
        "pcp": pcp_name,
        "pcp_provider_id": member.pcp_provider_id,
    }

    # ---- RAF breakdown ----
    latest_raf_result = await db.execute(
        select(RafHistory)
        .where(RafHistory.member_id == member_id)
        .order_by(RafHistory.calculation_date.desc())
        .limit(1)
    )
    latest_raf = latest_raf_result.scalars().first()

    current_raf = float(member.current_raf) if member.current_raf else 0.0
    projected_raf = float(member.projected_raf) if member.projected_raf else current_raf
    delta = round(projected_raf - current_raf, 3)

    raf_breakdown = {
        "demographic_raf": float(latest_raf.demographic_raf) if latest_raf else 0.0,
        "disease_raf": float(latest_raf.disease_raf) if latest_raf else current_raf,
        "interaction_raf": float(latest_raf.interaction_raf) if latest_raf else 0.0,
        "total_raf": current_raf,
        "projected_raf": projected_raf,
        "delta": delta,
        "current_annual_value": _annual_value(current_raf, member),
        "projected_annual_value": _annual_value(projected_raf, member),
    }

    # ---- Suspect HCCs ----
    suspects_result = await db.execute(
        select(HccSuspect).where(
            HccSuspect.member_id == member_id,
            HccSuspect.payment_year == get_current_payment_year(),
            HccSuspect.status == SuspectStatus.open.value,
        )
    )
    suspects_raw = suspects_result.scalars().all()
    suspects = [
        {
            "id": s.id,
            "condition_name": s.icd10_label or s.hcc_label or "",
            "icd10_code": s.icd10_code,
            "hcc_code": s.hcc_code,
            "raf_value": float(s.raf_value or 0),
            "annual_value": float(s.annual_value) if s.annual_value else _annual_value(s.raf_value or 0, member),
            "evidence_summary": s.evidence_summary or "",
            "confidence": s.confidence or 0,
            "suspect_type": s.suspect_type if s.suspect_type else "unknown",
        }
        for s in suspects_raw
    ]

    # ---- Confirmed HCCs (from current-year claims) ----
    claims_result = await db.execute(
        select(Claim).where(
            Claim.member_id == member_id,
            Claim.service_date >= date(get_current_payment_year(), 1, 1),
        )
    )
    current_claims = claims_result.scalars().all()

    # Build confirmed HCC list from captured suspects
    confirmed_result = await db.execute(
        select(HccSuspect).where(
            HccSuspect.member_id == member_id,
            HccSuspect.payment_year == get_current_payment_year(),
            HccSuspect.status == SuspectStatus.captured.value,
        )
    )
    confirmed_raw = confirmed_result.scalars().all()
    confirmed_hccs = [
        {
            "condition_name": c.icd10_label or c.hcc_label or "",
            "icd10_code": c.icd10_code,
            "hcc_code": c.hcc_code,
            "raf_value": float(c.raf_value or 0),
        }
        for c in confirmed_raw
    ]

    # ---- Care gaps ----
    gaps_result = await db.execute(
        select(MemberGap, GapMeasure)
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .where(
            MemberGap.member_id == member_id,
            MemberGap.status == GapStatus.open.value,
        )
    )
    care_gaps = [
        {
            "id": gap.id,
            "measure_name": measure.name,
            "measure_code": measure.code,
            "stars_weight": measure.stars_weight,
            "recommended_action": measure.description or "Close gap",
        }
        for gap, measure in gaps_result.all()
    ]

    # ---- Disease interactions ----
    member_hccs: set[int] = set()
    for c in confirmed_raw:
        if c.hcc_code:
            member_hccs.add(c.hcc_code)
    for s in suspects_raw:
        if s.hcc_code and s.hcc_code > 0:
            member_hccs.add(s.hcc_code)

    active_interactions = []
    for name, hcc_groups, bonus_raf in DISEASE_INTERACTIONS:
        if all(member_hccs & group for group in hcc_groups):
            active_interactions.append({
                "name": name,
                "bonus_raf": float(bonus_raf),
                "codes": " + ".join(
                    f"HCC {sorted(member_hccs & group)[0]}" for group in hcc_groups
                ),
            })

    near_misses = _detect_near_miss_interactions(member_hccs)

    # ---- Medications ----
    all_claims_result = await db.execute(
        select(Claim).where(Claim.member_id == member_id).order_by(Claim.service_date.desc())
    )
    all_claims = all_claims_result.scalars().all()
    all_dx = _extract_diagnosis_codes(all_claims)
    medications_raw = _extract_medications(all_claims)

    medications = []
    dx_normalized = {c.upper().replace(".", "")[:3] for c in all_dx}
    for med in medications_raw:
        # Check if the medication has a matching diagnosis code family
        # using the MED_DX_MAPPINGS from hcc_engine
        has_dx = False
        for med_keyword, _desc, icd10, _hcc, _label, _raf in MED_DX_MAPPINGS:
            if med_keyword in med:
                family_prefix = icd10.upper().replace(".", "")[:3]
                if family_prefix in dx_normalized:
                    has_dx = True
                break  # matched the medication keyword, no need to check further
        medications.append({
            "drug_name": med.title(),
            "has_matching_dx": has_dx,
        })

    # ---- Recent encounters (last 12 months) ----
    twelve_months_ago = date.today() - timedelta(days=365)
    encounters_result = await db.execute(
        select(Claim)
        .where(Claim.member_id == member_id, Claim.service_date >= twelve_months_ago)
        .order_by(Claim.service_date.desc())
        .limit(20)
    )
    encounter_claims = encounters_result.scalars().all()
    encounters = [
        {
            "date": c.service_date.isoformat() if c.service_date else None,
            "type": c.claim_type if c.claim_type else "unknown",
            "facility": c.facility_name or "Unknown",
            "provider": str(c.rendering_provider_id) if c.rendering_provider_id else "Unknown",
            "diagnoses": c.diagnosis_codes or [],
            "cost": float(c.paid_amount) if c.paid_amount else 0.0,
        }
        for c in encounter_claims
    ]

    # ---- Risk scores ----
    HOSP_RISK = {"low": 5.0, "rising": 10.0, "high": 15.0, "complex": 28.0}
    risk_tier = member.risk_tier if member.risk_tier else "low"
    hospitalization_risk = HOSP_RISK.get(risk_tier, 5.0)

    # ---- AI visit prep (generated narrative) ----
    visit_prep = _generate_visit_prep(suspects, care_gaps, near_misses, raf_breakdown)

    return {
        "demographics": demographics,
        "raf": raf_breakdown,
        "suspects": suspects,
        "confirmed_hccs": confirmed_hccs,
        "care_gaps": care_gaps,
        "interactions": active_interactions,
        "near_misses": near_misses,
        "medications": medications,
        "encounters": encounters[:10],
        "risk": {
            "tier": risk_tier,
            "hospitalization_risk_pct": hospitalization_risk,
        },
        "visit_prep": visit_prep,
    }


def _generate_visit_prep(
    suspects: list[dict],
    care_gaps: list[dict],
    near_misses: list[dict],
    raf: dict,
) -> str:
    """Generate an AI visit prep narrative prioritized by dollar impact."""
    lines = []

    # Suspects sorted by value
    sorted_suspects = sorted(suspects, key=lambda s: s.get("annual_value", 0), reverse=True)
    if sorted_suspects:
        top = sorted_suspects[0]
        lines.append(
            f"Capturing suspected {top['condition_name']} "
            f"({top.get('icd10_code', '')}, HCC {top['hcc_code']}) "
            f"adds ${top['annual_value']:,.0f}/year. "
            f"{top.get('evidence_summary', '')}"
        )

    # Care gaps
    high_weight_gaps = [g for g in care_gaps if g.get("stars_weight", 1) >= 3]
    if high_weight_gaps:
        gap_names = ", ".join(g["measure_code"] for g in high_weight_gaps[:3])
        lines.append(
            f"Triple-weighted Star measures needing closure: {gap_names}. "
            "These directly impact plan quality ratings."
        )

    # Near misses
    if near_misses:
        nm = near_misses[0]
        lines.append(
            f"Near-miss interaction: documenting conditions in the "
            f"{nm['name']} group would trigger an additional "
            f"+{nm['potential_raf']:.3f} RAF bonus."
        )

    if not lines:
        lines.append(
            "Patient has well-documented conditions. Focus on care gap "
            "closure and medication reconciliation today."
        )

    return " ".join(lines)


# ---------------------------------------------------------------------------
# Provider worklist
# ---------------------------------------------------------------------------

async def get_provider_worklist(
    db: AsyncSession, provider_id: int
) -> list[dict[str, Any]]:
    """
    Returns the provider's patient list sorted by composite priority score.
    Priority = RAF uplift opportunity x care gap count x recapture urgency x days since last visit.

    Uses a single query with LEFT JOIN and GROUP BY to avoid N+1 queries.
    """
    # Subquery for suspect counts per member
    suspect_sub = (
        select(
            HccSuspect.member_id,
            func.count(HccSuspect.id).label("suspect_count"),
        )
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.member_id)
        .subquery()
    )

    # Subquery for gap counts per member
    gap_sub = (
        select(
            MemberGap.member_id,
            func.count(MemberGap.id).label("gap_count"),
        )
        .where(MemberGap.status == GapStatus.open.value)
        .group_by(MemberGap.member_id)
        .subquery()
    )

    # Single query joining members with counts
    query = (
        select(
            Member,
            func.coalesce(suspect_sub.c.suspect_count, 0).label("suspect_count"),
            func.coalesce(gap_sub.c.gap_count, 0).label("gap_count"),
        )
        .outerjoin(suspect_sub, Member.id == suspect_sub.c.member_id)
        .outerjoin(gap_sub, Member.id == gap_sub.c.member_id)
        .where(Member.pcp_provider_id == provider_id)
    )

    result = await db.execute(query)
    rows = result.all()

    worklist = []
    for row in rows:
        m = row[0]
        suspect_count = row.suspect_count
        gap_count = row.gap_count

        # RAF uplift
        current = float(m.current_raf or 0)
        projected = float(m.projected_raf or current)
        uplift = projected - current

        # Priority score
        priority_score = (
            max(uplift, 0.01)
            * max(gap_count, 1)
            * max(suspect_count, 1)
        )

        # Priority reason
        reasons = []
        if uplift > 0.3:
            reasons.append(f"+{uplift:.3f} RAF uplift")
        if suspect_count > 0:
            reasons.append(f"{suspect_count} suspects")
        if gap_count > 0:
            reasons.append(f"{gap_count} open gaps")
        if not reasons:
            reasons.append("Routine visit")

        age = _calculate_age(m.date_of_birth)

        worklist.append({
            "id": m.id,
            "member_id": m.id,
            "member_external_id": m.member_id or "",
            "name": f"{m.first_name or ''} {m.last_name or ''}".strip(),
            "age": age,
            "gender": m.gender,
            "current_raf": current,
            "projected_raf": projected,
            "suspect_count": suspect_count,
            "gap_count": gap_count,
            "priority_score": round(priority_score, 3),
            "priority_reason": ", ".join(reasons),
            "risk_tier": m.risk_tier if m.risk_tier else "low",
        })

    worklist.sort(key=lambda x: x["priority_score"], reverse=True)
    return worklist
