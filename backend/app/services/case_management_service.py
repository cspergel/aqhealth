"""
Case Management Service — CRUD for case assignments, notes, and caseload analytics.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.case_management import CaseAssignment, CaseNote

logger = logging.getLogger(__name__)


async def get_case_dashboard(db: AsyncSession) -> dict:
    """Caseload overview with totals, by manager, by priority, overdue contacts."""
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    # Total active cases
    total_q = await db.execute(
        select(func.count(CaseAssignment.id)).where(CaseAssignment.status == "active")
    )
    total_active = total_q.scalar() or 0

    # By care manager
    by_manager_q = await db.execute(
        select(
            CaseAssignment.care_manager_name,
            CaseAssignment.care_manager_id,
            func.count(CaseAssignment.id).label("case_count"),
        )
        .where(CaseAssignment.status == "active")
        .group_by(CaseAssignment.care_manager_name, CaseAssignment.care_manager_id)
    )
    by_manager = [
        {"care_manager_id": r.care_manager_id, "care_manager_name": r.care_manager_name, "case_count": r.case_count}
        for r in by_manager_q.all()
    ]

    # By priority
    by_priority_q = await db.execute(
        select(
            CaseAssignment.priority,
            func.count(CaseAssignment.id).label("count"),
        )
        .where(CaseAssignment.status == "active")
        .group_by(CaseAssignment.priority)
    )
    by_priority = {r.priority: r.count for r in by_priority_q.all()}

    # Overdue contacts (no contact in 30+ days)
    overdue_q = await db.execute(
        select(func.count(CaseAssignment.id)).where(
            CaseAssignment.status == "active",
            (CaseAssignment.last_contact_date.is_(None))
            | (CaseAssignment.last_contact_date < thirty_days_ago),
        )
    )
    overdue_contacts = overdue_q.scalar() or 0

    return {
        "total_active": total_active,
        "by_manager": by_manager,
        "by_priority": by_priority,
        "overdue_contacts": overdue_contacts,
    }


async def get_cases(db: AsyncSession, care_manager_id: int | None = None) -> list[dict]:
    """Return cases optionally filtered by care manager."""
    query = select(CaseAssignment).order_by(CaseAssignment.created_at.desc())
    if care_manager_id is not None:
        query = query.where(CaseAssignment.care_manager_id == care_manager_id)
    result = await db.execute(query)
    cases = result.scalars().all()

    return [
        {
            "id": c.id,
            "member_id": c.member_id,
            "care_manager_id": c.care_manager_id,
            "care_manager_name": c.care_manager_name,
            "assignment_date": str(c.assignment_date) if c.assignment_date else None,
            "end_date": str(c.end_date) if c.end_date else None,
            "reason": c.reason,
            "status": c.status,
            "priority": c.priority,
            "last_contact_date": str(c.last_contact_date) if c.last_contact_date else None,
            "next_contact_date": str(c.next_contact_date) if c.next_contact_date else None,
            "contact_count": c.contact_count,
            "notes": c.notes,
        }
        for c in cases
    ]


async def get_case_detail(db: AsyncSession, case_id: int) -> dict | None:
    """Return a case with its notes."""
    result = await db.execute(select(CaseAssignment).where(CaseAssignment.id == case_id))
    c = result.scalar_one_or_none()
    if not c:
        return None

    notes_result = await db.execute(
        select(CaseNote)
        .where(CaseNote.assignment_id == case_id)
        .order_by(CaseNote.created_at.desc())
    )
    notes = notes_result.scalars().all()

    return {
        "id": c.id,
        "member_id": c.member_id,
        "care_manager_id": c.care_manager_id,
        "care_manager_name": c.care_manager_name,
        "assignment_date": str(c.assignment_date),
        "end_date": str(c.end_date) if c.end_date else None,
        "reason": c.reason,
        "status": c.status,
        "priority": c.priority,
        "last_contact_date": str(c.last_contact_date) if c.last_contact_date else None,
        "next_contact_date": str(c.next_contact_date) if c.next_contact_date else None,
        "contact_count": c.contact_count,
        "notes": c.notes,
        "case_notes": [
            {
                "id": n.id,
                "note_type": n.note_type,
                "content": n.content,
                "contact_method": n.contact_method,
                "duration_minutes": n.duration_minutes,
                "author_id": n.author_id,
                "author_name": n.author_name,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notes
        ],
    }


async def create_case(db: AsyncSession, data: dict) -> dict:
    """Assign a member to a care manager."""
    assignment = CaseAssignment(**data)
    db.add(assignment)
    await db.flush()
    await db.refresh(assignment)
    return {"id": assignment.id, "status": "created"}


async def update_case(db: AsyncSession, case_id: int, data: dict) -> dict | None:
    """Update a case assignment."""
    result = await db.execute(select(CaseAssignment).where(CaseAssignment.id == case_id))
    c = result.scalar_one_or_none()
    if not c:
        return None
    for key, value in data.items():
        if hasattr(c, key):
            setattr(c, key, value)
    await db.flush()
    return {"id": c.id, "status": "updated"}


async def add_case_note(db: AsyncSession, case_id: int, data: dict) -> dict:
    """Add a note to a case and update contact tracking."""
    note = CaseNote(assignment_id=case_id, **data)
    db.add(note)

    # Update last contact on the assignment
    result = await db.execute(select(CaseAssignment).where(CaseAssignment.id == case_id))
    c = result.scalar_one_or_none()
    if c:
        c.last_contact_date = date.today()
        c.contact_count = (c.contact_count or 0) + 1

    await db.flush()
    await db.refresh(note)
    return {"id": note.id, "status": "created"}


async def get_workload(db: AsyncSession) -> list[dict]:
    """Workload balance across care managers."""
    today = date.today()
    thirty_days_ago = today - timedelta(days=30)

    result = await db.execute(
        select(
            CaseAssignment.care_manager_id,
            CaseAssignment.care_manager_name,
            func.count(CaseAssignment.id).label("total_cases"),
            func.sum(case((CaseAssignment.priority == "high", 1), else_=0)).label("high_priority"),
            func.sum(
                case(
                    (
                        and_(
                            CaseAssignment.status == "active",
                            (CaseAssignment.last_contact_date.is_(None))
                            | (CaseAssignment.last_contact_date < thirty_days_ago),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("overdue"),
        )
        .where(CaseAssignment.status == "active")
        .group_by(CaseAssignment.care_manager_id, CaseAssignment.care_manager_name)
    )

    return [
        {
            "care_manager_id": r.care_manager_id,
            "care_manager_name": r.care_manager_name,
            "total_cases": r.total_cases,
            "high_priority": int(r.high_priority or 0),
            "overdue_contacts": int(r.overdue or 0),
        }
        for r in result.all()
    ]
