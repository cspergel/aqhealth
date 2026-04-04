"""
Code Optimizer — deterministic post-processing for ICD-10 code quality.

Ported from SNF Admit Assist's 8,873-line code_optimizer.py.
This is a SELECTIVE port of the most valuable patterns for the Health Platform:

1. Fix non-billable/truncated codes → most specific billable variant
2. Specificity upgrade suggestions based on keywords in source text
3. Medication-diagnosis correlation (extend med-dx gap detection)
4. Lab value → staging code validation

Unlike the SNF version (which processes hospital discharge docs), this version
is optimized for:
- eCW FHIR data (specific codes usually already present)
- Clinical notes with mixed coded/uncoded content
- Claims data with occasional truncated codes
- HIE C-CDA documents with generic codes

All logic is deterministic — no LLM calls. Runs after extraction/coding.
"""

import logging
import re
from typing import Any

from app.services.hcc_engine import lookup_hcc_for_icd10, build_code_ladder, HCC_MAPPINGS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Fix non-billable / truncated codes
# ---------------------------------------------------------------------------

# Common truncated codes and their most likely specific variants
TRUNCATED_CODE_DEFAULTS: dict[str, str] = {
    # Diabetes
    "E11": "E11.9",     # Type 2 DM → unspecified (but flag for specificity)
    "E11.6": "E11.65",  # DM with hyperglycemia
    "E11.2": "E11.22",  # DM with CKD
    "E11.3": "E11.311", # DM with retinopathy
    "E11.4": "E11.40",  # DM with neuropathy
    # CKD
    "N18": "N18.9",     # CKD → unspecified
    "N18.3": "N18.30",  # CKD stage 3 → unspecified substage
    # Heart failure
    "I50": "I50.9",     # HF → unspecified
    "I50.2": "I50.20",  # Systolic HF → unspecified
    "I50.3": "I50.30",  # Diastolic HF → unspecified
    "I50.4": "I50.40",  # Combined HF → unspecified
    # COPD
    "J44": "J44.1",     # COPD → with acute exacerbation
    # Depression
    "F33": "F33.0",     # Major depressive → mild
    "F32": "F32.9",     # Major depressive episode → unspecified
    # Atrial fibrillation
    "I48": "I48.91",    # AFib → unspecified
    # Obesity
    "E66": "E66.01",    # Obesity → morbid obesity
    # Dementia
    "G30": "G30.9",     # Alzheimer → unspecified
}


def fix_truncated_codes(codes: list[dict]) -> list[dict]:
    """Replace truncated/non-billable codes with their most specific billable variant.

    Also flags each fix so the user knows what was auto-corrected.
    """
    fixed = []
    for code_entry in codes:
        icd10 = code_entry.get("icd10", "")
        if not icd10:
            fixed.append(code_entry)
            continue

        # Check if it's truncated (exists in our defaults map)
        default = TRUNCATED_CODE_DEFAULTS.get(icd10)
        if default and default != icd10:
            # Verify the default is valid
            entry = lookup_hcc_for_icd10(default)
            if entry:
                original = icd10
                code_entry = {**code_entry}
                code_entry["icd10"] = default
                code_entry["description"] = entry.get("description", code_entry.get("description", ""))
                code_entry["hcc_code"] = int(entry["hcc"]) if entry.get("hcc") else code_entry.get("hcc_code")
                code_entry["raf_weight"] = float(entry.get("raf", 0))
                code_entry["has_hcc"] = entry.get("hcc") is not None
                code_entry.setdefault("optimizer_actions", []).append({
                    "action": "fix_truncated",
                    "original": original,
                    "corrected": default,
                    "reason": f"Truncated code {original} auto-corrected to {default}",
                })

        fixed.append(code_entry)
    return fixed


# ---------------------------------------------------------------------------
# 2. Specificity upgrades based on source text keywords
# ---------------------------------------------------------------------------

