"""
HCC Suspect & Chase List API endpoints.

Provides paginated, filterable access to HCC suspects, member-level detail,
status updates (capture/dismiss), aggregate summaries, and CSV/Excel export.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, case, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.models.hcc import HccSuspect, RafHistory, SuspectStatus, SuspectType
from app.models.member import Member, RiskTier
from app.models.provider import Provider
from app.services.export_service import export_to_csv, export_to_excel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hcc", tags=["hcc"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SuspectOut(BaseModel):
    id: int
    member_id: int
    payment_year: int
    hcc_code: int
    hcc_label: str | None = None
    icd10_code: str | None = None
    icd10_label: str | None = None
    raf_value: float
    annual_value: float | None = None
    suspect_type: str
    status: str
    confidence: int | None = None
    evidence_summary: str | None = None
    identified_date: date
    captured_date: date | None = None
    dismissed_date: date | None = None
    dismissed_reason: str | None = None

    model_config = {"from_attributes": True}


class SuspectWithMemberOut(SuspectOut):
    member_name: str | None = None
    date_of_birth: date | None = None
    pcp_name: str | None = None
    current_raf: float | None = None
    projected_raf: float | None = None
    risk_tier: str | None = None


class MemberSuspectsOut(BaseModel):
    member_id: int
    member_name: str
    date_of_birth: date
    current_raf: float | None = None
    projected_raf: float | None = None
    risk_tier: str | None = None
    pcp_name: str | None = None
    suspects: list[SuspectOut]


class SuspectUpdateIn(BaseModel):
    status: str = Field(..., description="New status: 'captured' or 'dismissed'")
    dismissed_reason: str | None = Field(None, description="Required if status=dismissed")


class SuspectUpdateOut(BaseModel):
    id: int
    status: str
    captured_date: date | None = None
    dismissed_date: date | None = None
    dismissed_reason: str | None = None


class SummaryTypeBreakdown(BaseModel):
    suspect_type: str
    count: int
    total_raf: float
    total_annual_value: float


class SummaryProviderBreakdown(BaseModel):
    provider_id: int | None = None
    provider_name: str | None = None
    count: int
    total_raf: float
    total_annual_value: float


class SummaryOut(BaseModel):
    total_suspects: int
    total_open: int
    total_captured: int
    total_dismissed: int
    total_raf_opportunity: float
    total_dollar_opportunity: float
    by_type: list[SummaryTypeBreakdown]
    by_provider: list[SummaryProviderBreakdown]


class PaginatedSuspectsOut(BaseModel):
    items: list[SuspectWithMemberOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class SortField(str, Enum):
    raf_value = "raf_value"
    member_name = "member_name"
    identified_date = "identified_date"
    annual_value = "annual_value"


class SortOrder(str, Enum):
    asc = "asc"
    desc = "desc"


class ExportFormat(str, Enum):
    csv = "csv"
    excel = "excel"


# ---------------------------------------------------------------------------
# GET /api/hcc/suspects — paginated chase list
# ---------------------------------------------------------------------------

@router.get("/suspects", response_model=PaginatedSuspectsOut)
async def list_suspects(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    provider_id: int | None = Query(None),
    hcc_code: int | None = Query(None),
    suspect_type: str | None = Query(None),
    status: str | None = Query(None),
    risk_tier: str | None = Query(None),
    min_raf_value: float | None = Query(None),
    sort_by: SortField = Query(SortField.raf_value),
    sort_order: SortOrder = Query(SortOrder.desc),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return a paginated, filterable chase list of HCC suspects."""

    # Base query joins suspects -> members -> providers
    base = (
        select(
            HccSuspect,
            Member.first_name,
            Member.last_name,
            Member.date_of_birth,
            Member.current_raf,
            Member.projected_raf,
            Member.risk_tier,
            Member.pcp_provider_id,
            Provider.first_name.label("pcp_first"),
            Provider.last_name.label("pcp_last"),
        )
        .join(Member, HccSuspect.member_id == Member.id)
        .outerjoin(Provider, Member.pcp_provider_id == Provider.id)
    )

    # Filters
    filters = []
    if provider_id is not None:
        filters.append(Member.pcp_provider_id == provider_id)
    if hcc_code is not None:
        filters.append(HccSuspect.hcc_code == hcc_code)
    if suspect_type is not None:
        filters.append(HccSuspect.suspect_type == suspect_type)
    if status is not None:
        filters.append(HccSuspect.status == status)
    else:
        # Default: show open suspects only
        filters.append(HccSuspect.status == SuspectStatus.open.value)
    if risk_tier is not None:
        filters.append(Member.risk_tier == risk_tier)
    if min_raf_value is not None:
        filters.append(HccSuspect.raf_value >= min_raf_value)

    if filters:
        base = base.where(and_(*filters))

    # Count
    count_q = select(func.count()).select_from(
        base.with_only_columns(HccSuspect.id).subquery()
    )
    total = (await db.execute(count_q)).scalar() or 0

    # Sorting
    if sort_by == SortField.raf_value:
        order_col = HccSuspect.raf_value
    elif sort_by == SortField.annual_value:
        order_col = HccSuspect.annual_value
    elif sort_by == SortField.member_name:
        order_col = Member.last_name
    elif sort_by == SortField.identified_date:
        order_col = HccSuspect.identified_date
    else:
        order_col = HccSuspect.raf_value

    if sort_order == SortOrder.asc:
        base = base.order_by(order_col.asc())
    else:
        base = base.order_by(order_col.desc())

    # Pagination
    offset = (page - 1) * page_size
    rows = (await db.execute(base.offset(offset).limit(page_size))).all()

    items: list[SuspectWithMemberOut] = []
    for row in rows:
        suspect: HccSuspect = row[0]
        pcp_first = row.pcp_first
        pcp_last = row.pcp_last
        pcp_name = f"{pcp_first} {pcp_last}".strip() if pcp_first or pcp_last else None

        items.append(SuspectWithMemberOut(
            id=suspect.id,
            member_id=suspect.member_id,
            payment_year=suspect.payment_year,
            hcc_code=suspect.hcc_code,
            hcc_label=suspect.hcc_label,
            icd10_code=suspect.icd10_code,
            icd10_label=suspect.icd10_label,
            raf_value=float(suspect.raf_value) if suspect.raf_value else 0.0,
            annual_value=float(suspect.annual_value) if suspect.annual_value else None,
            suspect_type=suspect.suspect_type if suspect.suspect_type else "",
            status=suspect.status if suspect.status else "",
            confidence=suspect.confidence,
            evidence_summary=suspect.evidence_summary,
            identified_date=suspect.identified_date,
            captured_date=suspect.captured_date,
            dismissed_date=suspect.dismissed_date,
            dismissed_reason=suspect.dismissed_reason,
            member_name=f"{row.first_name} {row.last_name}".strip(),
            date_of_birth=row.date_of_birth,
            pcp_name=pcp_name,
            current_raf=float(row.current_raf) if row.current_raf is not None else None,
            projected_raf=float(row.projected_raf) if row.projected_raf is not None else None,
            risk_tier=row.risk_tier if row.risk_tier else None,
        ))

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return PaginatedSuspectsOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ---------------------------------------------------------------------------
# GET /api/hcc/suspects/{member_id} — all suspects for a member
# ---------------------------------------------------------------------------

