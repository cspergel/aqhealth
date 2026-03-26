"""
Care Gap Tracking API endpoints.

Provides population-level gap summaries, member-level gap views,
gap status updates, measure management, and CSV export.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.member import Member
from app.models.provider import Provider
from app.services import care_gap_service
from app.services.export_service import export_to_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/care-gaps", tags=["care-gaps"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class MeasureSummaryOut(BaseModel):
    measure_id: int
    code: str
    name: str
    category: str | None = None
    stars_weight: int
    total_eligible: int
    open_gaps: int
    closed_gaps: int
    closure_rate: float
    star_level: int
    target_rate: float | None = None
    gaps_to_next_star: int | None = None


class MemberGapOut(BaseModel):
    id: int
    member_id: int
    member_name: str | None = None
    measure_code: str
    measure_name: str
    status: str
    due_date: str | None = None
    closed_date: str | None = None
    measurement_year: int
    stars_weight: int
    provider_name: str | None = None


class MemberGapDetailOut(BaseModel):
    id: int
    measure_code: str
    measure_name: str
    status: str
    due_date: str | None = None
    closed_date: str | None = None
    measurement_year: int
    stars_weight: int


class GapUpdateIn(BaseModel):
    status: str = Field(..., description="New status: 'closed' or 'excluded'")


class GapUpdateOut(BaseModel):
    id: int
    status: str
    closed_date: str | None = None


class MeasureCreateIn(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    description: str | None = None
    category: str | None = None
    stars_weight: int = Field(default=1, ge=1, le=3)
    target_rate: float | None = None
    star_3_cutpoint: float | None = None
    star_4_cutpoint: float | None = None
    star_5_cutpoint: float | None = None
    detection_logic: dict | None = None


class MeasureUpdateIn(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    stars_weight: int | None = None
    target_rate: float | None = None
    star_3_cutpoint: float | None = None
    star_4_cutpoint: float | None = None
    star_5_cutpoint: float | None = None
    is_active: bool | None = None
    detection_logic: dict | None = None


class MeasureOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    category: str | None = None
    stars_weight: int
    target_rate: float | None = None
    star_3_cutpoint: float | None = None
    star_4_cutpoint: float | None = None
    star_5_cutpoint: float | None = None
    is_custom: bool
    is_active: bool
    detection_logic: dict | None = None


# ---------------------------------------------------------------------------
# GET /api/care-gaps — population summary
# ---------------------------------------------------------------------------

@router.get("", response_model=list[MeasureSummaryOut])
async def get_population_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Per-measure population summary with closure rates and Stars impact."""
    summaries = await care_gap_service.get_gap_population_summary(db)
    return [MeasureSummaryOut(**s) for s in summaries]


# ---------------------------------------------------------------------------
# GET /api/care-gaps/members — member-level gap list
# ---------------------------------------------------------------------------

@router.get("/members", response_model=list[MemberGapOut])
async def list_member_gaps(
    measure_id: int | None = Query(None),
    provider_id: int | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Member-level gap list, filterable by measure and provider."""
    measurement_year = date.today().year

    query = (
        select(
            MemberGap,
            GapMeasure.code,
            GapMeasure.name.label("measure_name"),
            GapMeasure.stars_weight,
            Member.first_name,
            Member.last_name,
            Provider.first_name.label("pcp_first"),
            Provider.last_name.label("pcp_last"),
        )
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .join(Member, MemberGap.member_id == Member.id)
        .outerjoin(Provider, MemberGap.responsible_provider_id == Provider.id)
        .where(MemberGap.measurement_year == measurement_year)
    )

    if measure_id is not None:
        query = query.where(MemberGap.measure_id == measure_id)
    if provider_id is not None:
        query = query.where(MemberGap.responsible_provider_id == provider_id)
    if status is not None:
        query = query.where(MemberGap.status == status)
    else:
        query = query.where(MemberGap.status == GapStatus.open.value)

    query = query.order_by(GapMeasure.code, Member.last_name)
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    rows = result.all()

    items = []
    for row in rows:
        gap: MemberGap = row[0]
        pcp_name = (
            f"{row.pcp_first} {row.pcp_last}".strip()
            if row.pcp_first or row.pcp_last else None
        )
        items.append(MemberGapOut(
            id=gap.id,
            member_id=gap.member_id,
            member_name=f"{row.first_name} {row.last_name}".strip(),
            measure_code=row.code,
            measure_name=row.measure_name,
            status=gap.status,
            due_date=str(gap.due_date) if gap.due_date else None,
            closed_date=str(gap.closed_date) if gap.closed_date else None,
            measurement_year=gap.measurement_year,
            stars_weight=row.stars_weight,
            provider_name=pcp_name,
        ))

    return items


# ---------------------------------------------------------------------------
# GET /api/care-gaps/members/{member_id} — all gaps for a member
# ---------------------------------------------------------------------------

@router.get("/members/{member_id}", response_model=list[MemberGapDetailOut])
async def get_member_gaps(
    member_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """All gaps for a specific member."""
    member = await db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    gaps = await care_gap_service.get_member_gaps(db, member_id)
    return [MemberGapDetailOut(**g) for g in gaps]


# ---------------------------------------------------------------------------
# PATCH /api/care-gaps/{gap_id} — close or exclude a gap
# ---------------------------------------------------------------------------

@router.patch("/{gap_id}", response_model=GapUpdateOut)
async def update_gap(
    gap_id: int,
    body: GapUpdateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Close or exclude a care gap."""
    try:
        if body.status == "closed":
            gap = await care_gap_service.close_gap(db, gap_id)
        elif body.status == "excluded":
            gap = await care_gap_service.exclude_gap(db, gap_id)
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid status '{body.status}'. Must be 'closed' or 'excluded'.",
            )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return GapUpdateOut(
        id=gap.id,
        status=gap.status,
        closed_date=str(gap.closed_date) if gap.closed_date else None,
    )


