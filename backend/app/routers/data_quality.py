"""
Data Quality & Governance API endpoints.

Provides quality reports, quarantine management, entity resolution,
and data lineage endpoints. All tenant-scoped via JWT auth.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.data_quality_service import run_quality_checks
from app.services.entity_resolution_service import (
    get_unresolved_matches,
    resolve_match,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/data-quality", tags=["data-quality"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class QuarantineUpdate(BaseModel):
    status: str  # "fixed" or "discarded"
    fixed_data: Optional[dict] = None


class ResolveRequest(BaseModel):
    resolved_entity_id: int


# ---------------------------------------------------------------------------
# GET /api/data-quality/summary — lightweight summary for onboarding wizard
# ---------------------------------------------------------------------------

@router.get("/summary")
async def get_quality_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Summary of data quality — latest report score, quarantine count, resolution rate."""
    try:
        # Latest report
        latest = await db.execute(text(
            "SELECT overall_score, total_rows, valid_rows, quarantined_rows, warning_rows "
            "FROM data_quality_reports ORDER BY created_at DESC LIMIT 1"
        ))
        row = latest.first()
        if row:
            total = row[1] or 1
            return {
                "overall_score": row[0] or 0,
                "total_rows": row[1] or 0,
                "valid_rows": row[2] or 0,
                "quarantined_rows": row[3] or 0,
                "warning_rows": row[4] or 0,
                "valid_pct": round((row[2] or 0) / total * 100, 1),
            }
        return {
            "overall_score": 0,
            "total_rows": 0,
            "valid_rows": 0,
            "quarantined_rows": 0,
            "warning_rows": 0,
            "valid_pct": 0,
            "message": "No quality reports yet",
        }
    except Exception:
        return {"overall_score": 0, "total_rows": 0, "message": "Quality data unavailable"}


# ---------------------------------------------------------------------------
# GET /api/data-quality/reports — list quality reports
# ---------------------------------------------------------------------------

