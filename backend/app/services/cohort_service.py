"""
Dynamic Cohort Builder Service — build, save, and track custom population segments.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from datetime import date

from sqlalchemy import select, or_, exists
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect
from app.models.care_gap import MemberGap, GapStatus

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Build Cohort — queries real DB
# ---------------------------------------------------------------------------

async def build_cohort(db: AsyncSession, filters: dict) -> dict:
    """
    Build a cohort from filter criteria by querying the Members table.

    Supported filter keys:
    - age_min, age_max: int
    - gender: str ("M", "F")
    - diagnoses_include: list[str]  (ICD-10 codes the member MUST have via claims)
    - diagnoses_exclude: list[str]  (ICD-10 codes the member must NOT have)
    - risk_tier: str ("high", "medium", "low", "rising", "complex")
    - provider_id: int  (PCP provider ID)
    - raf_min: float
    - raf_max: float
    - has_suspects: bool  (members with open HCC suspects)
    - has_gaps: bool  (members with open care gaps)

    Returns cohort results with aggregate stats.
    """
    today = date.today()
    query = select(Member).where(
        # Only active members (coverage overlaps today)
        or_(Member.coverage_start <= today, Member.coverage_start.is_(None)),
        or_(Member.coverage_end >= today, Member.coverage_end.is_(None)),
    )

    # --- Apply filters ---

    # Age filters (computed from date_of_birth)
    # Use try/except to handle leap year edge case (e.g. today is Feb 29)
    def _safe_date(year: int, month: int, day: int) -> date:
        """Create a date, falling back to Feb 28 for invalid Feb 29."""
        try:
            return date(year, month, day)
        except ValueError:
            # Handles Feb 29 -> Feb 28 when target year is not a leap year
            return date(year, month, day - 1)

    if filters.get("age_min") is not None:
        max_dob = _safe_date(today.year - int(filters["age_min"]), today.month, today.day)
        query = query.where(Member.date_of_birth <= max_dob)
    if filters.get("age_max") is not None:
        min_dob = _safe_date(today.year - int(filters["age_max"]) - 1, today.month, today.day)
        query = query.where(Member.date_of_birth >= min_dob)

    # Gender
    if filters.get("gender"):
        query = query.where(Member.gender == filters["gender"])

    # Risk tier
    if filters.get("risk_tier"):
        query = query.where(Member.risk_tier == filters["risk_tier"])

    # Provider (PCP)
    if filters.get("provider_id") is not None:
        query = query.where(Member.pcp_provider_id == int(filters["provider_id"]))

    # RAF range
    if filters.get("raf_min") is not None:
        query = query.where(Member.current_raf >= float(filters["raf_min"]))
    if filters.get("raf_max") is not None:
        query = query.where(Member.current_raf <= float(filters["raf_max"]))

    # Diagnoses include — member must have at least one claim with each code
    for code in (filters.get("diagnoses_include") or []):
        query = query.where(
            exists(
                select(Claim.id).where(
                    Claim.member_id == Member.id,
                    Claim.diagnosis_codes.any(code),
                )
            )
        )

    # Diagnoses exclude — member must NOT have claims with these codes
    for code in (filters.get("diagnoses_exclude") or []):
        query = query.where(
            ~exists(
                select(Claim.id).where(
                    Claim.member_id == Member.id,
                    Claim.diagnosis_codes.any(code),
                )
            )
        )

    # Has open suspects
    if filters.get("has_suspects"):
        query = query.where(
            exists(
                select(HccSuspect.id).where(
                    HccSuspect.member_id == Member.id,
                    HccSuspect.status == "open",
                )
            )
        )

    # Has open care gaps
    if filters.get("has_gaps"):
        query = query.where(
            exists(
                select(MemberGap.id).where(
                    MemberGap.member_id == Member.id,
                    MemberGap.status == GapStatus.open.value,
                )
            )
        )

    # Execute
    result = await db.execute(query)
    members_raw = result.scalars().all()

    # Build response
    members = []
    total_raf = 0.0
    for m in members_raw:
        age = (
            today.year - m.date_of_birth.year
            - ((today.month, today.day) < (m.date_of_birth.month, m.date_of_birth.day))
        ) if m.date_of_birth else None
        raf = float(m.current_raf) if m.current_raf is not None else 0.0
        total_raf += raf
        members.append({
            "id": m.id,
            "member_id": m.member_id,
            "first_name": m.first_name,
            "last_name": m.last_name,
            "age": age,
            "gender": m.gender,
            "raf": raf,
            "risk_tier": m.risk_tier,
            "pcp_provider_id": m.pcp_provider_id,
        })

    count = len(members)
    avg_raf = round(total_raf / count, 3) if count > 0 else 0.0
    ages = [m["age"] for m in members if m["age"] is not None]
    avg_age = round(sum(ages) / len(ages), 1) if ages else 0.0
    pct_high = round(sum(1 for m in members if m["risk_tier"] == "high") / count * 100, 1) if count > 0 else 0.0

    return {
        "member_count": count,
        "filters_applied": filters,
        "aggregate_stats": {
            "avg_raf": avg_raf,
            "avg_age": avg_age,
            "pct_high_risk": pct_high,
        },
        "members": members,
    }


# ---------------------------------------------------------------------------
# Save Cohort  (planned — needs Cohort DB model)
# ---------------------------------------------------------------------------

async def save_cohort(db: AsyncSession, name: str, filters: dict) -> dict:
    """Save a named cohort definition for tracking over time.

    PLANNED: Requires a Cohort DB model (not yet created). Currently returns
    a stub response so callers know this is not persisted.
    """
    logger.warning("save_cohort is a stub — Cohort model not yet created")
    return {
        "stub": True,
        "message": "Cohort saving not yet persisted — Cohort DB model planned",
        "name": name,
        "filters": filters,
    }


# ---------------------------------------------------------------------------
# List / Get Cohorts  (planned — needs Cohort DB model)
# ---------------------------------------------------------------------------

async def list_cohorts(db: AsyncSession) -> list[dict]:
    """Return all saved cohorts.

    PLANNED: Requires a Cohort DB model (not yet created). Returns empty list.
    """
    logger.warning("list_cohorts is a stub — Cohort model not yet created")
    return []


async def get_cohort_detail(db: AsyncSession, cohort_id: int) -> dict | None:
    """Return cohort detail with members.

    PLANNED: Requires a Cohort DB model. Returns None.
    """
    return None


# ---------------------------------------------------------------------------
# Cohort Trends  (planned — needs Cohort DB model + historical snapshots)
# ---------------------------------------------------------------------------

async def get_cohort_trends(db: AsyncSession, cohort_id: int) -> dict:
    """Return monthly metric trends for a saved cohort.

    PLANNED: Requires Cohort model with stored snapshots.
    """
    return {
        "stub": True,
        "cohort_id": cohort_id,
        "message": "Cohort trends not yet implemented — Cohort DB model planned",
        "months": [],
    }
