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
from app.services.llm_guard import guarded_llm_call

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Platform schema field definitions — the canonical fields each data type maps to
# ---------------------------------------------------------------------------

PLATFORM_FIELDS = {
    "roster": [
        "member_id", "first_name", "last_name", "date_of_birth", "gender",
        "zip_code", "health_plan", "plan_product", "coverage_start",
        "coverage_end", "pcp_npi", "pcp_name", "medicaid_status",
        "disability_status", "institutional", "address", "city", "state",
        "phone", "email", "language", "race", "ethnicity",
    ],
    "claims": [
        "member_id", "claim_id", "claim_type", "service_date", "paid_date",
        "diagnosis_codes", "diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4",
        "diagnosis_5", "diagnosis_6", "diagnosis_7", "diagnosis_8",
        "procedure_code", "drg_code", "ndc_code",
        "rendering_npi", "rendering_provider_name", "facility_name", "facility_npi",
        "billing_tin", "billing_npi",
        "billed_amount", "allowed_amount", "paid_amount", "member_liability",
        "pos_code", "drug_name", "drug_class", "quantity", "days_supply",
        "modifier_1", "modifier_2", "revenue_code", "admission_date", "discharge_date",
        "discharge_status", "admit_type", "admit_source",
        "los", "status",
    ],
    "eligibility": [
        "member_id", "first_name", "last_name", "date_of_birth", "gender",
        "health_plan", "plan_product", "coverage_start", "coverage_end",
        "pcp_npi", "pcp_name", "group_number", "contract_id",
    ],
    "pharmacy": [
        "member_id", "claim_id", "service_date", "paid_date", "ndc_code",
        "drug_name", "drug_class", "quantity", "days_supply",
        "billed_amount", "allowed_amount", "paid_amount",
        "rendering_npi", "prescriber_npi", "prescriber_name",
        "pharmacy_name", "pharmacy_npi", "daw_code", "formulary_status",
        "generic_indicator", "refill_number",
    ],
    "providers": [
        "npi", "first_name", "last_name", "specialty", "practice_name", "tin",
        "address", "city", "state", "zip_code", "phone", "taxonomy_code",
        "credentialing_status", "panel_status", "accepting_new_patients",
    ],
    # --- Additional data types MSOs commonly receive ---
    "authorization": [
        "auth_id", "member_id", "service_type", "procedure_code",
        "requesting_provider_npi", "servicing_provider_npi",
        "requested_date", "decision_date", "status", "decision",
        "approved_units", "approved_from_date", "approved_to_date",
        "denial_reason", "urgency",
    ],
    "lab_results": [
        "member_id", "order_date", "result_date", "test_code", "test_name",
        "result_value", "result_units", "reference_range", "abnormal_flag",
        "ordering_provider_npi", "performing_lab",
    ],
    "care_gaps": [
        "member_id", "measure_code", "measure_name", "gap_status",
        "due_date", "last_service_date", "stars_weight",
    ],
    "risk_scores": [
        "member_id", "payment_year", "raf_score", "hcc_list",
        "demographic_score", "disease_score", "model_version",
    ],
    "capitation": [
        "member_id", "payment_month", "cap_amount", "plan_name",
        "product_type", "rate_cell", "county_code",
    ],
    "encounter": [
        "member_id", "encounter_id", "encounter_date", "encounter_type",
        "provider_npi", "provider_name", "facility_name",
        "diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4",
        "procedure_code", "visit_type", "status",
    ],
    "adt_census": [
        "member_id", "patient_name", "facility_name", "admit_date",
        "discharge_date", "patient_class", "attending_provider",
        "diagnosis", "room_bed", "event_type",
    ],
    "quality_report": [
        "member_id", "measure_code", "measure_name", "numerator",
        "denominator", "rate", "stars_weight", "performance_year",
    ],
    "provider_roster": [
        "npi", "provider_name", "specialty", "practice_name", "tin",
        "panel_size", "attributed_members", "contract_type",
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
                       "provider_npi", "prescriber_npi"],
    "billing_tin": ["billing_tin", "bill_tin", "billing_tax_id", "group_tin", "tax_id", "tin", "federal_tax_id", "fein"],
    "billing_npi": ["billing_npi", "bill_npi", "billing_provider_npi", "group_npi", "org_npi"],
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
    # Extended fields
    "address": ["address", "street", "address_line_1", "street_address", "member_address"],
    "city": ["city", "member_city", "patient_city"],
    "state": ["state", "member_state", "patient_state", "st"],
    "phone": ["phone", "phone_number", "telephone", "member_phone", "contact_phone"],
    "email": ["email", "email_address", "member_email"],
    "language": ["language", "preferred_language", "primary_language"],
    "race": ["race", "member_race"],
    "ethnicity": ["ethnicity", "member_ethnicity"],
    "diagnosis_1": ["diagnosis_1", "diag_1", "diag1", "dx1", "dx_1", "primary_diagnosis", "principal_dx",
                     "icd10_1", "icd_1"],
    "diagnosis_2": ["diagnosis_2", "diag_2", "diag2", "dx2", "dx_2", "secondary_diagnosis", "icd10_2", "icd_2"],
    "diagnosis_3": ["diagnosis_3", "diag_3", "diag3", "dx3", "dx_3", "icd10_3", "icd_3"],
    "diagnosis_4": ["diagnosis_4", "diag_4", "diag4", "dx4", "dx_4", "icd10_4", "icd_4"],
    "diagnosis_5": ["diagnosis_5", "diag_5", "diag5", "dx5", "dx_5", "icd10_5"],
    "diagnosis_6": ["diagnosis_6", "diag_6", "diag6", "dx6", "dx_6", "icd10_6"],
    "diagnosis_7": ["diagnosis_7", "diag_7", "diag7", "dx7", "dx_7", "icd10_7"],
    "diagnosis_8": ["diagnosis_8", "diag_8", "diag8", "dx8", "dx_8", "icd10_8"],
    "modifier_1": ["modifier_1", "mod_1", "mod1", "modifier"],
    "modifier_2": ["modifier_2", "mod_2", "mod2"],
    "revenue_code": ["revenue_code", "rev_code", "revenue"],
    "admission_date": ["admission_date", "admit_date", "admit_dt", "admission_dt"],
    "discharge_date": ["discharge_date", "discharge_dt", "disch_date", "disch_dt"],
    "discharge_status": ["discharge_status", "discharge_disposition", "disch_status",
                          "patient_status", "patient_disposition"],
    "admit_type": ["admit_type", "admission_type", "type_of_admission"],
    "admit_source": ["admit_source", "admission_source", "source_of_admission"],
    "los": ["los", "length_of_stay", "length of stay", "days_stay", "days_in_facility",
            "inpatient_days", "covered_days"],
    "status": ["status", "claim_status", "adjudication_status", "line_status",
               "claim_disposition", "processing_status"],
    "rendering_provider_name": ["rendering_provider_name", "rendering_provider", "servicing_provider",
                                 "provider_name", "attending_physician"],
    "prescriber_npi": ["prescriber_npi", "prescriber_id", "ordering_provider_npi"],
    "prescriber_name": ["prescriber_name", "prescriber", "ordering_provider"],
    "pharmacy_npi": ["pharmacy_npi", "dispensing_pharmacy_npi"],
    "daw_code": ["daw_code", "daw", "dispense_as_written"],
    "formulary_status": ["formulary_status", "formulary", "formulary_tier"],
    "generic_indicator": ["generic_indicator", "generic_flag", "brand_generic", "multi_source"],
    "refill_number": ["refill_number", "refill", "refill_no"],
    "group_number": ["group_number", "group_no", "group_id", "employer_group"],
    "contract_id": ["contract_id", "contract_number", "contract_no", "h_number"],
    "taxonomy_code": ["taxonomy_code", "taxonomy", "provider_taxonomy"],
    "credentialing_status": ["credentialing_status", "credential_status", "credentialed"],
    "panel_status": ["panel_status", "panel_open", "accepting_patients"],
    "accepting_new_patients": ["accepting_new_patients", "accepting_patients", "open_panel"],
    # Authorization fields
    "auth_id": ["auth_id", "authorization_id", "auth_number", "prior_auth_number"],
    "service_type": ["service_type", "auth_service_type", "service_category"],
    "requesting_provider_npi": ["requesting_provider_npi", "requesting_npi", "referring_npi"],
    "servicing_provider_npi": ["servicing_provider_npi", "servicing_npi"],
    "requested_date": ["requested_date", "request_date", "submission_date"],
    "decision_date": ["decision_date", "determination_date", "review_date"],
    "decision": ["decision", "determination", "auth_decision", "auth_status"],
    "approved_units": ["approved_units", "approved_qty", "authorized_units"],
    "approved_from_date": ["approved_from_date", "auth_start_date", "authorized_from"],
    "approved_to_date": ["approved_to_date", "auth_end_date", "authorized_to"],
    "denial_reason": ["denial_reason", "deny_reason", "denial_code"],
    "urgency": ["urgency", "urgent_flag", "review_urgency", "expedited"],
    # Lab result fields
    "order_date": ["order_date", "ordered_date", "lab_order_date"],
    "result_date": ["result_date", "resulted_date", "lab_result_date", "report_date"],
    "test_code": ["test_code", "loinc", "loinc_code", "lab_code", "order_code"],
    "test_name": ["test_name", "lab_test", "test_description", "order_name"],
    "result_value": ["result_value", "result", "value", "lab_value", "observation_value"],
    "result_units": ["result_units", "units", "unit_of_measure", "uom"],
    "reference_range": ["reference_range", "ref_range", "normal_range"],
    "abnormal_flag": ["abnormal_flag", "abnormal", "flag", "interpretation"],
    "ordering_provider_npi": ["ordering_provider_npi", "ordering_npi", "ordering_provider"],
    "performing_lab": ["performing_lab", "lab_name", "performing_organization"],
    # Capitation fields
    "cap_amount": ["cap_amount", "capitation_amount", "pmpm_amount", "cap_rate"],
    "payment_month": ["payment_month", "cap_month", "period", "payment_period"],
    "rate_cell": ["rate_cell", "rate_category", "age_sex_cell"],
    "county_code": ["county_code", "county", "fips_code"],
    # Risk score fields
    "raf_score": ["raf_score", "raf", "risk_score", "hcc_score", "risk_adjustment_factor"],
    "hcc_list": ["hcc_list", "hcc_codes", "active_hccs", "hcc_conditions"],
    "payment_year": ["payment_year", "model_year", "dos_year"],
    "demographic_score": ["demographic_score", "demo_score", "demographic_raf"],
    "disease_score": ["disease_score", "disease_raf", "condition_score"],
    "model_version": ["model_version", "hcc_model", "cms_model"],
    # Encounter fields
    "encounter_id": ["encounter_id", "visit_id", "encounter_number"],
    "encounter_date": ["encounter_date", "visit_date", "appointment_date"],
    "encounter_type": ["encounter_type", "visit_type", "service_type"],
}

