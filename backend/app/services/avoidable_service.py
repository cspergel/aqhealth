"""
Avoidable Admission Analysis service.

Classification of ER visits and admissions by avoidability,
with dollar-impact estimates and education opportunity identification.
"""

import logging
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.claim import Claim
from app.models.member import Member

logger = logging.getLogger(__name__)

# Simple list of avoidable diagnosis prefixes (ICD-10)
# These are conditions commonly treated in primary care settings
AVOIDABLE_DX_MAP: dict[str, str] = {
    "J06": "URI (Upper Respiratory Infection)",
    "J00": "URI (Acute Nasopharyngitis)",
    "J02": "URI (Acute Pharyngitis)",
    "J03": "URI (Acute Tonsillitis)",
    "J20": "URI (Acute Bronchitis)",
    "N39": "UTI (Urinary Tract Infection)",
    "N30": "UTI (Cystitis)",
    "M54": "Back Pain",
    "M79": "Soft Tissue Pain",
    "S01": "Minor Laceration (Head)",
    "S61": "Minor Laceration (Hand/Wrist)",
    "S81": "Minor Laceration (Lower Leg)",
    "R51": "Headache",
    "G43": "Migraine",
}

# Average ER visit cost for savings estimates
AVG_ER_COST = 2_200
AVG_PCP_COST = 150


def _classify_avoidable(diagnosis_codes: list[str] | None) -> str | None:
    """Return avoidable reason if any diagnosis matches, else None."""
    if not diagnosis_codes:
        return None
    for dx in diagnosis_codes:
        for prefix, label in AVOIDABLE_DX_MAP.items():
            if dx.startswith(prefix):
                return label
    return None


async def analyze_avoidable_admissions(db: AsyncSession) -> dict[str, Any]:
    """Classify ER visits / admissions by avoidability with savings estimates."""
    # Fetch all ED/observation claims
    result = await db.execute(
        select(Claim).where(
            Claim.service_category == "ed_observation",
        )
    )
    er_claims = result.scalars().all()

    total_er = len(er_claims)
    avoidable_count = 0
    avoidable_cost = 0.0
    by_provider: dict[int | None, dict[str, Any]] = {}
    by_facility: dict[str | None, dict[str, Any]] = {}

    for claim in er_claims:
        reason = _classify_avoidable(claim.diagnosis_codes)
        if reason:
            avoidable_count += 1
            cost = float(claim.paid_amount or AVG_ER_COST)
            avoidable_cost += cost

            # By provider
            pid = claim.rendering_provider_id
            if pid not in by_provider:
                by_provider[pid] = {"provider_id": pid, "total_er": 0, "avoidable": 0}
            by_provider[pid]["total_er"] += 1
            by_provider[pid]["avoidable"] += 1

            # By facility
            fac = claim.facility_name or "Unknown"
            if fac not in by_facility:
                by_facility[fac] = {"facility": fac, "total_er": 0, "avoidable": 0}
            by_facility[fac]["total_er"] += 1
            by_facility[fac]["avoidable"] += 1
        else:
            # Count non-avoidable in provider/facility totals too
            pid = claim.rendering_provider_id
            if pid not in by_provider:
                by_provider[pid] = {"provider_id": pid, "total_er": 0, "avoidable": 0}
            by_provider[pid]["total_er"] += 1

            fac = claim.facility_name or "Unknown"
            if fac not in by_facility:
                by_facility[fac] = {"facility": fac, "total_er": 0, "avoidable": 0}
            by_facility[fac]["total_er"] += 1

    estimated_savings = round(avoidable_count * (AVG_ER_COST - AVG_PCP_COST))

    return {
        "summary": {
            "total_er_visits": total_er,
            "avoidable_er_visits": avoidable_count,
            "avoidable_admissions": 0,
            "avoidable_readmissions": 0,
            "estimated_savings": estimated_savings,
        },
        "by_provider": list(by_provider.values()),
        "by_facility": list(by_facility.values()),
        "er_conversion_rates": [],
    }


async def get_avoidable_er_detail(db: AsyncSession) -> list[dict[str, Any]]:
    """Return each ER visit classified with avoidability, diagnosis, facility, etc."""
    result = await db.execute(
        select(Claim, Member)
        .join(Member, Claim.member_id == Member.id)
        .where(Claim.service_category == "ed_observation")
        .order_by(Claim.service_date.desc())
    )
    rows = result.all()

    details = []
    for claim, member in rows:
        reason = _classify_avoidable(claim.diagnosis_codes)
        details.append({
            "claim_id": claim.id,
            "member_id": member.id,
            "member_name": f"{member.first_name} {member.last_name}".strip(),
            "service_date": str(claim.service_date),
            "facility": claim.facility_name,
            "diagnosis_codes": claim.diagnosis_codes,
            "is_avoidable": reason is not None,
            "avoidable_reason": reason,
            "paid_amount": float(claim.paid_amount or 0),
        })

    return details


async def get_education_opportunities(db: AsyncSession) -> list[dict[str, Any]]:
    """Return members with 2+ avoidable ER visits who would benefit from education."""
    # Get all ED claims
    result = await db.execute(
        select(Claim)
        .where(Claim.service_category == "ed_observation")
    )
    er_claims = result.scalars().all()

    # Count avoidable visits per member
    member_avoidable: dict[int, int] = {}
    for claim in er_claims:
        reason = _classify_avoidable(claim.diagnosis_codes)
        if reason:
            member_avoidable[claim.member_id] = member_avoidable.get(claim.member_id, 0) + 1

    # Filter to 2+ avoidable
    target_ids = [mid for mid, count in member_avoidable.items() if count >= 2]
    if not target_ids:
        return []

    # Fetch member info
    members_q = await db.execute(
        select(Member).where(Member.id.in_(target_ids))
    )
    members = {m.id: m for m in members_q.scalars().all()}

    opportunities = []
    for mid in target_ids:
        m = members.get(mid)
        if not m:
            continue
        count = member_avoidable[mid]
        potential_savings = round(count * (AVG_ER_COST - AVG_PCP_COST))
        opportunities.append({
            "member_id": m.id,
            "member_name": f"{m.first_name} {m.last_name}".strip(),
            "avoidable_er_count": count,
            "potential_savings": potential_savings,
            "pcp_provider_id": m.pcp_provider_id,
            "recommendation": "Patient education on appropriate ER use; connect with PCP for care plan",
        })

    opportunities.sort(key=lambda x: x["avoidable_er_count"], reverse=True)
    return opportunities
