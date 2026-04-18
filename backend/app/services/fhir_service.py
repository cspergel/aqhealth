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
# A handler of None means the resource type is recognized but deliberately skipped.
RESOURCE_HANDLERS: dict[str, str | None] = {
    "Patient": "_ingest_patient",
    "Condition": "_ingest_condition",
    "MedicationRequest": "_ingest_medication",
    "Observation": "_ingest_observation",
    "Encounter": "_ingest_encounter",
    "Procedure": "_ingest_procedure",
}


# FHIR Encounter.class code -> our `service_category` taxonomy.
# See http://terminology.hl7.org/CodeSystem/v3-ActCode for the class codes.
_ENCOUNTER_CLASS_TO_CATEGORY: dict[str, str] = {
    "AMB": "professional",       # ambulatory
    "EMER": "ed_observation",    # emergency
    "IMP": "inpatient",          # inpatient encounter
    "ACUTE": "inpatient",        # inpatient acute
    "NONAC": "inpatient",        # inpatient non-acute
    "OBSENC": "ed_observation",  # observation encounter
    "SS": "professional",        # short stay
    "HH": "home_health",         # home health
    "VR": "professional",        # virtual
    "PRENC": "professional",     # pre-admission
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


async def _resolve_member_from_subject(db: AsyncSession, resource: dict) -> Member | None:
    """Return the Member referenced by `resource.subject.reference`, or None.

    FHIR references look like ``Patient/123`` (relative) or
    ``urn:uuid:...`` / absolute URLs. We pull the last segment and match
    against ``Member.member_id`` — the same convention ``_ingest_patient``
    uses when assigning the external FHIR id to ``member_id``.
    """
    subject_ref = (resource.get("subject") or {}).get("reference") or ""
    if not subject_ref:
        return None
    patient_id = subject_ref.split("/")[-1] if "/" in subject_ref else subject_ref
    if not patient_id:
        return None
    member_q = await db.execute(
        select(Member).where(Member.member_id == patient_id)
    )
    return member_q.scalar_one_or_none()


def _first_coding(code_block: dict | None) -> tuple[str | None, str | None, str | None]:
    """Return (system, code, display) from the first coding on a CodeableConcept."""
    if not code_block:
        return (None, None, None)
    for coding in code_block.get("coding") or []:
        code = coding.get("code")
        if code:
            return (coding.get("system"), code, coding.get("display"))
    return (None, None, code_block.get("text"))


async def _ingest_encounter(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Encounter to a signal-tier Claim row.

    We infer ``service_category`` from the encounter class code (AMB ->
    professional, EMER -> ed_observation, IMP -> inpatient). Encounters are
    stored as signal-tier because they don't carry payer adjudication data;
    they'll be reconciled against a record-tier claim when it arrives.
    """
    member = await _resolve_member_from_subject(db, resource)
    if not member:
        logger.warning(
            "FHIR Encounter references unknown patient: %s (encounter id=%s)",
            (resource.get("subject") or {}).get("reference"),
            resource.get("id"),
        )
        return

    # Class code -> service_category. FHIR R4 Encounter.class is a Coding
    # (not CodeableConcept) — it has `code`, `system`, `display` directly.
    class_block = resource.get("class") or {}
    class_code = class_block.get("code") if isinstance(class_block, dict) else None
    service_category = _ENCOUNTER_CLASS_TO_CATEGORY.get(class_code or "", "professional")

    # Period.start is the service start. Fall back to status-change dates.
    period = resource.get("period") or {}
    start_str = period.get("start") or resource.get("plannedStartDate")
    end_str = period.get("end")
    try:
        service_date = date.fromisoformat(start_str[:10]) if start_str else date.today()
    except ValueError:
        service_date = date.today()

    # LOS — only meaningful if we have both start and end.
    los: int | None = None
    if start_str and end_str:
        try:
            los = max((date.fromisoformat(end_str[:10]) - service_date).days, 0)
        except ValueError:
            los = None

    # FHIR Encounter.diagnosis points at separate Condition resources, not
    # raw ICD-10 codes. Those Conditions arrive (or already arrived) in the
    # same Bundle via _ingest_condition. We don't stuff Condition IDs into
    # Claim.diagnosis_codes (column is VARCHAR(10), IDs are longer).
    diag_refs: list[str] = []
    for diag in resource.get("diagnosis") or []:
        cond_ref = (diag.get("condition") or {}).get("reference", "")
        if cond_ref:
            diag_refs.append(cond_ref)

    claim_type_map = {
        "inpatient": "institutional",
        "ed_observation": "institutional",
        "snf_postacute": "institutional",
        "home_health": "institutional",
    }
    claim_type = claim_type_map.get(service_category, "professional")

    claim = Claim(
        member_id=member.id,
        claim_type=claim_type,
        service_date=service_date,
        service_category=service_category,
        los=los,
        data_tier="signal",
        is_estimated=False,
        signal_source="fhir_encounter",
        extra={
            "fhir_encounter_id": resource.get("id"),
            "class_code": class_code,
            "status": resource.get("status"),
            "diagnosis_refs": diag_refs or None,
        },
    )
    db.add(claim)
    await db.flush()
    logger.info(
        "Created signal-tier claim from FHIR Encounter %s for member %s (category=%s)",
        resource.get("id"), member.member_id, service_category,
    )


async def _ingest_observation(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Observation to a lab-result signal stored on a Claim row.

    We don't have a dedicated Observation model (and introducing one would
    ripple across 3 services). Instead we persist the observation as a
    minimal signal-tier Claim with the observation payload in ``extra``.
    The HCC engine, care-gap detector, and downstream analytics read Claim
    rows with ``signal_source='fhir_observation'`` to pick up lab data.
    """
    member = await _resolve_member_from_subject(db, resource)
    if not member:
        logger.warning(
            "FHIR Observation references unknown patient: %s (obs id=%s)",
            (resource.get("subject") or {}).get("reference"),
            resource.get("id"),
        )
        return

    # Code (LOINC preferred)
    system, code, display = _first_coding(resource.get("code"))

    # Value extraction — FHIR has multiple `value[x]` choice fields.
    value: dict = {}
    if "valueQuantity" in resource:
        vq = resource["valueQuantity"]
        value = {
            "type": "Quantity",
            "value": vq.get("value"),
            "unit": vq.get("unit") or vq.get("code"),
        }
    elif "valueString" in resource:
        value = {"type": "string", "value": resource["valueString"]}
    elif "valueCodeableConcept" in resource:
        _, vcode, vdisplay = _first_coding(resource["valueCodeableConcept"])
        value = {"type": "CodeableConcept", "code": vcode, "display": vdisplay}
    elif "valueBoolean" in resource:
        value = {"type": "boolean", "value": resource["valueBoolean"]}
    elif "valueInteger" in resource:
        value = {"type": "integer", "value": resource["valueInteger"]}

    # Effective date: effectiveDateTime | effectivePeriod.start | issued
    eff = (
        resource.get("effectiveDateTime")
        or (resource.get("effectivePeriod") or {}).get("start")
        or resource.get("issued")
    )
    try:
        service_date = date.fromisoformat(eff[:10]) if eff else date.today()
    except ValueError:
        service_date = date.today()

    if not code:
        logger.warning("FHIR Observation has no code; skipping (id=%s)", resource.get("id"))
        return

    claim = Claim(
        member_id=member.id,
        claim_type="professional",
        service_date=service_date,
        procedure_code=code if (system and "loinc" not in (system or "").lower()) else None,
        service_category="professional",
        data_tier="signal",
        is_estimated=False,
        signal_source="fhir_observation",
        extra={
            "fhir_observation_id": resource.get("id"),
            "code_system": system,
            "code": code,
            "display": display,
            "value": value,
            "status": resource.get("status"),
        },
    )
    db.add(claim)
    await db.flush()
    logger.info(
        "Stored FHIR Observation %s as signal claim for member %s (code=%s)",
        resource.get("id"), member.member_id, code,
    )


async def _ingest_procedure(db: AsyncSession, resource: dict) -> None:
    """Map FHIR Procedure to a professional Claim with the procedure code.

    A Procedure resource usually has a CPT/HCPCS code on the
    ``code.coding`` array. We store it as a signal-tier professional claim
    so downstream modules (utilization, avoidable-visit detection, HCC
    engine) pick it up without a model change.
    """
    member = await _resolve_member_from_subject(db, resource)
    if not member:
        logger.warning(
            "FHIR Procedure references unknown patient: %s (procedure id=%s)",
            (resource.get("subject") or {}).get("reference"),
            resource.get("id"),
        )
        return

    system, code, display = _first_coding(resource.get("code"))
    if not code:
        logger.warning("FHIR Procedure has no extractable code (id=%s)", resource.get("id"))
        return

    # Performed date can be performedDateTime or performedPeriod.start
    performed = (
        resource.get("performedDateTime")
        or (resource.get("performedPeriod") or {}).get("start")
    )
    try:
        service_date = date.fromisoformat(performed[:10]) if performed else date.today()
    except ValueError:
        service_date = date.today()

    # Optional linked diagnoses (Procedure.reasonCode coding). Clamp to
    # 10 chars because Claim.diagnosis_codes is ARRAY(String(10)).
    reason_codes: list[str] = []
    for rc in resource.get("reasonCode") or []:
        _, rcode, _ = _first_coding(rc)
        if rcode and len(rcode) <= 10:
            reason_codes.append(rcode)

    claim = Claim(
        member_id=member.id,
        claim_type="professional",
        service_date=service_date,
        procedure_code=code[:10] if code else None,
        diagnosis_codes=reason_codes or None,
        service_category="professional",
        data_tier="signal",
        is_estimated=False,
        signal_source="fhir_procedure",
        extra={
            "fhir_procedure_id": resource.get("id"),
            "code_system": system,
            "code": code,
            "display": display,
            "status": resource.get("status"),
        },
    )
    db.add(claim)
    await db.flush()
    logger.info(
        "Stored FHIR Procedure %s as signal claim for member %s (code=%s)",
        resource.get("id"), member.member_id, code,
    )
