"""
FHIR R4 Ingestion service.

Accepts FHIR R4 Bundles (partial or complete) and maps resources to the
AQSoft data model: Patient -> Member, Condition -> diagnoses, Encounter -> visits,
MedicationRequest -> pharmacy, Observation -> labs, Procedure -> procedures.
"""

from sqlalchemy.ext.asyncio import AsyncSession


# Standard FHIR resource type handlers
RESOURCE_HANDLERS = {
    "Patient",
    "Condition",
    "MedicationRequest",
    "Observation",
    "Encounter",
    "Procedure",
}


async def ingest_fhir_bundle(db: AsyncSession, bundle: dict) -> dict:
    """Parse a FHIR R4 Bundle and ingest all recognised resources.

    Handles partial data gracefully — extracts what is available.
    Returns processing summary with counts and errors.
    """
    results = {
        "resources_processed": 0,
        "members_created": 0,
        "conditions_extracted": 0,
        "medications_found": 0,
        "encounters_mapped": 0,
        "observations_found": 0,
        "procedures_found": 0,
        "errors": [],
    }

    entries = bundle.get("entry", [])
    for entry in entries:
        resource = entry.get("resource", entry)
        resource_type = resource.get("resourceType")
        if not resource_type or resource_type not in RESOURCE_HANDLERS:
            continue

        try:
            if resource_type == "Patient":
                await _ingest_patient(db, resource)
                results["members_created"] += 1
            elif resource_type == "Condition":
                await _ingest_condition(db, resource)
                results["conditions_extracted"] += 1
            elif resource_type == "MedicationRequest":
                await _ingest_medication(db, resource)
                results["medications_found"] += 1
            elif resource_type == "Encounter":
                await _ingest_encounter(db, resource)
                results["encounters_mapped"] += 1
            elif resource_type == "Observation":
                await _ingest_observation(db, resource)
                results["observations_found"] += 1
            elif resource_type == "Procedure":
                await _ingest_procedure(db, resource)
                results["procedures_found"] += 1
            results["resources_processed"] += 1
        except Exception as e:
            results["errors"].append(
                {"resource_type": resource_type, "error": str(e)}
            )

    return results


async def ingest_single_patient(db: AsyncSession, patient: dict) -> dict:
    """Ingest a single FHIR Patient resource."""
    await _ingest_patient(db, patient)
    return {"status": "ok", "members_created": 1}


async def ingest_conditions(db: AsyncSession, conditions: list[dict]) -> dict:
    """Ingest one or more FHIR Condition resources."""
    count = 0
    errors = []
    for cond in conditions:
        try:
            await _ingest_condition(db, cond)
            count += 1
        except Exception as e:
            errors.append(str(e))
    return {"conditions_extracted": count, "errors": errors}


def get_capability_statement() -> dict:
    """Return a minimal FHIR CapabilityStatement for our server."""
    return {
        "resourceType": "CapabilityStatement",
        "status": "active",
        "date": "2026-03-26",
        "kind": "instance",
        "fhirVersion": "4.0.1",
        "format": ["json"],
        "rest": [
            {
                "mode": "server",
                "resource": [
                    {
                        "type": rt,
                        "interaction": [{"code": "create"}],
                    }
                    for rt in sorted(RESOURCE_HANDLERS)
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Internal helpers — map FHIR resources to platform models
# ---------------------------------------------------------------------------

async def _ingest_patient(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Patient to Member model (stub)."""
    # Extract: id, name, birthDate, gender, address, identifier (MBI)
    pass


async def _ingest_condition(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Condition coding to ICD-10 diagnoses (stub)."""
    pass


async def _ingest_medication(db: AsyncSession, resource: dict) -> None:
    """Map FHIR MedicationRequest to pharmacy data (stub)."""
    pass


async def _ingest_encounter(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Encounter to visit / claim records (stub)."""
    pass


async def _ingest_observation(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Observation to lab results (stub)."""
    pass


async def _ingest_procedure(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Procedure to procedure codes (stub)."""
    pass
