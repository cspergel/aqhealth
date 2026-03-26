"""
RADV Audit Readiness API endpoints.

Provides audit readiness scores, per-member MEAT profiles,
and vulnerable code identification.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import radv_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/radv", tags=["radv"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class MEATScore(BaseModel):
    monitored: bool
    evaluated: bool
    assessed: bool
    treated: bool
    score: float


class HCCAuditItem(BaseModel):
    hcc_code: int
    hcc_label: str
    meat_score: float
    evidence_strength: str
    vulnerability: str
    meat_detail: MEATScore


class MemberAuditOut(BaseModel):
    member_id: str
    member_name: str
    overall_score: float
    hccs: list[HCCAuditItem]


class VulnerableCodeOut(BaseModel):
    hcc_code: int
    hcc_label: str
    member_count: int
    avg_meat_score: float
    weakest_member: str | None = None
    risk_level: str


class AuditReadinessOut(BaseModel):
    overall_score: float
    by_category: list[dict[str, Any]]
    weakest_codes: list[VulnerableCodeOut]
    strongest_codes: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/readiness", response_model=AuditReadinessOut)
async def audit_readiness(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Overall RADV audit readiness with by-HCC breakdown."""
    return await radv_service.get_audit_readiness(db)


@router.get("/member/{member_id}", response_model=MemberAuditOut)
async def member_audit_profile(
    member_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Per-member audit profile with MEAT breakdown for each HCC."""
    return await radv_service.get_member_audit_profile(db, member_id)


@router.get("/vulnerable", response_model=list[VulnerableCodeOut])
async def vulnerable_codes(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """HCC captures most likely to fail audit."""
    return await radv_service.get_vulnerable_codes(db)