# ---------------------------------------------------------------------------
# POST /api/care-gaps/measures — create custom measure
# ---------------------------------------------------------------------------

@router.post("/measures", response_model=MeasureOut, status_code=201)
async def create_measure(
    body: MeasureCreateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a custom measure definition."""
    measure = await care_gap_service.create_custom_measure(db, body.model_dump())
    return MeasureOut(
        id=measure.id,
        code=measure.code,
        name=measure.name,
        description=measure.description,
        category=measure.category,
        stars_weight=measure.stars_weight,
        target_rate=float(measure.target_rate) if measure.target_rate is not None else None,
        star_3_cutpoint=float(measure.star_3_cutpoint) if measure.star_3_cutpoint is not None else None,
        star_4_cutpoint=float(measure.star_4_cutpoint) if measure.star_4_cutpoint is not None else None,
        star_5_cutpoint=float(measure.star_5_cutpoint) if measure.star_5_cutpoint is not None else None,
        is_custom=measure.is_custom,
        is_active=measure.is_active,
        detection_logic=measure.detection_logic,
    )


# ---------------------------------------------------------------------------
# GET /api/care-gaps/measures — list all measures
# ---------------------------------------------------------------------------

@router.get("/measures", response_model=list[MeasureOut])
async def list_measures(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all measures (active and inactive)."""
    measures = await care_gap_service.get_all_measures(db)
    return [MeasureOut(**m) for m in measures]


# ---------------------------------------------------------------------------
# PATCH /api/care-gaps/measures/{measure_id} — update measure config
# ---------------------------------------------------------------------------

@router.patch("/measures/{measure_id}", response_model=MeasureOut)
async def update_measure(
    measure_id: int,
    body: MeasureUpdateIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update measure configuration (targets, cutpoints, active status)."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    try:
        measure = await care_gap_service.update_measure(db, measure_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return MeasureOut(
        id=measure.id,
        code=measure.code,
        name=measure.name,
        description=measure.description,
        category=measure.category,
        stars_weight=measure.stars_weight,
        target_rate=float(measure.target_rate) if measure.target_rate is not None else None,
        star_3_cutpoint=float(measure.star_3_cutpoint) if measure.star_3_cutpoint is not None else None,
        star_4_cutpoint=float(measure.star_4_cutpoint) if measure.star_4_cutpoint is not None else None,
        star_5_cutpoint=float(measure.star_5_cutpoint) if measure.star_5_cutpoint is not None else None,
        is_custom=measure.is_custom,
        is_active=measure.is_active,
        detection_logic=measure.detection_logic,
    )


# ---------------------------------------------------------------------------
# GET /api/care-gaps/export — export gap chase list
# ---------------------------------------------------------------------------

@router.get("/export")
async def export_gaps(
    measure_id: int | None = Query(None),
    provider_id: int | None = Query(None),
    status: str | None = Query(None, description="Defaults to 'open'"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
) -> StreamingResponse:
    """Export care gap chase list as CSV."""
    measurement_year = date.today().year

    query = (
        select(
            MemberGap.id.label("gap_id"),
            Member.member_id.label("health_plan_id"),
            Member.first_name,
            Member.last_name,
            Member.date_of_birth,
            GapMeasure.code.label("measure_code"),
            GapMeasure.name.label("measure_name"),
            GapMeasure.stars_weight,
            MemberGap.status,
            MemberGap.due_date,
            MemberGap.closed_date,
            Provider.first_name.label("pcp_first"),
            Provider.last_name.label("pcp_last"),
        )
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .join(Member, MemberGap.member_id == Member.id)
        .outerjoin(Provider, MemberGap.responsible_provider_id == Provider.id)
        .where(MemberGap.measurement_year == measurement_year)
    )

    if measure_id is not None:
        query = query.where(MemberGap.measure_id == measure_id)
    if provider_id is not None:
        query = query.where(MemberGap.responsible_provider_id == provider_id)
    if status is not None:
        query = query.where(MemberGap.status == status)
    else:
        query = query.where(MemberGap.status == GapStatus.open.value)

    query = query.order_by(GapMeasure.code, Member.last_name)
    result = await db.execute(query)
    rows = result.all()

    columns = [
        "gap_id", "health_plan_id", "member_name", "date_of_birth",
        "measure_code", "measure_name", "stars_weight", "status",
        "due_date", "closed_date", "pcp_name",
    ]

    data: list[dict[str, Any]] = []
    for row in rows:
        pcp_name = (
            f"{row.pcp_first} {row.pcp_last}".strip()
            if row.pcp_first or row.pcp_last else ""
        )
        data.append({
            "gap_id": row.gap_id,
            "health_plan_id": row.health_plan_id,
            "member_name": f"{row.first_name} {row.last_name}".strip(),
            "date_of_birth": str(row.date_of_birth) if row.date_of_birth else "",
            "measure_code": row.measure_code,
            "measure_name": row.measure_name,
            "stars_weight": row.stars_weight,
            "status": str(row.status),
            "due_date": str(row.due_date) if row.due_date else "",
            "closed_date": str(row.closed_date) if row.closed_date else "",
            "pcp_name": pcp_name,
        })

    return export_to_csv(data=data, columns=columns, filename="care_gap_chase_list.csv")
