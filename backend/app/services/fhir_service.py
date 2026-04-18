"""
FHIR R4 Ingestion service.

Accepts FHIR R4 Bundles (partial or complete) and maps resources to the
AQSoft data model: Patient -> Member, Condition -> diagnoses, Encounter -> visits,
MedicationRequest -> pharmacy, Observation -> labs, Procedure -> procedures.
"""

import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim

logger = logging.getLogger(__name__)


# Standard FHIR resource type handlers — maps resource type to its ingestion function.
# Stub handlers (value is None) are recognized but do not increment counters.
RESOURCE_HANDLERS: dict[str, str | None] = {
    "Patient": "_ingest_patient",
    "Condition": "_ingest_condition",
    "MedicationRequest": "_ingest_medication",
    "Observation": None,       # stub — not yet implemented
    "Encounter": None,         # stub — not yet implemented
    "Procedure": None,         # stub — not yet implemented
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
            # Skip stub handlers — they are recognized but not yet implemented
            if RESOURCE_HANDLERS.get(resource_type) is None:
                continue

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
    """Ingest a single FHIR Patient resource. Reports whether it was an insert or update."""
    was_update = await _ingest_patient(db, patient)
    if was_update:
        return {"status": "ok", "members_updated": 1, "members_created": 0}
    return {"status": "ok", "members_created": 1, "members_updated": 0}


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
    """Return a minimal FHIR CapabilityStatement for our server.

    Resources with an active handler advertise `create`. Recognized resources
    without an implementation are not listed, so FHIR conformance tooling
    does not see claimed support for endpoints that silently skip ingestion.
    """
    active = sorted(rt for rt, handler in RESOURCE_HANDLERS.items() if handler is not None)
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
                    for rt in active
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Internal helpers — map FHIR resources to platform models
# ---------------------------------------------------------------------------

async def _ingest_patient(db: AsyncSession, resource: dict) -> bool:
    """Map FHIR Patient to Member model — create or update. Returns True if updated, False if created."""
    # Extract FHIR fields
    fhir_id = resource.get("id", "")

    # Name
    names = resource.get("name", [])
    first_name = ""
    last_name = ""
    if names:
        name_obj = names[0]
        first_name = " ".join(name_obj.get("given", []))
        last_name = name_obj.get("family", "")

    # Demographics
    birth_date_str = resource.get("birthDate")
    birth_date = date.fromisoformat(birth_date_str) if birth_date_str else None
    gender_raw = resource.get("gender", "")
    gender = gender_raw[0].upper() if gender_raw else "U"

    # Identifier — look for MBI or member ID
    member_id_value = fhir_id
    for ident in resource.get("identifier", []):
        system = ident.get("system", "")
        if "mbi" in system.lower() or "member" in system.lower():
            member_id_value = ident.get("value", fhir_id)
            break

    # Address / zip
    zip_code = None
    for addr in resource.get("address", []):
        zip_code = addr.get("postalCode")
        if zip_code:
            break

    # Check if member already exists by member_id
    existing_q = await db.execute(
        select(Member).where(Member.member_id == member_id_value)
    )
    existing = existing_q.scalar_one_or_none()

    if existing:
        existing.first_name = first_name or existing.first_name
        existing.last_name = last_name or existing.last_name
        if birth_date:
            existing.date_of_birth = birth_date
        existing.gender = gender
        if zip_code:
            existing.zip_code = zip_code
        logger.info("Updated existing member %s from FHIR Patient", member_id_value)
        await db.flush()
        return True
    else:
        member = Member(
            member_id=member_id_value,
            first_name=first_name,
            last_name=last_name,
            date_of_birth=birth_date or date(1900, 1, 1),
            gender=gender,
            zip_code=zip_code,
        )
        db.add(member)
        logger.info("Created new member %s from FHIR Patient", member_id_value)
        await db.flush()
        return False


async def _ingest_condition(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Condition coding to ICD-10 — creates a claim-like record."""
    # Extract ICD-10 codes from coding
    icd_codes: list[str] = []
    code_block = resource.get("code", {})
    for coding in code_block.get("coding", []):
        system = coding.get("system", "")
        if "icd" in system.lower() or "icd-10" in system.lower():
            code_val = coding.get("code")
            if code_val:
                icd_codes.append(code_val)
    # Fallback: take any code present
    if not icd_codes:
        for coding in code_block.get("coding", []):
            code_val = coding.get("code")
            if code_val:
                icd_codes.append(code_val)

    if not icd_codes:
        logger.warning("FHIR Condition has no extractable codes: %s", resource.get("id"))
        return

    # Resolve member from subject reference
    subject_ref = resource.get("subject", {}).get("reference", "")
    # e.g. "Patient/12345"
    patient_id = subject_ref.split("/")[-1] if "/" in subject_ref else subject_ref

    member_q = await db.execute(
        select(Member).where(Member.member_id == patient_id)
    )
    member = member_q.scalar_one_or_none()
    if not member:
        logger.warning("FHIR Condition references unknown patient: %s", patient_id)
        return

    # Onset / recorded date
    onset_str = resource.get("onsetDateTime") or resource.get("recordedDate")
    service_date = date.fromisoformat(onset_str[:10]) if onset_str else date.today()

    # Create a professional claim record with the diagnosis codes
    claim = Claim(
        member_id=member.id,
        claim_type="professional",
        service_date=service_date,
        diagnosis_codes=icd_codes,
        service_category="professional",
        data_tier="signal",
        is_estimated=False,
        signal_source="fhir_condition",
    )
    db.add(claim)
    await db.flush()
    logger.info("Created claim from FHIR Condition for member %s with codes %s", patient_id, icd_codes)


async def _ingest_medication(db: AsyncSession, resource: dict) -> None:
    """Map FHIR MedicationRequest to pharmacy claim."""
    # Resolve member
    subject_ref = resource.get("subject", {}).get("reference", "")
    patient_id = subject_ref.split("/")[-1] if "/" in subject_ref else subject_ref

    member_q = await db.execute(
        select(Member).where(Member.member_id == patient_id)
    )
    member = member_q.scalar_one_or_none()
    if not member:
        logger.warning("FHIR MedicationRequest references unknown patient: %s", patient_id)
        return

    # Extract drug name from medicationCodeableConcept or medicationReference
    drug_name = None
    med_concept = resource.get("medicationCodeableConcept", {})
    if med_concept:
        drug_name = med_concept.get("text")
        if not drug_name:
            codings = med_concept.get("coding", [])
            if codings:
                drug_name = codings[0].get("display") or codings[0].get("code")

    authored_str = resource.get("authoredOn")
    service_date = date.fromisoformat(authored_str[:10]) if authored_str else date.today()

    claim = Claim(
        member_id=member.id,
        claim_type="pharmacy",
        service_date=service_date,
        drug_name=drug_name,
        service_category="pharmacy",
        data_tier="signal",
        is_estimated=False,
        signal_source="fhir_medication",
    )
    db.add(claim)
    await db.flush()
    logger.info("Created pharmacy claim from FHIR MedicationRequest for member %s", patient_id)


async def _ingest_encounter(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Encounter to visit / claim records — not yet implemented."""
    logger.debug("FHIR Encounter ingestion not yet implemented (resource id=%s)", resource.get("id"))


async def _ingest_observation(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Observation to lab results — not yet implemented."""
    logger.debug("FHIR Observation ingestion not yet implemented (resource id=%s)", resource.get("id"))


async def _ingest_procedure(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Procedure to procedure codes — not yet implemented."""
    logger.debug("FHIR Procedure ingestion not yet implemented (resource id=%s)", resource.get("id"))
