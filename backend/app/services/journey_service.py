"""
Member Journey / Timeline Service.

Provides a comprehensive chronological view of every interaction a member
has had with the healthcare system: claims, HCC captures, care gap events,
RAF trajectory, pharmacy fills, and AI-generated narrative.
"""

from datetime import date, timedelta
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect, SuspectStatus, RafHistory
from app.models.care_gap import MemberGap, GapStatus, GapMeasure
from app.models.provider import Provider


# ---------------------------------------------------------------------------
# Journey event type classification
# ---------------------------------------------------------------------------

SERVICE_CATEGORY_TO_EVENT_TYPE = {
    "inpatient": "admission",
    "ed_observation": "er_visit",
    "snf_postacute": "snf_admit",
    "home_health": "hh_start",
    "pharmacy": "rx_fill",
    "professional": "pcp_visit",   # default; refined by POS / specialty
    "dme": "pcp_visit",
    "other": "pcp_visit",
}

SPECIALIST_SPECIALTIES = {
    "Cardiology", "Nephrology", "Pulmonology", "Psychiatry",
    "Oncology", "Endocrinology", "Neurology", "Rheumatology",
    "Gastroenterology", "Orthopedics",
}


def _classify_claim_event(claim_row: dict) -> str:
    """Map a claim to its timeline event type."""
    base = SERVICE_CATEGORY_TO_EVENT_TYPE.get(
        claim_row.get("service_category", ""), "pcp_visit"
    )
    if base == "pcp_visit" and claim_row.get("specialty") in SPECIALIST_SPECIALTIES:
        return "specialist_visit"
    return base


def _build_claim_event(row: dict) -> dict:
    """Transform a claim DB row into a timeline event dict."""
    event_type = _classify_claim_event(row)
    svc_date = row["service_date"]

    # Build human-readable description
    facility = row.get("facility_name") or ""
    provider_name = row.get("provider_name") or ""
    dx_codes = row.get("diagnosis_codes") or []
    drug = row.get("drug_name") or ""

    if event_type == "rx_fill":
        title = f"Rx Fill — {drug}" if drug else "Pharmacy Fill"
    elif event_type == "er_visit":
        title = f"ER Visit at {facility}" if facility else "Emergency Department Visit"
    elif event_type == "admission":
        title = f"Admitted to {facility}" if facility else "Inpatient Admission"
    elif event_type == "snf_admit":
        title = f"SNF Admission — {facility}" if facility else "SNF Stay"
    elif event_type == "hh_start":
        title = "Home Health Episode Started"
    elif event_type == "specialist_visit":
        spec = row.get("specialty", "Specialist")
        title = f"{spec} Visit — {provider_name}" if provider_name else f"{spec} Visit"
    else:
        title = f"PCP Visit — {provider_name}" if provider_name else "Office Visit"

    return {
        "date": svc_date.isoformat() if isinstance(svc_date, date) else str(svc_date),
        "type": event_type,
        "title": title,
        "provider": provider_name,
        "facility": facility,
        "diagnoses": dx_codes,
        "cost": float(row.get("paid_amount") or 0),
        "description": "",
        "flags": [],
    }


# ---------------------------------------------------------------------------
# Main journey assembly
# ---------------------------------------------------------------------------

