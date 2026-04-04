"""
FHIR R4 Export Service — generates FHIR R4 resources from extracted clinical data
so coded diagnoses can be pushed back to the EMR (eCW or any FHIR-capable system).

Converts output from clinical_nlp_service.process_clinical_note into:
  - Condition resources (US Core Condition profile)
  - Observation resources (US Core Observation profile)
  - MedicationRequest resources (US Core MedicationRequest profile)
  - Transaction Bundle wrapping all resources

All resources include meta.source = "aqsoft-health-platform" for provenance.
"""

import logging
import uuid
from datetime import date, datetime
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

META_SOURCE = "aqsoft-health-platform"

CODING_SYSTEM_ICD10 = "http://hl7.org/fhir/sid/icd-10-cm"
CODING_SYSTEM_LOINC = "http://loinc.org"
CODING_SYSTEM_RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm"
CODING_SYSTEM_SNOMED = "http://snomed.info/sct"

US_CORE_CONDITION_PROFILE = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns"
US_CORE_OBSERVATION_PROFILE = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab"
US_CORE_MEDICATION_REQUEST_PROFILE = "http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest"

CONDITION_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/condition-category"
OBSERVATION_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category"
MEDICATION_REQUEST_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/medicationrequest-category"


def _new_id() -> str:
    """Generate a stable UUID for a resource."""
    return str(uuid.uuid4())


def _today_iso() -> str:
    return date.today().isoformat()


# ---------------------------------------------------------------------------
# Condition resource (US Core Condition)
# ---------------------------------------------------------------------------

def build_condition_resource(
    icd10_code: str,
    description: str,
    member_id: str,
    evidence_quote: str | None = None,
    note_date: str | None = None,
    encounter_id: str | None = None,
) -> dict[str, Any]:
    """Build a FHIR R4 Condition resource from an extracted ICD-10 diagnosis.

    Follows US Core Condition Problems and Health Concerns profile.

    Args:
        icd10_code: ICD-10-CM code (e.g. "E11.65").
        description: Human-readable description of the condition.
        member_id: FHIR Patient reference ID.
        evidence_quote: Exact quote from clinical note supporting this code.
        note_date: Date the condition was recorded (ISO format).
        encounter_id: Optional FHIR Encounter reference ID.

    Returns:
        FHIR R4 Condition resource as a dict.
    """
    resource_id = _new_id()
    recorded_date = note_date or _today_iso()

    condition: dict[str, Any] = {
        "resourceType": "Condition",
        "id": resource_id,
        "meta": {
            "profile": [US_CORE_CONDITION_PROFILE],
            "source": META_SOURCE,
        },
        "clinicalStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
                "code": "active",
                "display": "Active",
            }],
        },
        "verificationStatus": {
            "coding": [{
                "system": "http://terminology.hl7.org/CodeSystem/condition-ver-status",
                "code": "confirmed",
                "display": "Confirmed",
            }],
        },
        "category": [{
            "coding": [{
                "system": CONDITION_CATEGORY_SYSTEM,
                "code": "problem-list-item",
                "display": "Problem List Item",
            }],
        }],
        "code": {
            "coding": [{
                "system": CODING_SYSTEM_ICD10,
                "code": icd10_code,
                "display": description,
            }],
            "text": description,
        },
        "subject": {
            "reference": f"Patient/{member_id}",
        },
        "recordedDate": recorded_date,
    }

    # Encounter reference
    if encounter_id:
        condition["encounter"] = {"reference": f"Encounter/{encounter_id}"}

    # Evidence quote as note (FHIR Condition.note)
    if evidence_quote:
        condition["note"] = [{
            "text": f"Evidence from clinical note: {evidence_quote}",
        }]

    # Also store evidence in extension for structured access
    if evidence_quote:
        condition["extension"] = [{
            "url": "http://aqsoft.health/fhir/StructureDefinition/nlp-evidence",
            "valueString": evidence_quote,
        }]

    return condition


# ---------------------------------------------------------------------------
# Observation resource (US Core Lab Observation)
# ---------------------------------------------------------------------------

