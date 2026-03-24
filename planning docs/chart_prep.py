"""
Chart Prep Router — Receives scraped PCC dashboard data from the Chrome extension
and runs it through the HCC analysis pipeline.

This is the bridge between the PCC dashboard scraper and the existing
coding_service + raf_service + code_optimizer pipeline.

Endpoint: POST /api/chart-prep
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from app.services.coding_service import load_icd10_lookup, load_hcc_lookup
from app.services.raf_service import calculate_note_raf
from app.services.code_optimizer import MEDICATION_DIAGNOSIS_MAP

router = APIRouter(prefix="/api")


class ChartPrepRequest(BaseModel):
    """Incoming data from PCC dashboard scraper."""
    patient: dict
    diagnoses: list = []
    medications: list = []
    vitals: dict = {}
    code_status: dict = {}
    diet: Optional[str] = None
    allergies: list = []
    clinical_scores: dict = {}
    scraped_at: Optional[str] = None
    source_url: Optional[str] = None


@router.post("/chart-prep")
async def chart_prep(req: ChartPrepRequest):
    """Analyze PCC dashboard data for HCC capture opportunities.

    Pipeline:
    1. Map scraped diagnoses → ICD-10 → HCC enrichment
    2. Detect medication-diagnosis gaps
    3. Detect clinical score-based suspects (BIMS, PHQ-9, eGFR, etc.)
    4. Calculate RAF (current + projected)
    5. Find near-miss disease interactions
    6. Return structured result for overlay/chart prep
    """
    icd10_lookup = load_icd10_lookup()
    hcc_lookup = load_hcc_lookup()

    # Step 1: Enrich scraped diagnoses with HCC data
    confirmed_hccs = []
    non_hcc_codes = []
    all_diagnoses = []

    for dx in req.diagnoses:
        code = dx.get("code", "")
        desc = dx.get("description", "")

        # Try to enrich with HCC data
        hcc_entry = hcc_lookup.get(code, {}) if code else {}
        enriched = {
            "code": code,
            "description": desc,
            "hcc": hcc_entry.get("hcc"),
            "hcc_label": hcc_entry.get("disease_group", ""),
            "raf": hcc_entry.get("raf", 0),
            "source": "PCC Active Diagnosis",
        }
        all_diagnoses.append(enriched)

        if enriched["hcc"]:
            confirmed_hccs.append(enriched)
        else:
            non_hcc_codes.append(enriched)

    # Step 2: Medication-diagnosis gap detection
    # Reuse the 100+ drug mapping from code_optimizer
    existing_families = set()
    for dx in req.diagnoses:
        code = dx.get("code", "")
        if code and len(code) >= 3:
            existing_families.add(code[:3])

    med_dx_gaps = []
    for med in req.medications:
        med_name = med.get("name", "") or med.get("full_text", "")
        med_lower = med_name.lower()

        for keyword, (icd_family, fallback_code, condition_name) in MEDICATION_DIAGNOSIS_MAP.items():
            if keyword in med_lower:
                if icd_family not in existing_families:
                    hcc_entry = hcc_lookup.get(fallback_code, {})
                    med_dx_gaps.append({
                        "medication": med_name,
                        "expected_diagnosis": condition_name,
                        "suggested_code": fallback_code,
                        "hcc": hcc_entry.get("hcc"),
                        "raf": hcc_entry.get("raf", 0),
                        "evidence": f"Patient on {med_name} but {condition_name} ({icd_family}.x) not on active diagnosis list",
                        "confidence": 85,
                        "source": "Medication-Diagnosis Gap",
                    })
                break

    # Step 3: Clinical score-based suspects
    score_suspects = []
    scores = req.clinical_scores

    # BIMS → cognitive impairment / dementia suspect
    bims = scores.get("bims")
    if bims is not None and bims <= 12:
        # Check if dementia is already on problem list
        has_dementia = any(
            dx.get("code", "").startswith(("F01", "F02", "F03", "G30", "G31"))
            for dx in req.diagnoses
        )
        if not has_dementia:
            if bims <= 7:
                score_suspects.append({
                    "code": "F03.90",
                    "description": "Unspecified dementia",
                    "hcc": "52",
                    "raf": hcc_lookup.get("F03.90", {}).get("raf", 0.278),
                    "evidence": f"BIMS score {bims}/15 (severe impairment) without dementia on problem list",
                    "confidence": 88,
                    "source": "BIMS Score",
                })
            else:
                score_suspects.append({
                    "code": "G31.84",
                    "description": "Mild cognitive impairment",
                    "hcc": None,
                    "raf": 0,
                    "evidence": f"BIMS score {bims}/15 (moderate impairment) — consider formal cognitive evaluation",
                    "confidence": 75,
                    "source": "BIMS Score",
                })

    # PHQ-9 → depression suspect
    phq9 = scores.get("phq9")
    if phq9 is not None and phq9 >= 10:
        has_depression = any(
            dx.get("code", "").startswith(("F32", "F33"))
            for dx in req.diagnoses
        )
        if not has_depression:
            if phq9 >= 20:
                code, desc = "F33.2", "MDD, recurrent, severe"
            elif phq9 >= 15:
                code, desc = "F33.1", "MDD, recurrent, moderate"
            else:
                code, desc = "F33.0", "MDD, recurrent, mild"

            score_suspects.append({
                "code": code,
                "description": desc,
                "hcc": "155" if phq9 >= 10 else None,
                "raf": hcc_lookup.get(code, {}).get("raf", 0.309),
                "evidence": f"PHQ-9 score {phq9}/27 — {desc.split(',')[-1].strip()} depression indicated",
                "confidence": 82 if phq9 >= 15 else 75,
                "source": "PHQ-9 Score",
            })

    # eGFR → CKD suspect
    egfr = scores.get("egfr")
    if egfr is not None and egfr < 60:
        has_ckd = any(
            dx.get("code", "").startswith("N18")
            for dx in req.diagnoses
        )
        if not has_ckd:
            if egfr < 15:
                code, desc, stage = "N18.5", "CKD Stage 5", "326"
            elif egfr < 30:
                code, desc, stage = "N18.4", "CKD Stage 4", "138"
            elif egfr < 45:
                code, desc, stage = "N18.32", "CKD Stage 3b", "138"
            else:
                code, desc, stage = "N18.31", "CKD Stage 3a", "138"

            score_suspects.append({
                "code": code,
                "description": desc,
                "hcc": stage,
                "raf": hcc_lookup.get(code, {}).get("raf", 0),
                "evidence": f"eGFR {egfr} mL/min without CKD on problem list — {desc}",
                "confidence": 90,
                "source": "eGFR Lab Value",
            })

    # HbA1c → diabetes complication suspect
    a1c = scores.get("hba1c")
    if a1c is not None and a1c >= 6.5:
        has_dm = any(
            dx.get("code", "").startswith("E11")
            for dx in req.diagnoses
        )
        if has_dm:
            # DM is coded — check if it's unspecified vs with complications
            has_complications = any(
                dx.get("code", "").startswith("E11.") and
                not dx.get("code", "").startswith("E11.9")
                for dx in req.diagnoses
            )
            if not has_complications:
                score_suspects.append({
                    "code": "E11.65",
                    "description": "DM2 with hyperglycemia",
                    "hcc": "37",
                    "raf": hcc_lookup.get("E11.65", {}).get("raf", 0.302),
                    "evidence": f"HbA1c {a1c}% with DM coded as unspecified (E11.9, HCC 38) — upgrade to E11.65 (HCC 37) for hyperglycemia",
                    "confidence": 90,
                    "source": "HbA1c + DM Specificity Upgrade",
                })
        elif not has_dm:
            score_suspects.append({
                "code": "E11.9",
                "description": "Type 2 diabetes mellitus, unspecified",
                "hcc": "38",
                "raf": hcc_lookup.get("E11.9", {}).get("raf", 0),
                "evidence": f"HbA1c {a1c}% without diabetes on problem list",
                "confidence": 85,
                "source": "HbA1c Lab Value",
            })

    # Albumin → malnutrition suspect
    albumin = scores.get("albumin")
    if albumin is not None and albumin < 3.5:
        has_malnutrition = any(
            dx.get("code", "").startswith(("E43", "E44", "E46"))
            for dx in req.diagnoses
        )
        if not has_malnutrition:
            if albumin < 2.5:
                code, desc = "E43", "Severe protein-calorie malnutrition"
            elif albumin < 3.0:
                code, desc = "E44.0", "Moderate protein-calorie malnutrition"
            else:
                code, desc = "E44.1", "Mild protein-calorie malnutrition"

            score_suspects.append({
                "code": code,
                "description": desc,
                "hcc": "21",
                "raf": hcc_lookup.get(code, {}).get("raf", 0.455),
                "evidence": f"Albumin {albumin} g/dL — {desc} (HCC 21, high RAF value)",
                "confidence": 85 if albumin < 3.0 else 75,
                "source": "Albumin Lab Value",
            })

    # Braden → pressure ulcer risk (care gap, not a suspect per se)
    braden = scores.get("braden")

    # Step 4: Combine all suspects
    all_suspects = med_dx_gaps + score_suspects
    # Filter to HCC-bearing suspects only for RAF projection
    hcc_suspects = [s for s in all_suspects if s.get("hcc")]

    # Step 5: Calculate RAF
    current_raf_result = calculate_note_raf(all_diagnoses)
    current_raf = current_raf_result["total_raf"]

    projected_diagnoses = all_diagnoses + [
        {"code": s["code"], "hcc": s["hcc"], "raf": s["raf"]}
        for s in hcc_suspects
    ]
    projected_raf_result = calculate_note_raf(projected_diagnoses)
    projected_raf = projected_raf_result["total_raf"]

    raf_delta = round(projected_raf - current_raf, 3)

    # Step 6: Build care gaps
    care_gaps = []
    if braden is not None and braden <= 18:
        care_gaps.append({
            "gap": f"Braden score {braden} — at risk for pressure ulcers",
            "priority": "high" if braden <= 12 else "medium",
        })
    if scores.get("cam") == "positive":
        care_gaps.append({
            "gap": "CAM positive for delirium — evaluate underlying cause",
            "priority": "high",
        })
    if scores.get("fall_risk") and scores["fall_risk"] > 45:
        care_gaps.append({
            "gap": f"Fall risk score {scores['fall_risk']} — high risk",
            "priority": "high",
        })

    return {
        "patient": req.patient,
        "current_raf": current_raf,
        "projected_raf": projected_raf,
        "raf_delta": raf_delta,
        "annualized_impact": round(raf_delta * 11000, 2),
        "confirmed_hccs": confirmed_hccs,
        "hcc_count": len(confirmed_hccs),
        "suspect_hccs": sorted(hcc_suspects, key=lambda s: s.get("raf", 0), reverse=True),
        "suspect_count": len(hcc_suspects),
        "med_dx_gaps": med_dx_gaps,
        "score_suspects": score_suspects,
        "non_hcc_codes": non_hcc_codes,
        "care_gaps": care_gaps,
        "near_misses": current_raf_result.get("near_misses", []),
        "code_status": req.code_status,
        "clinical_scores": req.clinical_scores,
        "raf_groups": current_raf_result.get("groups", []),
        "interactions": current_raf_result.get("interactions", []),
    }
