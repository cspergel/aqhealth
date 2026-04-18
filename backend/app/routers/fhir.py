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
    """Accept a FHIR R4 Bundle (JSON) and ingest all recognised resources."""
    return await ingest_fhir_bundle(db, bundle)


@router.post("/patient")
async def ingest_patient(
    patient: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept a single FHIR Patient resource."""
    return await ingest_single_patient(db, patient)


@router.post("/condition")
async def ingest_condition(
    conditions: list[dict],
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Accept one or more FHIR Condition resources."""
    return await ingest_conditions(db, conditions)


@router.get("/capability")
async def capability():
    """Return FHIR CapabilityStatement (what we accept)."""
    return get_capability_statement()
