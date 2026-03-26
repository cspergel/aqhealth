"""
Transitional Care Management (TCM) Tracking Service.

Manages post-discharge TCM workflows: phone contact within 2 business days,
face-to-face visit within 7 days (99495) or 14 days (99496).
Tracks compliance, revenue generation, and per-provider performance.
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# TCM Dashboard
# ---------------------------------------------------------------------------

async def get_tcm_dashboard(db: AsyncSession) -> dict[str, Any]:
    """
    Return TCM metrics: active cases, compliance rate, revenue captured
    and potential, broken down by provider.
    """
    # In production this queries the TCM case table, claim table, and provider table.
    # For now, return structured placeholder that the API layer will override with mock data.
    return {
        "active_cases": 0,
        "compliance_rate": 0.0,
        "revenue_captured": 0,
        "revenue_potential": 0,
        "by_provider": [],
    }


# ---------------------------------------------------------------------------
# Active TCM Cases
# ---------------------------------------------------------------------------

async def get_active_tcm_cases(db: AsyncSession) -> list[dict[str, Any]]:
    """
    Members discharged in the last 30 days with TCM status tracking:
    - phone_contact: done / pending / overdue
    - visit: done / pending / overdue / missed
    - billing_status: billed / pending / not_eligible
    """
    return []


# ---------------------------------------------------------------------------
# Update TCM Status
# ---------------------------------------------------------------------------

async def update_tcm_status(
    db: AsyncSession,
    member_id: str,
    updates: dict[str, Any],
) -> dict[str, Any]:
    """
    Record phone contact completion, visit completion, or billing status change
    for a TCM case.
    """
    # In production: update the TCM case row, recalculate compliance, etc.
    return {"member_id": member_id, "updated": True, **updates}