@router.get("/reports")
async def list_quality_reports(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List data quality reports, most recent first."""
    try:
        result = await db.execute(text("""
            SELECT id, upload_job_id, overall_score, total_rows, valid_rows,
                   quarantined_rows, warning_rows, checks, summary, created_at
            FROM data_quality_reports
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), {"limit": limit, "offset": offset})
        rows = result.fetchall()
        return [
            {
                "id": r.id,
                "upload_job_id": r.upload_job_id,
                "overall_score": r.overall_score,
                "total_rows": r.total_rows,
                "valid_rows": r.valid_rows,
                "quarantined_rows": r.quarantined_rows,
                "warning_rows": r.warning_rows,
                "checks": r.checks,
                "summary": r.summary,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning("Failed to list quality reports: %s", e)
        return []


# ---------------------------------------------------------------------------
# GET /api/data-quality/reports/{id} — report detail
# ---------------------------------------------------------------------------

@router.get("/reports/{report_id}")
async def get_quality_report(
    report_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get a single quality report with full details."""
    try:
        result = await db.execute(text("""
            SELECT id, upload_job_id, overall_score, total_rows, valid_rows,
                   quarantined_rows, warning_rows, checks, summary, created_at
            FROM data_quality_reports
            WHERE id = :rid
        """), {"rid": report_id})
        r = result.fetchone()
        if not r:
            raise HTTPException(status_code=404, detail="Report not found")
        return {
            "id": r.id,
            "upload_job_id": r.upload_job_id,
            "overall_score": r.overall_score,
            "total_rows": r.total_rows,
            "valid_rows": r.valid_rows,
            "quarantined_rows": r.quarantined_rows,
            "warning_rows": r.warning_rows,
            "checks": r.checks,
            "summary": r.summary,
            "created_at": str(r.created_at) if r.created_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get quality report: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch report")


# ---------------------------------------------------------------------------
# GET /api/data-quality/quarantine — quarantined records
# ---------------------------------------------------------------------------

@router.get("/quarantine")
async def list_quarantined_records(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    source_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List quarantined records with optional filters."""
    try:
        conditions = ["1=1"]
        params: dict = {"limit": limit, "offset": offset}

        if source_type:
            conditions.append("source_type = :source_type")
            params["source_type"] = source_type
        if status:
            conditions.append("status = :status")
            params["status"] = status

        where = " AND ".join(conditions)
        result = await db.execute(text(f"""
            SELECT id, upload_job_id, source_type, row_number, raw_data,
                   errors, warnings, status, fixed_data, reviewed_by, created_at
            FROM quarantined_records
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """), params)
        rows = result.fetchall()
        return [
            {
                "id": r.id,
                "upload_job_id": r.upload_job_id,
                "source_type": r.source_type,
                "row_number": r.row_number,
                "raw_data": r.raw_data,
                "errors": r.errors,
                "warnings": r.warnings,
                "status": r.status,
                "fixed_data": r.fixed_data,
                "reviewed_by": r.reviewed_by,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning("Failed to list quarantined records: %s", e)
        return []


# ---------------------------------------------------------------------------
# PATCH /api/data-quality/quarantine/{id} — fix or discard
# ---------------------------------------------------------------------------

@router.patch("/quarantine/{record_id}")
async def update_quarantined_record(
    record_id: int,
    body: QuarantineUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Fix or discard a quarantined record."""
    if body.status not in ("fixed", "discarded"):
        raise HTTPException(status_code=400, detail="Status must be 'fixed' or 'discarded'")

    try:
        if body.status == "fixed" and body.fixed_data:
            await db.execute(text("""
                UPDATE quarantined_records
                SET status = :status, fixed_data = :fixed_data::jsonb,
                    reviewed_by = :user_id, updated_at = NOW()
                WHERE id = :rid
            """), {
                "status": body.status,
                "fixed_data": json.dumps(body.fixed_data),
                "user_id": current_user["user_id"],
                "rid": record_id,
            })
        else:
            await db.execute(text("""
                UPDATE quarantined_records
                SET status = :status, reviewed_by = :user_id, updated_at = NOW()
                WHERE id = :rid
            """), {"status": body.status, "user_id": current_user["user_id"], "rid": record_id})

        await db.commit()
        return {"success": True, "id": record_id, "status": body.status}
    except Exception as e:
        await db.rollback()
        logger.error("Failed to update quarantined record: %s", e)
        raise HTTPException(status_code=500, detail="Failed to update record")


# ---------------------------------------------------------------------------
# GET /api/data-quality/unresolved — unresolved entity matches
# ---------------------------------------------------------------------------

@router.get("/unresolved")
async def list_unresolved_matches(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return records where entity matching was ambiguous for human review."""
    return await get_unresolved_matches(db)


# ---------------------------------------------------------------------------
# POST /api/data-quality/resolve/{id} — confirm a match
# ---------------------------------------------------------------------------

@router.post("/resolve/{quarantine_id}")
async def confirm_match(
    quarantine_id: int,
    body: ResolveRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Confirm an entity match for a quarantined record."""
    result = await resolve_match(
        db,
        quarantine_id=quarantine_id,
        resolved_entity_id=body.resolved_entity_id,
        reviewed_by=current_user["user_id"],
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Resolution failed"))
    return result


# ---------------------------------------------------------------------------
# GET /api/data-quality/lineage — data lineage
# ---------------------------------------------------------------------------

@router.get("/lineage")
async def get_lineage(
    entity_type: str = Query(...),
    entity_id: int = Query(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get data lineage for a specific entity."""
    try:
        result = await db.execute(text("""
            SELECT id, entity_type, entity_id, source_system, source_file,
                   source_row, ingestion_job_id, field_changes, created_at
            FROM data_lineage
            WHERE entity_type = :etype AND entity_id = :eid
            ORDER BY created_at ASC
        """), {"etype": entity_type, "eid": entity_id})
        rows = result.fetchall()
        return [
            {
                "id": r.id,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "source_system": r.source_system,
                "source_file": r.source_file,
                "source_row": r.source_row,
                "ingestion_job_id": r.ingestion_job_id,
                "field_changes": r.field_changes,
                "created_at": str(r.created_at) if r.created_at else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning("Failed to get lineage: %s", e)
        return []
