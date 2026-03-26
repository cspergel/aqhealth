"""
Care Gap Tracking Service.

Provides HEDIS/Stars measure management, gap detection from claims data,
population-level summaries, and member/provider-level gap views.
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, func, and_, case, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.claim import Claim, ClaimType
from app.models.member import Member
from app.models.provider import Provider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default HEDIS/Stars measure definitions
# ---------------------------------------------------------------------------

DEFAULT_MEASURES: list[dict[str, Any]] = [
    {
        "code": "CDC-HbA1c",
        "name": "Diabetes Care — HbA1c Testing",
        "description": "Percentage of diabetic members 18-75 who had HbA1c testing in the measurement year.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 85.0,
        "star_3_cutpoint": 74.0,
        "star_4_cutpoint": 82.0,
        "star_5_cutpoint": 90.0,
        "detection_logic": {
            "type": "screening",
            "eligible_dx": ["E11", "E10", "E13"],
            "required_cpt": ["83036", "83037"],
            "age_min": 18,
            "age_max": 75,
        },
    },
    {
        "code": "CDC-Eye",
        "name": "Diabetes Care — Eye Exam",
        "description": "Percentage of diabetic members 18-75 who had a retinal eye exam.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 68.0,
        "star_3_cutpoint": 55.0,
        "star_4_cutpoint": 65.0,
        "star_5_cutpoint": 75.0,
        "detection_logic": {
            "type": "screening",
            "eligible_dx": ["E11", "E10", "E13"],
            "required_cpt": ["92002", "92004", "92012", "92014", "67028", "67210"],
            "age_min": 18,
            "age_max": 75,
        },
    },
    {
        "code": "BCS",
        "name": "Breast Cancer Screening",
        "description": "Percentage of women 50-74 who had a mammogram in the past two years.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 75.0,
        "star_3_cutpoint": 64.0,
        "star_4_cutpoint": 72.0,
        "star_5_cutpoint": 80.0,
        "detection_logic": {
            "type": "screening",
            "eligible_gender": "F",
            "required_cpt": ["77067", "77066", "77065", "G0202"],
            "age_min": 50,
            "age_max": 74,
            "lookback_years": 2,
        },
    },
    {
        "code": "COL",
        "name": "Colorectal Cancer Screening",
        "description": "Percentage of members 45-75 who had appropriate colorectal cancer screening.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 72.0,
        "star_3_cutpoint": 60.0,
        "star_4_cutpoint": 70.0,
        "star_5_cutpoint": 80.0,
        "detection_logic": {
            "type": "screening",
            "required_cpt": ["45378", "45380", "45381", "45384", "45385", "82270", "82274", "81528", "G0104", "G0105", "G0121"],
            "age_min": 45,
            "age_max": 75,
            "lookback_years": 10,
        },
    },
    {
        "code": "CBP",
        "name": "Controlling Blood Pressure",
        "description": "Percentage of members 18-85 with hypertension whose BP was adequately controlled.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 70.0,
        "star_3_cutpoint": 58.0,
        "star_4_cutpoint": 66.0,
        "star_5_cutpoint": 74.0,
        "detection_logic": {
            "type": "screening",
            "eligible_dx": ["I10", "I11", "I12", "I13"],
            "required_cpt": ["99213", "99214", "99215", "99395", "99396"],
            "age_min": 18,
            "age_max": 85,
        },
    },
    {
        "code": "COA-MedReview",
        "name": "Care for Older Adults — Medication Review",
        "description": "Percentage of members 66+ who had a medication review.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 72.0,
        "star_3_cutpoint": 60.0,
        "star_4_cutpoint": 70.0,
        "star_5_cutpoint": 80.0,
        "detection_logic": {
            "type": "screening",
            "required_cpt": ["99605", "99606", "1160F"],
            "age_min": 66,
            "age_max": 999,
        },
    },
    {
        "code": "COA-Pain",
        "name": "Care for Older Adults — Pain Assessment",
        "description": "Percentage of members 66+ who had a pain assessment.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 72.0,
        "star_3_cutpoint": 60.0,
        "star_4_cutpoint": 70.0,
        "star_5_cutpoint": 80.0,
        "detection_logic": {
            "type": "screening",
            "required_cpt": ["1125F", "1126F"],
            "age_min": 66,
            "age_max": 999,
        },
    },
    {
        "code": "COA-Functional",
        "name": "Care for Older Adults — Functional Status Assessment",
        "description": "Percentage of members 66+ who had a functional status assessment.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 72.0,
        "star_3_cutpoint": 60.0,
        "star_4_cutpoint": 70.0,
        "star_5_cutpoint": 80.0,
        "detection_logic": {
            "type": "screening",
            "required_cpt": ["1170F"],
            "age_min": 66,
            "age_max": 999,
        },
    },
    {
        "code": "MRP",
        "name": "Medication Reconciliation Post-Discharge",
        "description": "Percentage of discharges for members 18+ with medication reconciliation within 30 days.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 60.0,
        "star_3_cutpoint": 48.0,
        "star_4_cutpoint": 56.0,
        "star_5_cutpoint": 65.0,
        "detection_logic": {
            "type": "followup",
            "trigger_event": "inpatient_discharge",
            "required_cpt": ["99495", "99496", "1111F"],
            "followup_days": 30,
            "age_min": 18,
            "age_max": 999,
        },
    },
    {
        "code": "FMC",
        "name": "Follow-Up After ED Visit for Mental Health",
        "description": "Percentage of ED visits for mental health with follow-up within 30 days.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 55.0,
        "star_3_cutpoint": 40.0,
        "star_4_cutpoint": 50.0,
        "star_5_cutpoint": 60.0,
        "detection_logic": {
            "type": "followup",
            "trigger_event": "ed_mental_health",
            "trigger_dx": ["F20", "F25", "F31", "F32", "F33", "F41", "F43"],
            "required_cpt": ["90791", "90832", "90834", "90837", "99213", "99214"],
            "followup_days": 30,
            "age_min": 6,
            "age_max": 999,
        },
    },
    {
        "code": "SPD",
        "name": "Statin Use in Persons with Diabetes",
        "description": "Percentage of diabetic members 40-75 receiving statin therapy.",
        "category": "Medication Adherence",
        "stars_weight": 3,
        "target_rate": 85.0,
        "star_3_cutpoint": 76.0,
        "star_4_cutpoint": 82.0,
        "star_5_cutpoint": 88.0,
        "detection_logic": {
            "type": "medication_adherence",
            "eligible_dx": ["E11", "E10"],
            "drug_classes": ["HMG CoA Reductase Inhibitors", "statins"],
            "pdc_threshold": 0.8,
            "age_min": 40,
            "age_max": 75,
        },
    },
    {
        "code": "KED",
        "name": "Kidney Health Evaluation for Patients with Diabetes",
        "description": "Percentage of diabetic members 18-85 who received a kidney health evaluation.",
        "category": "Effectiveness of Care",
        "stars_weight": 1,
        "target_rate": 40.0,
        "star_3_cutpoint": 28.0,
        "star_4_cutpoint": 36.0,
        "star_5_cutpoint": 44.0,
        "detection_logic": {
            "type": "screening",
            "eligible_dx": ["E11", "E10", "E13"],
            "required_cpt": ["82043", "82044", "81001", "81003", "82565"],
            "age_min": 18,
            "age_max": 85,
        },
    },
    {
        "code": "AAP",
        "name": "Adults' Access to Preventive/Ambulatory Services",
        "description": "Percentage of members 20+ who had an ambulatory or preventive care visit.",
        "category": "Access to Care",
        "stars_weight": 1,
        "target_rate": 90.0,
        "star_3_cutpoint": 82.0,
        "star_4_cutpoint": 88.0,
        "star_5_cutpoint": 94.0,
        "detection_logic": {
            "type": "screening",
            "required_cpt": ["99381", "99382", "99383", "99384", "99385", "99386", "99387",
                             "99391", "99392", "99393", "99394", "99395", "99396", "99397",
                             "99201", "99202", "99203", "99204", "99205",
                             "99211", "99212", "99213", "99214", "99215"],
            "age_min": 20,
            "age_max": 999,
        },
    },
]


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

async def seed_default_measures(db: AsyncSession) -> int:
    """Create default HEDIS/Stars measures if they don't already exist.

    Returns the number of measures created.
    """
    created = 0
    for defn in DEFAULT_MEASURES:
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
        dx_filters = []
        for dx in eligible_dx:
            dx_filters.append(func.array_to_string(Claim.diagnosis_codes, ",").ilike(f"%{dx}%"))

        if dx_filters:
            from sqlalchemy import or_
            dx_query = dx_query.where(or_(*dx_filters))

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

    created = 0
    closed = 0

    for member in members:
        existing = await db.execute(
            select(MemberGap).where(
                MemberGap.member_id == member.id,
                MemberGap.measure_id == measure.id,
                MemberGap.measurement_year == measurement_year,
            )
        )
        existing_gap = existing.scalar_one_or_none()

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

    for member in members:
        fills = member_fills.get(member.id, [])
        pdc = _calculate_pdc(fills, year_start, min(today, year_end), period_days)

        existing = await db.execute(
            select(MemberGap).where(
                MemberGap.member_id == member.id,
                MemberGap.measure_id == measure.id,
                MemberGap.measurement_year == measurement_year,
            )
        )
        existing_gap = existing.scalar_one_or_none()

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
    """Calculate Proportion of Days Covered from fill records."""
    if not fills or period_days <= 0:
        return 0.0

    covered = set()
    for fill_date, days_supply in fills:
        for d in range(days_supply):
            covered_date = fill_date + timedelta(days=d)
            if period_start <= covered_date <= period_end:
                covered.add(covered_date)

    return len(covered) / period_days


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
            dx_filters.append(func.array_to_string(Claim.diagnosis_codes, ",").ilike(f"%{dx}%"))
        if dx_filters:
            trigger_query = trigger_query.where(or_(*dx_filters))

    trigger_result = await db.execute(trigger_query)
    trigger_claims = trigger_result.scalars().all()

    # Group trigger events by member
    member_events: dict[int, list[date]] = {}
    for claim in trigger_claims:
        member_events.setdefault(claim.member_id, []).append(claim.service_date)

    created = 0
    closed = 0
    today = date.today()

    for member_id, event_dates in member_events.items():
        for event_date in event_dates:
            followup_deadline = event_date + timedelta(days=followup_days)

            # Check for follow-up claim
            fu_query = await db.execute(
                select(func.count(Claim.id)).where(
                    Claim.member_id == member_id,
                    Claim.procedure_code.in_(required_cpt),
                    Claim.service_date > event_date,
                    Claim.service_date <= followup_deadline,
                )
            )
            has_followup = (fu_query.scalar() or 0) > 0

            existing = await db.execute(
                select(MemberGap).where(
                    MemberGap.member_id == member_id,
                    MemberGap.measure_id == measure.id,
                    MemberGap.measurement_year == measurement_year,
                    MemberGap.due_date == followup_deadline,
                )
            )
            existing_gap = existing.scalar_one_or_none()

            if has_followup:
                if existing_gap and existing_gap.status == GapStatus.open.value:
                    existing_gap.status = GapStatus.closed.value
                    existing_gap.closed_date = today
                    closed += 1
            else:
                if not existing_gap:
                    # Get member for provider info
                    member = await db.get(Member, member_id)
                    gap = MemberGap(
                        member_id=member_id,
                        measure_id=measure.id,
                        status=GapStatus.open.value,
                        due_date=followup_deadline,
                        measurement_year=measurement_year,
                        responsible_provider_id=member.pcp_provider_id if member else None,
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
    """Per-measure summary: eligible, open, closed, closure rate, star level, weight."""
    measurement_year = date.today().year

    result = await db.execute(
        select(GapMeasure).where(GapMeasure.is_active == True).order_by(GapMeasure.code)  # noqa: E712
    )
    measures = result.scalars().all()

    summaries = []
    for measure in measures:
        # Count gaps by status for this measure in measurement year
        counts = await db.execute(
            select(
                MemberGap.status,
                func.count(MemberGap.id),
            )
            .where(
                MemberGap.measure_id == measure.id,
                MemberGap.measurement_year == measurement_year,
            )
            .group_by(MemberGap.status)
        )

        status_counts: dict[str, int] = {}
        for row in counts.all():
            status_counts[str(row[0])] = row[1]

        open_count = status_counts.get("open", 0)
        closed_count = status_counts.get("closed", 0)
        excluded_count = status_counts.get("excluded", 0)
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

    created = 0
    for gap, measure, member in rows:
        member_name = f"{member.first_name} {member.last_name}".strip()

        # Check if an action item already exists for this gap
        existing = await db.execute(
            select(ActionItem.id).where(
                ActionItem.source_type == "care_gap",
                ActionItem.member_id == member.id,
                ActionItem.title.ilike(f"%{measure.code}%"),
                ActionItem.status.in_(["open", "in_progress"]),
            )
        )
        if existing.scalar_one_or_none() is not None:
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
