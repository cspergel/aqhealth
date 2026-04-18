"""
Universal Data Interface API endpoints.

Manages configured data interfaces and provides format-specific
ingest endpoints for HL7v2, X12/EDI, CDA/CCDA, and generic JSON.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.interface_service import (
    create_interface,
    delete_interface,
    detect_x12_type,
    get_interface_logs,
    get_interface_status,
    list_interfaces,
    normalize_to_platform,
    parse_cda_document,
    parse_hl7v2_message,
    parse_x12_834,
    parse_x12_835,
    parse_x12_837,
    test_interface_connection,
    update_interface,
)

logger = logging.getLogger(__name__)

# Universal interfaces — data section. Reads broadly, writes admin-only
# (per-route require_role already applied below for POST/PATCH/DELETE and
# for all /ingest/* ingestion endpoints).
router = APIRouter(
    prefix="/api",
    tags=["interfaces"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.auditor,
    ))],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class InterfaceCreate(BaseModel):
    name: str
    interface_type: str
    direction: str = "inbound"
    config: dict = Field(default_factory=dict)
    is_active: bool = True
    schedule: str | None = None


class InterfaceUpdate(BaseModel):
    name: str | None = None
    interface_type: str | None = None
    direction: str | None = None
    config: dict | None = None
    is_active: bool | None = None
    schedule: str | None = None


class IngestResult(BaseModel):
    success: bool
    format: str
    records_parsed: int
    records_normalised: int = 0
    details: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Interface CRUD
# ---------------------------------------------------------------------------

@router.get("/interfaces")
async def list_all_interfaces(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all configured data interfaces with status."""
    return await list_interfaces(db)


@router.get("/interfaces/status")
async def interface_status(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get summary status of all interfaces."""
    return await get_interface_status(db)


@router.post("/interfaces")
async def create_new_interface(
    body: InterfaceCreate,
    current_user: dict = Depends(require_role(UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Configure a new data interface."""
    return await create_interface(db, body.model_dump())


@router.patch("/interfaces/{interface_id}")
async def update_existing_interface(
    interface_id: int,
    body: InterfaceUpdate,
    current_user: dict = Depends(require_role(UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an existing interface configuration."""
    updates = body.model_dump(exclude_unset=True)
    return await update_interface(db, interface_id, updates)


@router.delete("/interfaces/{interface_id}")
async def remove_interface(
    interface_id: int,
    current_user: dict = Depends(require_role(UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Remove an interface configuration."""
    return await delete_interface(db, interface_id)


@router.post("/interfaces/{interface_id}/test")
async def test_connection(
    interface_id: int,
    current_user: dict = Depends(require_role(UserRole.mso_admin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Test connectivity of a configured interface."""
    return await test_interface_connection(db, interface_id)


@router.get("/interfaces/{interface_id}/logs")
async def get_logs(
    interface_id: int,
    limit: int = Query(default=20, le=100),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get recent activity log for an interface."""
    return await get_interface_logs(db, interface_id, limit)


# ---------------------------------------------------------------------------
# Format-specific ingest endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/ingest/hl7v2",
    response_model=IngestResult,
    dependencies=[Depends(require_role(UserRole.superadmin, UserRole.mso_admin, UserRole.analyst))],
)
async def ingest_hl7v2(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Accept a raw HL7v2 message.
    Content-Type: x-application/hl7-v2+er7 or text/plain
    """
    raw = (await request.body()).decode("utf-8")
    parsed = parse_hl7v2_message(raw)
    normalised = normalize_to_platform(parsed, "hl7v2")

    total_records = (
        len(normalised["members"])
        + len(normalised["encounters"])
        + len(normalised["observations"])
    )

    return IngestResult(
        success=True,
        format="hl7v2",
        records_parsed=1,
        records_normalised=total_records,
        details={
            "message_type": parsed.get("message_type"),
            "patient": parsed.get("patient"),
            "diagnoses_count": len(parsed.get("diagnoses", [])),
            "observations_count": len(parsed.get("observations", [])),
        },
    )


@router.post(
    "/ingest/x12",
    response_model=IngestResult,
    dependencies=[Depends(require_role(UserRole.superadmin, UserRole.mso_admin, UserRole.analyst))],
)
async def ingest_x12(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Accept an X12/EDI file. Auto-detects 837/835/834.
    """
    raw = (await request.body()).decode("utf-8")
    tx_type = detect_x12_type(raw)

    if tx_type == "837":
        parsed = parse_x12_837(raw)
        normalised = normalize_to_platform(parsed, "x12_837")
        return IngestResult(
            success=True,
            format="x12_837",
            records_parsed=len(parsed),
            records_normalised=len(normalised.get("claims", [])),
            details={"transaction_type": "837", "claims_count": len(parsed)},
        )
    elif tx_type == "835":
        parsed = parse_x12_835(raw)
        return IngestResult(
            success=True,
            format="x12_835",
            records_parsed=len(parsed),
            details={"transaction_type": "835", "payments_count": len(parsed)},
        )
    elif tx_type == "834":
        parsed = parse_x12_834(raw)
        normalised = normalize_to_platform(parsed, "x12_834")
        return IngestResult(
            success=True,
            format="x12_834",
            records_parsed=len(parsed),
            records_normalised=len(normalised.get("members", [])),
            details={"transaction_type": "834", "enrollments_count": len(parsed)},
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Could not auto-detect X12 transaction type. Ensure the file contains an ST segment.",
        )


@router.post(
    "/ingest/cda",
    response_model=IngestResult,
    dependencies=[Depends(require_role(UserRole.superadmin, UserRole.mso_admin, UserRole.analyst))],
)
async def ingest_cda(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept a CDA/CCDA XML document."""
    raw = (await request.body()).decode("utf-8")
    parsed = parse_cda_document(raw)
    normalised = normalize_to_platform(parsed, "cda")

    total_records = len(normalised["members"]) + len(normalised["observations"])

    return IngestResult(
        success=True,
        format="cda",
        records_parsed=1,
        records_normalised=total_records,
        details={
            "patient": parsed.get("patient", {}).get("last_name"),
            "problems_count": len(parsed.get("problems", [])),
            "medications_count": len(parsed.get("medications", [])),
            "allergies_count": len(parsed.get("allergies", [])),
            "lab_results_count": len(parsed.get("lab_results", [])),
        },
    )


@router.post(
    "/ingest/json",
    response_model=IngestResult,
    dependencies=[Depends(require_role(UserRole.superadmin, UserRole.mso_admin, UserRole.analyst))],
)
async def ingest_json(
    body: dict,
    format_hint: str = Query(default="auto", description="Format hint: 'fhir', 'custom', 'auto'"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept generic JSON data with an optional format hint."""
    # Auto-detect FHIR
    if format_hint == "auto":
        if "resourceType" in body:
            format_hint = "fhir"
        else:
            format_hint = "custom"

    if format_hint == "fhir":
        # Delegate to FHIR service
        from app.services.fhir_service import ingest_fhir_bundle
        result = await ingest_fhir_bundle(db, body)
        return IngestResult(
            success=True,
            format="fhir",
            records_parsed=1,
            details={"delegated_to": "fhir_service", "result": result},
        )

    # Custom JSON — store as-is for now
    record_count = len(body.get("records", [])) if isinstance(body.get("records"), list) else 1
    return IngestResult(
        success=True,
        format="json_custom",
        records_parsed=record_count,
        details={"keys": list(body.keys())[:10]},
    )
