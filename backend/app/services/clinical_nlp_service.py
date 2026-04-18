"""
Clinical NLP Service — extracts structured data from clinical notes using
Claude with tool_use for real-time ICD-10/HCC validation.

Ported from SNF Admit Assist's battle-tested 2-pass extraction pipeline:
  Pass 1: Extract structured facts from clinical note (diagnoses, meds, labs, findings)
  Pass 2: Code assignment with real-time validation via Claude tool_use

Each extracted item includes:
- Evidence quote from the source note
- Source document metadata (type, date, provider, facility)
- ICD-10 code validated against reference data
- HCC mapping with RAF impact
- Confidence score (0-100)
- Code specificity ladder showing upgrade options

Architecture:
  eCW DocumentReference -> note text
  -> Claude Pass 1 (extraction with structured output)
  -> Claude Pass 2 (coding with tool_use: lookup_hcc, build_ladder, check_med_gap)
  -> Validated conditions + evidence trail
  -> clinical_gap_detector -> compare against claims
  -> Population chase lists
"""

import json
import logging
from datetime import date
from typing import Any

from app.config import settings
from app.services.hcc_engine import lookup_hcc_for_icd10, build_code_ladder
from app.services.llm_guard import guarded_llm_call
from app.services.phi_scrubber import scrub as phi_scrub

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Full ICD-10 reference data (70,000+ codes, not just HCC-mapped)
# ---------------------------------------------------------------------------

_ICD10_FULL_LOOKUP: dict[str, dict] | None = None
_CLINICAL_RULES: dict | None = None


def _load_full_icd10() -> dict[str, dict]:
    """Load the complete ICD-10 reference (from SNF Admit Assist)."""
    global _ICD10_FULL_LOOKUP
    if _ICD10_FULL_LOOKUP is not None:
        return _ICD10_FULL_LOOKUP

    import os
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "merged_all_codes_2025midyear.json"
    )
    if not os.path.exists(path):
        logger.warning("Full ICD-10 reference not found at %s", path)
        _ICD10_FULL_LOOKUP = {}
        return _ICD10_FULL_LOOKUP

    with open(path) as f:
        data = json.load(f)
    _ICD10_FULL_LOOKUP = {entry["icd10"]: entry for entry in data}
    logger.info("Loaded %d full ICD-10 codes from %s", len(_ICD10_FULL_LOOKUP), path)
    return _ICD10_FULL_LOOKUP


def _load_clinical_rules() -> dict:
    """Load YAML-driven clinical validation rules (119 code families)."""
    global _CLINICAL_RULES
    if _CLINICAL_RULES is not None:
        return _CLINICAL_RULES

    import os
    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "clinical_rules_index.json"
    )
    if not os.path.exists(path):
        _CLINICAL_RULES = {}
        return _CLINICAL_RULES

    with open(path) as f:
        _CLINICAL_RULES = json.load(f)
    logger.info("Loaded clinical rules: %d code families", len(_CLINICAL_RULES.get("families", {})))
    return _CLINICAL_RULES


def lookup_icd10_full(code: str) -> dict | None:
    """Look up ANY ICD-10 code (not just HCC-mapped) in the full reference.

    Returns: {icd10, description, is_billable, chapter, ...} or None.
    Also checks HCC mapping and returns combined info.
    """
    lookup = _load_full_icd10()
    # Try exact match
    entry = lookup.get(code)
    if not entry:
        # Try without dot
        stripped = code.replace(".", "")
        for k, v in lookup.items():
            if k.replace(".", "") == stripped:
                entry = v
                code = k
                break
    if not entry:
        return None

    # Enrich with HCC data
    hcc_entry = lookup_hcc_for_icd10(code)
    result = {**entry}
    if hcc_entry:
        result["hcc"] = hcc_entry.get("hcc")
        result["raf"] = hcc_entry.get("raf", 0)
        result["hcc_description"] = hcc_entry.get("description", "")
        result["maps_to_hcc"] = True
    else:
        result["maps_to_hcc"] = False
        result["hcc"] = None
        result["raf"] = 0

    return result

# ---------------------------------------------------------------------------
# Document type priority (from SNF Admit Assist)
# Higher priority = more authoritative for coding decisions
# ---------------------------------------------------------------------------

