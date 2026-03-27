"""
Universal Data Interface Layer

Accepts healthcare data in any standard format and normalizes it
into the platform's canonical data model. Acts as a lightweight
integration engine (like a mini-Rhapsody).

Supported formats:
- REST/JSON (custom API)
- FHIR R4 (already built, referenced here)
- HL7v2 (ADT, ORU, SIU messages)
- X12/EDI (837, 835, 834, 270/271)
- CDA/CCDA (XML clinical documents)
- CSV/Excel (already built via ingestion service)
- SFTP (scheduled file pickup)
- Webhook (event-driven push)
"""

import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HL7v2 parser
# ---------------------------------------------------------------------------

def parse_hl7v2_message(raw: str) -> dict:
    """
    Parse an HL7v2 pipe-delimited message into structured data.
    Handles MSH, PID, PV1, DG1, OBR, OBX, IN1 segments.
    Returns normalised dict with: message_type, patient, encounter,
    diagnoses, observations, insurance.
    """
    segments: dict[str, list[list[str]]] = {}
    lines = raw.strip().replace("\r\n", "\r").replace("\n", "\r").split("\r")

    for line in lines:
        if not line.strip():
            continue
        fields = line.split("|")
        seg_type = fields[0]
        if seg_type not in segments:
            segments[seg_type] = []
        segments[seg_type].append(fields)

    result: dict[str, Any] = {
        "message_type": None,
        "message_control_id": None,
        "sending_facility": None,
        "patient": {},
        "encounter": {},
        "diagnoses": [],
        "observations": [],
        "insurance": [],
    }

    # MSH — Message Header
    # NOTE: HL7v2 MSH is special — MSH-1 is the field separator "|" itself,
    # so when splitting on "|" the indices are offset by 1 from the HL7 spec.
    # E.g. MSH-9 (message type) is at Python index 8 after split("|").
    msh = segments.get("MSH", [[]])[0]
    if len(msh) > 8:
        result["message_type"] = _safe_get(msh, 8)  # e.g. "ADT^A01"
    if len(msh) > 9:
        result["message_control_id"] = _safe_get(msh, 9)
    if len(msh) > 3:
        result["sending_facility"] = _safe_get(msh, 3)

    # PID — Patient Identification
    pid = segments.get("PID", [[]])[0]
    if pid:
        name_parts = _safe_get(pid, 5).split("^") if len(pid) > 5 else []
        result["patient"] = {
            "patient_id": _safe_get(pid, 3),
            "last_name": name_parts[0] if len(name_parts) > 0 else None,
            "first_name": name_parts[1] if len(name_parts) > 1 else None,
            "dob": _safe_get(pid, 7),
            "sex": _safe_get(pid, 8),
            "address": _safe_get(pid, 11),
            "phone": _safe_get(pid, 13),
            "ssn": _safe_get(pid, 19),
            "mrn": _safe_get(pid, 3),
        }

    # PV1 — Patient Visit
    pv1 = segments.get("PV1", [[]])[0]
    if pv1:
        result["encounter"] = {
            "patient_class": _safe_get(pv1, 2),  # I=inpatient, O=outpatient, E=emergency
            "attending_provider": _safe_get(pv1, 7),
            "referring_provider": _safe_get(pv1, 8),
            "hospital_service": _safe_get(pv1, 10),
            "admit_date": _safe_get(pv1, 44),
            "discharge_date": _safe_get(pv1, 45),
            "admit_source": _safe_get(pv1, 14),
            "discharge_disposition": _safe_get(pv1, 36),
            "facility": _safe_get(pv1, 3),
        }

    # DG1 — Diagnosis
    for dg1 in segments.get("DG1", []):
        result["diagnoses"].append({
            "sequence": _safe_get(dg1, 1),
            "code": _safe_get(dg1, 3),
            "description": _safe_get(dg1, 4),
            "type": _safe_get(dg1, 6),  # A=admitting, W=working, F=final
        })

    # OBR — Observation Request
    obr_list = segments.get("OBR", [])

    # OBX — Observation Result
    for obx in segments.get("OBX", []):
        result["observations"].append({
            "set_id": _safe_get(obx, 1),
            "value_type": _safe_get(obx, 2),
            "identifier": _safe_get(obx, 3),
            "value": _safe_get(obx, 5),
            "units": _safe_get(obx, 6),
            "reference_range": _safe_get(obx, 7),
            "abnormal_flag": _safe_get(obx, 8),
            "status": _safe_get(obx, 11),
        })

    # IN1 — Insurance
    for in1 in segments.get("IN1", []):
        result["insurance"].append({
            "sequence": _safe_get(in1, 1),
            "plan_id": _safe_get(in1, 2),
            "company_name": _safe_get(in1, 4),
            "group_number": _safe_get(in1, 8),
            "group_name": _safe_get(in1, 9),
            "member_id": _safe_get(in1, 36) or _safe_get(in1, 2),
            "effective_date": _safe_get(in1, 12),
            "expiration_date": _safe_get(in1, 13),
        })

    return result


