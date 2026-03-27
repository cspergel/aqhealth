"""
Care Gap Tracking Service.

Provides HEDIS/Stars measure management, gap detection from claims data,
population-level summaries, and member/provider-level gap views.
"""

import json
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select, func, and_, case, update, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.claim import Claim, ClaimType
from app.models.member import Member
from app.models.provider import Provider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Path to the authoritative quality measures JSON
# ---------------------------------------------------------------------------

_QUALITY_MEASURES_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "quality_measures.json"


def _load_measures_from_json() -> list[dict[str, Any]]:
    """Load measure definitions from quality_measures.json and map to GapMeasure fields."""
    with open(_QUALITY_MEASURES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    measures = []
    for m in data["measures"]:
        cutpoints = m.get("star_cutpoints", {})
        # Use the 4-star cutpoint as the default target_rate, falling back to 80.0
        target_rate = cutpoints.get("4") or cutpoints.get("3") or 80.0

        # Build detection_logic from the rich JSON fields
        detection_logic: dict[str, Any] = {"type": m.get("measure_type", "screening")}
        eligible = m.get("eligible_criteria", {})
        compliance = m.get("compliance_criteria", {})
        if eligible:
            detection_logic["eligible_criteria"] = eligible
        if compliance:
            detection_logic["compliance_criteria"] = compliance
        if m.get("inverse"):
            detection_logic["inverse"] = True

        measures.append({
            "code": m["code"],
            "name": m["name"],
            "description": m.get("description"),
            "category": m.get("category"),
            "stars_weight": m.get("stars_weight", 1),
            "target_rate": float(target_rate),
            "star_3_cutpoint": cutpoints.get("3"),
            "star_4_cutpoint": cutpoints.get("4"),
            "star_5_cutpoint": cutpoints.get("5"),
            "detection_logic": detection_logic,
        })
    return measures


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

async def seed_default_measures(db: AsyncSession) -> int:
    """Create default HEDIS/Stars measures from quality_measures.json if they don't already exist.

    Returns the number of measures created.
    """
    measures = _load_measures_from_json()
    created = 0
    for defn in measures:
        existing = await db.execute(
            select(GapMeasure).where(GapMeasure.code == defn["code"])
        )
        if existing.scalar_one_or_none() is not None:
            continue

        measure = GapMeasure(
            code=defn["code"],
            name=defn["name"],
            description=defn.get("description"),
            category=defn.get("category"),
            stars_weight=defn.get("stars_weight", 1),
            target_rate=defn.get("target_rate"),
            star_3_cutpoint=defn.get("star_3_cutpoint"),
            star_4_cutpoint=defn.get("star_4_cutpoint"),
            star_5_cutpoint=defn.get("star_5_cutpoint"),
            is_custom=False,
            is_active=True,
            detection_logic=defn.get("detection_logic"),
        )
        db.add(measure)
        created += 1

    await db.commit()
    logger.info("Seeded %d default care gap measures", created)
    return created


async def detect_gaps(db: AsyncSession) -> dict[str, int]:
    """Scan claims data for each active measure and create MemberGap records.

    Returns dict with counts: {"scanned": N, "gaps_created": N, "gaps_closed": N}.
    """
    measurement_year = date.today().year
    year_start = date(measurement_year, 1, 1)
    year_end = date(measurement_year, 12, 31)

    result = await db.execute(
        select(GapMeasure).where(GapMeasure.is_active == True)  # noqa: E712
    )
    measures = result.scalars().all()

    total_created = 0
    total_closed = 0

    for measure in measures:
        logic = measure.detection_logic or {}
        gap_type = logic.get("type", "screening")

        if gap_type == "screening":
            created, closed = await _detect_screening_gaps(
                db, measure, logic, measurement_year, year_start, year_end
            )
        elif gap_type == "medication_adherence":
            created, closed = await _detect_medication_gaps(
                db, measure, logic, measurement_year, year_start, year_end
            )
        elif gap_type == "followup":
            created, closed = await _detect_followup_gaps(
                db, measure, logic, measurement_year, year_start, year_end
            )
        else:
            logger.warning("Unknown gap type %s for measure %s", gap_type, measure.code)
            continue

        total_created += created
        total_closed += closed

    await db.commit()

    # --- Cross-module: auto-create action items for triple-weighted measure gaps ---
    action_items_created = 0
    try:
        action_items_created = await _auto_create_actions_for_critical_gaps(db, measurement_year)
    except Exception as e:
        logger.warning("Cross-module: auto-create action items failed (non-fatal): %s", e)

    return {
        "scanned": len(measures),
        "gaps_created": total_created,
        "gaps_closed": total_closed,
        "action_items_created": action_items_created,
    }


async def _get_eligible_members(
    db: AsyncSession,
    logic: dict,
    year_start: date,
    year_end: date,
) -> list[Member]:
    """Determine the eligible population for a measure based on detection logic."""
    query = select(Member).where(
        Member.coverage_start <= year_end,
        (Member.coverage_end >= year_start) | (Member.coverage_end == None),  # noqa: E711
    )

    age_min = logic.get("age_min")
    age_max = logic.get("age_max")
    if age_min is not None:
        max_dob = date(year_end.year - age_min, 12, 31)
        query = query.where(Member.date_of_birth <= max_dob)
    if age_max is not None and age_max < 999:
        min_dob = date(year_end.year - age_max - 1, 1, 1)
        query = query.where(Member.date_of_birth >= min_dob)

    if logic.get("eligible_gender"):
        query = query.where(Member.gender == logic["eligible_gender"])

    result = await db.execute(query)
    members = list(result.scalars().all())

    # If measure requires specific diagnoses, filter to members with those dx
    eligible_dx = logic.get("eligible_dx")
    if eligible_dx:
        member_ids = [m.id for m in members]
        if not member_ids:
            return []

        dx_query = (
            select(Claim.member_id)
            .where(
                Claim.member_id.in_(member_ids),
                Claim.service_date >= date(year_start.year - 1, 1, 1),
                Claim.service_date <= year_end,
            )
            .distinct()
        )
        # Check if any diagnosis code starts with the eligible prefixes
        # Use EXISTS + unnest for proper array-element prefix matching
        from sqlalchemy import literal_column
        dx_filters = []
        for dx in eligible_dx:
            # Match array elements that start with the dx prefix (e.g., "E11" matches "E11.65")
            dx_filters.append(
                text(f"EXISTS (SELECT 1 FROM unnest(diagnosis_codes) AS dx_val WHERE dx_val LIKE :dx_prefix_{dx})")
            )

        if dx_filters:
            from sqlalchemy import or_, bindparam
            combined = or_(*dx_filters)
            dx_query = dx_query.where(combined)
            # Bind the prefix parameters
            dx_params = {f"dx_prefix_{dx}": f"{dx}%" for dx in eligible_dx}
            dx_query = dx_query.params(**dx_params)

        dx_result = await db.execute(dx_query)
        eligible_ids = {row[0] for row in dx_result.all()}
        members = [m for m in members if m.id in eligible_ids]

    return members


async def _detect_screening_gaps(
    db: AsyncSession,
    measure: GapMeasure,
    logic: dict,
    measurement_year: int,
    year_start: date,
    year_end: date,
) -> tuple[int, int]:
    """Detect screening-type gaps: members missing required CPT codes."""
    members = await _get_eligible_members(db, logic, year_start, year_end)
    if not members:
        return 0, 0

    required_cpt = logic.get("required_cpt", [])
    lookback_years = logic.get("lookback_years", 1)
    lookback_start = date(measurement_year - lookback_years + 1, 1, 1)

    member_ids = [m.id for m in members]

    # Find members who HAVE the required service
    compliant_query = (
        select(Claim.member_id)
        .where(
            Claim.member_id.in_(member_ids),
            Claim.procedure_code.in_(required_cpt),
            Claim.service_date >= lookback_start,
            Claim.service_date <= year_end,
        )
        .distinct()
    )
    compliant_result = await db.execute(compliant_query)
    compliant_ids = {row[0] for row in compliant_result.all()}

    # Batch-fetch existing gaps for all eligible members to avoid N+1 queries
    existing_gaps_result = await db.execute(
        select(MemberGap).where(
            MemberGap.member_id.in_(member_ids),
            MemberGap.measure_id == measure.id,
            MemberGap.measurement_year == measurement_year,
        )
    )
    existing_gaps_by_member: dict[int, MemberGap] = {
        g.member_id: g for g in existing_gaps_result.scalars().all()
    }

    created = 0
    closed = 0

    for member in members:
        existing_gap = existing_gaps_by_member.get(member.id)

        if member.id in compliant_ids:
            # Member is compliant — close any open gap
            if existing_gap and existing_gap.status == GapStatus.open.value:
                existing_gap.status = GapStatus.closed.value
                existing_gap.closed_date = date.today()
                closed += 1
        else:
            # Member has a gap
            if not existing_gap:
                gap = MemberGap(
                    member_id=member.id,
                    measure_id=measure.id,
                    status=GapStatus.open.value,
                    due_date=year_end,
                    measurement_year=measurement_year,
                    responsible_provider_id=member.pcp_provider_id,
                )
                db.add(gap)
                created += 1

    return created, closed


async def _detect_medication_gaps(
    db: AsyncSession,
    measure: GapMeasure,
    logic: dict,
    measurement_year: int,
    year_start: date,
    year_end: date,
) -> tuple[int, int]:
    """Detect medication adherence gaps using PDC from pharmacy claims."""
    members = await _get_eligible_members(db, logic, year_start, year_end)
    if not members:
        return 0, 0

    drug_classes = [dc.lower() for dc in logic.get("drug_classes", [])]
    pdc_threshold = logic.get("pdc_threshold", 0.8)
    member_ids = [m.id for m in members]

    # Get pharmacy claims for these members
    rx_query = (
        select(Claim)
        .where(
            Claim.member_id.in_(member_ids),
            Claim.claim_type == ClaimType.pharmacy,
            Claim.service_date >= year_start,
            Claim.service_date <= year_end,
        )
        .order_by(Claim.member_id, Claim.service_date)
    )
    rx_result = await db.execute(rx_query)
    rx_claims = rx_result.scalars().all()

    # Group by member and calculate PDC
    member_fills: dict[int, list[tuple[date, int]]] = {}
    for claim in rx_claims:
        if claim.drug_class and claim.drug_class.lower() in drug_classes:
            fills = member_fills.setdefault(claim.member_id, [])
            fills.append((claim.service_date, claim.days_supply or 30))

    created = 0
    closed = 0
    today = date.today()
    period_days = min((today - year_start).days, 365)
    if period_days <= 0:
        period_days = 365

    # Batch-fetch existing gaps for all eligible members to avoid N+1 queries
    existing_gaps_result = await db.execute(
        select(MemberGap).where(
            MemberGap.member_id.in_(member_ids),
            MemberGap.measure_id == measure.id,
            MemberGap.measurement_year == measurement_year,
        )
    )
    existing_gaps_by_member: dict[int, MemberGap] = {
        g.member_id: g for g in existing_gaps_result.scalars().all()
    }

    for member in members:
        fills = member_fills.get(member.id, [])
        pdc = _calculate_pdc(fills, year_start, min(today, year_end), period_days)

        existing_gap = existing_gaps_by_member.get(member.id)

        if pdc >= pdc_threshold:
            if existing_gap and existing_gap.status == GapStatus.open.value:
                existing_gap.status = GapStatus.closed.value
                existing_gap.closed_date = today
                closed += 1
        else:
            if not existing_gap:
                gap = MemberGap(
                    member_id=member.id,
                    measure_id=measure.id,
                    status=GapStatus.open.value,
                    due_date=year_end,
                    measurement_year=measurement_year,
                    responsible_provider_id=member.pcp_provider_id,
                )
                db.add(gap)
                created += 1

    return created, closed


def _calculate_pdc(
    fills: list[tuple[date, int]],
    period_start: date,
    period_end: date,
    period_days: int,
) -> float:
    """Calculate Proportion of Days Covered from fill records.

    Uses date range arithmetic instead of day-by-day iteration for performance.
    """
    if not fills or period_days <= 0:
        return 0.0

    # Sort fills by date
    sorted_fills = sorted(fills, key=lambda f: f[0])

    # Merge overlapping coverage intervals, clipped to the measurement period
    intervals: list[tuple[date, date]] = []
    for fill_date, days_supply in sorted_fills:
        start = max(fill_date, period_start)
        end = min(fill_date + timedelta(days=days_supply - 1), period_end)
        if start > end:
            continue
        if intervals and start <= intervals[-1][1] + timedelta(days=1):
            # Merge with previous interval
            intervals[-1] = (intervals[-1][0], max(intervals[-1][1], end))
        else:
            intervals.append((start, end))

    total_days_covered = sum((end - start).days + 1 for start, end in intervals)
    return total_days_covered / period_days if period_days else 0.0


async def _detect_followup_gaps(
    db: AsyncSession,
    measure: GapMeasure,
    logic: dict,
    measurement_year: int,
    year_start: date,
    year_end: date,
) -> tuple[int, int]:
    """Detect follow-up gaps: missing follow-up visit after a trigger event."""
    required_cpt = logic.get("required_cpt", [])
    followup_days = logic.get("followup_days", 30)
    trigger_dx = logic.get("trigger_dx", [])
    trigger_event = logic.get("trigger_event", "")

    # Find trigger events (e.g., inpatient discharges, ED visits)
    trigger_query = select(Claim).where(
        Claim.service_date >= year_start,
        Claim.service_date <= year_end,
    )

    if "inpatient" in trigger_event:
        trigger_query = trigger_query.where(Claim.service_category == "inpatient")
    elif "ed" in trigger_event:
        trigger_query = trigger_query.where(Claim.service_category == "ed_observation")

    if trigger_dx:
        from sqlalchemy import or_
        dx_filters = []
        for dx in trigger_dx:
            dx_filters.append(
                text(f"EXISTS (SELECT 1 FROM unnest(diagnosis_codes) AS dx_val WHERE dx_val LIKE :tdx_prefix_{dx})")
            )
        if dx_filters:
            combined = or_(*dx_filters)
            trigger_query = trigger_query.where(combined)
            dx_params = {f"tdx_prefix_{dx}": f"{dx}%" for dx in trigger_dx}
            trigger_query = trigger_query.params(**dx_params)

    trigger_result = await db.execute(trigger_query)
    trigger_claims = trigger_result.scalars().all()

    # Group trigger events by member
    member_events: dict[int, list[date]] = {}
    for claim in trigger_claims:
        member_events.setdefault(claim.member_id, []).append(claim.service_date)

    created = 0
    closed = 0
    today = date.today()

    if not member_events:
        return created, closed

    all_member_ids = list(member_events.keys())

    # Batch-fetch all follow-up claims for these members to avoid N+1
    fu_result = await db.execute(
        select(Claim.member_id, Claim.service_date).where(
            Claim.member_id.in_(all_member_ids),
            Claim.procedure_code.in_(required_cpt),
            Claim.service_date >= year_start,
            Claim.service_date <= year_end,
        )
    )
    # Index follow-up claims by member for fast lookup
    from collections import defaultdict
    followup_claims_by_member: dict[int, list[date]] = defaultdict(list)
    for row in fu_result.all():
        followup_claims_by_member[row.member_id].append(row.service_date)

    # Batch-fetch existing gaps for this measure and all members
    existing_gaps_result = await db.execute(
        select(MemberGap).where(
            MemberGap.member_id.in_(all_member_ids),
            MemberGap.measure_id == measure.id,
            MemberGap.measurement_year == measurement_year,
        )
    )
    existing_gaps_by_key: dict[tuple[int, date], MemberGap] = {}
    for g in existing_gaps_result.scalars().all():
        existing_gaps_by_key[(g.member_id, g.due_date)] = g

    # Batch-fetch member PCP info for gap creation
    member_pcp_result = await db.execute(
        select(Member.id, Member.pcp_provider_id).where(Member.id.in_(all_member_ids))
    )
    member_pcp_map: dict[int, int | None] = {r.id: r.pcp_provider_id for r in member_pcp_result.all()}

    for member_id, event_dates in member_events.items():
        fu_dates = followup_claims_by_member.get(member_id, [])

        for event_date in event_dates:
            followup_deadline = event_date + timedelta(days=followup_days)

            # Check for follow-up claim in the pre-fetched data
            has_followup = any(
                d > event_date and d <= followup_deadline for d in fu_dates
            )

            existing_gap = existing_gaps_by_key.get((member_id, followup_deadline))

            if has_followup:
                if existing_gap and existing_gap.status == GapStatus.open.value:
                    existing_gap.status = GapStatus.closed.value
                    existing_gap.closed_date = today
                    closed += 1
            else:
                if not existing_gap:
                    gap = MemberGap(
                        member_id=member_id,
                        measure_id=measure.id,
                        status=GapStatus.open.value,
                        due_date=followup_deadline,
                        measurement_year=measurement_year,
                        responsible_provider_id=member_pcp_map.get(member_id),
                    )
                    db.add(gap)
                    created += 1

    return created, closed


def _star_level_for_rate(rate: float, measure: GapMeasure) -> int:
    """Determine the star level (1-5) based on closure rate and cutpoints."""
    s5 = float(measure.star_5_cutpoint) if measure.star_5_cutpoint is not None else None
    s4 = float(measure.star_4_cutpoint) if measure.star_4_cutpoint is not None else None
    s3 = float(measure.star_3_cutpoint) if measure.star_3_cutpoint is not None else None

    if s5 is not None and rate >= s5:
        return 5
    if s4 is not None and rate >= s4:
        return 4
    if s3 is not None and rate >= s3:
        return 3
    if s3 is not None and rate >= s3 * 0.7:
        return 2
    return 1


async def get_gap_population_summary(db: AsyncSession) -> list[dict[str, Any]]:
    """Per-measure summary: eligible, open, closed, closure rate, star level, weight.

    Uses a single GROUP BY query to avoid N+1 per-measure gap count fetches.
    """
    measurement_year = date.today().year

    # Single query: join measures with gap counts grouped by measure
    result = await db.execute(
        select(
            GapMeasure,
            func.sum(case((MemberGap.status == "open", 1), else_=0)).label("open_count"),
            func.sum(case((MemberGap.status == "closed", 1), else_=0)).label("closed_count"),
            func.sum(case((MemberGap.status == "excluded", 1), else_=0)).label("excluded_count"),
        )
        .outerjoin(
            MemberGap,
            and_(
                MemberGap.measure_id == GapMeasure.id,
                MemberGap.measurement_year == measurement_year,
            ),
        )
        .where(GapMeasure.is_active.is_(True))
        .group_by(GapMeasure.id)
        .order_by(GapMeasure.code)
    )

    summaries = []
    for row in result.all():
        measure = row[0]
        open_count = int(row.open_count or 0)
        closed_count = int(row.closed_count or 0)
        excluded_count = int(row.excluded_count or 0)
        total_eligible = open_count + closed_count + excluded_count

        closure_rate = (closed_count / total_eligible * 100) if total_eligible > 0 else 0.0
        star_level = _star_level_for_rate(closure_rate, measure)

        # Calculate gaps needed for next star level
        gaps_to_next = None
        if star_level < 5 and total_eligible > 0:
            next_cutpoint = None
            if star_level < 3 and measure.star_3_cutpoint is not None:
                next_cutpoint = float(measure.star_3_cutpoint)
            elif star_level == 3 and measure.star_4_cutpoint is not None:
                next_cutpoint = float(measure.star_4_cutpoint)
            elif star_level == 4 and measure.star_5_cutpoint is not None:
                next_cutpoint = float(measure.star_5_cutpoint)

            if next_cutpoint is not None:
                needed_closed = int((next_cutpoint / 100) * total_eligible) - closed_count
                if needed_closed > 0:
                    gaps_to_next = needed_closed

        summaries.append({
            "measure_id": measure.id,
            "code": measure.code,
            "name": measure.name,
            "category": measure.category,
            "stars_weight": measure.stars_weight,
            "total_eligible": total_eligible,
            "open_gaps": open_count,
            "closed_gaps": closed_count,
            "closure_rate": round(closure_rate, 1),
            "star_level": star_level,
            "target_rate": float(measure.target_rate) if measure.target_rate is not None else None,
            "gaps_to_next_star": gaps_to_next,
        })

    return summaries


async def get_member_gaps(db: AsyncSession, member_id: int) -> list[dict[str, Any]]:
    """All gaps for a specific member with measure details."""
    result = await db.execute(
        select(MemberGap, GapMeasure)
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .where(MemberGap.member_id == member_id)
        .order_by(MemberGap.status, GapMeasure.code)
    )

    gaps = []
    for row in result.all():
        gap: MemberGap = row[0]
        measure: GapMeasure = row[1]
        gaps.append({
            "id": gap.id,
            "measure_code": measure.code,
            "measure_name": measure.name,
            "status": gap.status,
            "due_date": str(gap.due_date) if gap.due_date else None,
            "closed_date": str(gap.closed_date) if gap.closed_date else None,
            "measurement_year": gap.measurement_year,
            "stars_weight": measure.stars_weight,
        })

    return gaps


async def get_provider_gaps(db: AsyncSession, provider_id: int) -> dict[str, Any]:
    """Gaps aggregated by provider panel."""
    result = await db.execute(
        select(
            GapMeasure.code,
            GapMeasure.name,
            MemberGap.status,
            func.count(MemberGap.id),
        )
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .where(MemberGap.responsible_provider_id == provider_id)
        .group_by(GapMeasure.code, GapMeasure.name, MemberGap.status)
    )

    by_measure: dict[str, dict[str, Any]] = {}
    for row in result.all():
        code = row[0]
        if code not in by_measure:
            by_measure[code] = {"code": code, "name": row[1], "open": 0, "closed": 0}
        status_val = str(row[2])
        by_measure[code][status_val] = row[3]

    return {
        "provider_id": provider_id,
        "measures": list(by_measure.values()),
    }


async def close_gap(db: AsyncSession, gap_id: int) -> MemberGap:
    """Mark a gap as closed with today's date."""
    gap = await db.get(MemberGap, gap_id)
    if not gap:
        raise ValueError(f"Gap {gap_id} not found")
    gap.status = GapStatus.closed.value
    gap.closed_date = date.today()
    await db.commit()
    await db.refresh(gap)
    return gap


async def exclude_gap(db: AsyncSession, gap_id: int) -> MemberGap:
    """Mark a gap as excluded."""
    gap = await db.get(MemberGap, gap_id)
    if not gap:
        raise ValueError(f"Gap {gap_id} not found")
    gap.status = GapStatus.excluded.value
    await db.commit()
    await db.refresh(gap)
    return gap


async def create_custom_measure(db: AsyncSession, measure_data: dict) -> GapMeasure:
    """Create a custom measure definition."""
    measure = GapMeasure(
        code=measure_data["code"],
        name=measure_data["name"],
        description=measure_data.get("description"),
        category=measure_data.get("category"),
        stars_weight=measure_data.get("stars_weight", 1),
        target_rate=measure_data.get("target_rate"),
        star_3_cutpoint=measure_data.get("star_3_cutpoint"),
        star_4_cutpoint=measure_data.get("star_4_cutpoint"),
        star_5_cutpoint=measure_data.get("star_5_cutpoint"),
        is_custom=True,
        is_active=True,
        detection_logic=measure_data.get("detection_logic"),
    )
    db.add(measure)
    await db.commit()
    await db.refresh(measure)
    return measure


async def update_measure(db: AsyncSession, measure_id: int, updates: dict) -> GapMeasure:
    """Edit targets, cutpoints, or active status of a measure."""
    measure = await db.get(GapMeasure, measure_id)
    if not measure:
        raise ValueError(f"Measure {measure_id} not found")

    allowed = {
        "name", "description", "category", "stars_weight", "target_rate",
        "star_3_cutpoint", "star_4_cutpoint", "star_5_cutpoint",
        "is_active", "detection_logic",
    }
    for key, value in updates.items():
        if key in allowed:
            setattr(measure, key, value)

    await db.commit()
    await db.refresh(measure)
    return measure


async def get_all_measures(db: AsyncSession) -> list[dict[str, Any]]:
    """List all measures (active and inactive)."""
    result = await db.execute(
        select(GapMeasure).order_by(GapMeasure.is_active.desc(), GapMeasure.code)
    )
    measures = result.scalars().all()
    return [
        {
            "id": m.id,
            "code": m.code,
            "name": m.name,
            "description": m.description,
            "category": m.category,
            "stars_weight": m.stars_weight,
            "target_rate": float(m.target_rate) if m.target_rate is not None else None,
            "star_3_cutpoint": float(m.star_3_cutpoint) if m.star_3_cutpoint is not None else None,
            "star_4_cutpoint": float(m.star_4_cutpoint) if m.star_4_cutpoint is not None else None,
            "star_5_cutpoint": float(m.star_5_cutpoint) if m.star_5_cutpoint is not None else None,
            "is_custom": m.is_custom,
            "is_active": m.is_active,
            "detection_logic": m.detection_logic,
        }
        for m in measures
    ]


# ---------------------------------------------------------------------------
# Cross-module: auto-create action items for critical (triple-weighted) gaps
# ---------------------------------------------------------------------------

async def _auto_create_actions_for_critical_gaps(
    db: AsyncSession, measurement_year: int
) -> int:
    """For every open gap on a triple-weighted Stars measure (weight >= 3),
    auto-create a high-priority ActionItem for member outreach.

    Only creates an action item if one doesn't already exist for the same
    member + measure combination. Returns number of action items created.
    """
    from app.models.action import ActionItem

    # Find open gaps on measures with stars_weight >= 3
    result = await db.execute(
        select(MemberGap, GapMeasure, Member)
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .join(Member, MemberGap.member_id == Member.id)
        .where(
            MemberGap.status == GapStatus.open.value,
            MemberGap.measurement_year == measurement_year,
            GapMeasure.stars_weight >= 3,
        )
    )
    rows = result.all()

    if not rows:
        return 0

    # Batch-fetch existing open/in_progress action items for care_gap source_type
    # to avoid N+1 queries checking each gap individually
    all_member_ids = list({member.id for _, _, member in rows})
    existing_actions_result = await db.execute(
        select(ActionItem.member_id, ActionItem.title).where(
            ActionItem.source_type == "care_gap",
            ActionItem.member_id.in_(all_member_ids),
            ActionItem.status.in_(["open", "in_progress"]),
        )
    )
    # Build set of (member_id, measure_code) that already have action items
    existing_action_keys: set[tuple[int, str]] = set()
    for row in existing_actions_result.all():
        # Extract measure code from title by checking known codes
        existing_action_keys.add((row.member_id, row.title))

    created = 0
    for gap, measure, member in rows:
        member_name = f"{member.first_name or ''} {member.last_name or ''}".strip()

        # Check if an action item already exists for this member + measure
        has_existing = any(
            mid == member.id and (measure.code or "").lower() in (title or "").lower()
            for mid, title in existing_action_keys
        )
        if has_existing:
            continue

        action = ActionItem(
            source_type="care_gap",
            source_id=gap.id,
            title=f"Close {measure.name} gap for {member_name}",
            description=(
                f"Triple-weighted Stars measure {measure.code} ({measure.name}) "
                f"has an open gap for {member_name}. "
                f"Stars weight: {measure.stars_weight}x. "
                f"Due date: {gap.due_date}."
            ),
            action_type="outreach",
            priority="high",
            member_id=member.id,
            provider_id=gap.responsible_provider_id,
            due_date=gap.due_date,
            expected_impact=f"Close {measure.code} gap — triple-weighted Stars measure",
        )
        db.add(action)
        created += 1

    if created:
        await db.commit()
        logger.info("Auto-created %d action items for triple-weighted care gaps", created)

    return created
