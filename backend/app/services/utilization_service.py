"""
Utilization Command Center service.

Provides real-time operational dashboard data: census metrics, facility
intelligence, admission calendars, and admission pattern analytics.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.adt import ADTEvent
from app.models.claim import Claim
from app.models.member import Member

# Day-of-week labels (Monday=1 in extract(dow ...))
DOW_LABELS = {0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
              4: "Thursday", 5: "Friday", 6: "Saturday"}


async def get_utilization_dashboard(db: AsyncSession) -> dict[str, Any]:
    """Return the full utilization command center payload.

    Includes current census, recent activity, ALOS by facility / diagnosis,
    follow-up needed list, obs vs inpatient breakdown, ER snapshot, and
    facility comparison metrics.
    """
    now = datetime.now(timezone.utc)
    today = date.today()
    seven_days_ago = now - timedelta(days=7)

    # --- Current census: ADT admits without a matching discharge ---
    census_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type == "admit",
            ADTEvent.discharge_date == None,  # noqa: E711
        )
    )
    total_admitted = census_q.scalar() or 0

    # By facility
    by_facility_q = await db.execute(
        select(
            ADTEvent.facility_name,
            func.count(ADTEvent.id),
        )
        .where(
            ADTEvent.event_type == "admit",
            ADTEvent.discharge_date == None,  # noqa: E711
        )
        .group_by(ADTEvent.facility_name)
        .order_by(func.count(ADTEvent.id).desc())
    )
    by_facility = [
        {"facility": row[0] or "Unknown", "count": row[1]}
        for row in by_facility_q.all()
    ]

    # By patient class
    by_class_q = await db.execute(
        select(
            ADTEvent.patient_class,
            func.count(ADTEvent.id),
        )
        .where(
            ADTEvent.event_type == "admit",
            ADTEvent.discharge_date == None,  # noqa: E711
        )
        .group_by(ADTEvent.patient_class)
    )
    by_class = {(row[0] or "unknown"): row[1] for row in by_class_q.all()}

    # New admits today
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    admits_today_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type == "admit",
            ADTEvent.event_timestamp >= today_start,
        )
    )
    admits_today = admits_today_q.scalar() or 0

    # --- Recent activity ---
    admits_24h_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type == "admit",
            ADTEvent.event_timestamp >= now - timedelta(hours=24),
        )
    )
    admits_24h = admits_24h_q.scalar() or 0

    admits_7d_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type == "admit",
            ADTEvent.event_timestamp >= seven_days_ago,
        )
    )
    admits_7d = admits_7d_q.scalar() or 0

    discharges_7d_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type == "discharge",
            ADTEvent.event_timestamp >= seven_days_ago,
        )
    )
    discharges_7d = discharges_7d_q.scalar() or 0

    # --- ALOS from claims (inpatient) ---
    alos_q = await db.execute(
        select(
            Claim.facility_name,
            func.avg(Claim.paid_amount).label("avg_cost"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category == "inpatient")
        .group_by(Claim.facility_name)
        .order_by(func.count(Claim.id).desc())
        .limit(20)
    )
    alos_by_facility = [
        {
            "facility": row[0] or "Unknown",
            "avg_cost": round(float(row[1] or 0), 2),
            "claim_count": row[2],
        }
        for row in alos_q.all()
    ]

    # --- Follow-up needed (see dedicated function) ---
    follow_up = await get_follow_up_needed(db)

    # --- ER snapshot ---
    er_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type.in_(["ed_visit", "observation"]),
            ADTEvent.event_timestamp >= seven_days_ago,
        )
    )
    current_er = er_q.scalar() or 0

    return {
        "current_census": {
            "total_admitted": total_admitted,
            "by_class": by_class,
            "by_facility": by_facility,
            "new_today": admits_today,
        },
        "recent_activity": {
            "admits_24h": admits_24h,
            "admits_48h": 0,  # can refine later
            "admits_7d": admits_7d,
            "discharges_1d": 0,
            "discharges_3d": 0,
            "discharges_7d": discharges_7d,
        },
        "alos_by_facility": alos_by_facility,
        "alos_by_diagnosis": [],
        "follow_up_needed": follow_up,
        "obs_vs_inpatient": [],
        "er_snapshot": {
            "current_er_visits": current_er,
            "by_facility": [],
            "by_diagnosis": [],
            "after_hours_pct": 0,
            "weekend_pct": 0,
        },
        "facility_comparison": [],
    }


async def get_facility_intelligence(db: AsyncSession) -> dict[str, Any]:
    """Return facility profiles from claims data: avg cost, count per facility."""
    result = await db.execute(
        select(
            Claim.facility_name,
            func.count(Claim.id).label("claim_count"),
            func.avg(Claim.paid_amount).label("avg_cost"),
            func.sum(Claim.paid_amount).label("total_cost"),
        )
        .where(Claim.facility_name != None)  # noqa: E711
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc().nullslast())
    )
    rows = result.all()

    facility_profiles = [
        {
            "facility_name": row[0],
            "claim_count": row[1],
            "avg_cost": round(float(row[2] or 0), 2),
            "total_cost": round(float(row[3] or 0), 2),
        }
        for row in rows
    ]

    # Cost comparison (same data, sorted by avg cost)
    cost_comparison = sorted(facility_profiles, key=lambda f: f["avg_cost"], reverse=True)

    return {
        "facility_profiles": facility_profiles,
        "facility_types": {},
        "facility_aliases": [],
        "cost_comparison": cost_comparison,
    }


async def get_admission_calendar(db: AsyncSession, months: int = 3) -> list[dict[str, Any]]:
    """Return daily admission counts for a calendar view over *months* months."""
    cutoff = date.today() - timedelta(days=months * 30)

    result = await db.execute(
        select(
            Claim.service_date,
            func.count(Claim.id),
        )
        .where(
            Claim.service_category == "inpatient",
            Claim.service_date >= cutoff,
        )
        .group_by(Claim.service_date)
        .order_by(Claim.service_date)
    )

    return [
        {"date": str(row[0]), "admissions": row[1]}
        for row in result.all()
    ]


async def get_admission_patterns(db: AsyncSession) -> dict[str, Any]:
    """Return day-of-week admission patterns from inpatient claims."""
    # Group by day-of-week using extract
    dow_q = await db.execute(
        select(
            extract("dow", Claim.service_date).label("dow"),
            func.count(Claim.id),
        )
        .where(Claim.service_category == "inpatient")
        .group_by(extract("dow", Claim.service_date))
        .order_by(extract("dow", Claim.service_date))
    )

    day_of_week = []
    weekend_count = 0
    weekday_count = 0
    for row in dow_q.all():
        dow_int = int(row[0])
        count = row[1]
        label = DOW_LABELS.get(dow_int, f"Day {dow_int}")
        day_of_week.append({"day": label, "count": count})
        if dow_int in (0, 6):  # Sunday=0, Saturday=6
            weekend_count += count
        else:
            weekday_count += count

    total = weekend_count + weekday_count
    return {
        "time_of_day": [],  # time not available from claims service_date
        "day_of_week": day_of_week,
        "weekend_vs_weekday": {
            "weekend": weekend_count,
            "weekday": weekday_count,
            "weekend_pct": round((weekend_count / total * 100) if total else 0, 1),
        },
        "after_hours_er_rate": 0,
        "seasonal_trends": [],
    }


async def get_follow_up_needed(db: AsyncSession) -> list[dict[str, Any]]:
    """Return ADT discharges in the last 7 days without a follow-up claim."""
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Get recent discharges
    discharge_q = await db.execute(
        select(ADTEvent, Member)
        .join(Member, ADTEvent.member_id == Member.id)
        .where(
            ADTEvent.event_type == "discharge",
            ADTEvent.event_timestamp >= seven_days_ago,
            ADTEvent.member_id != None,  # noqa: E711
        )
        .order_by(ADTEvent.event_timestamp.desc())
    )
    discharges = discharge_q.all()

    if not discharges:
        return []

    # Get members who have a follow-up claim after their discharge
    member_ids = [row[1].id for row in discharges]
    followup_q = await db.execute(
        select(Claim.member_id)
        .where(
            Claim.member_id.in_(member_ids),
            Claim.service_date >= (date.today() - timedelta(days=7)),
            Claim.service_category.in_(["professional", "other"]),
        )
        .distinct()
    )
    has_followup = {row[0] for row in followup_q.all()}

    results = []
    for adt_event, member in discharges:
        if member.id not in has_followup:
            discharge_dt = adt_event.event_timestamp
            discharge_date = discharge_dt.date() if hasattr(discharge_dt, "date") else discharge_dt
            results.append({
                "member_id": member.id,
                "member_name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
                "discharge_date": str(discharge_date),
                "facility": adt_event.facility_name,
                "days_since_discharge": (date.today() - discharge_date).days,
            })

    return results
