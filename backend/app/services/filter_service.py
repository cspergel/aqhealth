"""
Universal Filter Service — provides field definitions, filter CRUD,
and the engine that translates JSON filter conditions into SQLAlchemy queries.
"""

import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, and_, or_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_filter import SavedFilter
from app.models.member import Member

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Field definitions per page context
# ---------------------------------------------------------------------------

FIELD_TYPES = {
    "number": [">=", "<=", "=", "!=", "between"],
    "string": ["contains", "equals", "starts_with", "not_contains"],
    "enum": ["is", "is_not", "in"],
    "boolean": ["is_true", "is_false"],
}

MEMBERS_FIELDS = [
    {"field": "current_raf", "label": "RAF Score", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "risk_tier", "label": "Risk Tier", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["low", "rising", "high", "complex"]},
    {"field": "days_since_visit", "label": "Days Since Last Visit", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "er_visits_12mo", "label": "ER Visits (12mo)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "admissions_12mo", "label": "Admissions (12mo)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "snf_days_12mo", "label": "SNF Days (12mo)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "age", "label": "Age", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "gender", "label": "Gender", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["M", "F"]},
    {"field": "plan", "label": "Plan", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["Humana Gold Plus", "Aetna Medicare Advantage"]},
    {"field": "pcp", "label": "Provider (PCP)", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "group", "label": "Practice Group", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["ISG Tampa", "FMG St. Petersburg", "ISG Brandon", "FMG Clearwater"]},
    {"field": "suspect_count", "label": "Suspect Count", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "gap_count", "label": "Gap Count", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "total_spend_12mo", "label": "12mo Spend ($)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "has_suspects", "label": "Has Suspects", "type": "boolean", "operators": FIELD_TYPES["boolean"]},
    {"field": "has_gaps", "label": "Has Open Gaps", "type": "boolean", "operators": FIELD_TYPES["boolean"]},
]

SUSPECTS_FIELDS = [
    {"field": "raf_value", "label": "RAF Value", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "suspect_type", "label": "Suspect Type", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["historical", "clinical", "nlp"]},
    {"field": "status", "label": "Status", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["open", "accepted", "rejected", "captured"]},
    {"field": "hcc_code", "label": "HCC Code", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "confidence", "label": "Confidence", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "days_open", "label": "Days Open", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "provider", "label": "Provider", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "group", "label": "Practice Group", "type": "string", "operators": FIELD_TYPES["string"]},
]

EXPENDITURE_FIELDS = [
    {"field": "service_category", "label": "Service Category", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["inpatient", "ed_observation", "pharmacy", "outpatient", "professional", "snf_postacute"]},
    {"field": "facility", "label": "Facility", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "provider", "label": "Provider", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "paid_amount", "label": "Paid Amount ($)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "diagnosis", "label": "Diagnosis", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "drg_code", "label": "DRG Code", "type": "string", "operators": FIELD_TYPES["string"]},
]

PROVIDERS_FIELDS = [
    {"field": "capture_rate", "label": "Capture Rate (%)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "recapture_rate", "label": "Recapture Rate (%)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "panel_size", "label": "Panel Size", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "avg_raf", "label": "Avg RAF", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "panel_pmpm", "label": "PMPM ($)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "gap_closure_rate", "label": "Gap Closure Rate (%)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "specialty", "label": "Specialty", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["Internal Medicine", "Family Medicine", "Geriatrics"]},
    {"field": "group", "label": "Practice Group", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "tier", "label": "Tier", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["green", "amber", "red"]},
]

CARE_GAPS_FIELDS = [
    {"field": "measure", "label": "Measure", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "status", "label": "Status", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["open", "closed", "excluded"]},
    {"field": "weight", "label": "Weight", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "closure_rate", "label": "Closure Rate (%)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "provider", "label": "Provider", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "group", "label": "Practice Group", "type": "string", "operators": FIELD_TYPES["string"]},
]

CENSUS_FIELDS = [
    {"field": "facility", "label": "Facility", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "patient_class", "label": "Patient Class", "type": "enum", "operators": FIELD_TYPES["enum"],
     "options": ["inpatient", "observation", "ed", "snf"]},
    {"field": "los_days", "label": "Length of Stay (Days)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "daily_cost", "label": "Daily Cost ($)", "type": "number", "operators": FIELD_TYPES["number"]},
    {"field": "diagnosis", "label": "Diagnosis", "type": "string", "operators": FIELD_TYPES["string"]},
    {"field": "provider", "label": "Provider", "type": "string", "operators": FIELD_TYPES["string"]},
]

FIELD_MAP = {
    "members": MEMBERS_FIELDS,
    "suspects": SUSPECTS_FIELDS,
    "expenditure": EXPENDITURE_FIELDS,
    "providers": PROVIDERS_FIELDS,
    "care_gaps": CARE_GAPS_FIELDS,
    "census": CENSUS_FIELDS,
}


def get_available_fields(page_context: str) -> list[dict]:
    """Return all filterable fields for a given page context."""
    return FIELD_MAP.get(page_context, [])


# ---------------------------------------------------------------------------
# CRUD for saved filters
# ---------------------------------------------------------------------------

async def save_filter(db: AsyncSession, filter_data: dict) -> SavedFilter:
    """Create a new saved filter."""
    sf = SavedFilter(
        name=filter_data["name"],
        description=filter_data.get("description"),
        page_context=filter_data["page_context"],
        conditions=filter_data["conditions"],
        created_by=filter_data["created_by"],
        is_shared=filter_data.get("is_shared", False),
        is_system=filter_data.get("is_system", False),
    )
    db.add(sf)
    await db.commit()
    await db.refresh(sf)
    return sf


async def get_saved_filters(
    db: AsyncSession, page_context: str, user_id: int
) -> list[dict]:
    """Return user's own + shared + system filters for a page context."""
    stmt = (
        select(SavedFilter)
        .where(
            SavedFilter.page_context == page_context,
            or_(
                SavedFilter.created_by == user_id,
                SavedFilter.is_shared == True,
                SavedFilter.is_system == True,
            ),
        )
        .order_by(SavedFilter.is_system.desc(), SavedFilter.use_count.desc())
    )
    result = await db.execute(stmt)
    filters = result.scalars().all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "page_context": f.page_context,
            "conditions": f.conditions,
            "created_by": f.created_by,
            "is_shared": f.is_shared,
            "is_system": f.is_system,
            "use_count": f.use_count,
            "last_used": f.last_used.isoformat() if f.last_used else None,
        }
        for f in filters
    ]


async def delete_filter(db: AsyncSession, filter_id: int, user_id: int) -> bool:
    """Delete a user-created filter (system filters cannot be deleted)."""
    stmt = select(SavedFilter).where(
        SavedFilter.id == filter_id,
        SavedFilter.created_by == user_id,
        SavedFilter.is_system == False,
    )
    result = await db.execute(stmt)
    sf = result.scalar_one_or_none()
    if not sf:
        return False
    await db.delete(sf)
    await db.commit()
    return True


async def apply_filter(
    db: AsyncSession, page_context: str, conditions: dict
) -> dict:
    """
    Apply filter conditions and return a matching count.
    In a full implementation this would build a SQLAlchemy query.
    For now, returns the conditions for the frontend to apply client-side.
    """
    # Increment usage tracking if filter has an ID
    filter_id = conditions.get("filter_id")
    if filter_id:
        stmt = select(SavedFilter).where(SavedFilter.id == filter_id)
        result = await db.execute(stmt)
        sf = result.scalar_one_or_none()
        if sf:
            sf.use_count += 1
            sf.last_used = datetime.utcnow()
            await db.commit()

    return {"applied": True, "conditions": conditions, "context": page_context}
