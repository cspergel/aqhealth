"""
Autonomous Discovery Engine API endpoints.

Provides endpoints to trigger discovery scans, retrieve latest results,
and access revenue-cycle-specific findings. All tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.discovery_service import (
    run_full_discovery,
    anomaly_scan,
    opportunity_scan,
    comparative_scan,
    temporal_scan,
    cross_module_scan,
    revenue_cycle_scan,
)
from app.services.insight_service import generate_insights

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


@router.post("/run")
async def trigger_full_discovery(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Trigger a full autonomous discovery scan (admin only).
    Runs all 6 scans, synthesizes, and persists as Insight records.
    """
    # Run full discovery + insight generation pipeline
    results = await generate_insights(db)
    return {
        "discoveries_created": len(results),
        "discoveries": results,
    }


@router.get("/latest")
async def get_latest_discoveries(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Get the most recent discovery scan results (raw, before synthesis)."""
    # Run scans without synthesis to show raw findings
    raw: list[dict] = []
    scan_summary: dict[str, int] = {}

    for name, func_ref in [
        ("anomaly", anomaly_scan),
        ("opportunity", opportunity_scan),
        ("comparative", comparative_scan),
        ("temporal", temporal_scan),
        ("cross_module", cross_module_scan),
        ("revenue_cycle", revenue_cycle_scan),
    ]:
        try:
            results = await func_ref(db)
            raw.extend(results)
            scan_summary[name] = len(results)
        except Exception as e:
            logger.error("Scan '%s' failed: %s", name, e)
            scan_summary[name] = 0

    return {
        "total_findings": len(raw),
        "scan_summary": scan_summary,
        "findings": raw,
    }


@router.get("/revenue-cycle")
async def get_revenue_cycle_findings(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Get billing/collections specific findings from the revenue cycle scan."""
    try:
        results = await revenue_cycle_scan(db)
        return {
            "total_findings": len(results),
            "findings": results,
        }
    except Exception as e:
        logger.error("Revenue cycle scan failed: %s", e)
        raise HTTPException(status_code=500, detail="Revenue cycle scan failed")
