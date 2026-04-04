"""
Clinical Rules Validator — YAML-driven validation of ICD-10 codes against
clinical evidence using 119 code family rules from SNF Admit Assist.

Each code family defines:
- prefix_pattern: regex matching ICD-10 codes in this family
- required_keywords: terms that SHOULD appear in source text to justify the code
- exclusion_terms: terms that CONTRADICT the code (e.g., "in remission" for active codes)
- labs: associated lab values that support the code
- co_occurrence: codes that commonly appear together

Validation produces a confidence adjustment:
- Keywords found → boost confidence
- Exclusion terms found → reduce confidence, flag for review
- Associated labs found → boost confidence
- No supporting evidence → flag as low-confidence

Ported from SNF Admit Assist's code_optimizer (clinical_rules_index.json).
"""

import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load clinical rules at module import
# ---------------------------------------------------------------------------

_RULES: dict | None = None
_RULES_BY_PATTERN: list[tuple[re.Pattern, str, dict]] = []


def _load_rules() -> dict:
    global _RULES, _RULES_BY_PATTERN
    if _RULES is not None:
        return _RULES

    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "data", "clinical_rules_index.json"
    )
    if not os.path.exists(path):
        logger.warning("Clinical rules not found at %s", path)
        _RULES = {"families": {}}
        return _RULES

    with open(path) as f:
        _RULES = json.load(f)

    # Pre-compile regex patterns for fast matching
    _RULES_BY_PATTERN = []
    for family_name, family_data in _RULES.get("families", {}).items():
        pattern_str = family_data.get("prefix_pattern", "")
        if pattern_str:
            try:
                compiled = re.compile(pattern_str, re.IGNORECASE)
                _RULES_BY_PATTERN.append((compiled, family_name, family_data))
            except re.error:
                pass

    logger.info("Loaded %d clinical rule families (%d with patterns)",
                len(_RULES.get("families", {})), len(_RULES_BY_PATTERN))
    return _RULES


def get_rule_for_code(icd10_code: str) -> tuple[str | None, dict | None]:
    """Find the clinical rule family that matches an ICD-10 code.

    Returns (family_name, family_data) or (None, None) if no match.
    """
    _load_rules()
    normalized = icd10_code.upper().replace(".", "")
    dotted = icd10_code if "." in icd10_code else (icd10_code[:3] + "." + icd10_code[3:] if len(icd10_code) > 3 else icd10_code)

    for pattern, name, data in _RULES_BY_PATTERN:
        if pattern.search(dotted) or pattern.search(normalized):
            return name, data

    return None, None


def validate_code_against_evidence(
    icd10_code: str,
    source_text: str,
    medications: list[str] | None = None,
    lab_values: list[dict] | None = None,
) -> dict[str, Any]:
    """Validate an ICD-10 code against clinical evidence using rule families.

    Returns:
        {
            "code": "E11.65",
            "family": "hcc_38_diabetes_complications",
            "confidence_adjustment": +10 or -20,
            "keywords_found": ["diabetes", "hyperglycemia"],
            "exclusions_found": [],
            "labs_supporting": [{"name": "A1c", "value": 8.2}],
            "flags": ["keyword_match", "lab_support"],
            "recommendation": "supported" | "review" | "contraindicated"
        }
    """
    family_name, family_data = get_rule_for_code(icd10_code)

    result = {
        "code": icd10_code,
        "family": family_name,
        "confidence_adjustment": 0,
        "keywords_found": [],
        "exclusions_found": [],
        "labs_supporting": [],
        "flags": [],
        "recommendation": "no_rule",  # no matching rule family
    }

    if not family_data:
        return result

    text_lower = source_text.lower() if source_text else ""
    meds_lower = [m.lower() for m in (medications or [])]

    # Check required keywords
    required = family_data.get("required_keywords", [])
    for kw in required:
        if kw.lower() in text_lower:
            result["keywords_found"].append(kw)

    if required and result["keywords_found"]:
        result["confidence_adjustment"] += 10
        result["flags"].append("keyword_match")
    elif required and not result["keywords_found"]:
        result["confidence_adjustment"] -= 15
        result["flags"].append("no_keyword_match")

    # Check exclusion terms
    exclusions = family_data.get("exclusion_terms", [])
    for term in exclusions:
        if term.lower() in text_lower:
            result["exclusions_found"].append(term)

    if result["exclusions_found"]:
        result["confidence_adjustment"] -= 30
        result["flags"].append("exclusion_found")

    # Check associated labs
    rule_labs = family_data.get("labs", [])
    if rule_labs and lab_values:
        for rule_lab in rule_labs:
            lab_name = rule_lab.get("name", "").lower()
            for actual_lab in lab_values:
                actual_name = (actual_lab.get("name") or actual_lab.get("finding") or "").lower()
                if lab_name in actual_name:
                    result["labs_supporting"].append({
                        "name": actual_lab.get("name") or actual_lab.get("finding"),
                        "value": actual_lab.get("value"),
                        "units": actual_lab.get("units"),
                    })
                    result["confidence_adjustment"] += 10
                    result["flags"].append("lab_support")
                    break

    # Check co-occurrence codes (if other codes in the session)
    # This would need the full code list — deferred for now

    # Determine recommendation
    if result["exclusions_found"]:
        result["recommendation"] = "contraindicated"
    elif result["confidence_adjustment"] >= 10:
        result["recommendation"] = "supported"
    elif result["confidence_adjustment"] <= -10:
        result["recommendation"] = "review"
    else:
        result["recommendation"] = "neutral"

    return result


def validate_all_codes(
    codes: list[dict],
    source_text: str = "",
    medications: list[str] | None = None,
    lab_values: list[dict] | None = None,
) -> list[dict[str, Any]]:
    """Validate a list of ICD-10 codes against clinical evidence.

    Returns the same codes with added validation results.
    """
    results = []
    for code_entry in codes:
        icd10 = code_entry.get("icd10", "")
        if not icd10:
            results.append(code_entry)
            continue

        validation = validate_code_against_evidence(
            icd10, source_text, medications, lab_values
        )

        # Merge validation into code entry
        enriched = {**code_entry}
        enriched["validation"] = validation

        # Adjust confidence based on validation
        original_conf = code_entry.get("confidence", 50)
        adjusted_conf = max(0, min(100, original_conf + validation["confidence_adjustment"]))
        enriched["confidence"] = adjusted_conf
        enriched["confidence_original"] = original_conf

        results.append(enriched)

    return results