def _safe_get(fields: list, idx: int) -> str | None:
    """Safely get a field from an HL7 segment."""
    if idx < len(fields):
        val = fields[idx].strip()
        return val if val else None
    return None


# ---------------------------------------------------------------------------
# X12/EDI parsers
# ---------------------------------------------------------------------------

def _split_x12_segments(raw: str) -> list[str]:
    """Split an X12 file into segments, handling both ~ and newline delimiters."""
    # Detect segment terminator
    if "~" in raw:
        segments = [s.strip() for s in raw.split("~") if s.strip()]
    else:
        segments = [s.strip() for s in raw.split("\n") if s.strip()]
    return segments


def parse_x12_837(raw: str) -> list[dict]:
    """
    Parse X12 837 Professional/Institutional claim file.
    Extract: claim ID, member info, diagnosis codes, procedure codes,
    provider, facility, amounts.
    Returns list of normalised claim dicts.
    """
    segments = _split_x12_segments(raw)
    claims: list[dict] = []
    current_claim: dict[str, Any] = {}
    current_member: dict[str, Any] = {}
    current_provider: dict[str, Any] = {}
    current_diagnoses: list[str] = []
    current_procedures: list[dict] = []

    for seg in segments:
        elements = seg.split("*")
        seg_id = elements[0] if elements else ""

        if seg_id == "CLM":
            # Save previous claim if exists
            if current_claim.get("claim_id"):
                current_claim["member"] = {**current_member}
                current_claim["provider"] = {**current_provider}
                current_claim["diagnoses"] = list(current_diagnoses)
                current_claim["procedures"] = list(current_procedures)
                claims.append(current_claim)

            current_claim = {
                "claim_id": _x12_safe(elements, 1),
                "total_charge": _x12_float(elements, 2),
                "facility_code": _x12_safe(elements, 5),
                "frequency_code": _x12_safe(elements, 6),
            }
            current_diagnoses = []
            current_procedures = []

        elif seg_id == "NM1":
            entity_code = _x12_safe(elements, 1)
            name_info = {
                "last_name": _x12_safe(elements, 3),
                "first_name": _x12_safe(elements, 4),
                "id_qualifier": _x12_safe(elements, 8),
                "id": _x12_safe(elements, 9),
            }
            if entity_code == "IL":  # Insured/subscriber
                current_member = name_info
            elif entity_code in ("82", "85"):  # Rendering/billing provider
                current_provider = name_info

        elif seg_id == "HI":
            # Health Information — diagnosis codes
            for i in range(1, len(elements)):
                code_parts = elements[i].split(":")
                if len(code_parts) >= 2:
                    current_diagnoses.append(code_parts[1])

        elif seg_id == "SV1":
            # Professional service line
            proc_parts = (elements[1] if len(elements) > 1 else "").split(":")
            current_procedures.append({
                "code": proc_parts[1] if len(proc_parts) > 1 else proc_parts[0] if proc_parts else None,
                "charge": _x12_float(elements, 2),
                "units": _x12_safe(elements, 4),
            })

        elif seg_id == "DTP":
            qualifier = _x12_safe(elements, 1)
            if qualifier == "472":  # Service date
                current_claim["service_date"] = _x12_safe(elements, 3)

    # Save last claim
    if current_claim.get("claim_id"):
        current_claim["member"] = {**current_member}
        current_claim["provider"] = {**current_provider}
        current_claim["diagnoses"] = list(current_diagnoses)
        current_claim["procedures"] = list(current_procedures)
        claims.append(current_claim)

    return claims


