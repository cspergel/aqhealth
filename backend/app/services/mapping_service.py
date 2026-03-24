"""
AI-powered column mapping service.

Uses Anthropic Claude API to analyze uploaded file headers and sample data,
identifies the data type, and proposes column mappings to platform schema fields.
Falls back to heuristic matching when ANTHROPIC_API_KEY is not configured.
"""

import json
import logging
import re
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Platform schema field definitions — the canonical fields each data type maps to
# ---------------------------------------------------------------------------

PLATFORM_FIELDS = {
    "roster": [
        "member_id", "first_name", "last_name", "date_of_birth", "gender",
        "zip_code", "health_plan", "plan_product", "coverage_start",
        "coverage_end", "pcp_npi", "pcp_name", "medicaid_status",
        "disability_status", "institutional",
    ],
    "claims": [
        "member_id", "claim_id", "claim_type", "service_date", "paid_date",
        "diagnosis_codes", "procedure_code", "drg_code", "ndc_code",
        "rendering_npi", "facility_name", "facility_npi",
        "billed_amount", "allowed_amount", "paid_amount", "member_liability",
        "pos_code", "drug_name", "drug_class", "quantity", "days_supply",
    ],
    "eligibility": [
        "member_id", "first_name", "last_name", "date_of_birth", "gender",
        "health_plan", "plan_product", "coverage_start", "coverage_end",
        "pcp_npi", "pcp_name",
    ],
    "pharmacy": [
        "member_id", "claim_id", "service_date", "paid_date", "ndc_code",
        "drug_name", "drug_class", "quantity", "days_supply",
        "billed_amount", "allowed_amount", "paid_amount",
        "rendering_npi", "pharmacy_name",
    ],
    "providers": [
        "npi", "first_name", "last_name", "specialty", "practice_name", "tin",
    ],
}

# ---------------------------------------------------------------------------
# Heuristic keyword map — used as fallback when no API key is configured
# ---------------------------------------------------------------------------

_HEURISTIC_MAP: dict[str, list[str]] = {
    "member_id": ["member_id", "member id", "memberid", "member_number", "subscriber_id",
                   "subscriber id", "hicn", "mbi", "patient_id", "enrollee_id"],
    "first_name": ["first_name", "first name", "fname", "first", "member_first",
                    "patient_first_name", "given_name"],
    "last_name": ["last_name", "last name", "lname", "last", "member_last",
                   "patient_last_name", "surname", "family_name"],
    "date_of_birth": ["date_of_birth", "dob", "birth_date", "birthdate", "birth date",
                       "date of birth", "member_dob", "patient_dob"],
    "gender": ["gender", "sex", "member_gender", "patient_sex"],
    "zip_code": ["zip_code", "zip", "zipcode", "postal_code", "member_zip"],
    "health_plan": ["health_plan", "plan_name", "plan name", "payer", "payer_name",
                     "insurance_name", "carrier"],
    "plan_product": ["plan_product", "product", "plan_type", "lob", "line_of_business",
                      "product_type"],
    "coverage_start": ["coverage_start", "effective_date", "eff_date", "start_date",
                        "enrollment_date", "eligibility_start"],
    "coverage_end": ["coverage_end", "term_date", "termination_date", "end_date",
                      "eligibility_end", "disenrollment_date"],
    "pcp_npi": ["pcp_npi", "pcp npi", "provider_npi", "primary_care_npi",
                 "assigned_pcp_npi"],
    "pcp_name": ["pcp_name", "pcp name", "provider_name", "primary_care_provider",
                  "assigned_pcp"],
    "medicaid_status": ["medicaid_status", "medicaid", "dual_eligible", "dual",
                         "medicaid_flag"],
    "disability_status": ["disability_status", "disability", "disabled",
                           "originally_disabled", "esrd"],
    "institutional": ["institutional", "institution", "ltc", "snf_resident"],
    "claim_id": ["claim_id", "claim id", "claimid", "claim_number", "claim_no",
                  "claim number"],
    "claim_type": ["claim_type", "claim type", "claimtype", "type_of_claim",
                    "form_type"],
    "service_date": ["service_date", "service date", "date_of_service", "dos",
                      "from_date", "service_from_date", "svc_date", "fill_date",
                      "dispensed_date"],
    "paid_date": ["paid_date", "paid date", "payment_date", "check_date",
                   "adjudication_date", "processed_date"],
    "diagnosis_codes": ["diagnosis_codes", "diagnosis", "diag", "dx", "icd10",
                         "icd_code", "dx_code", "primary_diagnosis",
                         "diag_1", "diag1", "dx1", "principal_diagnosis"],
    "procedure_code": ["procedure_code", "cpt", "cpt_code", "hcpcs", "hcpcs_code",
                        "proc_code", "procedure"],
    "drg_code": ["drg_code", "drg", "ms_drg", "apr_drg", "drg_number"],
    "ndc_code": ["ndc_code", "ndc", "ndc_number", "national_drug_code"],
    "rendering_npi": ["rendering_npi", "rendering_provider_npi", "servicing_npi",
                       "provider_npi", "prescriber_npi", "billing_npi"],
    "facility_name": ["facility_name", "facility", "hospital_name", "location_name",
                       "servicing_facility"],
    "facility_npi": ["facility_npi", "facility_provider_npi", "hospital_npi"],
    "billed_amount": ["billed_amount", "billed", "charge_amount", "total_charge",
                       "charges", "billed_charges"],
    "allowed_amount": ["allowed_amount", "allowed", "eligible_amount",
                        "approved_amount"],
    "paid_amount": ["paid_amount", "paid", "payment_amount", "net_paid",
                     "plan_paid", "amount_paid", "total_paid"],
    "member_liability": ["member_liability", "patient_liability", "copay",
                          "coinsurance", "deductible", "member_cost"],
    "pos_code": ["pos_code", "pos", "place_of_service", "place of service"],
    "drug_name": ["drug_name", "drug", "medication", "med_name", "product_name",
                   "brand_name", "generic_name"],
    "drug_class": ["drug_class", "therapeutic_class", "ahfs", "gpi",
                    "pharmacological_class"],
    "quantity": ["quantity", "qty", "quantity_dispensed", "units"],
    "days_supply": ["days_supply", "supply_days", "days", "day_supply"],
    "npi": ["npi", "provider_npi", "national_provider_identifier"],
    "specialty": ["specialty", "provider_specialty", "taxonomy", "speciality"],
    "practice_name": ["practice_name", "practice", "group_name", "clinic_name",
                       "organization_name"],
    "tin": ["tin", "tax_id", "tax_identification_number", "ein", "fein"],
    "pharmacy_name": ["pharmacy_name", "pharmacy", "dispensing_pharmacy"],
}

