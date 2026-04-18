"""
Member Roster / Panel Management Service.

Provides filtered, paginated member lists with computed fields,
member detail, and aggregate stats for the filtered population.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.provider import Provider
from app.models.practice_group import PracticeGroup
from app.models.claim import Claim
from app.models.hcc import HccSuspect
from app.models.care_gap import MemberGap

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Get Member List (paginated + filtered)
# ---------------------------------------------------------------------------

async def get_member_list(db: AsyncSession, filters: dict[str, Any]) -> dict:
    """
    Query members with all filters, includes computed fields.

    Supported filter keys:
    - raf_min, raf_max: float
    - days_not_seen: int (members not seen in X+ days)
    - risk_tier: str (low, rising, high, complex)
    - provider_id: int
    - group_id: int
    - has_suspects: bool
    - has_gaps: bool
    - plan: str
    - search: str (name or member_id)
    - min_er_visits: int
    - min_admissions: int
    - sort_by: str (raf, name, last_visit, suspect_count, gap_count, spend)
    - order: str (asc, desc)
    - page: int
    - page_size: int
    """
    today = date.today()
    twelve_months_ago = today - timedelta(days=365)

    # Subquery: days since last visit (MAX service_date per member)
    last_visit_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.max(Claim.service_date).label("last_visit_date"),
        )
        .group_by(Claim.member_id)
        .subquery("last_visit_sq")
    )

    # Subquery: open suspect count per member
    suspect_sq = (
        select(
            HccSuspect.member_id.label("member_id"),
            func.count(HccSuspect.id).label("suspect_count"),
        )
        .where(HccSuspect.status == "open")
        .group_by(HccSuspect.member_id)
        .subquery("suspect_sq")
    )

    # Subquery: open gap count per member
    gap_sq = (
        select(
            MemberGap.member_id.label("member_id"),
            func.count(MemberGap.id).label("gap_count"),
        )
        .where(MemberGap.status == "open")
        .group_by(MemberGap.member_id)
        .subquery("gap_sq")
    )

    # Subquery: ER visits in last 12 months
    er_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.count(Claim.id).label("er_visits_12mo"),
        )
        .where(
            Claim.service_category == "ed_observation",
            Claim.service_date >= twelve_months_ago,
        )
        .group_by(Claim.member_id)
        .subquery("er_sq")
    )

    # Subquery: admissions in last 12 months
    admit_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.count(Claim.id).label("admissions_12mo"),
        )
        .where(
            Claim.service_category == "inpatient",
            Claim.service_date >= twelve_months_ago,
        )
        .group_by(Claim.member_id)
        .subquery("admit_sq")
    )

    # Subquery: total spend in last 12 months
    spend_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend_12mo"),
        )
        .where(Claim.service_date >= twelve_months_ago)
        .group_by(Claim.member_id)
        .subquery("spend_sq")
    )

    # Build main query
    suspect_count_col = func.coalesce(suspect_sq.c.suspect_count, 0).label("suspect_count")
    gap_count_col = func.coalesce(gap_sq.c.gap_count, 0).label("gap_count")
    # Use epoch division to get total days from an interval.
    # extract('day', interval) returns only the "days" component, not total days.
    # extract('epoch', interval) / 86400 gives the correct total number of days.
    # Keep NULL when there's no last_visit_date. A sentinel like 9999 would
    # trip every "days not seen >= N" alert rule for members who simply have
    # no visit history yet.
    days_since_visit_col = func.floor(
        func.extract("epoch", func.current_date() - last_visit_sq.c.last_visit_date) / 86400
    ).label("days_since_visit")
    total_spend_col = func.coalesce(spend_sq.c.total_spend_12mo, 0).label("total_spend_12mo")
    er_visits_col = func.coalesce(er_sq.c.er_visits_12mo, 0).label("er_visits_12mo")
    admissions_col = func.coalesce(admit_sq.c.admissions_12mo, 0).label("admissions_12mo")

    query = (
        select(
            Member.id,
            Member.member_id,
            Member.first_name,
            Member.last_name,
            Member.date_of_birth,
            Member.gender,
            Member.health_plan,
            Member.plan_product,
            Member.coverage_start,
            Member.coverage_end,
            Member.pcp_provider_id,
            Member.current_raf,
            Member.projected_raf,
            Member.risk_tier,
            Provider.first_name.label("pcp_first_name"),
            Provider.last_name.label("pcp_last_name"),
            PracticeGroup.name.label("group_name"),
            last_visit_sq.c.last_visit_date,
            days_since_visit_col,
            suspect_count_col,
            gap_count_col,
            total_spend_col,
            er_visits_col,
            admissions_col,
        )
        .outerjoin(Provider, Member.pcp_provider_id == Provider.id)
        .outerjoin(PracticeGroup, Provider.practice_group_id == PracticeGroup.id)
        .outerjoin(last_visit_sq, Member.id == last_visit_sq.c.member_id)
        .outerjoin(suspect_sq, Member.id == suspect_sq.c.member_id)
        .outerjoin(gap_sq, Member.id == gap_sq.c.member_id)
        .outerjoin(er_sq, Member.id == er_sq.c.member_id)
        .outerjoin(admit_sq, Member.id == admit_sq.c.member_id)
        .outerjoin(spend_sq, Member.id == spend_sq.c.member_id)
    )

    # Apply filters
    conditions = []

    if filters.get("raf_min") is not None:
        conditions.append(Member.current_raf >= filters["raf_min"])
    if filters.get("raf_max") is not None:
        conditions.append(Member.current_raf <= filters["raf_max"])
    if filters.get("risk_tier"):
        conditions.append(Member.risk_tier == filters["risk_tier"])
    if filters.get("provider_id") is not None:
        conditions.append(Member.pcp_provider_id == filters["provider_id"])
    if filters.get("group_id") is not None:
        conditions.append(Provider.practice_group_id == filters["group_id"])
    if filters.get("plan"):
        conditions.append(Member.health_plan == filters["plan"])
    if filters.get("search"):
        search = filters["search"].replace("%", r"\%").replace("_", r"\_")
        q = f"%{search}%"
        conditions.append(
            or_(
                func.concat(Member.first_name, " ", Member.last_name).ilike(q),
                Member.member_id.ilike(q),
            )
        )

    if conditions:
        query = query.where(and_(*conditions))

    # HAVING-style filters applied after query via wrapping in a subquery
    # For filters that depend on computed columns, use subquery wrapping
    having_filters = {}
    if filters.get("days_not_seen") is not None:
        having_filters["days_not_seen"] = filters["days_not_seen"]
    if filters.get("has_suspects") is True:
        having_filters["has_suspects"] = True
    if filters.get("has_gaps") is True:
        having_filters["has_gaps"] = True
    if filters.get("min_er_visits") is not None:
        having_filters["min_er_visits"] = filters["min_er_visits"]
    if filters.get("min_admissions") is not None:
        having_filters["min_admissions"] = filters["min_admissions"]

    # Wrap in subquery for computed-column filtering
    sq = query.subquery("member_sq")

    # Build outer query with all columns
    outer = select(sq)

    if having_filters.get("days_not_seen") is not None:
        # "Overdue for a visit" means BOTH (a) seen longer ago than the
        # threshold AND (b) never seen at all — both are operationally
        # overdue. NULL >= N is NULL (excluded by default), so add an
        # explicit IS NULL branch.
        threshold = having_filters["days_not_seen"]
        outer = outer.where(
            (sq.c.days_since_visit >= threshold) | (sq.c.days_since_visit.is_(None))
        )
    if having_filters.get("has_suspects"):
        outer = outer.where(sq.c.suspect_count > 0)
    if having_filters.get("has_gaps"):
        outer = outer.where(sq.c.gap_count > 0)
    if having_filters.get("min_er_visits") is not None:
        outer = outer.where(sq.c.er_visits_12mo >= having_filters["min_er_visits"])
    if having_filters.get("min_admissions") is not None:
        outer = outer.where(sq.c.admissions_12mo >= having_filters["min_admissions"])

    # Sort
    sort_by = filters.get("sort_by", "raf")
    order = filters.get("order", "desc")
    sort_map = {
        "raf": sq.c.current_raf,
        "name": sq.c.last_name,
        "last_visit": sq.c.days_since_visit,
        "suspect_count": sq.c.suspect_count,
        "gap_count": sq.c.gap_count,
        "spend": sq.c.total_spend_12mo,
    }
    sort_col = sort_map.get(sort_by, sq.c.current_raf)
    if order == "asc":
        outer = outer.order_by(sort_col.asc().nullslast())
    else:
        outer = outer.order_by(sort_col.desc().nullslast())

    # Count total before pagination
    count_query = select(func.count()).select_from(outer.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    page = filters.get("page", 1)
    page_size = filters.get("page_size", 25)
    total_pages = max(1, (total + page_size - 1) // page_size)
    offset = (page - 1) * page_size
    outer = outer.limit(page_size).offset(offset)

    result = await db.execute(outer)
    rows = result.all()

    items = []
    for row in rows:
        pcp_name = None
        if row.pcp_first_name and row.pcp_last_name:
            pcp_name = f"Dr. {row.pcp_first_name} {row.pcp_last_name}"

        items.append({
            "member_id": row.member_id,
            "name": f"{row.first_name or ''} {row.last_name or ''}".strip(),
            "dob": str(row.date_of_birth) if row.date_of_birth else "",
            "pcp": pcp_name or "",
            "pcp_id": row.pcp_provider_id,
            "group": row.group_name or "",
            "current_raf": float(row.current_raf) if row.current_raf else 0.0,
            # Emit null for unknown tier rather than "low" — misclassifying an
            # unknown-risk member as low-risk is a clinical sentinel bug. The
            # frontend renders null as "unknown" tier badge.
            "risk_tier": row.risk_tier,
            "last_visit_date": str(row.last_visit_date) if row.last_visit_date else "",
            # Keep None when we have no visit data. A sentinel like 999 would
            # trigger every "days since visit >= 180" alert rule for new tenants.
            "days_since_visit": int(row.days_since_visit) if row.days_since_visit is not None else None,
            "suspect_count": int(row.suspect_count),
            "gap_count": int(row.gap_count),
            "total_spend_12mo": float(row.total_spend_12mo),
            "er_visits_12mo": int(row.er_visits_12mo),
            "admissions_12mo": int(row.admissions_12mo),
            "plan": row.health_plan or "",
            "has_suspects": int(row.suspect_count) > 0,
            "has_gaps": int(row.gap_count) > 0,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ---------------------------------------------------------------------------
# Get Member Detail
# ---------------------------------------------------------------------------

async def get_member_detail(db: AsyncSession, member_id: str) -> dict | None:
    """Return full member detail including demographics, RAF, suspects, gaps, claims."""

    # Find member by member_id string
    result = await db.execute(
        select(Member).where(Member.member_id == member_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        return None

    # Get PCP info
    pcp_name = None
    if member.pcp_provider_id:
        pcp_result = await db.execute(
            select(Provider).where(Provider.id == member.pcp_provider_id)
        )
        pcp = pcp_result.scalar_one_or_none()
        if pcp:
            pcp_name = f"Dr. {pcp.first_name or ''} {pcp.last_name or ''}".strip()

    # Get recent claims
    claims_result = await db.execute(
        select(Claim)
        .where(Claim.member_id == member.id)
        .order_by(Claim.service_date.desc())
        .limit(20)
    )
    claims = claims_result.scalars().all()

    recent_claims = []
    for c in claims:
        recent_claims.append({
            "date": str(c.service_date) if c.service_date else None,
            "type": c.service_category or c.claim_type or "Other",
            "provider": c.facility_name,
            "amount": float(c.paid_amount) if c.paid_amount else 0,
            "diagnoses": c.diagnosis_codes or [],
        })

    # Get open suspects
    suspects_result = await db.execute(
        select(HccSuspect)
        .where(HccSuspect.member_id == member.id, HccSuspect.status == "open")
    )
    suspects = suspects_result.scalars().all()
    suspect_list = [
        {
            "hcc_code": s.hcc_code,
            "hcc_label": s.hcc_label,
            "icd10_code": s.icd10_code,
            "raf_value": float(s.raf_value) if s.raf_value else 0,
            "confidence": s.confidence,
        }
        for s in suspects
    ]

    # Get open gaps
    gaps_result = await db.execute(
        select(MemberGap)
        .where(MemberGap.member_id == member.id, MemberGap.status == "open")
    )
    gaps = gaps_result.scalars().all()
    gap_list = [
        {
            "measure_id": g.measure_id,
            "due_date": str(g.due_date) if g.due_date else None,
            "measurement_year": g.measurement_year,
        }
        for g in gaps
    ]

    # Calculate age
    today = date.today()
    age = 0
    if member.date_of_birth:
        age = today.year - member.date_of_birth.year - (
            (today.month, today.day) < (member.date_of_birth.month, member.date_of_birth.day)
        )

    # Null convention aligned with get_member_list:
    # - strings for display (dob, pcp, plan): coerce to "" so the frontend can
    #   render without null-guards
    # - risk_tier: keep null — mapping unknown -> "low" is a clinical-sentinel
    #   bug (misclassifies as low-risk)
    return {
        "member_id": member.member_id,
        "name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
        "dob": str(member.date_of_birth) if member.date_of_birth else "",
        "pcp": pcp_name or "",
        "pcp_id": member.pcp_provider_id,
        "current_raf": float(member.current_raf) if member.current_raf else 0.0,
        "projected_raf": float(member.projected_raf) if member.projected_raf else 0.0,
        "risk_tier": member.risk_tier,
        "plan": member.health_plan or "",
        "demographics": {
            "age": age if member.date_of_birth else None,
            "gender": member.gender or "",
            "zip_code": member.zip_code or "",
        },
        "suspect_count": len(suspect_list),
        "gap_count": len(gap_list),
        "suspects": suspect_list,
        "gaps": gap_list,
        "recent_claims": recent_claims,
    }


# ---------------------------------------------------------------------------
# Get Member Stats (aggregates for filtered population)
# ---------------------------------------------------------------------------

async def get_member_stats(db: AsyncSession, filters: dict[str, Any]) -> dict:
    """Return aggregate stats for the filtered population.

    Applies the same filter set as get_member_list so "Stats for current
    filter" and "Members matching filter" never disagree.
    """
    today = date.today()
    twelve_months_ago = today - timedelta(days=365)

    # --- Subqueries (must mirror get_member_list so the filter semantics match) ---
    last_visit_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.max(Claim.service_date).label("last_visit_date"),
        )
        .group_by(Claim.member_id)
        .subquery("last_visit_sq")
    )
    suspect_sq = (
        select(
            HccSuspect.member_id.label("member_id"),
            func.count(HccSuspect.id).label("suspect_count"),
        )
        .where(HccSuspect.status == "open")
        .group_by(HccSuspect.member_id)
        .subquery("suspect_sq")
    )
    gap_sq = (
        select(
            MemberGap.member_id.label("member_id"),
            func.count(MemberGap.id).label("gap_count"),
        )
        .where(MemberGap.status == "open")
        .group_by(MemberGap.member_id)
        .subquery("gap_sq")
    )
    er_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.count(Claim.id).label("er_visits_12mo"),
        )
        .where(
            Claim.service_category == "ed_observation",
            Claim.service_date >= twelve_months_ago,
        )
        .group_by(Claim.member_id)
        .subquery("er_sq")
    )
    admit_sq = (
        select(
            Claim.member_id.label("member_id"),
            func.count(Claim.id).label("admissions_12mo"),
        )
        .where(
            Claim.service_category == "inpatient",
            Claim.service_date >= twelve_months_ago,
        )
        .group_by(Claim.member_id)
        .subquery("admit_sq")
    )

    suspect_count_col = func.coalesce(suspect_sq.c.suspect_count, 0)
    gap_count_col = func.coalesce(gap_sq.c.gap_count, 0)
    days_since_visit_col = func.floor(
        func.extract("epoch", func.current_date() - last_visit_sq.c.last_visit_date) / 86400
    )
    er_visits_col = func.coalesce(er_sq.c.er_visits_12mo, 0)
    admissions_col = func.coalesce(admit_sq.c.admissions_12mo, 0)

    query = (
        select(
            func.count(Member.id).label("count"),
            func.avg(Member.current_raf).label("avg_raf"),
            func.coalesce(func.sum(suspect_count_col), 0).label("total_suspects"),
            func.coalesce(func.sum(gap_count_col), 0).label("total_gaps"),
        )
        .outerjoin(Provider, Member.pcp_provider_id == Provider.id)
        .outerjoin(last_visit_sq, Member.id == last_visit_sq.c.member_id)
        .outerjoin(suspect_sq, Member.id == suspect_sq.c.member_id)
        .outerjoin(gap_sq, Member.id == gap_sq.c.member_id)
        .outerjoin(er_sq, Member.id == er_sq.c.member_id)
        .outerjoin(admit_sq, Member.id == admit_sq.c.member_id)
    )

    # Member-level conditions (same as get_member_list)
    conditions = []
    if filters.get("raf_min") is not None:
        conditions.append(Member.current_raf >= filters["raf_min"])
    if filters.get("raf_max") is not None:
        conditions.append(Member.current_raf <= filters["raf_max"])
    if filters.get("risk_tier"):
        conditions.append(Member.risk_tier == filters["risk_tier"])
    if filters.get("provider_id") is not None:
        conditions.append(Member.pcp_provider_id == filters["provider_id"])
    if filters.get("group_id") is not None:
        conditions.append(Provider.practice_group_id == filters["group_id"])
    if filters.get("plan"):
        conditions.append(Member.health_plan == filters["plan"])
    if filters.get("search"):
        search = filters["search"].replace("%", r"\%").replace("_", r"\_")
        q = f"%{search}%"
        conditions.append(
            or_(
                func.concat(Member.first_name, " ", Member.last_name).ilike(q),
                Member.member_id.ilike(q),
            )
        )

    # Post-aggregate conditions (same as get_member_list's having_filters)
    if filters.get("days_not_seen") is not None:
        threshold = filters["days_not_seen"]
        conditions.append(
            (days_since_visit_col >= threshold) | (days_since_visit_col.is_(None))
        )
    if filters.get("has_suspects"):
        conditions.append(suspect_count_col > 0)
    if filters.get("has_gaps"):
        conditions.append(gap_count_col > 0)
    if filters.get("min_er_visits") is not None:
        conditions.append(er_visits_col >= filters["min_er_visits"])
    if filters.get("min_admissions") is not None:
        conditions.append(admissions_col >= filters["min_admissions"])

    if conditions:
        query = query.where(and_(*conditions))

    result = await db.execute(query)
    row = result.one()

    if not row.count or row.count == 0:
        return {
            "count": 0,
            "avg_raf": 0,
            "total_suspects": 0,
            "total_gaps": 0,
        }

    return {
        "count": int(row.count),
        "avg_raf": round(float(row.avg_raf or 0), 3),
        "total_suspects": int(row.total_suspects),
        "total_gaps": int(row.total_gaps),
    }
