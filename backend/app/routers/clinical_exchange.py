"""
Clinical Data Exchange API endpoints.

Automated evidence packaging for payer data requests: HCC evidence,
quality measure evidence, RADV audit packages.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import clinical_exchange_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exchange", tags=["clinical-exchange"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class EvidenceRequest(BaseModel):
    member_id: int
    type: str  # "hcc_evidence", "quality_evidence", "radv_audit"
    hcc_code: int | None = None
    measure_code: str | None = None


class DataExchangeRequestIn(BaseModel):
    request_type: str
    requestor: str | None = None
    member_id: int | None = None
    hcc_code: int | None = None
    measure_code: str | None = None
    notes: str | None = None


class ExchangeDashboardOut(BaseModel):
    total_requests: int
    auto_responded: int
    pending: int
    completed: int
    avg_response_hours: float


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=ExchangeDashboardOut)
async def exchange_dashboard(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Exchange stats: requests received, auto-responded, pending, avg response time."""
    return await clinical_exchange_service.get_exchange_dashboard(db)


@router.get("/requests")
async def list_requests(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Pending and completed data exchange requests."""
    return await clinical_exchange_service.get_pending_requests(db)


@router.post("/requests")
async def create_request(
    body: DataExchangeRequestIn,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Create a new data exchange request (or receive from payer API)."""
    return {"id": 0, "status": "pending", **body.model_dump()}


@router.post("/generate-evidence")
async def generate_evidence(
    body: EvidenceRequest,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Generate an evidence package for a member."""
    if body.type == "hcc_evidence" and body.hcc_code is not None:
        return await clinical_exchange_service.generate_hcc_evidence_package(
            db, body.member_id, body.hcc_code,
        )
    elif body.type == "quality_evidence" and body.measure_code is not None:
        return await clinical_exchange_service.generate_quality_evidence(
            db, body.member_id, body.measure_code,
        )
    elif body.type == "radv_audit":
        return await clinical_exchange_service.generate_audit_package(
            db, body.member_id,
        )
    raise HTTPException(status_code=400, detail="Invalid request type or missing parameters")


@router.post("/auto-respond/{request_id}")
async def auto_respond(
    request_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Auto-respond to a payer data request."""
    return await clinical_exchange_service.auto_respond_to_request(db, request_id)


@router.get("/package/{request_id}")
async def get_package(
    request_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Download/view an evidence package for a completed request."""
    return {
        "request_id": request_id,
        "package": {},
        "status": "completed",
    }