def parse_x12_835(raw: str) -> list[dict]:
    """
    Parse X12 835 remittance advice.
    Extract: claim ID, paid amount, adjustments, denial codes.
    Returns list of payment records.
    """
    segments = _split_x12_segments(raw)
    payments: list[dict] = []
    current_payment: dict[str, Any] = {}
    current_adjustments: list[dict] = []

    for seg in segments:
        elements = seg.split("*")
        seg_id = elements[0] if elements else ""

        if seg_id == "CLP":
            # Save previous payment
            if current_payment.get("claim_id"):
                current_payment["adjustments"] = list(current_adjustments)
                payments.append(current_payment)

            current_payment = {
                "claim_id": _x12_safe(elements, 1),
                "status_code": _x12_safe(elements, 2),
                "charge_amount": _x12_float(elements, 3),
                "paid_amount": _x12_float(elements, 4),
                "patient_responsibility": _x12_float(elements, 5),
                "payer_claim_control": _x12_safe(elements, 7),
            }
            current_adjustments = []

        elif seg_id == "CAS":
            # Claim Adjustment Segment
            group_code = _x12_safe(elements, 1)  # CO, PR, OA, PI, CR
            i = 2
            while i + 1 < len(elements):
                reason = _x12_safe(elements, i)
                amount = _x12_float(elements, i + 1)
                if reason:
                    current_adjustments.append({
                        "group_code": group_code,
                        "reason_code": reason,
                        "amount": amount,
                    })
                i += 3  # reason, amount, quantity triplets

        elif seg_id == "SVC":
            # Service Payment Information
            proc_parts = (elements[1] if len(elements) > 1 else "").split(":")
            current_payment.setdefault("service_lines", []).append({
                "procedure_code": proc_parts[1] if len(proc_parts) > 1 else proc_parts[0] if proc_parts else None,
                "charge_amount": _x12_float(elements, 2),
                "paid_amount": _x12_float(elements, 3),
            })

    # Save last payment
    if current_payment.get("claim_id"):
        current_payment["adjustments"] = list(current_adjustments)
        payments.append(current_payment)

    return payments


