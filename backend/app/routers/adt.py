"""
ADT (Admit-Discharge-Transfer) API endpoints.

Handles real-time webhook ingestion, manual event submission, CSV batch uploads,
live census data, care alerts, and source configuration.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_tenant_db
from app.services.adt_service import (
    acknowledge_alert,
    assign_alert,
    configure_source,
    get_alerts,
    get_census_summary,
    get_events,
    get_live_census,
    get_sources,
    process_adt_event,
    process_csv_batch,
    process_hl7_message,
    resolve_alert,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/adt", tags=["adt"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ADTEventInput(BaseModel):
    event_type: str
    event_timestamp: str | None = None
    patient_name: str | None = None
    patient_dob: str | None = None
    patient_mrn: str | None = None
    external_member_id: str | None = None
    patient_class: str | None = None
    admit_date: str | None = None
    discharge_date: str | None = None
    admit_source: str | None = None
    discharge_disposition: str | None = None
    diagnosis_codes: list[str] | None = None
    facility_name: str | None = None
    facility_npi: str | None = None
    facility_type: str | None = None
    attending_provider: str | None = None
    attending_npi: str | None = None
    pcp_name: str | None = None
    pcp_npi: str | None = None
    plan_name: str | None = None
    plan_member_id: str | None = None
    raw_message_id: str | None = None


class WebhookPayload(BaseModel):
    """Flexible webhook payload — varies by source."""
    source: str | None = None
    event_type: str | None = None
    data: dict = Field(default_factory=dict)


class AlertUpdateInput(BaseModel):
    action: str  # "acknowledge", "assign", "resolve"
    assigned_to: int | None = None
    resolution_notes: str | None = None


class SourceConfigInput(BaseModel):
    id: int | None = None
    name: str
    source_type: str
    config: dict = Field(default_factory=dict)
    is_active: bool = True


# ---------------------------------------------------------------------------
# Webhook endpoint (no auth — uses webhook secret)
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def receive_webhook(
    payload: WebhookPayload,
    x_webhook_secret: str | None = Header(None),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Receive real-time webhook from Bamboo Health, Collective Medical, etc.
    Authenticated via webhook secret in header (not JWT).
    """
    expected_secret = getattr(settings, "adt_webhook_secret", "adt-webhook-secret-dev")
    if x_webhook_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    # Determine source
    source_name = payload.source or "webhook"
    sources = await get_sources(db)
    source = next((s for s in sources if s["name"].lower() == source_name.lower()), None)
    source_id = source["id"] if source else 1

    # Merge event data
    event_data = {**payload.data}
    if payload.event_type:
        event_data["event_type"] = payload.event_type

    try:
        result = await process_adt_event(db, event_data, source_id)
        return {"status": "processed", "event_id": result["id"], "alerts": len(result.get("alerts", []))}
    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process webhook")


# ---------------------------------------------------------------------------
# Manual event submission
# ---------------------------------------------------------------------------

@router.post("/events")
async def submit_event(
    body: ADTEventInput,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Manually submit an ADT event."""
    event_data = body.model_dump()
    # Use a manual source or the first available
    sources = await get_sources(db)
    manual_source = next((s for s in sources if s["source_type"] == "manual"), None)
    source_id = manual_source["id"] if manual_source else 1

    result = await process_adt_event(db, event_data, source_id)
    return result


# ---------------------------------------------------------------------------
# CSV batch upload
# ---------------------------------------------------------------------------

@router.post("/batch")
async def upload_batch(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Upload a CSV batch file of ADT events."""
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted")

    content = await file.read()
    text_content = content.decode("utf-8")

    sources = await get_sources(db)
    manual_source = next((s for s in sources if s["source_type"] == "manual"), None)
    source_id = manual_source["id"] if manual_source else 1

    result = await process_csv_batch(db, text_content, source_id)
    return result


# ---------------------------------------------------------------------------
# Census endpoints
# ---------------------------------------------------------------------------

@router.get("/census")
async def census(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Live census dashboard data."""
    return await get_live_census(db)


@router.get("/census/summary")
async def census_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Census summary stats."""
    return await get_census_summary(db)


# ---------------------------------------------------------------------------
# Care alerts endpoints
# ---------------------------------------------------------------------------

@router.get("/alerts")
async def list_alerts(
    status: str | None = Query("open"),
    assigned_to: int | None = Query(None),
    priority: str | None = Query(None),
    alert_type: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List care alerts (filterable)."""
    return await get_alerts(db, status=status, assigned_to=assigned_to, priority=priority, alert_type=alert_type)


@router.patch("/alerts/{alert_id}")
async def update_alert(
    alert_id: int,
    body: AlertUpdateInput,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Acknowledge, assign, or resolve a care alert."""
    user_id = current_user["user_id"]

    if body.action == "acknowledge":
        return await acknowledge_alert(db, alert_id, user_id)
    elif body.action == "assign":
        if not body.assigned_to:
            raise HTTPException(status_code=400, detail="assigned_to is required for assign action")
        return await assign_alert(db, alert_id, body.assigned_to)
    elif body.action == "resolve":
        return await resolve_alert(db, alert_id, user_id, body.resolution_notes)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")


# ---------------------------------------------------------------------------
# ADT source configuration
# ---------------------------------------------------------------------------

@router.get("/sources")
async def list_sources(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List configured ADT sources."""
    return await get_sources(db)


@router.post("/sources")
async def create_source(
    body: SourceConfigInput,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Configure a new ADT source."""
    return await configure_source(db, body.model_dump())


@router.patch("/sources/{source_id}")
async def update_source(
    source_id: int,
    body: SourceConfigInput,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an existing ADT source configuration."""
    data = body.model_dump()
    data["id"] = source_id
    return await configure_source(db, data)


# ---------------------------------------------------------------------------
# Event history
# ---------------------------------------------------------------------------

@router.get("/events")
async def list_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List recent ADT events for review."""
    return await get_events(db, limit=limit, offset=offset)
