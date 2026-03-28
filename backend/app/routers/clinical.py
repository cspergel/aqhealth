"""
Clinical Router — Provider Clinical View (Mode 2) endpoints.

Provides patient context, provider worklist, and capture/close actions
for the point-of-care EMR overlay.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.models.care_gap import GapStatus, MemberGap
from app.models.hcc import HccSuspect, SuspectStatus
from app.services.boi_service import feed_capture_to_boi
from app.services.patient_context_service import get_patient_context, get_provider_worklist

logger = logging.getLogger(__name__)

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
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Full patient context for the clinical encounter view."""
    result = await get_patient_context(db, member_id)
    if result.get("error"):
        # Query valid member ID range so the caller knows what IDs exist
        from app.models.member import Member
        min_max = await db.execute(
            select(func.min(Member.id), func.max(Member.id), func.count(Member.id))
        )
        row = min_max.one()
        detail = {
            "error": result["error"],
            "member_id_requested": member_id,
            "valid_member_id_range": {"min": row[0], "max": row[1], "total": row[2]},
            "hint": f"Try a member_id between {row[0]} and {row[1]}" if row[0] else "No members found in database",
        }
        raise HTTPException(status_code=404, detail=detail)
    return result


@router.get("/worklist")
async def worklist(
    provider_id: int = Query(..., description="Provider ID for worklist"),
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Provider's prioritized patient list."""
    return await get_provider_worklist(db, provider_id)


@router.post("/capture")
async def capture_suspect(
    req: CaptureRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Mark a suspect HCC as captured by the provider."""
    suspect = await db.get(HccSuspect, req.suspect_id)
    if not suspect:
        raise HTTPException(status_code=404, detail="Suspect not found")
    if suspect.member_id != req.member_id:
        raise HTTPException(status_code=400, detail="Suspect does not belong to this member")
    if suspect.status != SuspectStatus.open.value:
        raise HTTPException(status_code=400, detail=f"Suspect is already {suspect.status}")

    # NOTE: No SELECT FOR UPDATE here — concurrent captures of the same suspect
    # could race. Acceptable for now because duplicate captures are idempotent
    # (status is set to the same value). If this becomes a problem, add
    # `with_for_update()` to the db.get() call above.
    suspect.status = SuspectStatus.captured.value
    suspect.captured_date = date.today()
    await db.commit()
    await db.refresh(suspect)

    # --- Cross-module: feed captured HCC value into BOI tracking ---
    try:
        await feed_capture_to_boi(db, suspect)
        await db.commit()
    except Exception as e:
        logger.warning("Cross-module: BOI feed failed (non-fatal): %s", e)

    # --- Self-learning: record suspect outcome for future confidence adjustments ---
    try:
        from app.services.hcc_engine import learn_suspect_outcome
        await learn_suspect_outcome(db, suspect.id, "captured")
        await db.commit()
    except Exception as e:
        logger.warning("Self-learning: suspect outcome recording failed (non-fatal): %s", e)

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
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Close an open care gap."""
    gap = await db.get(MemberGap, req.gap_id)
    if not gap:
        raise HTTPException(status_code=404, detail="Care gap not found")
    if gap.member_id != req.member_id:
        raise HTTPException(status_code=400, detail="Gap does not belong to this member")
    if gap.status != GapStatus.open.value:
        raise HTTPException(status_code=400, detail=f"Gap is already {gap.status}")

    gap.status = GapStatus.closed.value
    gap.closed_date = date.today()
    await db.commit()

    # --- Self-learning: record gap closure for procedure recommendations ---
    try:
        from app.services.care_gap_service import learn_gap_closure
        await learn_gap_closure(db, gap.id)
        await db.commit()
    except Exception as e:
        logger.warning("Self-learning: gap closure learning failed (non-fatal): %s", e)

    return {
        "success": True,
        "gap_id": gap.id,
    }