@router.get("/suspects/{member_id}", response_model=MemberSuspectsOut)
async def get_member_suspects(
    member_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return all suspects for a specific member with full detail."""
    member = await db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Get PCP name
    pcp_name: str | None = None
    if member.pcp_provider_id:
        provider = await db.get(Provider, member.pcp_provider_id)
        if provider:
            pcp_name = f"{provider.first_name} {provider.last_name}".strip()

    # Get suspects ordered by RAF value
    result = await db.execute(
        select(HccSuspect)
        .where(HccSuspect.member_id == member_id)
        .order_by(HccSuspect.raf_value.desc())
    )
    suspects = result.scalars().all()

    return MemberSuspectsOut(
        member_id=member.id,
        member_name=f"{member.first_name} {member.last_name}".strip(),
        date_of_birth=member.date_of_birth,
        current_raf=float(member.current_raf) if member.current_raf is not None else None,
        projected_raf=float(member.projected_raf) if member.projected_raf is not None else None,
        risk_tier=member.risk_tier if member.risk_tier else None,
        pcp_name=pcp_name,
        suspects=[
            SuspectOut(
                id=s.id,
                member_id=s.member_id,
                payment_year=s.payment_year,
                hcc_code=s.hcc_code,
                hcc_label=s.hcc_label,
                icd10_code=s.icd10_code,
                icd10_label=s.icd10_label,
                raf_value=float(s.raf_value) if s.raf_value else 0.0,
                annual_value=float(s.annual_value) if s.annual_value else None,
                suspect_type=s.suspect_type if s.suspect_type else "",
                status=s.status if s.status else "",
                confidence=s.confidence,
                evidence_summary=s.evidence_summary,
                identified_date=s.identified_date,
                captured_date=s.captured_date,
                dismissed_date=s.dismissed_date,
                dismissed_reason=s.dismissed_reason,
            )
            for s in suspects
        ],
    )


# ---------------------------------------------------------------------------
# PATCH /api/hcc/suspects/{suspect_id} — update status
# ---------------------------------------------------------------------------

@router.patch("/suspects/{suspect_id}", response_model=SuspectUpdateOut)
async def update_suspect(
    suspect_id: int,
    body: SuspectUpdateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update a suspect's status (capture or dismiss)."""
    suspect = await db.get(HccSuspect, suspect_id)
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")

    today = date.today()

    if body.status == "captured":
        suspect.status = SuspectStatus.captured.value
        suspect.captured_date = today
    elif body.status == "dismissed":
        if not body.dismissed_reason:
            raise HTTPException(
                status_code=422,
                detail="dismissed_reason is required when dismissing a suspect",
            )
        suspect.status = SuspectStatus.dismissed.value
        suspect.dismissed_date = today
        suspect.dismissed_reason = body.dismissed_reason
    else:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{body.status}'. Must be 'captured' or 'dismissed'.",
        )

    await db.commit()
    await db.refresh(suspect)

    return SuspectUpdateOut(
        id=suspect.id,
        status=suspect.status,
        captured_date=suspect.captured_date,
        dismissed_date=suspect.dismissed_date,
        dismissed_reason=suspect.dismissed_reason,
    )