DOC_TYPE_PRIORITY = {
    "discharge_summary": 0,
    "history_and_physical": 1,
    "progress_note": 2,
    "consult": 3,
    "ed_note": 4,
    "operative_report": 5,
    "lab_report": 6,
    "imaging_report": 7,
    "medication_list": 8,
    "nursing_note": 9,
    "other": 99,
}

# ---------------------------------------------------------------------------
# LOINC codes for lab values mentioned in clinical text
# ---------------------------------------------------------------------------

LAB_LOINC_MAP = {
    "egfr": ("33914-3", "Glomerular filtration rate"),
    "gfr": ("33914-3", "Glomerular filtration rate"),
    "a1c": ("4548-4", "Hemoglobin A1c"),
    "hba1c": ("4548-4", "Hemoglobin A1c"),
    "hemoglobin a1c": ("4548-4", "Hemoglobin A1c"),
    "creatinine": ("2160-0", "Creatinine"),
    "bmi": ("39156-5", "Body mass index"),
    "ejection fraction": ("10230-1", "Ejection fraction"),
    "ef": ("10230-1", "Ejection fraction"),
    "ldl": ("2089-1", "LDL Cholesterol"),
    "hdl": ("2085-9", "HDL Cholesterol"),
    "bnp": ("42637-9", "BNP"),
    "potassium": ("2823-3", "Potassium"),
    "sodium": ("2951-2", "Sodium"),
    "inr": ("6301-6", "INR"),
    "albumin": ("1751-7", "Albumin"),
    "prealbumin": ("14338-5", "Prealbumin"),
    "troponin": ("49563-0", "Troponin"),
    "tsh": ("3016-3", "TSH"),
    "hemoglobin": ("718-7", "Hemoglobin"),
    "wbc": ("6690-2", "White blood cell count"),
    "platelets": ("777-3", "Platelet count"),
}

# ---------------------------------------------------------------------------
# Lab value -> CKD staging thresholds (from SNF clinical_rules_index)
# ---------------------------------------------------------------------------

EGFR_CKD_STAGING = [
    # Stage 1 (eGFR >= 90) intentionally EXCLUDED — requires evidence of kidney
    # damage (proteinuria, structural abnormality) beyond just the lab value.
    # Auto-coding eGFR >= 90 as CKD1 would be a false HCC capture.
    (60, 89, "N18.2", "CKD Stage 2"),
    (45, 59, "N18.31", "CKD Stage 3a"),
    (30, 44, "N18.32", "CKD Stage 3b"),
    (15, 29, "N18.4", "CKD Stage 4"),
    (0, 14, "N18.5", "CKD Stage 5"),
]

A1C_DIABETES_THRESHOLDS = [
    (6.5, 7.9, "E11.65", "Type 2 DM with hyperglycemia"),
    (8.0, 9.9, "E11.65", "Type 2 DM with hyperglycemia"),
    (10.0, None, "E11.65", "Type 2 DM with hyperglycemia, poorly controlled"),
]

# ---------------------------------------------------------------------------
# Pass 1: Extraction prompt (adapted from SNF Admit Assist)
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM_PROMPT = """You are a medical document data-extraction engine. Extract every clinically relevant fact into structured JSON.

## Rules
1. Extract ONLY information explicitly stated in the document. Never infer or fabricate.
2. If a field is not mentioned, use null for single values or empty list for lists.
3. For each diagnosis, include the EXACT quote from the text that supports it.
4. For labs/vitals, capture: name, numeric value, units, date, whether abnormal.
5. For medications, capture: name, dose, frequency, route, status (active/new/discontinued).
6. Return ONLY raw valid JSON. NO markdown fences. Start with { and end with }.

## Output Schema

{
  "document_type": "progress_note | discharge_summary | h_and_p | consult | lab_report | other",
  "document_date": "date if mentioned, or null",
  "diagnoses": [
    {
      "text": "diagnosis as written in the document",
      "icd10_hint": "ICD-10 code if mentioned in the document, or null",
      "clinical_status": "active | resolved | historical | recurrence",
      "evidence_quote": "exact sentence(s) from the note supporting this diagnosis",
      "specificity_clues": "any details that help determine the most specific code (e.g., 'EF 35%', 'stage 4', 'on insulin')"
    }
  ],
  "medications": [
    {
      "name": "medication name",
      "dose": "dose or null",
      "frequency": "frequency or null",
      "route": "route or null",
      "status": "active | new | changed | discontinued | unknown"
    }
  ],
  "key_findings": [
    {
      "finding": "descriptive text (e.g., 'GFR 45 mL/min')",
      "type": "lab | imaging | vital | exam | other",
      "value": "numeric value or null",
      "units": "units or null",
      "date": "date of finding or null",
      "abnormal": true
    }
  ],
  "past_medical_history": ["list of PMH items"],
  "allergies": ["list of allergies"],
  "procedures": ["list of procedures mentioned"]
}"""