def build_observation_resource(
    loinc_code: str,
    value: float | str,
    units: str,
    member_id: str,
    observation_date: str | None = None,
    display_name: str | None = None,
    encounter_id: str | None = None,
) -> dict[str, Any]:
    """Build a FHIR R4 Observation resource from an extracted lab/vital.

    Follows US Core Laboratory Result Observation profile.

    Args:
        loinc_code: LOINC code (e.g. "4548-4" for HbA1c).
        value: Numeric or string value of the observation.
        units: Units of measurement (e.g. "mg/dL", "%").
        member_id: FHIR Patient reference ID.
        observation_date: Date of observation (ISO format).
        display_name: Human-readable name of the observation.
        encounter_id: Optional FHIR Encounter reference ID.

    Returns:
        FHIR R4 Observation resource as a dict.
    """
    resource_id = _new_id()
    effective_date = observation_date or _today_iso()

    observation: dict[str, Any] = {
        "resourceType": "Observation",
        "id": resource_id,
        "meta": {
            "profile": [US_CORE_OBSERVATION_PROFILE],
            "source": META_SOURCE,
        },
        "status": "final",
        "category": [{
            "coding": [{
                "system": OBSERVATION_CATEGORY_SYSTEM,
                "code": "laboratory",
                "display": "Laboratory",
            }],
        }],
        "code": {
            "coding": [{
                "system": CODING_SYSTEM_LOINC,
                "code": loinc_code,
                "display": display_name or loinc_code,
            }],
            "text": display_name or loinc_code,
        },
        "subject": {
            "reference": f"Patient/{member_id}",
        },
        "effectiveDateTime": effective_date,
    }

    # Value — numeric vs string
    if isinstance(value, (int, float)):
        observation["valueQuantity"] = {
            "value": value,
            "unit": units,
            "system": "http://unitsofmeasure.org",
            "code": units,
        }
    else:
        observation["valueString"] = str(value)

    if encounter_id:
        observation["encounter"] = {"reference": f"Encounter/{encounter_id}"}

    return observation


# ---------------------------------------------------------------------------
# MedicationRequest resource (US Core MedicationRequest)
# ---------------------------------------------------------------------------

def build_medication_resource(
    medication_name: str,
    dosage: str | None,
    member_id: str,
    frequency: str | None = None,
    route: str | None = None,
    status: str = "active",
    encounter_id: str | None = None,
) -> dict[str, Any]:
    """Build a FHIR R4 MedicationRequest resource from an extracted medication.

    Follows US Core MedicationRequest profile.

    Args:
        medication_name: Name of the medication.
        dosage: Dosage string (e.g. "10 mg").
        member_id: FHIR Patient reference ID.
        frequency: Dosing frequency (e.g. "daily", "BID").
        route: Administration route (e.g. "oral", "IV").
        status: Medication status (active, stopped, completed).
        encounter_id: Optional FHIR Encounter reference ID.

    Returns:
        FHIR R4 MedicationRequest resource as a dict.
    """
    resource_id = _new_id()

    # Map NLP status to FHIR MedicationRequest status
    fhir_status_map = {
        "active": "active",
        "new": "active",
        "changed": "active",
        "discontinued": "stopped",
        "stopped": "stopped",
        "completed": "completed",
        "unknown": "active",
    }
    fhir_status = fhir_status_map.get(status, "active")

    med_request: dict[str, Any] = {
        "resourceType": "MedicationRequest",
        "id": resource_id,
        "meta": {
            "profile": [US_CORE_MEDICATION_REQUEST_PROFILE],
            "source": META_SOURCE,
        },
        "status": fhir_status,
        "intent": "order",
        "category": [{
            "coding": [{
                "system": MEDICATION_REQUEST_CATEGORY_SYSTEM,
                "code": "community",
                "display": "Community",
            }],
        }],
        "medicationCodeableConcept": {
            "text": medication_name,
        },
        "subject": {
            "reference": f"Patient/{member_id}",
        },
        "authoredOn": _today_iso(),
    }

    if encounter_id:
        med_request["encounter"] = {"reference": f"Encounter/{encounter_id}"}

    # Dosage instruction
    if dosage or frequency or route:
        dosage_instruction: dict[str, Any] = {}
        text_parts = []
        if dosage:
            text_parts.append(dosage)
        if frequency:
            text_parts.append(frequency)
        if route:
            text_parts.append(route)
        dosage_instruction["text"] = " ".join(text_parts)

        if route:
            dosage_instruction["route"] = {"text": route}

        med_request["dosageInstruction"] = [dosage_instruction]

    return med_request


# ---------------------------------------------------------------------------
# Transaction Bundle
# ---------------------------------------------------------------------------