# Keyword → potential upgrade codes (from SNF code_optimizer)
SPECIFICITY_KEYWORDS: dict[str, list[dict]] = {
    # Diabetes specificity
    "neuropathy": [
        {"from_prefix": "E11", "to": "E11.40", "desc": "DM with diabetic neuropathy"},
        {"from_prefix": "E11", "to": "E11.42", "desc": "DM with diabetic polyneuropathy"},
    ],
    "nephropathy": [
        {"from_prefix": "E11", "to": "E11.22", "desc": "DM with diabetic CKD"},
        {"from_prefix": "E11", "to": "E11.21", "desc": "DM with diabetic nephropathy"},
    ],
    "retinopathy": [
        {"from_prefix": "E11", "to": "E11.319", "desc": "DM with unspecified diabetic retinopathy"},
    ],
    "gastroparesis": [
        {"from_prefix": "E11", "to": "E11.43", "desc": "DM with diabetic autonomic neuropathy"},
    ],
    # Heart failure specificity
    "systolic": [
        {"from_prefix": "I50", "to": "I50.20", "desc": "Unspecified systolic HF"},
    ],
    "diastolic": [
        {"from_prefix": "I50", "to": "I50.30", "desc": "Unspecified diastolic HF"},
    ],
    "hfref": [
        {"from_prefix": "I50", "to": "I50.22", "desc": "Chronic systolic HF"},
    ],
    "hfpef": [
        {"from_prefix": "I50", "to": "I50.32", "desc": "Chronic diastolic HF"},
    ],
    "ef 35": [
        {"from_prefix": "I50", "to": "I50.22", "desc": "Chronic systolic HF (EF<40%)"},
    ],
    "ef 30": [
        {"from_prefix": "I50", "to": "I50.22", "desc": "Chronic systolic HF (EF<40%)"},
    ],
    "ef 25": [
        {"from_prefix": "I50", "to": "I50.22", "desc": "Chronic systolic HF (EF<40%)"},
    ],
    # COPD specificity
    "acute exacerbation": [
        {"from_prefix": "J44", "to": "J44.1", "desc": "COPD with acute exacerbation"},
    ],
    # CKD specificity (when eGFR mentioned but no stage)
    "stage 3": [
        {"from_prefix": "N18", "to": "N18.30", "desc": "CKD stage 3 unspecified"},
    ],
    "stage 3a": [
        {"from_prefix": "N18", "to": "N18.31", "desc": "CKD stage 3a"},
    ],
    "stage 3b": [
        {"from_prefix": "N18", "to": "N18.32", "desc": "CKD stage 3b"},
    ],
    "stage 4": [
        {"from_prefix": "N18", "to": "N18.4", "desc": "CKD stage 4"},
    ],
    "stage 5": [
        {"from_prefix": "N18", "to": "N18.5", "desc": "CKD stage 5"},
    ],
    "esrd": [
        {"from_prefix": "N18", "to": "N18.6", "desc": "End stage renal disease"},
    ],
    # Depression specificity
    "severe": [
        {"from_prefix": "F33", "to": "F33.2", "desc": "Major depressive disorder, severe"},
        {"from_prefix": "F32", "to": "F32.2", "desc": "Major depressive episode, severe"},
    ],
    "moderate": [
        {"from_prefix": "F33", "to": "F33.1", "desc": "Major depressive disorder, moderate"},
        {"from_prefix": "F32", "to": "F32.1", "desc": "Major depressive episode, moderate"},
    ],
    # Malnutrition
    "malnutrition": [
        {"from_prefix": "E4", "to": "E44.0", "desc": "Moderate protein-calorie malnutrition"},
    ],
    "severe malnutrition": [
        {"from_prefix": "E4", "to": "E43", "desc": "Severe protein-calorie malnutrition"},
    ],
}


def suggest_specificity_upgrades(
    codes: list[dict],
    source_text: str = "",
) -> list[dict]:
    """Check if source text contains keywords that support more specific codes.

    Returns same codes with upgrade suggestions attached.
    """
    if not source_text:
        return codes

    text_lower = source_text.lower()
    result = []

    for code_entry in codes:
        code_entry = {**code_entry}  # Don't mutate original
        icd10 = code_entry.get("icd10", "")
        code_prefix = icd10.replace(".", "")[:3] if icd10 else ""

        suggestions = []
        for keyword, upgrades in SPECIFICITY_KEYWORDS.items():
            if keyword not in text_lower:
                continue
            for upgrade in upgrades:
                if not code_prefix.startswith(upgrade["from_prefix"].replace(".", "")[:2]):
                    continue
                target = upgrade["to"]
                # Verify the upgrade is valid and better
                target_entry = lookup_hcc_for_icd10(target)
                current_raf = code_entry.get("raf_weight", 0)
                target_raf = float(target_entry.get("raf", 0)) if target_entry else 0

                if target_entry and (target_raf > current_raf or target != icd10):
                    suggestions.append({
                        "suggested_code": target,
                        "description": upgrade["desc"],
                        "keyword_matched": keyword,
                        "current_code": icd10,
                        "raf_delta": round(target_raf - current_raf, 3),
                        "target_raf": target_raf,
                        "target_hcc": int(target_entry["hcc"]) if target_entry.get("hcc") else None,
                    })

        if suggestions:
            # Sort by RAF delta descending
            suggestions.sort(key=lambda s: -s["raf_delta"])
            code_entry.setdefault("optimizer_actions", []).append({
                "action": "specificity_upgrade_available",
                "suggestions": suggestions,
            })
            code_entry["has_specificity_upgrade"] = True

        result.append(code_entry)

    return result


# ---------------------------------------------------------------------------
# 3. Medication-diagnosis correlation
# ---------------------------------------------------------------------------