# ---------------------------------------------------------------------------
# Pass 2: Coding prompt with tool_use instructions
# ---------------------------------------------------------------------------

CODING_SYSTEM_PROMPT = """You are an expert medical coder specializing in CMS-HCC risk adjustment for Medicare Advantage.

Given extracted clinical data from a patient's notes, assign the most specific ICD-10-CM codes.

## Rules
1. Only code conditions that are ACTIVELY documented — not suspected, not ruled out.
2. Always use the MOST SPECIFIC code the evidence supports. Never use unspecified when specific data exists.
3. Use the provided tools to validate every code you assign:
   - lookup_hcc: Check if a code maps to an HCC and its RAF weight
   - build_code_ladder: See all specificity options for a code family
4. For each code, cite the exact evidence from the extraction.
5. Assign a confidence score (0-100) based on evidence strength.

## Priority
- Codes that map to HCCs are highest priority (they impact RAF)
- More specific codes are preferred over general ones
- Lab values should drive staging codes (eGFR -> CKD stage, A1c -> DM control)

Return JSON:
{
  "codes": [
    {
      "icd10": "code",
      "description": "description",
      "hcc_code": null or integer,
      "raf_weight": 0.0,
      "evidence_quote": "exact text from extraction supporting this code",
      "confidence": 0-100,
      "source_finding_type": "diagnosis | lab | medication | pmh"
    }
  ]
}"""


# ---------------------------------------------------------------------------
# Tool definitions for Claude tool_use
# ---------------------------------------------------------------------------

CODING_TOOLS = [
    {
        "name": "lookup_icd10",
        "description": "Look up ANY ICD-10-CM code in the full 70,000+ code reference. Returns description, billable status, chapter, AND whether it maps to an HCC with RAF weight. Use this for any code — not just HCC codes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "icd10_code": {
                    "type": "string",
                    "description": "ICD-10-CM code (e.g., 'E11.65', 'I50.22', 'J06.9', 'Z87.39')"
                }
            },
            "required": ["icd10_code"]
        }
    },
    {
        "name": "lookup_hcc",
        "description": "Quick check if an ICD-10-CM code maps to an HCC and get its RAF weight. Faster than lookup_icd10 but only returns HCC data.",
        "input_schema": {
            "type": "object",
            "properties": {
                "icd10_code": {
                    "type": "string",
                    "description": "ICD-10-CM code (e.g., 'E11.65', 'I50.22', 'N18.4')"
                }
            },
            "required": ["icd10_code"]
        }
    },
    {
        "name": "build_code_ladder",
        "description": "Get all related ICD-10 codes in the same family with their HCC mappings and RAF weights. Use this to find the most specific code with the highest RAF.",
        "input_schema": {
            "type": "object",
            "properties": {
                "base_code": {
                    "type": "string",
                    "description": "Base ICD-10-CM code to build the ladder from (e.g., 'E11' for diabetes, 'N18' for CKD)"
                }
            },
            "required": ["base_code"]
        }
    },
    {
        "name": "check_lab_staging",
        "description": "Given a lab value, determine the appropriate staging code. For eGFR -> CKD stage, A1c -> diabetes control level.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lab_name": {"type": "string", "description": "Lab test name (e.g., 'eGFR', 'A1c', 'BMI')"},
                "value": {"type": "number", "description": "Numeric lab value"},
                "units": {"type": "string", "description": "Units (e.g., 'mL/min', '%', 'kg/m2')"}
            },
            "required": ["lab_name", "value"]
        }
    },
]


