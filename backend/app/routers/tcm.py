"""
Transitional Care Management (TCM) API endpoints.

Tracks post-discharge TCM workflows, compliance, and revenue.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import tcm_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tcm", tags=["tcm"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TCMUpdateIn(BaseModel):
    phone_contact: str | None = Field(None, description="'done' to mark phone contact completed")
    visit: str | None = Field(None, description="'done' to mark visit completed")
    visit_type: str | None = Field(None, description="99495 or 99496")
    billing_status: str | None = None
    notes: str | None = None


class TCMCaseOut(BaseModel):
    member_id: int
    member_name: str
    discharge_date: str
    days_since_discharge: int
    phone_contact: str
    visit: str
    billing_status: str
    pcp_provider_id: int | None = None
    facility_name: str | None = None


class TCMDashboardOut(BaseModel):
    active_cases: int
    compliance_rate: float
    revenue_captured: float | int
    revenue_potential: float | int
    by_provider: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=TCMDashboardOut)
async def tcm_dashboard(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """TCM metrics: active cases, compliance rate, revenue breakdown."""
    return await tcm_service.get_tcm_dashboard(db)


@router.get("/active", response_model=list[TCMCaseOut])
async def active_tcm_cases(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """All active TCM cases (members discharged in last 30 days)."""
    return await tcm_service.get_active_tcm_cases(db)


@router.patch("/{member_id}")
async def update_tcm(
    member_id: int,
    body: TCMUpdateIn,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Record phone contact, visit completion, or billing status update."""
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided to update")
    result = await tcm_service.update_tcm_status(db, member_id, updates)
    return result
