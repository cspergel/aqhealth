"""
Clinical Router — Provider Clinical View (Mode 2) endpoints.

Provides patient context, provider worklist, and capture/close actions
for the point-of-care EMR overlay.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_tenant_session
from app.dependencies import get_current_user
from app.models.care_gap import GapStatus, MemberGap
from app.models.hcc import HccSuspect, SuspectStatus
from app.services.patient_context_service import get_patient_context, get_provider_worklist

router = APIRouter(prefix="/api/clinical", tags=["clinical"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CaptureRequest(BaseModel):
    member_id: int
    suspect_id: int


class CloseGapRequest(BaseModel):
    member_id: int
    gap_id: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/patient/{member_id}")
async def patient_context(
    member_id: int,
    db: AsyncSession = Depends(get_tenant_session),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Full patient context for the clinical encounter view."""
    result = await get_patient_context(db, member_id)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/worklist")
async def worklist(
    provider_id: int,
    db: AsyncSession = Depends(get_tenant_session),
    user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Provider's prioritized patient list."""
    return await get_provider_worklist(db, provider_id)


@router.post("/capture")
async def capture_suspect(
    req: CaptureRequest,
    db: AsyncSession = Depends(get_tenant_session),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Mark a suspect HCC as captured by the provider."""
    suspect = await db.get(HccSuspect, req.suspect_id)
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")
    if suspect.member_id != req.member_id:
        raise HTTPException(status_code=400, detail="Suspect does not belong to this member")
    if suspect.status != SuspectStatus.open:
        raise HTTPException(status_code=400, detail=f"Suspect is already {suspect.status.value}")

    suspect.status = SuspectStatus.captured
    suspect.captured_date = date.today()
    await db.flush()
    await db.commit()

    return {
        "success": True,
        "suspect_id": suspect.id,
        "hcc_code": suspect.hcc_code,
        "raf_value": float(suspect.raf_value),
        "annual_value": float(suspect.annual_value) if suspect.annual_value else 0.0,
    }


@router.post("/close-gap")
async def close_gap(
    req: CloseGapRequest,
    db: AsyncSession = Depends(get_tenant_session),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Close an open care gap."""
    gap = await db.get(MemberGap, req.gap_id)
    if not gap:
        raise HTTPException(status_code=404, detail="Care gap not found")
    if gap.member_id != req.member_id:
        raise HTTPException(status_code=400, detail="Gap does not belong to this member")
    if gap.status != GapStatus.open:
        raise HTTPException(status_code=400, detail=f"Gap is already {gap.status.value}")

    gap.status = GapStatus.closed
    gap.closed_date = date.today()
    await db.flush()
    await db.commit()

    return {
        "success": True,
        "gap_id": gap.id,
    }
