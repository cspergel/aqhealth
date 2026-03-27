"""
Prior Authorization / UM API endpoints.

Dashboard, CRUD, compliance, and overdue tracking.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.prior_auth_service import (
    get_auth_dashboard,
    get_auth_requests,
    get_auth_detail,
    create_auth_request,
    update_auth_request,
    get_compliance_report,
    get_overdue_requests,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth-requests", tags=["prior-auth"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AuthCreate(BaseModel):
    member_id: int
    service_type: str
    procedure_code: str | None = None
    diagnosis_code: str | None = None
    requesting_provider_npi: str | None = None
    requesting_provider_name: str | None = None
    servicing_provider_npi: str | None = None
    servicing_facility: str | None = None
    request_date: str
    urgency: str = "standard"
    notes: str | None = None


class AuthUpdate(BaseModel):
    status: str | None = None
    decision: str | None = None
    decision_date: str | None = None
    approved_units: int | None = None
    denial_reason: str | None = None
    appeal_date: str | None = None
    appeal_status: str | None = None
    peer_to_peer_date: str | None = None
    turnaround_hours: int | None = None
    compliant: bool | None = None
    reviewer_id: int | None = None
    reviewer_name: str | None = None
    auth_start_date: str | None = None
    auth_end_date: str | None = None
    notes: str | None = None


# ---------------------------------------------------------------------------
# GET /api/auth-requests/dashboard — stats overview
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def auth_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Dashboard: pending count, avg turnaround, approval rate, compliance rate."""
    return await get_auth_dashboard(db)


# ---------------------------------------------------------------------------
# GET /api/auth-requests/compliance — CMS turnaround compliance report
# ---------------------------------------------------------------------------

@router.get("/compliance")
async def auth_compliance(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """CMS turnaround compliance report by urgency."""
    return await get_compliance_report(db)


# ---------------------------------------------------------------------------
# GET /api/auth-requests/overdue — requests past CMS deadlines
# ---------------------------------------------------------------------------

@router.get("/overdue")
async def auth_overdue(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Requests past CMS deadlines (urgent >72hr, standard >14 days)."""
    return await get_overdue_requests(db)


# ---------------------------------------------------------------------------
# GET /api/auth-requests — list with filters
# ---------------------------------------------------------------------------

@router.get("")
async def list_auth_requests(
    status: str | None = Query(None),
    urgency: str | None = Query(None),
    service_type: str | None = Query(None),
    provider: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List auth requests with filters."""
    return await get_auth_requests(
        db,
        status=status,
        urgency=urgency,
        service_type=service_type,
        provider=provider,
    )


# ---------------------------------------------------------------------------
# GET /api/auth-requests/{id} — detail
# ---------------------------------------------------------------------------

@router.get("/{auth_id}")
async def auth_detail(
    auth_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return full auth request detail."""
    result = await get_auth_detail(db, auth_id)
    if not result:
        raise HTTPException(status_code=404, detail="Auth request not found")
    return result


# ---------------------------------------------------------------------------
# POST /api/auth-requests — create new auth request
# ---------------------------------------------------------------------------

@router.post("")
async def create_auth(
    body: AuthCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a new prior auth request."""
    return await create_auth_request(db, body.model_dump())


# ---------------------------------------------------------------------------
# PATCH /api/auth-requests/{id} — update (approve, deny, appeal)
# ---------------------------------------------------------------------------

@router.patch("/{auth_id}")
async def patch_auth(
    auth_id: int,
    body: AuthUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an auth request (approve, deny, appeal, etc.)."""
    data = body.model_dump(exclude_unset=True)
    result = await update_auth_request(db, auth_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Auth request not found")
    return result