def _handle_tool_call(tool_name: str, tool_input: dict) -> str:
    """Handle a tool call from Claude during coding pass."""
    if tool_name == "lookup_icd10":
        code = tool_input.get("icd10_code", "")
        entry = lookup_icd10_full(code)
        if entry:
            return json.dumps({
                "code": code,
                "description": entry.get("description", ""),
                "is_billable": entry.get("is_billable", True),
                "maps_to_hcc": entry.get("maps_to_hcc", False),
                "hcc_code": entry.get("hcc"),
                "raf_weight": entry.get("raf", 0),
                "chapter": entry.get("chapter", ""),
                "valid": True,
            })
        return json.dumps({"code": code, "valid": False, "message": "Code not found in ICD-10 reference"})

    elif tool_name == "lookup_hcc":
        code = tool_input.get("icd10_code", "")
        entry = lookup_hcc_for_icd10(code)
        if entry:
            return json.dumps({
                "code": code,
                "hcc_code": entry.get("hcc"),
                "raf_weight": entry.get("raf", 0),
                "description": entry.get("description", ""),
                "maps_to_hcc": entry.get("hcc") is not None,
            })
        return json.dumps({"code": code, "maps_to_hcc": False, "message": "No HCC mapping found"})

    elif tool_name == "build_code_ladder":
        base = tool_input.get("base_code", "")
        ladder = build_code_ladder(base)
        return json.dumps({"base_code": base, "options": ladder[:10]})

    elif tool_name == "check_lab_staging":
        lab = tool_input.get("lab_name", "").lower()
        value = tool_input.get("value", 0)

        if lab in ("egfr", "gfr"):
            for low, high, code, desc in EGFR_CKD_STAGING:
                if high is None and value >= low:
                    entry = lookup_hcc_for_icd10(code)
                    return json.dumps({"lab": lab, "value": value, "suggested_code": code, "description": desc,
                                       "hcc": entry.get("hcc") if entry else None, "raf": entry.get("raf", 0) if entry else 0})
                elif high is not None and low <= value <= high:
                    entry = lookup_hcc_for_icd10(code)
                    return json.dumps({"lab": lab, "value": value, "suggested_code": code, "description": desc,
                                       "hcc": entry.get("hcc") if entry else None, "raf": entry.get("raf", 0) if entry else 0})

        if lab in ("a1c", "hba1c"):
            for low, high, code, desc in A1C_DIABETES_THRESHOLDS:
                if high is None and value >= low:
                    entry = lookup_hcc_for_icd10(code)
                    return json.dumps({"lab": lab, "value": value, "suggested_code": code, "description": desc,
                                       "hcc": entry.get("hcc") if entry else None, "raf": entry.get("raf", 0) if entry else 0})
                elif high is not None and low <= value <= high:
                    entry = lookup_hcc_for_icd10(code)
                    return json.dumps({"lab": lab, "value": value, "suggested_code": code, "description": desc,
                                       "hcc": entry.get("hcc") if entry else None, "raf": entry.get("raf", 0) if entry else 0})

        if lab == "bmi" and value >= 40:
            bmi_entry = lookup_hcc_for_icd10("E66.01")
            return json.dumps({"lab": "BMI", "value": value, "suggested_code": "E66.01", "description": "Morbid obesity",
                               "hcc": int(bmi_entry["hcc"]) if bmi_entry and bmi_entry.get("hcc") else None,
                               "raf": float(bmi_entry.get("raf", 0)) if bmi_entry else 0})

        return json.dumps({"lab": lab, "value": value, "message": "No staging rule for this lab/value"})

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


# ---------------------------------------------------------------------------
# Pre-processing: auto-map ICD-10 codes found directly in text (no LLM needed)
# ---------------------------------------------------------------------------

import re

# Regex to find ICD-10 codes in clinical text (e.g., E11.65, I50.22, N18.4)
_ICD10_PATTERN = re.compile(
    r'\b([A-TV-Z]\d{2}\.?\d{0,4})\b'
)

# Common false positives to exclude
_ICD10_EXCLUDE = {
    "T10", "T20", "S10", "V10",  # Too short / ambiguous
}