def parse_x12_834(raw: str) -> list[dict]:
    """
    Parse X12 834 enrollment/benefit file.
    Extract: member ID, demographics, coverage dates, PCP, plan.
    Returns list of enrollment records.
    """
    segments = _split_x12_segments(raw)
    enrollments: list[dict] = []
    current_member: dict[str, Any] = {}

    for seg in segments:
        elements = seg.split("*")
        seg_id = elements[0] if elements else ""

        if seg_id == "INS":
            # Save previous member
            if current_member.get("member_id") or current_member.get("last_name"):
                enrollments.append(current_member)

            current_member = {
                "subscriber_indicator": _x12_safe(elements, 1),
                "relationship_code": _x12_safe(elements, 2),
                "maintenance_type": _x12_safe(elements, 3),
                "benefit_status": _x12_safe(elements, 5),
            }

        elif seg_id == "NM1":
            entity = _x12_safe(elements, 1)
            if entity == "IL":  # Member
                current_member["last_name"] = _x12_safe(elements, 3)
                current_member["first_name"] = _x12_safe(elements, 4)
                current_member["middle_name"] = _x12_safe(elements, 5)
                current_member["id_qualifier"] = _x12_safe(elements, 8)
                current_member["member_id"] = _x12_safe(elements, 9)
            elif entity == "P3":  # PCP
                current_member["pcp_last_name"] = _x12_safe(elements, 3)
                current_member["pcp_first_name"] = _x12_safe(elements, 4)
                current_member["pcp_npi"] = _x12_safe(elements, 9)

        elif seg_id == "DMG":
            current_member["dob"] = _x12_safe(elements, 2)
            current_member["gender"] = _x12_safe(elements, 3)

        elif seg_id == "DTP":
            qualifier = _x12_safe(elements, 1)
            date_val = _x12_safe(elements, 3)
            if qualifier == "348":
                current_member["coverage_start"] = date_val
            elif qualifier == "349":
                current_member["coverage_end"] = date_val

        elif seg_id == "HD":
            current_member["maintenance_type_code"] = _x12_safe(elements, 1)
            current_member["insurance_line_code"] = _x12_safe(elements, 3)
            current_member["plan_coverage"] = _x12_safe(elements, 4)

        elif seg_id == "N3":
            current_member["address_line1"] = _x12_safe(elements, 1)

        elif seg_id == "N4":
            current_member["city"] = _x12_safe(elements, 1)
            current_member["state"] = _x12_safe(elements, 2)
            current_member["zip"] = _x12_safe(elements, 3)

    # Save last member
    if current_member.get("member_id") or current_member.get("last_name"):
        enrollments.append(current_member)

    return enrollments


def _x12_safe(elements: list, idx: int) -> str | None:
    if idx < len(elements):
        val = elements[idx].strip()
        return val if val else None
    return None


def _x12_float(elements: list, idx: int) -> float | None:
    val = _x12_safe(elements, idx)
    if val:
        try:
            return float(val)
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# CDA/CCDA parser
# ---------------------------------------------------------------------------

# Common CDA XML namespaces
CDA_NS = {"hl7": "urn:hl7-org:v3", "sdtc": "urn:hl7-org:sdtc"}


