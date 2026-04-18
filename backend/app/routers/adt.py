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

import contextlib
import hmac

from app.config import settings
from app.database import get_tenant_session, validate_schema_name
from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
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

# RBAC: intentionally PUBLIC (no JWT, no role guard). External ADT vendors
# (Bamboo Health, Collective Medical, Availity) POST events here. Auth is via
# HMAC-style X-Webhook-Secret header + X-Tenant-Schema, validated below.
@router.post("/webhook")
async def receive_webhook(
    payload: WebhookPayload,
    x_webhook_secret: str | None = Header(None),
    x_tenant_schema: str | None = Header(None),
):
    """
    Receive real-time webhook from Bamboo Health, Collective Medical, etc.
    Authenticated via webhook secret in header (not JWT).
    Requires X-Tenant-Schema header to identify the target tenant.
    """
    if not x_tenant_schema:
        raise HTTPException(status_code=400, detail="X-Tenant-Schema header required")
    try:
        validate_schema_name(x_tenant_schema)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid tenant schema name")

    # Verify the tenant exists, is active, and validate the webhook secret.
    # Supports per-tenant webhook secrets (stored in tenant config) with
    # fallback to the global secret for backwards compatibility.
    from app.database import async_session_factory
    from sqlalchemy import text as sa_text
    async with async_session_factory() as platform_db:
        tenant_check = await platform_db.execute(
            sa_text("SELECT id, config FROM platform.tenants WHERE schema_name = :schema AND status = 'active'"),
            {"schema": x_tenant_schema},
        )
        tenant_row = tenant_check.fetchone()
        if not tenant_row:
            raise HTTPException(status_code=403, detail="Tenant not found or inactive")

        # Check per-tenant webhook secret first, then fall back to global
        tenant_config = tenant_row.config or {}
        tenant_secret = tenant_config.get("adt_webhook_secret")
        global_secret = getattr(settings, "adt_webhook_secret", None)
        expected_secret = tenant_secret or global_secret

        if not expected_secret:
            raise HTTPException(status_code=503, detail="Webhook secret not configured")
        if not x_webhook_secret or not hmac.compare_digest(x_webhook_secret, expected_secret):
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    # Open a tenant-scoped DB session (bypasses JWT-based get_tenant_db)
    async with contextlib.asynccontextmanager(get_tenant_session)(x_tenant_schema) as db:
        # Determine source
        source_name = payload.source or "webhook"
        sources = await get_sources(db)
        source = next((s for s in sources if s["name"].lower() == source_name.lower()), None)
        if not source:
            raise HTTPException(status_code=400, detail=f"No ADT source matching '{source_name}'")
        source_id = source["id"]

        # Merge event data
        event_data = {**payload.data}
        if payload.event_type:
            event_data["event_type"] = payload.event_type

        try:
            result = await process_adt_event(db, event_data, source_id)
            return {"status": "processed", "event_id": result["id"], "alerts": len(result.get("alerts", []))}
        except Exception as e:
            logger.error("Webhook processing error: %s", e)
            raise HTTPException(status_code=500, detail="Failed to process webhook")


# ---------------------------------------------------------------------------
# Manual event submission
# ---------------------------------------------------------------------------

@router.post(
    "/events",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
        UserRole.care_manager,
    ))],
)
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

@router.post(
    "/batch",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
    ))],
)
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

@router.get(
    "/census",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
        UserRole.care_manager, UserRole.auditor,
    ))],
)
async def census(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Live census dashboard data."""
    return await get_live_census(db)


@router.get(
    "/census/summary",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
        UserRole.care_manager, UserRole.auditor,
    ))],
)
async def census_summary(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Census summary stats."""
    return await get_census_summary(db)


# ---------------------------------------------------------------------------
# Care alerts endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/alerts",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
        UserRole.care_manager, UserRole.provider,
    ))],
)
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


@router.patch(
    "/alerts/{alert_id}",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.care_manager,
        UserRole.provider,
    ))],
)
async def update_alert(
    alert_id: int,
    body: AlertUpdateInput,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Acknowledge, assign, or resolve a care alert."""
    user_id = current_user["user_id"]

    if body.action == "acknowledge":
        result = await acknowledge_alert(db, alert_id, user_id)
    elif body.action == "assign":
        if not body.assigned_to:
            raise HTTPException(status_code=400, detail="assigned_to is required for assign action")
        result = await assign_alert(db, alert_id, body.assigned_to)
    elif body.action == "resolve":
        result = await resolve_alert(db, alert_id, user_id, body.resolution_notes)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")

    if not result:
        raise HTTPException(status_code=404, detail="Alert not found")
    return result


# ---------------------------------------------------------------------------
# ADT source configuration
# ---------------------------------------------------------------------------

@router.get(
    "/sources",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
        UserRole.auditor,
    ))],
)
async def list_sources(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List configured ADT sources."""
    return await get_sources(db)


@router.post("/sources")
async def create_source(
    body: SourceConfigInput,
    current_user: dict = Depends(require_role(UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Configure a new ADT source."""
    return await configure_source(db, body.model_dump())


@router.patch("/sources/{source_id}")
async def update_source(
    source_id: int,
    body: SourceConfigInput,
    current_user: dict = Depends(require_role(UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an existing ADT source configuration."""
    data = body.model_dump()
    data["id"] = source_id
    return await configure_source(db, data)


# ---------------------------------------------------------------------------
# Event history
# ---------------------------------------------------------------------------

@router.get(
    "/events",
    dependencies=[Depends(require_role(
        UserRole.superadmin, UserRole.mso_admin, UserRole.analyst,
        UserRole.care_manager, UserRole.auditor,
    ))],
)
async def list_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List recent ADT events for review."""
    return await get_events(db, limit=limit, offset=offset)