def auto_extract_icd10_codes(text: str) -> list[dict[str, Any]]:
    """Extract ICD-10 codes directly mentioned in clinical text.

    No LLM needed — uses regex + your HCC reference data to validate
    and enrich each code with HCC mapping, RAF weight, description,
    and code ladder.

    Returns only validated codes (ones that exist in the reference data).
    """
    if not text:
        return []

    # Find all potential ICD-10 patterns
    candidates = set(_ICD10_PATTERN.findall(text))

    validated: list[dict[str, Any]] = []
    seen_codes: set[str] = set()

    for candidate in candidates:
        # Skip too-short or excluded patterns
        normalized = candidate.upper().strip()
        if len(normalized) < 3 or normalized[:3] in _ICD10_EXCLUDE:
            continue
        if normalized in seen_codes:
            continue

        # Look up in full reference first (70K codes), then HCC subset
        full_entry = lookup_icd10_full(candidate)
        entry = lookup_hcc_for_icd10(candidate)
        if not full_entry and not entry:
            # Try with dot inserted if missing
            if "." not in candidate and len(candidate) > 3:
                dotted = candidate[:3] + "." + candidate[3:]
                full_entry = lookup_icd10_full(dotted)
                entry = lookup_hcc_for_icd10(dotted)
                if full_entry or entry:
                    candidate = dotted

        if full_entry or entry:
            seen_codes.add(normalized)

            # Use full reference for description, HCC data for RAF
            description = ""
            hcc_code = None
            raf_weight = 0.0
            has_hcc = False

            if entry and entry.get("hcc"):
                hcc_code = int(entry["hcc"])
                raf_weight = float(entry.get("raf", 0))
                description = entry.get("description", "")
                has_hcc = True
            if full_entry:
                description = full_entry.get("description", description)

            # Find the context around this code in the text
            evidence_quote = _find_context(text, candidate)

            # Build code ladder for specificity check
            ladder = build_code_ladder(candidate)
            upgrades = [c for c in ladder if c["raf_weight"] > raf_weight and not c["is_current"]]

            validated.append({
                "icd10": candidate,
                "description": description,
                "hcc_code": hcc_code,
                "raf_weight": raf_weight,
                "has_hcc": has_hcc,
                "evidence_quote": evidence_quote,
                "confidence": 95,  # High confidence — code explicitly in text
                "source_finding_type": "explicit_code",
                "extraction_method": "auto_regex",  # No LLM used
                "code_ladder": ladder[:6],
                "has_specificity_upgrade": len(upgrades) > 0,
                "upgrades_available": upgrades[:3],
            })

    # Sort: HCC-mapped codes first, then by RAF descending
    validated.sort(key=lambda c: (-(1 if c["has_hcc"] else 0), -c["raf_weight"]))

    logger.info("Auto-extracted %d validated ICD-10 codes from text (no LLM)", len(validated))
    return validated


def _find_context(text: str, code: str, window: int = 80) -> str:
    """Find the surrounding context for an ICD-10 code in text."""
    idx = text.find(code)
    if idx == -1:
        # Try without dot
        idx = text.find(code.replace(".", ""))
    if idx == -1:
        return ""
    start = max(0, idx - window)
    end = min(len(text), idx + len(code) + window)
    context = text[start:end].strip()
    # Clean up to sentence boundaries if possible
    if start > 0 and "." in context[:20]:
        context = context[context.index(".") + 1:].strip()
    if end < len(text) and "." in context[-20:]:
        context = context[:context.rindex(".") + 1].strip()
    return context


# ---------------------------------------------------------------------------
# Pass 1: Extract structured facts from a clinical note
# ---------------------------------------------------------------------------