def build_transaction_bundle(resources: list[dict[str, Any]]) -> dict[str, Any]:
    """Wrap a list of FHIR resources into a FHIR R4 transaction Bundle.

    Each resource becomes a Bundle.entry with request.method = POST.

    Args:
        resources: List of FHIR resource dicts (Condition, Observation, etc.).

    Returns:
        FHIR R4 Bundle of type "transaction".
    """
    entries = []
    for resource in resources:
        resource_type = resource.get("resourceType", "Resource")
        entry: dict[str, Any] = {
            "fullUrl": f"urn:uuid:{resource.get('id', _new_id())}",
            "resource": resource,
            "request": {
                "method": "POST",
                "url": resource_type,
            },
        }
        entries.append(entry)

    return {
        "resourceType": "Bundle",
        "id": _new_id(),
        "meta": {
            "source": META_SOURCE,
        },
        "type": "transaction",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "entry": entries,
    }


# ---------------------------------------------------------------------------
# High-level: NLP result -> FHIR Bundle
# ---------------------------------------------------------------------------

def export_nlp_results_as_fhir(
    nlp_result: dict[str, Any],
    member_fhir_id: str,
) -> dict[str, Any]:
    """Convert the output of clinical_nlp_service.process_clinical_note into
    a complete FHIR R4 transaction Bundle.

    Builds Condition resources from extracted codes, Observation resources
    from key_findings with LOINC codes, and MedicationRequest resources
    from extracted medications.

    Args:
        nlp_result: Output dict from process_clinical_note containing
            'codes', 'extraction', and 'source' keys.
        member_fhir_id: FHIR Patient ID to use as the subject reference.

    Returns:
        FHIR R4 Bundle (type: transaction) containing all generated resources.
    """
    resources: list[dict[str, Any]] = []

    # Source metadata for dating
    source = nlp_result.get("source", {})
    note_date = source.get("document_date")

    # --- Conditions from extracted codes ---
    for code_entry in nlp_result.get("codes", []):
        icd10 = code_entry.get("icd10")
        if not icd10:
            continue

        condition = build_condition_resource(
            icd10_code=icd10,
            description=code_entry.get("description", ""),
            member_id=member_fhir_id,
            evidence_quote=code_entry.get("evidence_quote"),
            note_date=note_date,
        )

        # Enrich with HCC/RAF data as extension if available
        hcc_code = code_entry.get("hcc_code")
        raf_weight = code_entry.get("raf_weight", 0)
        if hcc_code:
            extensions = condition.get("extension", [])
            extensions.append({
                "url": "http://aqsoft.health/fhir/StructureDefinition/hcc-mapping",
                "extension": [
                    {
                        "url": "hccCode",
                        "valueInteger": int(hcc_code),
                    },
                    {
                        "url": "rafWeight",
                        "valueDecimal": float(raf_weight),
                    },
                ],
            })
            condition["extension"] = extensions

        resources.append(condition)

    # --- Observations from key_findings ---
    extraction = nlp_result.get("extraction", {})
    for finding in extraction.get("key_findings", []):
        loinc_code = finding.get("loinc_code")
        value = finding.get("value")
        if not loinc_code or value is None:
            continue

        observation = build_observation_resource(
            loinc_code=loinc_code,
            value=value,
            units=finding.get("units", ""),
            member_id=member_fhir_id,
            observation_date=finding.get("date") or note_date,
            display_name=finding.get("loinc_name") or finding.get("finding"),
        )
        resources.append(observation)

    # --- MedicationRequests from medications ---
    for med in extraction.get("medications", []):
        med_name = med.get("name")
        if not med_name:
            continue

        med_request = build_medication_resource(
            medication_name=med_name,
            dosage=med.get("dose"),
            member_id=member_fhir_id,
            frequency=med.get("frequency"),
            route=med.get("route"),
            status=med.get("status", "active"),
        )
        resources.append(med_request)

    bundle = build_transaction_bundle(resources)

    logger.info(
        "FHIR export: %d resources in bundle for Patient/%s "
        "(%d conditions, %d observations, %d medications)",
        len(resources),
        member_fhir_id,
        sum(1 for r in resources if r["resourceType"] == "Condition"),
        sum(1 for r in resources if r["resourceType"] == "Observation"),
        sum(1 for r in resources if r["resourceType"] == "MedicationRequest"),
    )

    return bundle