# ---------------------------------------------------------------------------
# Data-type detection heuristics
# ---------------------------------------------------------------------------

_TYPE_SIGNALS: dict[str, list[str]] = {
    "claims": ["claim_id", "cpt", "hcpcs", "drg", "procedure_code", "billed_amount",
               "paid_amount", "pos_code", "service_date", "dos", "diagnosis"],
    "pharmacy": ["ndc", "ndc_code", "drug_name", "days_supply", "quantity_dispensed",
                  "fill_date", "dispensed_date", "pharmacy_name"],
    "roster": ["member_id", "first_name", "last_name", "dob", "date_of_birth",
               "pcp_npi", "pcp_name", "coverage_start", "coverage_end"],
    "eligibility": ["effective_date", "term_date", "eligibility_start",
                     "eligibility_end", "enrollment_date", "disenrollment_date"],
    "providers": ["npi", "specialty", "practice_name", "tin", "taxonomy"],
}


def _normalize(s: str) -> str:
    """Lowercase, strip whitespace, replace common separators with underscore."""
    return re.sub(r"[\s\-\.]+", "_", s.strip().lower())


def _detect_type_heuristic(headers: list[str]) -> str:
    """Score each data type by how many signal keywords appear in the headers."""
    normed = [_normalize(h) for h in headers]
    scores: dict[str, int] = {}
    for dtype, signals in _TYPE_SIGNALS.items():
        score = 0
        for sig in signals:
            for nh in normed:
                if sig in nh:
                    score += 1
                    break
        scores[dtype] = score
    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    return best if scores[best] >= 2 else "unknown"


def _heuristic_mapping(
    headers: list[str], data_type: str
) -> dict[str, dict[str, Any]]:
    """Build a mapping using keyword matching — no API call needed."""
    valid_fields = PLATFORM_FIELDS.get(data_type, [])
    # If unknown, use a union of all fields
    if not valid_fields:
        seen: set[str] = set()
        for flds in PLATFORM_FIELDS.values():
            for f in flds:
                if f not in seen:
                    seen.add(f)
                    valid_fields.append(f)

    mapping: dict[str, dict[str, Any]] = {}
    used_fields: set[str] = set()

    for header in headers:
        normed = _normalize(header)
        best_match: str | None = None
        best_confidence: float = 0.0

        for platform_field, keywords in _HEURISTIC_MAP.items():
            if platform_field not in valid_fields and data_type != "unknown":
                continue
            if platform_field in used_fields:
                continue

            for kw in keywords:
                kw_norm = _normalize(kw)
                if normed == kw_norm:
                    # Exact match
                    if best_confidence < 1.0:
                        best_match = platform_field
                        best_confidence = 1.0
                elif kw_norm in normed or normed in kw_norm:
                    # Partial match
                    conf = 0.7
                    if best_confidence < conf:
                        best_match = platform_field
                        best_confidence = conf

        if best_match and best_confidence >= 0.5:
            mapping[header] = {
                "platform_field": best_match,
                "confidence": best_confidence,
            }
            used_fields.add(best_match)
        else:
            mapping[header] = {
                "platform_field": None,
                "confidence": 0.0,
            }

    return mapping


