"""
Claims Query API endpoints.

Paginated claims listing, detail, and aggregate statistics.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.models.claim import Claim

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/claims", tags=["claims"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ClaimOut(BaseModel):
    id: int
    member_id: int
    claim_id: str | None = None
    claim_type: str
    service_date: str
    paid_date: str | None = None
    diagnosis_codes: list[str] | None = None
    procedure_code: str | None = None
    drg_code: str | None = None
    facility_name: str | None = None
    billed_amount: float | None = None
    allowed_amount: float | None = None
    paid_amount: float | None = None
    service_category: str | None = None
    pos_code: str | None = None
    drug_name: str | None = None

    model_config = {"from_attributes": True}


class ClaimListResponse(BaseModel):
    items: list[ClaimOut]
    total: int
    page: int
    page_size: int


class CategoryBreakdown(BaseModel):
    category: str
    count: int
    total_spend: float


class ClaimStatsResponse(BaseModel):
    total_claims: int
    total_spend: float
    avg_per_claim: float
    by_category: list[CategoryBreakdown]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _claim_to_out(c: Claim) -> ClaimOut:
    return ClaimOut(
        id=c.id,
        member_id=c.member_id,
        claim_id=c.claim_id,
        claim_type=c.claim_type or "unknown",
        service_date=str(c.service_date),
        paid_date=str(c.paid_date) if c.paid_date else None,
        diagnosis_codes=c.diagnosis_codes,
        procedure_code=c.procedure_code,
        drg_code=c.drg_code,
        facility_name=c.facility_name,
        billed_amount=float(c.billed_amount) if c.billed_amount is not None else None,
        allowed_amount=float(c.allowed_amount) if c.allowed_amount is not None else None,
        paid_amount=float(c.paid_amount) if c.paid_amount is not None else None,
        service_category=c.service_category,
        pos_code=c.pos_code,
        drug_name=c.drug_name,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=ClaimStatsResponse)
async def claim_stats(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Aggregate claim statistics: total claims, total spend, by-category breakdown, avg per claim."""
    # Total claims and spend
    totals = await db.execute(
        select(
            func.count(Claim.id).label("total_claims"),
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend"),
        )
    )
    row = totals.one()
    total_claims = row.total_claims or 0
    total_spend = float(row.total_spend or 0)
    avg_per_claim = total_spend / total_claims if total_claims > 0 else 0.0

    # By category breakdown
    cat_result = await db.execute(
        select(
            func.coalesce(Claim.service_category, "other").label("category"),
            func.count(Claim.id).label("count"),
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend"),
        ).group_by(Claim.service_category)
    )
    by_category = [
        CategoryBreakdown(
            category=r.category or "other",
            count=r.count,
            total_spend=float(r.total_spend or 0),
        )
        for r in cat_result.all()
    ]

    return ClaimStatsResponse(
        total_claims=total_claims,
        total_spend=total_spend,
        avg_per_claim=round(avg_per_claim, 2),
        by_category=by_category,
    )


@router.get("/{claim_id}", response_model=ClaimOut)
async def get_claim(
    claim_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get a single claim by ID."""
    claim = await db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return _claim_to_out(claim)


@router.get("", response_model=ClaimListResponse)
async def list_claims(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    member_id: Optional[int] = None,
    service_category: Optional[str] = None,
    provider_id: Optional[int] = None,
    facility: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    min_amount: Optional[float] = None,
    sort_by: Optional[str] = Query(None, pattern="^(service_date|paid_amount)$"),
    sort_dir: Optional[str] = Query("desc", pattern="^(asc|desc)$"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Paginated claims list with filters."""
    query = select(Claim)
    count_query = select(func.count(Claim.id))

    # Apply filters
    if member_id is not None:
        query = query.where(Claim.member_id == member_id)
        count_query = count_query.where(Claim.member_id == member_id)
    if service_category:
        query = query.where(Claim.service_category == service_category)
        count_query = count_query.where(Claim.service_category == service_category)
    if provider_id is not None:
        query = query.where(Claim.rendering_provider_id == provider_id)
        count_query = count_query.where(Claim.rendering_provider_id == provider_id)
    if facility:
        escaped_facility = facility.replace("%", r"\%").replace("_", r"\_")
        query = query.where(Claim.facility_name.ilike(f"%{escaped_facility}%"))
        count_query = count_query.where(Claim.facility_name.ilike(f"%{escaped_facility}%"))
    if date_from:
        query = query.where(Claim.service_date >= date_from)
        count_query = count_query.where(Claim.service_date >= date_from)
    if date_to:
        query = query.where(Claim.service_date <= date_to)
        count_query = count_query.where(Claim.service_date <= date_to)
    if min_amount is not None:
        query = query.where(Claim.paid_amount >= min_amount)
        count_query = count_query.where(Claim.paid_amount >= min_amount)

    # Sorting
    if sort_by == "paid_amount":
        order_col = Claim.paid_amount
    else:
        order_col = Claim.service_date

    if sort_dir == "asc":
        query = query.order_by(order_col.asc())
    else:
        query = query.order_by(order_col.desc())

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    # Execute
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query)
    claims = result.scalars().all()

    return ClaimListResponse(
        items=[_claim_to_out(c) for c in claims],
        total=total,
        page=page,
        page_size=page_size,
    )