def parse_cda_document(xml_str: str) -> dict:
    """
    Parse CDA/CCDA XML document.
    Extract: patient demographics, problems (diagnoses), medications,
    allergies, procedures, vital signs, lab results.
    Returns normalised dict.
    """
    result: dict[str, Any] = {
        "patient": {},
        "problems": [],
        "medications": [],
        "allergies": [],
        "procedures": [],
        "vital_signs": [],
        "lab_results": [],
    }

    try:
        # Security note: Python 3.8+ xml.etree.ElementTree does not resolve
        # external entities by default, so this is safe for untrusted input.
        # For defence-in-depth in production, consider using the `defusedxml`
        # package (defusedxml.ElementTree.fromstring) which also blocks
        # entity expansion, DTD retrieval, and billion-laughs attacks.
        root = ET.fromstring(xml_str)
    except ET.ParseError as e:
        logger.error("Failed to parse CDA XML: %s", e)
        return result

    # Patient demographics from recordTarget
    record_target = root.find(".//hl7:recordTarget/hl7:patientRole", CDA_NS)
    if record_target is not None:
        patient: dict[str, Any] = {}

        # IDs
        for id_elem in record_target.findall("hl7:id", CDA_NS):
            ext = id_elem.get("extension")
            root_oid = id_elem.get("root")
            if ext:
                patient.setdefault("ids", []).append({"root": root_oid, "extension": ext})
                if not patient.get("member_id"):
                    patient["member_id"] = ext

        # Name
        name_el = record_target.find(".//hl7:patient/hl7:name", CDA_NS)
        if name_el is not None:
            given = name_el.findtext("hl7:given", default="", namespaces=CDA_NS)
            family = name_el.findtext("hl7:family", default="", namespaces=CDA_NS)
            patient["first_name"] = given
            patient["last_name"] = family

        # Gender
        gender_el = record_target.find(".//hl7:patient/hl7:administrativeGenderCode", CDA_NS)
        if gender_el is not None:
            patient["gender"] = gender_el.get("code")

        # DOB
        dob_el = record_target.find(".//hl7:patient/hl7:birthTime", CDA_NS)
        if dob_el is not None:
            patient["dob"] = dob_el.get("value")

        # Address
        addr_el = record_target.find("hl7:addr", CDA_NS)
        if addr_el is not None:
            patient["address"] = {
                "street": addr_el.findtext("hl7:streetAddressLine", default="", namespaces=CDA_NS),
                "city": addr_el.findtext("hl7:city", default="", namespaces=CDA_NS),
                "state": addr_el.findtext("hl7:state", default="", namespaces=CDA_NS),
                "zip": addr_el.findtext("hl7:postalCode", default="", namespaces=CDA_NS),
            }

        result["patient"] = patient

    # Parse structured body sections
    for section in root.findall(".//hl7:component/hl7:structuredBody/hl7:component/hl7:section", CDA_NS):
        code_el = section.find("hl7:code", CDA_NS)
        if code_el is None:
            continue
        loinc = code_el.get("code", "")

        # Problems (11450-4)
        if loinc == "11450-4":
            for entry in section.findall(".//hl7:entry", CDA_NS):
                obs = entry.find(".//hl7:observation/hl7:value", CDA_NS)
                if obs is not None:
                    result["problems"].append({
                        "code": obs.get("code"),
                        "code_system": obs.get("codeSystem"),
                        "display": obs.get("displayName"),
                    })

        # Medications (10160-0)
        elif loinc == "10160-0":
            for entry in section.findall(".//hl7:entry", CDA_NS):
                med = entry.find(".//hl7:manufacturedMaterial/hl7:code", CDA_NS)
                if med is not None:
                    result["medications"].append({
                        "code": med.get("code"),
                        "code_system": med.get("codeSystem"),
                        "display": med.get("displayName"),
                    })

        # Allergies (48765-2)
        elif loinc == "48765-2":
            for entry in section.findall(".//hl7:entry", CDA_NS):
                allergen = entry.find(".//hl7:participant/hl7:participantRole/hl7:playingEntity/hl7:code", CDA_NS)
                if allergen is not None:
                    result["allergies"].append({
                        "code": allergen.get("code"),
                        "display": allergen.get("displayName"),
                    })

        # Procedures (47519-4)
        elif loinc == "47519-4":
            for entry in section.findall(".//hl7:entry", CDA_NS):
                proc_code = entry.find(".//hl7:procedure/hl7:code", CDA_NS)
                if proc_code is not None:
                    result["procedures"].append({
                        "code": proc_code.get("code"),
                        "code_system": proc_code.get("codeSystem"),
                        "display": proc_code.get("displayName"),
                    })

        # Vital Signs (8716-3)
        elif loinc == "8716-3":
            for entry in section.findall(".//hl7:entry", CDA_NS):
                for obs in entry.findall(".//hl7:observation", CDA_NS):
                    code_elem = obs.find("hl7:code", CDA_NS)
                    value_elem = obs.find("hl7:value", CDA_NS)
                    if code_elem is not None and value_elem is not None:
                        result["vital_signs"].append({
                            "code": code_elem.get("code"),
                            "display": code_elem.get("displayName"),
                            "value": value_elem.get("value"),
                            "unit": value_elem.get("unit"),
                        })

        # Lab Results (30954-2)
        elif loinc == "30954-2":
            for entry in section.findall(".//hl7:entry", CDA_NS):
                for obs in entry.findall(".//hl7:observation", CDA_NS):
                    code_elem = obs.find("hl7:code", CDA_NS)
                    value_elem = obs.find("hl7:value", CDA_NS)
                    if code_elem is not None and value_elem is not None:
                        result["lab_results"].append({
                            "code": code_elem.get("code"),
                            "display": code_elem.get("displayName"),
                            "value": value_elem.get("value"),
                            "unit": value_elem.get("unit"),
                        })

    return result


# ---------------------------------------------------------------------------
# Universal normaliser
# ---------------------------------------------------------------------------

