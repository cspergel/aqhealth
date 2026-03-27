"""
Transitional Care Management (TCM) Tracking Service.

Manages post-discharge TCM workflows: phone contact within 2 business days,
face-to-face visit within 7 days (99495) or 14 days (99496).
Tracks compliance, revenue generation, and per-provider performance.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.adt import ADTEvent
from app.models.annotation import Annotation
from app.models.member import Member

logger = logging.getLogger(__name__)

# TCM billing codes
TCM_CPT_HIGH = "99495"  # face-to-face within 7 days
TCM_CPT_MOD = "99496"   # face-to-face within 14 days
TCM_REVENUE_HIGH = 256.0
TCM_REVENUE_MOD = 168.0

# Business-day deadline for phone contact
PHONE_CONTACT_DAYS = 2
# Calendar-day deadline for visit
VISIT_DAYS_HIGH = 7
VISIT_DAYS_MOD = 14


# ---------------------------------------------------------------------------
# TCM Dashboard
# ---------------------------------------------------------------------------

async def get_tcm_dashboard(db: AsyncSession) -> dict[str, Any]:
    """
    Return TCM metrics: active cases, compliance rate, revenue captured
    and potential, broken down by provider.
    """
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    # Count discharge events in last 30 days
    discharge_count_q = await db.execute(
        select(func.count(ADTEvent.id)).where(
            ADTEvent.event_type == "discharge",
            ADTEvent.event_timestamp >= thirty_days_ago,
            ADTEvent.member_id != None,  # noqa: E711
        )
    )
    active_cases = discharge_count_q.scalar() or 0

    if active_cases == 0:
        return {
            "active_cases": 0,
            "compliance_rate": 0.0,
            "revenue_captured": 0,
            "revenue_potential": 0,
            "by_provider": [],
        }

    # Check which discharges have a phone contact annotation
    # Phone contact = annotation on the member with note_type in
    # ("call_log", "outreach") created after the discharge
    phone_contacted_q = await db.execute(
        select(func.count(func.distinct(ADTEvent.member_id))).where(
            ADTEvent.event_type == "discharge",
            ADTEvent.event_timestamp >= thirty_days_ago,
            ADTEvent.member_id != None,  # noqa: E711
            ADTEvent.member_id.in_(
                select(Annotation.entity_id).where(
                    Annotation.entity_type == "member",
                    Annotation.note_type.in_(["call_log", "outreach", "tcm_phone"]),
                    Annotation.created_at >= thirty_days_ago,
                )
            ),
        )
    )
    phone_contacted = phone_contacted_q.scalar() or 0

    compliance_rate = round((phone_contacted / active_cases * 100) if active_cases else 0, 1)
    revenue_potential = round(active_cases * TCM_REVENUE_MOD)
    revenue_captured = round(phone_contacted * TCM_REVENUE_MOD)

    # By provider (PCP of the discharged member)
    provider_q = await db.execute(
        select(
            Member.pcp_provider_id,
            func.count(ADTEvent.id),
        )
        .join(Member, ADTEvent.member_id == Member.id)
        .where(
            ADTEvent.event_type == "discharge",
            ADTEvent.event_timestamp >= thirty_days_ago,
            Member.pcp_provider_id != None,  # noqa: E711
        )
        .group_by(Member.pcp_provider_id)
    )
    by_provider = [
        {"provider_id": row[0], "discharge_count": row[1]}
        for row in provider_q.all()
    ]

    return {
        "active_cases": active_cases,
        "compliance_rate": compliance_rate,
        "revenue_captured": revenue_captured,
        "revenue_potential": revenue_potential,
        "by_provider": by_provider,
    }


# ---------------------------------------------------------------------------
# Active TCM Cases
# ---------------------------------------------------------------------------

async def get_active_tcm_cases(db: AsyncSession) -> list[dict[str, Any]]:
    """
    Members discharged in the last 30 days with TCM status tracking:
    - phone_contact: done / pending / overdue
    - visit: done / pending / overdue / missed
    - billing_status: billed / pending / not_eligible
    """
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    today = date.today()

    # Get discharge events with member info
    result = await db.execute(
        select(ADTEvent, Member)
        .join(Member, ADTEvent.member_id == Member.id)
        .where(
            ADTEvent.event_type == "discharge",
            ADTEvent.event_timestamp >= thirty_days_ago,
            ADTEvent.member_id != None,  # noqa: E711
        )
        .order_by(ADTEvent.event_timestamp.desc())
    )
    rows = result.all()

    if not rows:
        return []

    # Batch-fetch annotations for these members (phone contacts / visit notes)
    member_ids = list({row[1].id for row in rows})
    ann_result = await db.execute(
        select(Annotation).where(
            Annotation.entity_type == "member",
            Annotation.entity_id.in_(member_ids),
            Annotation.note_type.in_(["call_log", "outreach", "tcm_phone", "tcm_visit", "clinical"]),
            Annotation.created_at >= thirty_days_ago,
        )
    )
    annotations = ann_result.scalars().all()

    # Index annotations by member
    member_annotations: dict[int, list] = {}
    for ann in annotations:
        member_annotations.setdefault(ann.entity_id, []).append(ann)

    cases = []
    for adt_event, member in rows:
        discharge_dt = adt_event.event_timestamp
        discharge_date = discharge_dt.date() if hasattr(discharge_dt, "date") else discharge_dt
        days_since = (today - discharge_date).days

        # Determine phone contact status
        member_anns = member_annotations.get(member.id, [])
        has_phone = any(
            a.note_type in ("call_log", "outreach", "tcm_phone") for a in member_anns
        )
        if has_phone:
            phone_status = "done"
        elif days_since > PHONE_CONTACT_DAYS:
            phone_status = "overdue"
        else:
            phone_status = "pending"

        # Determine visit status
        has_visit = any(
            a.note_type in ("tcm_visit", "clinical") for a in member_anns
        )
        if has_visit:
            visit_status = "done"
        elif days_since > VISIT_DAYS_MOD:
            visit_status = "missed"
        elif days_since > VISIT_DAYS_HIGH:
            visit_status = "overdue"
        else:
            visit_status = "pending"

        cases.append({
            "member_id": member.id,
            "member_name": f"{member.first_name} {member.last_name}".strip(),
            "discharge_date": str(discharge_date),
            "facility_name": adt_event.facility_name,
            "days_since_discharge": days_since,
            "phone_contact": phone_status,
            "visit": visit_status,
            "billing_status": "billed" if (has_phone and has_visit) else "pending",
            "pcp_provider_id": member.pcp_provider_id,
        })

    return cases


# ---------------------------------------------------------------------------
# Update TCM Status
# ---------------------------------------------------------------------------

async def update_tcm_status(
    db: AsyncSession,
    member_id: str,
    updates: dict[str, Any],
) -> dict[str, Any]:
    """
    Record phone contact completion, visit completion, or billing status change
    for a TCM case by creating an annotation on the member.
    """
    note_type = "tcm_phone"
    content = "TCM status update"

    if updates.get("phone_contact") == "done":
        note_type = "tcm_phone"
        content = "TCM phone contact completed"
    elif updates.get("visit") == "done":
        note_type = "tcm_visit"
        content = "TCM face-to-face visit completed"

    annotation = Annotation(
        entity_type="member",
        entity_id=int(member_id),
        content=updates.get("notes", content),
        note_type=note_type,
        author_id=updates.get("author_id", 0),
        author_name=updates.get("author_name", "System"),
    )
    db.add(annotation)
    await db.flush()

    return {"member_id": member_id, "updated": True, **updates}
