"""
FHIR R4 Ingestion API endpoints.

Accepts FHIR R4 Bundles and individual resources, mapping them to the
AQSoft data model. Also exposes a CapabilityStatement.
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.fhir_service import (
    ingest_fhir_bundle,
    ingest_single_patient,
    ingest_conditions,
    get_capability_statement,
)
from app.services.fhir_validator import (
    validate_bundle,
    SUPPORTED_RESOURCE_TYPES,
)

logger = logging.getLogger(__name__)

# FHIR ingest — data section, admin/analyst only (no clinician write access).
router = APIRouter(
    prefix="/api/fhir",
    tags=["fhir"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
    ))],
)


@router.post("/ingest")
async def ingest_bundle(
    bundle: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept a FHIR R4 Bundle (JSON) and ingest all recognised resources.

    Rejects with 400 before ingestion when the payload is not a structurally
    valid FHIR R4 Bundle (see `fhir_validator.validate_bundle`).
    """
    validate_bundle(bundle)
    return await ingest_fhir_bundle(db, bundle)


@router.post("/patient")
async def ingest_patient(
    patient: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept a single FHIR Patient resource."""
    if not isinstance(patient, dict) or patient.get("resourceType") != "Patient":
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="resourceType must be 'Patient'")
    return await ingest_single_patient(db, patient)


@router.post("/condition")
async def ingest_condition(
    conditions: list[dict],
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept one or more FHIR Condition resources."""
    from fastapi import HTTPException
    if not isinstance(conditions, list):
        raise HTTPException(status_code=400, detail="Expected a JSON array of Condition resources")
    for i, c in enumerate(conditions):
        if not isinstance(c, dict) or c.get("resourceType") != "Condition":
            raise HTTPException(
                status_code=400,
                detail=f"conditions[{i}].resourceType must be 'Condition'",
            )
    return await ingest_conditions(db, conditions)


@router.get("/capability")
async def capability():
    """Return FHIR CapabilityStatement (what we accept)."""
    return get_capability_statement()