def normalize_to_platform(data: dict, source_format: str) -> dict:
    """
    Take parsed data from any format and map it to platform models.
    Returns a dict with keys: members, claims, encounters, observations.
    Each value is a list of dicts ready for database insertion.
    """
    result: dict[str, list[dict]] = {
        "members": [],
        "claims": [],
        "encounters": [],
        "observations": [],
    }

    if source_format == "hl7v2":
        patient = data.get("patient", {})
        if patient:
            result["members"].append({
                "external_id": patient.get("patient_id") or patient.get("mrn"),
                "first_name": patient.get("first_name"),
                "last_name": patient.get("last_name"),
                "dob": patient.get("dob"),
                "sex": patient.get("sex"),
            })

        encounter = data.get("encounter", {})
        if encounter:
            result["encounters"].append({
                "patient_class": encounter.get("patient_class"),
                "admit_date": encounter.get("admit_date"),
                "discharge_date": encounter.get("discharge_date"),
                "facility": encounter.get("facility"),
                "attending_provider": encounter.get("attending_provider"),
                "diagnoses": [d.get("code") for d in data.get("diagnoses", [])],
            })

        for obs in data.get("observations", []):
            result["observations"].append({
                "code": obs.get("identifier"),
                "value": obs.get("value"),
                "units": obs.get("units"),
                "status": obs.get("status"),
            })

    elif source_format in ("x12_837",):
        for claim in (data if isinstance(data, list) else [data]):
            result["claims"].append({
                "claim_id": claim.get("claim_id"),
                "total_charge": claim.get("total_charge"),
                "service_date": claim.get("service_date"),
                "diagnoses": claim.get("diagnoses", []),
                "procedures": claim.get("procedures", []),
                "member_id": claim.get("member", {}).get("id"),
                "member_name": f"{claim.get('member', {}).get('last_name', '')}, {claim.get('member', {}).get('first_name', '')}",
                "provider_id": claim.get("provider", {}).get("id"),
            })

    elif source_format in ("x12_834",):
        for enrollment in (data if isinstance(data, list) else [data]):
            result["members"].append({
                "external_id": enrollment.get("member_id"),
                "first_name": enrollment.get("first_name"),
                "last_name": enrollment.get("last_name"),
                "dob": enrollment.get("dob"),
                "gender": enrollment.get("gender"),
                "coverage_start": enrollment.get("coverage_start"),
                "coverage_end": enrollment.get("coverage_end"),
                "pcp_npi": enrollment.get("pcp_npi"),
            })

    elif source_format == "cda":
        patient = data.get("patient", {})
        if patient:
            result["members"].append({
                "external_id": patient.get("member_id"),
                "first_name": patient.get("first_name"),
                "last_name": patient.get("last_name"),
                "dob": patient.get("dob"),
                "gender": patient.get("gender"),
            })

        for problem in data.get("problems", []):
            result["observations"].append({
                "type": "diagnosis",
                "code": problem.get("code"),
                "display": problem.get("display"),
            })

        for lab in data.get("lab_results", []):
            result["observations"].append({
                "type": "lab",
                "code": lab.get("code"),
                "display": lab.get("display"),
                "value": lab.get("value"),
                "unit": lab.get("unit"),
            })

    return result


# ---------------------------------------------------------------------------
# Auto-detect X12 transaction type
# ---------------------------------------------------------------------------

def detect_x12_type(raw: str) -> str | None:
    """Auto-detect X12 transaction type from ST segment."""
    segments = _split_x12_segments(raw)
    for seg in segments:
        elements = seg.split("*")
        if elements[0] == "ST":
            code = _x12_safe(elements, 1)
            if code == "837":
                return "837"
            elif code == "835":
                return "835"
            elif code == "834":
                return "834"
            elif code == "270":
                return "270"
            elif code == "271":
                return "271"
    return None


# ---------------------------------------------------------------------------
# Interface status
# ---------------------------------------------------------------------------

