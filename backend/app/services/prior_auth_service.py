"""
Prior Authorization / UM Service — CRUD, dashboards, and compliance tracking.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prior_auth import PriorAuth

logger = logging.getLogger(__name__)

# CMS turnaround requirements
URGENT_MAX_HOURS = 72
STANDARD_MAX_DAYS = 14


async def get_auth_dashboard(db: AsyncSession) -> dict:
    """Stats: pending count, avg turnaround, approval rate, compliance rate, by service type."""
    # Pending count
    pending_q = await db.execute(
        select(func.count(PriorAuth.id)).where(PriorAuth.status == "pending")
    )
    pending_count = pending_q.scalar() or 0

    # Avg turnaround (only for decided requests)
    avg_tat_q = await db.execute(
        select(func.avg(PriorAuth.turnaround_hours)).where(
            PriorAuth.turnaround_hours.isnot(None)
        )
    )
    avg_turnaround = round(float(avg_tat_q.scalar() or 0), 1)

    # Approval rate
    decided_q = await db.execute(
        select(
            func.count(PriorAuth.id).label("total"),
            func.sum(case((PriorAuth.status == "approved", 1), else_=0)).label("approved"),
        ).where(PriorAuth.status.in_(["approved", "denied", "partial"]))
    )
    decided = decided_q.one()
    total_decided = decided.total or 0
    approved_count = int(decided.approved or 0)
    approval_rate = round(
        (approved_count / total_decided * 100) if total_decided > 0 else 0, 1
    )

    # Compliance rate
    compliance_q = await db.execute(
        select(
            func.count(PriorAuth.id).label("total"),
            func.sum(case((PriorAuth.compliant == True, 1), else_=0)).label("compliant"),
        ).where(PriorAuth.compliant.isnot(None))
    )
    comp = compliance_q.one()
    total_comp = comp.total or 0
    compliant_count = int(comp.compliant or 0)
    compliance_rate = round(
        (compliant_count / total_comp * 100) if total_comp > 0 else 0, 1
    )

    # By service type
    by_type_q = await db.execute(
        select(
            PriorAuth.service_type,
            func.count(PriorAuth.id).label("count"),
        )
        .group_by(PriorAuth.service_type)
        .order_by(func.count(PriorAuth.id).desc())
    )
    by_service_type = [
        {"service_type": r.service_type, "count": r.count}
        for r in by_type_q.all()
    ]

    return {
        "pending_count": pending_count,
        "avg_turnaround_hours": avg_turnaround,
        "approval_rate": approval_rate,
        "compliance_rate": compliance_rate,
        "by_service_type": by_service_type,
    }


async def get_auth_requests(
    db: AsyncSession,
    status: str | None = None,
    urgency: str | None = None,
    service_type: str | None = None,
    provider: str | None = None,
) -> list[dict]:
    """List auth requests with optional filters."""
    query = select(PriorAuth).order_by(PriorAuth.request_date.desc())
    if status:
        query = query.where(PriorAuth.status == status)
    if urgency:
        query = query.where(PriorAuth.urgency == urgency)
    if service_type:
        query = query.where(PriorAuth.service_type == service_type)
    if provider:
        # Escape SQL LIKE wildcards in user input
        escaped_provider = provider.replace("%", r"\%").replace("_", r"\_")
        query = query.where(
            PriorAuth.requesting_provider_name.ilike(f"%{escaped_provider}%")
        )
    result = await db.execute(query)
    auths = result.scalars().all()

    return [_auth_to_dict(a) for a in auths]


async def get_auth_detail(db: AsyncSession, auth_id: int) -> dict | None:
    """Return full auth request detail."""
    result = await db.execute(select(PriorAuth).where(PriorAuth.id == auth_id))
    auth = result.scalar_one_or_none()
    if not auth:
        return None
    return _auth_to_dict(auth)


async def create_auth_request(db: AsyncSession, data: dict) -> dict:
    """Create a new auth request."""
    auth = PriorAuth(**data)
    db.add(auth)
    await db.flush()
    await db.refresh(auth)
    return {"id": auth.id, "status": "created"}


async def update_auth_request(db: AsyncSession, auth_id: int, data: dict) -> dict | None:
    """Update an auth request (approve, deny, appeal, etc.)."""
    result = await db.execute(select(PriorAuth).where(PriorAuth.id == auth_id))
    auth = result.scalar_one_or_none()
    if not auth:
        return None
    for key, value in data.items():
        if hasattr(auth, key):
            setattr(auth, key, value)
    await db.flush()
    return {"id": auth.id, "status": "updated"}


async def get_compliance_report(db: AsyncSession) -> dict:
    """CMS turnaround compliance report."""
    result = await db.execute(
        select(
            PriorAuth.urgency,
            func.count(PriorAuth.id).label("total"),
            func.sum(case((PriorAuth.compliant == True, 1), else_=0)).label("compliant"),
            func.avg(PriorAuth.turnaround_hours).label("avg_tat"),
        )
        .where(PriorAuth.decision_date.isnot(None))
        .group_by(PriorAuth.urgency)
    )

    rows = result.all()
    return {
        "by_urgency": [
            {
                "urgency": r.urgency,
                "total": r.total,
                "compliant": int(r.compliant or 0),
                "compliance_rate": round(
                    (int(r.compliant or 0) / r.total * 100) if r.total > 0 else 0, 1
                ),
                "avg_turnaround_hours": round(float(r.avg_tat or 0), 1),
                "max_allowed_hours": URGENT_MAX_HOURS if r.urgency == "urgent" else STANDARD_MAX_DAYS * 24,
            }
            for r in rows
        ]
    }


async def get_overdue_requests(db: AsyncSession) -> list[dict]:
    """Requests past CMS deadlines (urgent >72hr, standard >14 days)."""
    today = date.today()

    result = await db.execute(
        select(PriorAuth).where(
            PriorAuth.status == "pending",
            or_(
                and_(
                    PriorAuth.urgency == "urgent",
                    PriorAuth.request_date <= today - timedelta(days=3),
                ),
                and_(
                    PriorAuth.urgency == "standard",
                    PriorAuth.request_date <= today - timedelta(days=14),
                ),
            ),
        )
    )
    auths = result.scalars().all()
    return [_auth_to_dict(a) for a in auths]


def _auth_to_dict(a: PriorAuth) -> dict:
    """Convert a PriorAuth model to a dict."""
    return {
        "id": a.id,
        "auth_number": a.auth_number,
        "member_id": a.member_id,
        "service_type": a.service_type,
        "procedure_code": a.procedure_code,
        "diagnosis_code": a.diagnosis_code,
        "requesting_provider_npi": a.requesting_provider_npi,
        "requesting_provider_name": a.requesting_provider_name,
        "servicing_provider_npi": a.servicing_provider_npi,
        "servicing_facility": a.servicing_facility,
        "request_date": str(a.request_date) if a.request_date else None,
        "decision_date": str(a.decision_date) if a.decision_date else None,
        "auth_start_date": str(a.auth_start_date) if a.auth_start_date else None,
        "auth_end_date": str(a.auth_end_date) if a.auth_end_date else None,
        "urgency": a.urgency,
        "status": a.status,
        "decision": a.decision,
        "approved_units": a.approved_units,
        "denial_reason": a.denial_reason,
        "appeal_date": str(a.appeal_date) if a.appeal_date else None,
        "appeal_status": a.appeal_status,
        "peer_to_peer_date": str(a.peer_to_peer_date) if a.peer_to_peer_date else None,
        "turnaround_hours": a.turnaround_hours,
        "compliant": a.compliant,
        "reviewer_id": a.reviewer_id,
        "reviewer_name": a.reviewer_name,
        "notes": a.notes,
    }