# ---------------------------------------------------------------------------
# GET /api/hcc/summary — aggregate stats
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryOut)
async def get_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return aggregate suspect statistics for the tenant population."""

    # Total counts by status
    status_q = await db.execute(
        select(
            HccSuspect.status,
            func.count(HccSuspect.id),
        ).group_by(HccSuspect.status)
    )
    status_counts: dict[str, int] = {}
    for row in status_q.all():
        status_counts[str(row[0])] = row[1]

    total_suspects = sum(status_counts.values())
    total_open = status_counts.get("open", 0)
    total_captured = status_counts.get("captured", 0)
    total_dismissed = status_counts.get("dismissed", 0)

    # Total RAF and dollar opportunity (open suspects only)
    opp_q = await db.execute(
        select(
            func.coalesce(func.sum(HccSuspect.raf_value), 0),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        ).where(HccSuspect.status == SuspectStatus.open.value)
    )
    opp_row = opp_q.one()
    total_raf_opportunity = float(opp_row[0])
    total_dollar_opportunity = float(opp_row[1])

    # Breakdown by type (open only)
    type_q = await db.execute(
        select(
            HccSuspect.suspect_type,
            func.count(HccSuspect.id),
            func.coalesce(func.sum(HccSuspect.raf_value), 0),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        )
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.suspect_type)
    )
    by_type = [
        SummaryTypeBreakdown(
            suspect_type=str(row[0]),
            count=row[1],
            total_raf=float(row[2]),
            total_annual_value=float(row[3]),
        )
        for row in type_q.all()
    ]

    # Breakdown by provider (open only)
    provider_q = await db.execute(
        select(
            Member.pcp_provider_id,
            Provider.first_name,
            Provider.last_name,
            func.count(HccSuspect.id),
            func.coalesce(func.sum(HccSuspect.raf_value), 0),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        )
        .join(Member, HccSuspect.member_id == Member.id)
        .outerjoin(Provider, Member.pcp_provider_id == Provider.id)
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(Member.pcp_provider_id, Provider.first_name, Provider.last_name)
        .order_by(func.sum(HccSuspect.annual_value).desc())
    )
    by_provider = [
        SummaryProviderBreakdown(
            provider_id=row[0],
            provider_name=(
                f"{row[1]} {row[2]}".strip() if row[1] or row[2] else "Unassigned"
            ),
            count=row[3],
            total_raf=float(row[4]),
            total_annual_value=float(row[5]),
        )
        for row in provider_q.all()
    ]

    return SummaryOut(
        total_suspects=total_suspects,
        total_open=total_open,
        total_captured=total_captured,
        total_dismissed=total_dismissed,
        total_raf_opportunity=total_raf_opportunity,
        total_dollar_opportunity=total_dollar_opportunity,
        by_type=by_type,
        by_provider=by_provider,
    )


# ---------------------------------------------------------------------------
# GET /api/hcc/export — CSV or Excel export
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_suspects(
    format: ExportFormat = Query(ExportFormat.csv),
    provider_id: int | None = Query(None),
    hcc_code: int | None = Query(None),
    suspect_type: str | None = Query(None),
    status: str | None = Query(None, description="Defaults to 'open'"),
    risk_tier: str | None = Query(None),
    min_raf_value: float | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> StreamingResponse:
    """Export the chase list as CSV or Excel."""

    query = (
        select(
            HccSuspect.id.label("suspect_id"),
            Member.member_id.label("health_plan_id"),
            Member.first_name,
            Member.last_name,
            Member.date_of_birth,
            Member.current_raf,
            Member.projected_raf,
            Member.risk_tier,
            Provider.first_name.label("pcp_first"),
            Provider.last_name.label("pcp_last"),
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            HccSuspect.icd10_code,
            HccSuspect.icd10_label,
            HccSuspect.raf_value,
            HccSuspect.annual_value,
            HccSuspect.suspect_type,
            HccSuspect.status,
            HccSuspect.confidence,
            HccSuspect.evidence_summary,
            HccSuspect.identified_date,
        )
        .join(Member, HccSuspect.member_id == Member.id)
        .outerjoin(Provider, Member.pcp_provider_id == Provider.id)
    )

    filters = []
    if provider_id is not None:
        filters.append(Member.pcp_provider_id == provider_id)
    if hcc_code is not None:
        filters.append(HccSuspect.hcc_code == hcc_code)
    if suspect_type is not None:
        filters.append(HccSuspect.suspect_type == suspect_type)
    if status is not None:
        filters.append(HccSuspect.status == status)
    else:
        filters.append(HccSuspect.status == SuspectStatus.open.value)
    if risk_tier is not None:
        filters.append(Member.risk_tier == risk_tier)
    if min_raf_value is not None:
        filters.append(HccSuspect.raf_value >= min_raf_value)

    if filters:
        query = query.where(and_(*filters))

    query = query.order_by(HccSuspect.raf_value.desc())
    result = await db.execute(query)
    rows = result.all()

    columns = [
        "suspect_id", "health_plan_id", "member_name", "date_of_birth",
        "pcp_name", "current_raf", "projected_raf", "risk_tier",
        "hcc_code", "hcc_label", "icd10_code", "icd10_label",
        "raf_value", "annual_value", "suspect_type", "status",
        "confidence", "evidence_summary", "identified_date",
    ]

    data: list[dict[str, Any]] = []
    for row in rows:
        pcp_name = (
            f"{row.pcp_first} {row.pcp_last}".strip()
            if row.pcp_first or row.pcp_last else ""
        )
        data.append({
            "suspect_id": row.suspect_id,
            "health_plan_id": row.health_plan_id,
            "member_name": f"{row.first_name} {row.last_name}".strip(),
            "date_of_birth": str(row.date_of_birth) if row.date_of_birth else "",
            "pcp_name": pcp_name,
            "current_raf": float(row.current_raf) if row.current_raf is not None else "",
            "projected_raf": float(row.projected_raf) if row.projected_raf is not None else "",
            "risk_tier": row.risk_tier if row.risk_tier else "",
            "hcc_code": row.hcc_code,
            "hcc_label": row.hcc_label or "",
            "icd10_code": row.icd10_code or "",
            "icd10_label": row.icd10_label or "",
            "raf_value": float(row.raf_value) if row.raf_value else 0,
            "annual_value": float(row.annual_value) if row.annual_value else 0,
            "suspect_type": str(row.suspect_type),
            "status": str(row.status),
            "confidence": row.confidence or "",
            "evidence_summary": row.evidence_summary or "",
            "identified_date": str(row.identified_date) if row.identified_date else "",
        })

    if format == ExportFormat.excel:
        return export_to_excel(
            data=data,
            columns=columns,
            sheet_name="HCC Chase List",
            filename="hcc_chase_list.xlsx",
        )

    return export_to_csv(data=data, columns=columns, filename="hcc_chase_list.csv")