# ---------------------------------------------------------------------------
# Anthropic Claude API mapping
# ---------------------------------------------------------------------------

async def _ai_mapping(
    headers: list[str],
    sample_rows: list[list[str]],
    data_type_hint: str | None = None,
) -> dict[str, Any]:
    """
    Call Anthropic Claude to propose column mapping.
    Returns {"data_type": str, "mapping": {source_col: {platform_field, confidence}}}.
    """
    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic package not installed, falling back to heuristic")
        return {}

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Build the sample data table for context
    sample_table = "Headers: " + " | ".join(headers) + "\n"
    for i, row in enumerate(sample_rows[:5]):
        sample_table += f"Row {i + 1}: " + " | ".join(str(v) for v in row) + "\n"

    all_fields_desc = json.dumps(PLATFORM_FIELDS, indent=2)

    prompt = f"""You are a healthcare data analyst assistant. Analyze these CSV/Excel column headers and sample data from a healthcare file upload.

## Sample Data
{sample_table}

## Platform Schema Fields (by data type)
{all_fields_desc}

## Task
1. Identify the data type: roster, claims, eligibility, pharmacy, providers, or unknown
2. For each source column header, propose which platform schema field it maps to
3. Assign a confidence score (0.0 to 1.0) for each mapping

Special notes:
- Diagnosis codes may be split across multiple columns (diag_1, diag_2, etc.) — map them all to "diagnosis_codes"
- Date columns should be identified by their content format (MM/DD/YYYY, YYYY-MM-DD, etc.)
- Financial columns (amounts, costs) — look at the values to distinguish billed vs paid vs allowed
- member_id is the health plan's member identifier
- NPI is a 10-digit number

Return ONLY valid JSON in this exact format:
{{
  "data_type": "roster|claims|eligibility|pharmacy|providers|unknown",
  "mapping": {{
    "SourceColumnName": {{"platform_field": "field_name_or_null", "confidence": 0.95}},
    ...
  }}
}}"""

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract JSON from the response
        text = response.content[0].text
        # Try to find JSON block in the response
        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            result = json.loads(json_match.group())
            return result
        else:
            logger.warning("Could not parse JSON from AI response, falling back")
            return {}

    except Exception as e:
        logger.error(f"Anthropic API call failed: {e}")
        return {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def propose_mapping(
    headers: list[str],
    sample_rows: list[list[str]],
    existing_rules: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Propose a column mapping for an uploaded file.

    1. Tries Anthropic Claude API if API key is configured
    2. Falls back to heuristic keyword matching
    3. Applies any existing MappingRules

    Returns:
        {
            "data_type": str,
            "mapping": {source_col: {"platform_field": str|None, "confidence": float}},
        }
    """
    ai_result: dict[str, Any] = {}

    # Try AI mapping first if API key is available
    if settings.anthropic_api_key:
        ai_result = await _ai_mapping(headers, sample_rows)

    if ai_result and "mapping" in ai_result:
        data_type = ai_result.get("data_type", "unknown")
        mapping = ai_result["mapping"]
        logger.info(f"AI mapping succeeded: detected type={data_type}")
    else:
        # Fallback to heuristic
        data_type = _detect_type_heuristic(headers)
        mapping = _heuristic_mapping(headers, data_type)
        logger.info(f"Heuristic mapping: detected type={data_type}")

    # Apply existing rules
    if existing_rules:
        mapping = apply_rules(mapping, existing_rules)

    return {
        "data_type": data_type,
        "mapping": mapping,
    }


def apply_rules(
    proposed_mapping: dict[str, Any],
    rules: list[dict],
) -> dict[str, Any]:
    """
    Apply user-created MappingRules to override or supplement the proposed mapping.

    Rule types:
    - column_rename: {"source_column": "X", "platform_field": "Y"}
        Force a source column to map to a specific platform field.
    - value_transform: {"source_column": "X", "transform": "date_format", "params": {...}}
        Attach a transformation instruction (applied during ingestion).
    - filter: {"source_column": "X", "condition": "not_empty"}
        Mark rows to skip during ingestion.
    """
    for rule in rules:
        if not rule.get("is_active", True):
            continue

        rule_type = rule.get("rule_type", "")
        config = rule.get("rule_config", {})

        if rule_type == "column_rename":
            src = config.get("source_column")
            target = config.get("platform_field")
            if src and target and src in proposed_mapping:
                proposed_mapping[src] = {
                    "platform_field": target,
                    "confidence": 1.0,  # user-defined = max confidence
                }

        elif rule_type == "value_transform":
            src = config.get("source_column")
            if src and src in proposed_mapping:
                if isinstance(proposed_mapping[src], dict):
                    proposed_mapping[src]["transform"] = {
                        "type": config.get("transform"),
                        "params": config.get("params", {}),
                    }

    return proposed_mapping