async def get_member_journey(
    db: AsyncSession, member_id: int, months: int = 24
) -> dict:
    """
    Build the full member journey timeline.

    Pulls claims, HCC events, care gap events, and RAF history for
    the given member over the specified month window, then merges
    everything into a single chronological timeline.
    """
    cutoff = date.today() - timedelta(days=months * 30)

    # ---- 1. Member demographics ----
    member_q = await db.execute(
        select(Member).where(Member.id == member_id)
    )
    member = member_q.scalar_one_or_none()
    if not member:
        return {"error": "Member not found"}

    # PCP name
    pcp_name = None
    if member.pcp_provider_id:
        pcp_q = await db.execute(
            select(Provider.first_name, Provider.last_name).where(
                Provider.id == member.pcp_provider_id
            )
        )
        pcp_row = pcp_q.first()
        if pcp_row:
            pcp_name = f"Dr. {pcp_row.first_name or ''} {pcp_row.last_name or ''}".strip()

    member_summary = {
        "id": member.id,
        "member_id": member.member_id,
        "name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
        "dob": member.date_of_birth.isoformat() if member.date_of_birth else None,
        "age": (date.today().year - member.date_of_birth.year - (
            (date.today().month, date.today().day) < (member.date_of_birth.month, member.date_of_birth.day)
        )) if member.date_of_birth else None,
        "gender": member.gender,
        "health_plan": member.health_plan,
        "pcp": pcp_name,
        "current_raf": float(member.current_raf or 0),
        "projected_raf": float(member.projected_raf or 0),
        "risk_tier": member.risk_tier if member.risk_tier else None,
    }

    # ---- 2. Claims ----
    claims_q = await db.execute(
        select(Claim).where(
            and_(Claim.member_id == member_id, Claim.service_date >= cutoff)
        ).order_by(Claim.service_date.desc())
    )
    claims = claims_q.scalars().all()

    events: list[dict] = []
    total_spend = 0.0
    for c in claims:
        row = {
            "service_date": c.service_date,
            "service_category": c.service_category,
            "facility_name": c.facility_name,
            "diagnosis_codes": c.diagnosis_codes,
            "paid_amount": c.paid_amount,
            "drug_name": c.drug_name,
            "provider_name": None,
            "specialty": None,
        }
        total_spend += float(c.paid_amount or 0)
        events.append(_build_claim_event(row))

    member_summary["total_spend_12m"] = total_spend

    # ---- 3. HCC suspect events ----
    suspects_q = await db.execute(
        select(HccSuspect).where(
            and_(
                HccSuspect.member_id == member_id,
                HccSuspect.identified_date >= cutoff,
            )
        ).order_by(HccSuspect.identified_date.desc())
    )
    suspects = suspects_q.scalars().all()

    open_suspects = 0
    for s in suspects:
        if s.status == SuspectStatus.captured.value and s.captured_date:
            events.append({
                "date": s.captured_date.isoformat(),
                "type": "hcc_captured",
                "title": f"HCC Captured — {s.hcc_label or f'HCC {s.hcc_code}'}",
                "provider": "",
                "facility": "",
                "diagnoses": [s.icd10_code] if s.icd10_code else [],
                "cost": 0,
                "description": s.evidence_summary or "",
                "flags": [{
                    "type": "success",
                    "message": f"+{float(s.raf_value or 0):.3f} RAF captured"
                }],
            })
        elif s.status == SuspectStatus.open.value:
            open_suspects += 1

    member_summary["open_suspects"] = open_suspects

    # ---- 4. Care gap events ----
    # Join MemberGap with GapMeasure to get the measure code (MemberGap only
    # has measure_id FK, not measure_code directly).
    gaps_q = await db.execute(
        select(MemberGap, GapMeasure.code).join(
            GapMeasure, MemberGap.measure_id == GapMeasure.id
        ).where(
            MemberGap.member_id == member_id
        )
    )
    gap_rows = gaps_q.all()

    open_gaps = 0
    for g, measure_code in gap_rows:
        if g.status == GapStatus.closed.value and g.closed_date:
            events.append({
                "date": g.closed_date.isoformat(),
                "type": "gap_closed",
                "title": f"Care Gap Closed — {measure_code}",
                "provider": "",
                "facility": "",
                "diagnoses": [],
                "cost": 0,
                "description": "",
                "flags": [{
                    "type": "success",
                    "message": f"{measure_code} gap closed"
                }],
            })
        elif g.status == GapStatus.open.value:
            open_gaps += 1

    member_summary["open_gaps"] = open_gaps

    # ---- 5. Sort all events by date descending ----
    events.sort(key=lambda e: e["date"], reverse=True)

    # ---- 6. AI narrative placeholder ----
    narrative = _generate_narrative(member_summary, events)

    return {
        "member": member_summary,
        "timeline": events,
        "narrative": narrative,
    }


async def get_member_risk_trajectory(
    db: AsyncSession, member_id: int
) -> list[dict]:
    """
    Return monthly RAF score and cost trajectory for the member,
    with overlay markers for interventions (HCC captures, gap closures).
    """
    history_q = await db.execute(
        select(RafHistory).where(
            RafHistory.member_id == member_id
        ).order_by(RafHistory.calculation_date.asc())
    )
    rows = history_q.scalars().all()

    trajectory = []
    for r in rows:
        trajectory.append({
            "date": r.calculation_date.isoformat() if r.calculation_date else None,
            "raf": float(r.total_raf or 0),
            "disease_raf": float(r.disease_raf or 0),
            "demographic_raf": float(r.demographic_raf or 0),
            "hcc_count": r.hcc_count or 0,
        })

    return trajectory


# ---------------------------------------------------------------------------
# Narrative generation (simplified — would be LLM-powered in production)
# ---------------------------------------------------------------------------

def _generate_narrative(summary: dict, events: list[dict]) -> str:
    """Generate a summary narrative of the member's healthcare journey."""
    name = summary.get("name", "This member")
    admissions = sum(1 for e in events if e["type"] == "admission")
    er_visits = sum(1 for e in events if e["type"] == "er_visit")
    snf_stays = sum(1 for e in events if e["type"] == "snf_admit")
    hcc_captures = sum(1 for e in events if e["type"] == "hcc_captured")
    gaps_closed = sum(1 for e in events if e["type"] == "gap_closed")
    missed = sum(1 for e in events for f in e.get("flags", []) if f.get("type") == "missed")

    parts = [f"{name}'s journey shows"]
    detail_parts = []
    if admissions:
        detail_parts.append(f"{admissions} hospitalization{'s' if admissions != 1 else ''}")
    if er_visits:
        detail_parts.append(f"{er_visits} ER visit{'s' if er_visits != 1 else ''}")
    if snf_stays:
        detail_parts.append(f"{snf_stays} SNF stay{'s' if snf_stays != 1 else ''}")
    if hcc_captures:
        detail_parts.append(f"{hcc_captures} HCC capture{'s' if hcc_captures != 1 else ''}")
    if gaps_closed:
        detail_parts.append(f"{gaps_closed} care gap{'s' if gaps_closed != 1 else ''} closed")

    if detail_parts:
        parts.append(", ".join(detail_parts) + ".")
    else:
        parts.append("limited recent activity.")

    if missed:
        parts.append(f" There {'is' if missed == 1 else 'are'} {missed} missed {'opportunity' if missed == 1 else 'opportunities'} flagged for review.")

    return " ".join(parts)