async def extract_from_note(
    note_text: str,
    note_type: str = "progress_note",
    note_date: date | None = None,
    provider_name: str | None = None,
    facility_name: str | None = None,
    document_id: str | None = None,
    tenant_schema: str = "unknown",
) -> dict[str, Any]:
    """Pass 1: Extract structured clinical facts from a single note.

    Returns structured extraction with diagnoses, medications, labs,
    findings — each with evidence quotes from the source text.

    PHI handling: note text is run through `phi_scrubber.scrub()` before it
    leaves the process, and the actual Claude call goes through
    `llm_guard.guarded_llm_call` for tenant-isolated output validation.
    """
    if not note_text or len(note_text.strip()) < 20:
        return {"diagnoses": [], "medications": [], "key_findings": [], "past_medical_history": []}

    # Scrub direct identifiers (SSN, phone, email, MRN, dates) from the note
    # text AND from free-text metadata fields before they leave the process.
    # Evidence quotes returned by Claude may still contain non-regex-catchable
    # PHI (names, addresses), so downstream storage of quotes must respect
    # tenant isolation. This is a first-line scrub, not a full de-identifier.
    scrubbed_note = phi_scrub(note_text)
    scrubbed_provider = phi_scrub(provider_name or "unknown")
    scrubbed_facility = phi_scrub(facility_name or "unknown")

    try:
        user_prompt = (
            f"Document type: {note_type}\n"
            f"Date: {note_date or 'unknown'}\n"
            f"Provider: {scrubbed_provider}\n"
            f"Facility: {scrubbed_facility}\n\n"
            f"---\n\n{scrubbed_note}"
        )

        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            context_data={
                "note_type": note_type,
                "document_id": document_id,
                # Do not put note text in context_data — it goes into the
                # _metadata block that Claude sees; we already include it
                # in user_prompt above.
            },
            max_tokens=4000,
        )

        text = guard_result.get("response", "") or ""
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        extraction = json.loads(text)

        # Attach source metadata to every item (SNF pattern)
        source_meta = {
            "document_type": note_type,
            "document_date": note_date.isoformat() if note_date else None,
            "provider": provider_name,
            "facility": facility_name,
            "document_id": document_id,
            "priority": DOC_TYPE_PRIORITY.get(note_type, 99),
        }
        extraction["_source"] = source_meta

        # Enrich lab findings with LOINC codes
        for finding in extraction.get("key_findings", []):
            name_lower = (finding.get("finding") or "").lower()
            for keyword, (loinc, loinc_name) in LAB_LOINC_MAP.items():
                if keyword in name_lower:
                    finding["loinc_code"] = loinc
                    finding["loinc_name"] = loinc_name
                    break

        logger.info(
            "Pass 1 extraction: %d diagnoses, %d meds, %d findings from %s",
            len(extraction.get("diagnoses", [])),
            len(extraction.get("medications", [])),
            len(extraction.get("key_findings", [])),
            note_type,
        )
        return extraction

    except json.JSONDecodeError as e:
        logger.warning("Pass 1 extraction JSON parse failed: %s", e)
        return {"diagnoses": [], "medications": [], "key_findings": [], "error": str(e)}
    except Exception as e:
        logger.error("Pass 1 extraction failed: %s", e)
        return {"diagnoses": [], "medications": [], "key_findings": [], "error": str(e)}


# ---------------------------------------------------------------------------
# Pass 2: Code assignment with Claude tool_use
# ---------------------------------------------------------------------------