async def get_interface_status(db: AsyncSession) -> dict:
    """
    Return status of all configured interfaces.
    Includes last_received, error_count, records_processed.
    """
    from app.models.data_interface import DataInterface

    stmt = select(DataInterface).order_by(DataInterface.id)
    result = await db.execute(stmt)
    interfaces = result.scalars().all()

    return {
        "total": len(interfaces),
        "active": sum(1 for i in interfaces if i.is_active),
        "error": sum(1 for i in interfaces if i.error_count > 0),
        "interfaces": [
            {
                "id": i.id,
                "name": i.name,
                "interface_type": i.interface_type,
                "direction": i.direction,
                "is_active": i.is_active,
                "schedule": i.schedule,
                "last_received": i.last_received.isoformat() if i.last_received else None,
                "last_error": i.last_error,
                "records_processed": i.records_processed,
                "error_count": i.error_count,
            }
            for i in interfaces
        ],
    }


# ---------------------------------------------------------------------------
# CRUD operations for interfaces
# ---------------------------------------------------------------------------

async def list_interfaces(db: AsyncSession) -> list[dict]:
    from app.models.data_interface import DataInterface
    stmt = select(DataInterface).order_by(DataInterface.id)
    result = await db.execute(stmt)
    return [
        {
            "id": i.id,
            "name": i.name,
            "interface_type": i.interface_type,
            "direction": i.direction,
            "config": i.config,
            "is_active": i.is_active,
            "schedule": i.schedule,
            "last_received": i.last_received.isoformat() if i.last_received else None,
            "last_error": i.last_error,
            "records_processed": i.records_processed,
            "error_count": i.error_count,
        }
        for i in result.scalars().all()
    ]


async def create_interface(db: AsyncSession, data: dict) -> dict:
    from app.models.data_interface import DataInterface
    iface = DataInterface(**data)
    db.add(iface)
    await db.commit()
    await db.refresh(iface)
    return {"id": iface.id, "name": iface.name, "status": "created"}


async def update_interface(db: AsyncSession, interface_id: int, data: dict) -> dict:
    from app.models.data_interface import DataInterface
    stmt = select(DataInterface).where(DataInterface.id == interface_id)
    result = await db.execute(stmt)
    iface = result.scalar_one_or_none()
    if not iface:
        return {"error": "Interface not found"}
    for key, val in data.items():
        if hasattr(iface, key):
            setattr(iface, key, val)
    await db.commit()
    return {"id": iface.id, "status": "updated"}


async def delete_interface(db: AsyncSession, interface_id: int) -> dict:
    from app.models.data_interface import DataInterface
    stmt = select(DataInterface).where(DataInterface.id == interface_id)
    result = await db.execute(stmt)
    iface = result.scalar_one_or_none()
    if not iface:
        return {"error": "Interface not found"}
    await db.delete(iface)
    await db.commit()
    return {"id": interface_id, "status": "deleted"}


async def test_interface_connection(db: AsyncSession, interface_id: int) -> dict:
    """Test connectivity of a configured interface."""
    from app.models.data_interface import DataInterface
    stmt = select(DataInterface).where(DataInterface.id == interface_id)
    result = await db.execute(stmt)
    iface = result.scalar_one_or_none()
    if not iface:
        return {"success": False, "error": "Interface not found"}

    # Connection testing not yet implemented — return explicit null success
    return {
        "success": None,
        "interface_id": iface.id,
        "interface_type": iface.interface_type,
        "message": "Connection testing not yet implemented",
    }


async def get_interface_logs(db: AsyncSession, interface_id: int, limit: int = 20) -> list[dict]:
    """Get recent activity logs for an interface."""
    from app.models.data_interface import InterfaceLog
    stmt = (
        select(InterfaceLog)
        .where(InterfaceLog.interface_id == interface_id)
        .order_by(InterfaceLog.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [
        {
            "id": log.id,
            "event_type": log.event_type,
            "message": log.message,
            "records_count": log.records_count,
            "details": log.details,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in result.scalars().all()
    ]