# ---------------------------------------------------------------------------
# Data-type detection heuristics
# ---------------------------------------------------------------------------

_TYPE_SIGNALS: dict[str, list[str]] = {
    "claims": ["claim_id", "cpt", "hcpcs", "drg", "procedure_code", "billed_amount",
               "paid_amount", "pos_code", "service_date", "dos", "diagnosis",
               "claim_number", "clm", "revenue_code", "modifier", "admit_date"],
    "pharmacy": ["ndc", "ndc_code", "drug_name", "days_supply", "quantity_dispensed",
                  "fill_date", "dispensed_date", "pharmacy_name", "prescriber",
                  "daw", "formulary", "generic", "refill"],
    "roster": ["member_id", "first_name", "last_name", "dob", "date_of_birth",
               "pcp_npi", "pcp_name", "coverage_start", "coverage_end",
               "subscriber", "enrollee", "mbi", "hicn"],
    "eligibility": ["effective_date", "term_date", "eligibility_start",
                     "eligibility_end", "enrollment_date", "disenrollment_date",
                     "group_number", "contract_id"],
    "providers": ["npi", "specialty", "practice_name", "tin", "taxonomy",
                   "credentialing", "panel_status"],
    "authorization": ["auth_id", "authorization", "prior_auth", "approval",
                       "denial", "approved_units", "auth_number", "review_type"],
    "lab_results": ["test_code", "test_name", "result_value", "result_units",
                     "reference_range", "abnormal", "loinc", "performing_lab",
                     "specimen", "lab_result"],
    "care_gaps": ["measure_code", "gap_status", "stars_weight", "hedis",
                   "gap_in_care", "open_gap", "closed_gap"],
    "risk_scores": ["raf_score", "raf", "hcc_list", "risk_score",
                     "payment_year", "model_version", "demographic_score"],
    "capitation": ["cap_amount", "capitation", "pmpm", "rate_cell",
                    "payment_month", "cap_rate"],
    "encounter": ["encounter_id", "encounter_date", "encounter_type",
                    "visit_type", "visit_date"],
    "adt_census": ["admit_date", "discharge_date", "patient_class",
                    "attending_provider", "room_bed", "event_type", "census"],
    "quality_report": ["numerator", "denominator", "performance_year",
                        "quality_measure", "star_rating"],
    "provider_roster": ["panel_size", "attributed_members", "contract_type",
                         "provider_roster", "network_status"],
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
    tenant_schema: str = "default",
) -> dict[str, Any]:
    """
    Call Anthropic Claude to propose column mapping.
    Returns {"data_type": str, "mapping": {source_col: {platform_field, confidence}}}.
    """
    # Build the sample data table for context
    sample_table = "Headers: " + " | ".join(headers) + "\n"
    for i, row in enumerate(sample_rows[:5]):
        sample_table += f"Row {i + 1}: " + " | ".join(str(v) for v in row) + "\n"

    all_fields_desc = json.dumps(PLATFORM_FIELDS, indent=2)

    system_prompt = "You are a healthcare data analyst assistant. Analyze CSV/Excel column headers and sample data from a healthcare file upload and propose column mappings."

    prompt = f"""Analyze these CSV/Excel column headers and sample data from a healthcare file upload.

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
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=system_prompt,
            user_prompt=prompt,
            context_data={"headers": headers, "sample_row_count": len(sample_rows)},
            max_tokens=2048,
        )

        if guard_result["warnings"]:
            logger.warning("Mapping LLM output warnings: %s", guard_result["warnings"])

        text = guard_result["response"]
        if not text:
            return {}

        # Try to find JSON block in the response
        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            result = json.loads(json_match.group())
            return result
        else:
            logger.warning("Could not parse JSON from AI response, falling back")
            return {}

    except Exception as e:
        logger.error(f"Guarded LLM call failed for mapping: {e}")
        return {}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def propose_mapping(
    headers: list[str],
    sample_rows: list[list[str]],
    existing_rules: list[dict] | None = None,
    tenant_schema: str = "default",
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
        ai_result = await _ai_mapping(headers, sample_rows, tenant_schema=tenant_schema)

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