def _scrub_extraction_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Recursively scrub PHI from the dict/list/str tree before it goes to
    the LLM. Used by Pass 2 (tool_use loop) where guarded_llm_call is not
    a drop-in because it does not support the tool_use protocol.
    """
    if isinstance(payload, dict):
        return {k: _scrub_extraction_payload(v) for k, v in payload.items()}
    if isinstance(payload, list):
        return [_scrub_extraction_payload(v) for v in payload]
    if isinstance(payload, str):
        return phi_scrub(payload)
    return payload


async def assign_codes_with_tools(
    extraction: dict[str, Any],
) -> list[dict[str, Any]]:
    """Pass 2: Assign ICD-10 codes using Claude with tool_use.

    Claude validates every code against our HCC reference data in real-time
    via tools, ensuring:
    - Codes are valid ICD-10-CM
    - Most specific code is used (via code ladder)
    - Lab values drive staging (eGFR -> CKD stage)
    - Each code has evidence + HCC/RAF impact

    PHI handling:
    - Extraction payload is recursively scrubbed (`phi_scrub`) before being
      serialised into the Claude prompt. Evidence quotes returned by Pass 1
      may carry residual PHI (names, free-text addresses); the scrub catches
      SSN/phone/email/MRN/DOB patterns.
    - This path cannot use `guarded_llm_call` because that helper does not
      support Anthropic's tool_use protocol (tool definitions + tool_result
      blocks). This is the single documented bypass and it is scoped: we
      only process one member's data at a time, and all tool outputs are
      validated against the local ICD-10 reference.
    """
    diagnoses = extraction.get("diagnoses", [])
    findings = extraction.get("key_findings", [])
    medications = extraction.get("medications", [])
    pmh = extraction.get("past_medical_history", [])

    if not diagnoses and not findings:
        return []

    # Scrub PHI from every free-text field in the extraction before it goes
    # to the LLM. Keeps structural keys intact so Pass 2's coder still sees
    # the same JSON shape.
    scrubbed = _scrub_extraction_payload({
        "diagnoses": diagnoses,
        "key_findings": findings,
        "medications": medications,
        "past_medical_history": pmh,
    })

    # Build the coding input
    coding_input = json.dumps(scrubbed, indent=2)

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        messages = [{
            "role": "user",
            "content": f"Assign ICD-10 codes for this patient. Use the tools to validate every code.\n\n{coding_input}"
        }]

        # Run the tool_use loop
        max_turns = 10
        for _ in range(max_turns):
            response = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                system=CODING_SYSTEM_PROMPT,
                tools=CODING_TOOLS,
                messages=messages,
            )

            # Check if Claude wants to use tools
            if response.stop_reason == "tool_use":
                # Process tool calls
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = _handle_tool_call(block.name, block.input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": result,
                        })

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                # Final response — extract the codes
                for block in response.content:
                    if hasattr(block, "text") and block.text:
                        text = block.text.strip()
                        if text.startswith("```"):
                            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                        try:
                            result = json.loads(text)
                            codes = result.get("codes", [])
                            # Attach source metadata
                            source = extraction.get("_source", {})
                            for code in codes:
                                code["source"] = source
                            logger.info("Pass 2 coding: %d codes assigned", len(codes))
                            return codes
                        except json.JSONDecodeError:
                            pass
                return []

        return []

    except Exception as e:
        logger.error("Pass 2 coding failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Full pipeline: note text -> extraction -> coding -> validated results
# ---------------------------------------------------------------------------

async def process_clinical_note(
    note_text: str,
    note_type: str = "progress_note",
    note_date: date | None = None,
    provider_name: str | None = None,
    facility_name: str | None = None,
    document_id: str | None = None,
    member_id: str | None = None,
    tenant_schema: str = "unknown",
) -> dict[str, Any]:
    """Full 2-pass pipeline: extract facts -> assign codes with tool validation.

    Returns a complete clinical extraction with:
    - Validated ICD-10 codes with HCC/RAF impact
    - Evidence quotes from the source note
    - Lab-driven staging (eGFR -> CKD, A1c -> DM control)
    - Code specificity ladders
    - Confidence scores
    - Source document metadata for audit trail
    """
    # Pre-pass: Auto-extract any ICD-10 codes already in the text (no LLM needed)
    auto_codes = auto_extract_icd10_codes(note_text)

    # Pass 1: Extract structured facts from the note via Claude
    extraction = await extract_from_note(
        note_text, note_type, note_date, provider_name, facility_name,
        document_id, tenant_schema=tenant_schema,
    )

    # Pass 2: Code with tool validation (Claude assigns codes for extracted diagnoses)
    llm_codes = await assign_codes_with_tools(extraction)

    # Merge: auto-extracted codes + LLM-assigned codes, deduplicated
    seen_icd10: set[str] = set()
    codes: list[dict] = []
    # Auto-extracted first (higher confidence)
    for c in auto_codes:
        icd = c.get("icd10", "").upper().replace(".", "")
        if icd not in seen_icd10:
            seen_icd10.add(icd)
            codes.append(c)
    # Then LLM codes (only if not already found by auto-extract)
    for c in llm_codes:
        icd = c.get("icd10", "").upper().replace(".", "")
        if icd not in seen_icd10:
            seen_icd10.add(icd)
            codes.append(c)

    # Build diagnosis_source_map (SNF pattern)
    diagnosis_source_map: dict[str, dict] = {}
    for dx in extraction.get("diagnoses", []):
        key = (dx.get("text") or "").lower().strip()
        if key:
            diagnosis_source_map[key] = {
                "text": dx.get("text"),
                "evidence_quote": dx.get("evidence_quote"),
                "clinical_status": dx.get("clinical_status"),
                "sources": [extraction.get("_source", {})],
            }

    # Run code optimizer (fix truncated, suggest specificity upgrades, med-dx gaps)
    from app.services.code_optimizer import optimize_codes as run_optimizer
    medications_list = [m.get("name", "") for m in extraction.get("medications", []) if m.get("name")]
    optimizer_result = run_optimizer(codes, note_text, medications_list)
    codes = optimizer_result["codes"]
    med_dx_suggestions = optimizer_result.get("med_dx_suggestions", [])

    # Validate codes against clinical rules (119 code families)
    from app.services.clinical_rules_validator import validate_all_codes
    lab_findings = extraction.get("key_findings", [])
    codes = validate_all_codes(codes, note_text, medications_list, lab_findings)

    # Enrich codes with ladder and evidence
    enriched_codes = []
    for code in codes:
        icd10 = code.get("icd10", "")
        hcc_entry = lookup_hcc_for_icd10(icd10)
        ladder = build_code_ladder(icd10) if icd10 else []

        enriched_codes.append({
            **code,
            "hcc_code": int(hcc_entry["hcc"]) if hcc_entry and hcc_entry.get("hcc") else code.get("hcc_code"),
            "raf_weight": float(hcc_entry.get("raf", 0)) if hcc_entry else code.get("raf_weight", 0),
            "code_ladder": ladder[:8],
            "has_hcc": bool(hcc_entry and hcc_entry.get("hcc")),
        })

    return {
        "member_id": member_id,
        "extraction": {
            "diagnoses": extraction.get("diagnoses", []),
            "medications": extraction.get("medications", []),
            "key_findings": extraction.get("key_findings", []),
            "past_medical_history": extraction.get("past_medical_history", []),
        },
        "codes": enriched_codes,
        "diagnosis_source_map": diagnosis_source_map,
        "source": extraction.get("_source", {}),
        "med_dx_suggestions": med_dx_suggestions,
        "optimizer_summary": optimizer_result.get("summary", {}),
        "summary": {
            "total_codes": len(enriched_codes),
            "hcc_codes": sum(1 for c in enriched_codes if c.get("has_hcc")),
            "total_raf": round(sum(c.get("raf_weight", 0) for c in enriched_codes if c.get("has_hcc")), 3),
            "auto_extracted": sum(1 for c in enriched_codes if c.get("extraction_method") == "auto_regex"),
            "llm_extracted": sum(1 for c in enriched_codes if c.get("extraction_method") != "auto_regex"),
        },
    }


async def process_document_reference(
    doc_ref: dict,
    member_id: str,
    tenant_schema: str = "unknown",
) -> dict[str, Any]:
    """Process an eCW DocumentReference through the full NLP pipeline.

    Takes a parsed DocumentReference dict (from ecw.py fetch_document_references)
    and runs it through extraction -> coding -> validation.
    """
    content_text = doc_ref.get("content_text") or doc_ref.get("extra", {}).get("content_text")
    if not content_text:
        return {"codes": [], "extraction": {}, "summary": {"total_codes": 0, "hcc_codes": 0, "total_raf": 0}}

    note_date = None
    date_str = doc_ref.get("date") or doc_ref.get("extra", {}).get("date")
    if date_str:
        try:
            from datetime import datetime
            note_date = datetime.fromisoformat(date_str).date()
        except (ValueError, TypeError):
            pass

    return await process_clinical_note(
        note_text=content_text,
        note_type=doc_ref.get("type_display") or doc_ref.get("extra", {}).get("type_display", "clinical_note"),
        note_date=note_date,
        provider_name=doc_ref.get("extra", {}).get("author_name"),
        facility_name=doc_ref.get("extra", {}).get("facility_name"),
        document_id=doc_ref.get("fhir_id"),
        member_id=member_id,
        tenant_schema=tenant_schema,
    )