# Extended medication → expected diagnosis mapping
MED_DX_CORRELATION: list[tuple[str, str, str, str]] = [
    # (med_keyword, expected_dx_family, suggested_code, condition)
    ("insulin", "E11", "E11.65", "Type 2 DM with hyperglycemia"),
    ("metformin", "E11", "E11.9", "Type 2 diabetes"),
    ("semaglutide", "E11", "E11.9", "Type 2 diabetes"),
    ("furosemide", "I50", "I50.9", "Heart failure"),
    ("carvedilol", "I50", "I50.9", "Heart failure"),
    ("spironolactone", "I50", "I50.9", "Heart failure"),
    ("sacubitril", "I50", "I50.22", "Chronic systolic heart failure"),
    ("warfarin", "I48", "I48.91", "Atrial fibrillation"),
    ("apixaban", "I48", "I48.91", "Atrial fibrillation"),
    ("rivaroxaban", "I48", "I48.91", "Atrial fibrillation"),
    ("donepezil", "G30", "G30.9", "Alzheimer disease"),
    ("memantine", "G30", "G30.9", "Alzheimer disease"),
    ("levodopa", "G20", "G20", "Parkinson disease"),
    ("albuterol", "J44", "J44.1", "COPD"),
    ("tiotropium", "J44", "J44.1", "COPD"),
    ("sertraline", "F33", "F33.0", "Major depressive disorder"),
    ("escitalopram", "F33", "F33.0", "Major depressive disorder"),
    ("clozapine", "F20", "F20.9", "Schizophrenia"),
    ("lithium", "F31", "F31.9", "Bipolar disorder"),
    ("tacrolimus", "Z94", "Z94.0", "Transplant status"),
    ("mycophenolate", "Z94", "Z94.0", "Transplant status"),
    ("epoetin", "N18", "N18.4", "CKD stage 4"),
]


def check_med_dx_correlation(
    codes: list[dict],
    medications: list[str],
) -> list[dict]:
    """Check if medications suggest diagnoses not yet in the code list.

    Returns list of suggested additions (not modifications to existing codes).
    """
    if not medications:
        return []

    meds_lower = [m.lower() for m in medications]
    coded_families = set()
    for c in codes:
        icd10 = c.get("icd10", "")
        if icd10:
            coded_families.add(icd10.replace(".", "")[:3])

    suggestions = []
    seen_families: set[str] = set()

    for med_keyword, dx_family, suggested_code, condition in MED_DX_CORRELATION:
        # Check if any medication matches
        matched_med = None
        for med in meds_lower:
            if med_keyword in med:
                matched_med = med
                break
        if not matched_med:
            continue

        # Check if the diagnosis family is already coded
        family_normalized = dx_family.replace(".", "")[:3]
        if family_normalized in coded_families:
            continue
        if family_normalized in seen_families:
            continue
        seen_families.add(family_normalized)

        entry = lookup_hcc_for_icd10(suggested_code)
        suggestions.append({
            "action": "med_dx_gap",
            "medication": matched_med,
            "expected_diagnosis_family": dx_family,
            "suggested_code": suggested_code,
            "condition": condition,
            "hcc_code": int(entry["hcc"]) if entry and entry.get("hcc") else None,
            "raf_weight": float(entry.get("raf", 0)) if entry else 0,
            "confidence": 65,
            "evidence": f"Patient is on {matched_med} which treats {condition}",
        })

    return suggestions


# ---------------------------------------------------------------------------
# Main optimization pipeline
# ---------------------------------------------------------------------------

def optimize_codes(
    codes: list[dict],
    source_text: str = "",
    medications: list[str] | None = None,
) -> dict[str, Any]:
    """Run the full code optimization pipeline.

    Steps:
    1. Fix truncated/non-billable codes
    2. Suggest specificity upgrades from source text keywords
    3. Check medication-diagnosis correlation for missing codes

    Returns dict with optimized codes + suggestions.
    """
    # Step 1: Fix truncated codes
    codes = fix_truncated_codes(codes)

    # Step 2: Specificity upgrades
    codes = suggest_specificity_upgrades(codes, source_text)

    # Step 3: Med-dx correlation
    med_suggestions = check_med_dx_correlation(codes, medications or [])

    # Count actions taken
    truncated_fixed = sum(
        1 for c in codes
        for a in c.get("optimizer_actions", [])
        if a.get("action") == "fix_truncated"
    )
    upgrades_available = sum(1 for c in codes if c.get("has_specificity_upgrade"))

    return {
        "codes": codes,
        "med_dx_suggestions": med_suggestions,
        "summary": {
            "codes_processed": len(codes),
            "truncated_fixed": truncated_fixed,
            "specificity_upgrades_available": upgrades_available,
            "med_dx_gaps_found": len(med_suggestions),
        },
    }
