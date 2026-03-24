"""
OCC/MDS Assessment Parser — Maps MDS 3.0 assessment items to ICD-10 codes
and HCC-relevant clinical findings.

Plugs into the SNF Admit Assist pipeline between document upload and the
coding service. Takes structured OCC/MDS item values and produces:
  1. Confirmed ICD-10 codes (directly derivable from assessment data)
  2. Suspect HCCs (clinical evidence suggests condition, needs physician confirmation)
  3. Specificity hints (OCC data that can upgrade unspecified codes)
  4. Care gap alerts (screenings/assessments indicated by OCC findings)

Consumed by: generate.py pipeline, overlay sidebar, MSO analytics

MDS 3.0 Reference: CMS RAI Manual v3.0, Sections B-I, GG
PDPM ICD-10 Mapping: CMS FY2026 (V2.4000)
"""

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class OCCFinding:
    """A single clinical finding derived from OCC/MDS data."""
    mds_item: str           # e.g. "B0100", "GG0130A1"
    mds_value: str          # Raw value from assessment
    description: str        # Human-readable finding
    icd10_codes: list       # Candidate ICD-10 codes [{code, desc, specificity}]
    hcc: Optional[str]      # HCC number if applicable
    raf: float              # RAF weight if HCC-mapped
    confidence: int         # 0-100, how certain we are this is codeable
    evidence_text: str      # Clinical justification text
    category: str           # "cognitive", "functional", "skin", "mood", "nutrition", "medical", "pain"
    action: str             # "auto_code", "suspect", "specificity_upgrade", "care_gap"
    source: str = "OCC/MDS Assessment"


@dataclass
class OCCParseResult:
    """Complete result of parsing an OCC/MDS assessment."""
    confirmed_codes: list = field(default_factory=list)     # OCCFindings with action="auto_code"
    suspect_hccs: list = field(default_factory=list)        # OCCFindings with action="suspect"
    specificity_upgrades: list = field(default_factory=list) # OCCFindings with action="specificity_upgrade"
    care_gaps: list = field(default_factory=list)           # OCCFindings with action="care_gap"
    functional_summary: dict = field(default_factory=dict)  # GG item summary for note pre-population
    cognitive_summary: dict = field(default_factory=dict)   # BIMS/CAM summary
    raw_items: dict = field(default_factory=dict)           # All parsed MDS items


# ---------------------------------------------------------------------------
# Section B: Hearing, Speech, Vision
# ---------------------------------------------------------------------------

SECTION_B_RULES = {
    # B0100 - Comatose
    "B0100": {
        "1": {
            "desc": "Resident is comatose",
            "codes": [{"code": "R40.20", "desc": "Unspecified coma", "specificity": "needs_detail"}],
            "hcc": "52",  # HCC 52 under V28 — Dementia/Cognitive
            "raf": 0.278,
            "confidence": 95,
            "category": "cognitive",
            "action": "auto_code",
            "evidence": "MDS B0100=1: Resident assessed as comatose on SNF admission assessment",
        },
    },
    # B0200 - Hearing
    "B0200": {
        "2": {
            "desc": "Moderately impaired hearing",
            "codes": [{"code": "H91.90", "desc": "Unspecified hearing loss, unspecified ear", "specificity": "unspecified"}],
            "hcc": None, "raf": 0, "confidence": 70,
            "category": "medical", "action": "suspect",
            "evidence": "MDS B0200=2: Moderate hearing impairment — verify laterality for specific coding",
        },
        "3": {
            "desc": "Severely impaired hearing",
            "codes": [{"code": "H91.90", "desc": "Unspecified hearing loss, unspecified ear", "specificity": "unspecified"}],
            "hcc": None, "raf": 0, "confidence": 80,
            "category": "medical", "action": "auto_code",
            "evidence": "MDS B0200=3: Highly impaired hearing documented on assessment",
        },
    },
}


# ---------------------------------------------------------------------------
# Section C: Cognitive Patterns (BIMS, CAM, Cognitive Skills)
# ---------------------------------------------------------------------------

SECTION_C_RULES = {
    # C0100-C0500 - BIMS (Brief Interview for Mental Status)
    # BIMS total score: C0100 + C0200 + C0300 + C0400 + C0500
    # Score 0-7: severe impairment, 8-12: moderate, 13-15: cognitively intact
    "_BIMS_TOTAL": {
        "range_0_7": {
            "desc": "Severe cognitive impairment (BIMS 0-7)",
            "codes": [
                {"code": "F03.90", "desc": "Unspecified dementia without behavioral disturbance", "specificity": "unspecified"},
                {"code": "R41.840", "desc": "Attention and concentration deficit", "specificity": "symptom"},
            ],
            "hcc": "52", "raf": 0.278, "confidence": 88,
            "category": "cognitive", "action": "suspect",
            "evidence": "BIMS total score {score}/15 indicates severe cognitive impairment — evaluate for dementia diagnosis with specific etiology",
        },
        "range_8_12": {
            "desc": "Moderate cognitive impairment (BIMS 8-12)",
            "codes": [
                {"code": "R41.841", "desc": "Cognitive communication deficit, moderate", "specificity": "symptom"},
                {"code": "G31.84", "desc": "Mild cognitive impairment", "specificity": "specified"},
            ],
            "hcc": None, "raf": 0, "confidence": 75,
            "category": "cognitive", "action": "suspect",
            "evidence": "BIMS total score {score}/15 indicates moderate cognitive impairment — consider formal neurocognitive evaluation",
        },
    },

    # C1310 - Signs and Symptoms of Delirium (CAM)
    # Acute onset + inattention + disorganized thinking OR altered consciousness
    "_CAM_POSITIVE": {
        "positive": {
            "desc": "Delirium identified by CAM assessment",
            "codes": [
                {"code": "R41.0", "desc": "Disorientation, unspecified", "specificity": "symptom"},
                {"code": "F05", "desc": "Delirium due to known physiological condition", "specificity": "specified"},
            ],
            "hcc": "52", "raf": 0.278, "confidence": 90,
            "category": "cognitive", "action": "suspect",
            "evidence": "CAM positive for delirium: acute onset mental status change with inattention — requires physician evaluation for underlying etiology",
        },
    },

    # C0700 - Short-term Memory OK
    "C0700": {
        "1": {  # Memory problem
            "desc": "Short-term memory impairment",
            "codes": [{"code": "R41.3", "desc": "Other amnesia", "specificity": "symptom"}],
            "hcc": None, "raf": 0, "confidence": 65,
            "category": "cognitive", "action": "care_gap",
            "evidence": "MDS C0700=1: Short-term memory problem identified — cognitive evaluation recommended",
        },
    },

    # C0800 - Long-term Memory OK
    "C0800": {
        "1": {
            "desc": "Long-term memory impairment",
            "codes": [{"code": "R41.1", "desc": "Anterograde amnesia", "specificity": "symptom"}],
            "hcc": None, "raf": 0, "confidence": 65,
            "category": "cognitive", "action": "care_gap",
            "evidence": "MDS C0800=1: Long-term memory problem identified — neurocognitive evaluation recommended",
        },
    },

    # C1000 - Cognitive Skills for Daily Decision Making
    "C1000": {
        "2": {
            "desc": "Moderately impaired decision-making",
            "codes": [{"code": "R41.844", "desc": "Frontal lobe and executive function deficit", "specificity": "symptom"}],
            "hcc": None, "raf": 0, "confidence": 70,
            "category": "cognitive", "action": "suspect",
            "evidence": "MDS C1000=2: Moderately impaired cognitive skills for daily decisions",
        },
        "3": {
            "desc": "Severely impaired decision-making",
            "codes": [
                {"code": "F03.90", "desc": "Unspecified dementia without behavioral disturbance", "specificity": "unspecified"},
            ],
            "hcc": "52", "raf": 0.278, "confidence": 85,
            "category": "cognitive", "action": "suspect",
            "evidence": "MDS C1000=3: Severely impaired cognitive skills for daily decisions — strongly suggestive of dementia",
        },
    },
}


# ---------------------------------------------------------------------------
# Section D: Mood (PHQ-9)
# ---------------------------------------------------------------------------

SECTION_D_RULES = {
    # D0300 - PHQ-9 Total Severity Score (0-27)
    "_PHQ9_TOTAL": {
        "range_10_14": {
            "desc": "Moderate depression (PHQ-9 10-14)",
            "codes": [
                {"code": "F33.1", "desc": "Major depressive disorder, recurrent, moderate", "specificity": "specified"},
                {"code": "F32.1", "desc": "Major depressive disorder, single episode, moderate", "specificity": "specified"},
            ],
            "hcc": "155", "raf": 0.309, "confidence": 82,
            "category": "mood", "action": "suspect",
            "evidence": "PHQ-9 score {score}/27 indicates moderate depression — physician evaluation and documentation of MDD recommended",
        },
        "range_15_19": {
            "desc": "Moderately severe depression (PHQ-9 15-19)",
            "codes": [
                {"code": "F33.2", "desc": "Major depressive disorder, recurrent, severe w/o psychotic features", "specificity": "specified"},
            ],
            "hcc": "155", "raf": 0.309, "confidence": 88,
            "category": "mood", "action": "suspect",
            "evidence": "PHQ-9 score {score}/27 indicates moderately severe depression — strong candidate for MDD documentation",
        },
        "range_20_27": {
            "desc": "Severe depression (PHQ-9 20-27)",
            "codes": [
                {"code": "F33.2", "desc": "Major depressive disorder, recurrent, severe w/o psychotic features", "specificity": "specified"},
            ],
            "hcc": "155", "raf": 0.309, "confidence": 92,
            "category": "mood", "action": "suspect",
            "evidence": "PHQ-9 score {score}/27 indicates severe depression — MDD documentation strongly recommended",
        },
    },
}


# ---------------------------------------------------------------------------
# Section GG: Functional Abilities and Goals
# ---------------------------------------------------------------------------

# GG scoring: 06=Independent, 05=Setup/cleanup, 04=Supervision/touching,
# 03=Partial/moderate assist, 02=Substantial/maximal assist, 01=Dependent,
# 07=Refused, 09=Not applicable, 10=Not attempted (environmental), 88=Not attempted (medical)

GG_SELF_CARE_ITEMS = {
    "GG0130A": "Eating",
    "GG0130B": "Oral hygiene",
    "GG0130C": "Toileting hygiene",
    "GG0130E": "Shower/bathe self",
    "GG0130F": "Upper body dressing",
    "GG0130G": "Lower body dressing",
    "GG0130H": "Putting on/taking off footwear",
}

GG_MOBILITY_ITEMS = {
    "GG0170A": "Roll left and right",
    "GG0170B": "Sit to lying",
    "GG0170C": "Lying to sitting on side of bed",
    "GG0170D": "Sit to stand",
    "GG0170E": "Chair/bed-to-chair transfer",
    "GG0170F": "Toilet transfer",
    "GG0170I": "Walk 10 feet",
    "GG0170J": "Walk 50 feet with two turns",
    "GG0170K": "Walk 150 feet",
    "GG0170M": "1 step (curb)",
    "GG0170N": "4 steps",
    "GG0170O": "12 steps",
    "GG0170P": "Picking up object",
    "GG0170R": "Wheel 50 feet with two turns",
    "GG0170S": "Wheel 150 feet",
}

SECTION_GG_RULES = {
    # Functional dependence patterns that suggest specific conditions
    "_TOTAL_DEPENDENCE": {
        # If majority of GG items are 01 (dependent), suggests significant debility
        "threshold": {
            "desc": "Total/near-total functional dependence",
            "codes": [
                {"code": "R53.1", "desc": "Weakness", "specificity": "symptom"},
                {"code": "R26.89", "desc": "Other abnormalities of gait and mobility", "specificity": "symptom"},
                {"code": "M62.81", "desc": "Muscle weakness (generalized)", "specificity": "specified"},
                {"code": "Z74.09", "desc": "Other reduced mobility", "specificity": "specified"},
            ],
            "hcc": None, "raf": 0, "confidence": 70,
            "category": "functional", "action": "care_gap",
            "evidence": "GG assessment shows {dep_count}/{total_count} items at dependent/maximal assist level — evaluate for underlying cause of functional decline",
        },
    },

    # Non-ambulatory (GG0170I/J/K all 01 or 88)
    "_NON_AMBULATORY": {
        "threshold": {
            "desc": "Non-ambulatory status",
            "codes": [
                {"code": "Z99.3", "desc": "Dependence on wheelchair", "specificity": "specified"},
                {"code": "R26.0", "desc": "Ataxic gait", "specificity": "symptom"},
            ],
            "hcc": None, "raf": 0, "confidence": 80,
            "category": "functional", "action": "auto_code",
            "evidence": "GG mobility assessment: Walk 10ft/50ft/150ft all scored as dependent or not attempted due to medical condition — document wheelchair dependence",
        },
    },
}


# ---------------------------------------------------------------------------
# Section I: Active Diagnoses (MDS checkboxes → ICD-10 → HCC)
# These are diagnoses checked on the MDS that we can map directly
# ---------------------------------------------------------------------------

SECTION_I_DIAGNOSIS_MAP = {
    # Heart/Circulation
    "I0200": {"name": "Anemia", "codes": ["D64.9"], "hcc": None},
    "I0300": {"name": "Atrial Fibrillation", "codes": ["I48.91"], "hcc": "96"},
    "I0400": {"name": "Coronary Artery Disease", "codes": ["I25.10"], "hcc": None},
    "I0500": {"name": "Deep Venous Thrombosis", "codes": ["I82.90"], "hcc": "107"},
    "I0600": {"name": "Heart Failure", "codes": ["I50.9"], "hcc": "85",
              "specificity_hint": "Specify systolic/diastolic, acuity (I50.22, I50.32, I50.42)"},
    "I0700": {"name": "Hypertension", "codes": ["I10"], "hcc": None},
    "I0800": {"name": "Peripheral Vascular Disease", "codes": ["I73.9"], "hcc": "108"},

    # GI
    "I1100": {"name": "Cirrhosis", "codes": ["K74.60"], "hcc": "28"},
    "I1200": {"name": "GERD", "codes": ["K21.0"], "hcc": None},
    "I1300": {"name": "Ulcerative Colitis/Crohn's/IBD", "codes": ["K52.9"], "hcc": None},

    # Endocrine
    "I2000": {"name": "Diabetes Mellitus", "codes": ["E11.9"], "hcc": "38",
              "specificity_hint": "Check for complications: nephropathy (E11.65→HCC37), retinopathy (E11.319→HCC37), neuropathy (E11.40→HCC37)"},
    "I2100": {"name": "Hyponatremia", "codes": ["E87.1"], "hcc": None},
    "I2200": {"name": "Hyperkalemia", "codes": ["E87.5"], "hcc": None},
    "I2300": {"name": "Thyroid Disorder", "codes": ["E03.9"], "hcc": None},

    # Musculoskeletal
    "I3400": {"name": "Osteoporosis", "codes": ["M81.0"], "hcc": None},
    "I3500": {"name": "Hip Fracture", "codes": ["S72.009D"], "hcc": "170",
              "specificity_hint": "Specify laterality and fracture type for accurate coding"},
    "I3700": {"name": "Arthritis", "codes": ["M19.90"], "hcc": None},
    "I3800": {"name": "Amputation", "codes": ["Z89.9"], "hcc": "189"},

    # Neurological
    "I4000": {"name": "Alzheimer's Disease", "codes": ["G30.9"], "hcc": "51"},
    "I4200": {"name": "Non-Alzheimer's Dementia", "codes": ["F03.90"], "hcc": "52"},
    "I4300": {"name": "CVA/Stroke", "codes": ["I63.9"], "hcc": "100",
              "specificity_hint": "Use late effect codes if >30 days post (I69.xxx). Specify deficits."},
    "I4400": {"name": "Cerebral Palsy", "codes": ["G80.9"], "hcc": "75"},
    "I4500": {"name": "Hemiplegia/Hemiparesis", "codes": ["G81.90"], "hcc": "103"},
    "I4800": {"name": "Multiple Sclerosis", "codes": ["G35"], "hcc": "75"},
    "I4900": {"name": "Paraplegia", "codes": ["G82.20"], "hcc": "70"},
    "I5000": {"name": "Parkinson's Disease", "codes": ["G20"], "hcc": "73"},
    "I5100": {"name": "Quadriplegia", "codes": ["G82.50"], "hcc": "70"},
    "I5200": {"name": "Seizure Disorder", "codes": ["G40.909"], "hcc": None},
    "I5250": {"name": "TBI", "codes": ["S06.9X9D"], "hcc": "166"},

    # Psychiatric/Mood
    "I5300": {"name": "Anxiety Disorder", "codes": ["F41.9"], "hcc": None},
    "I5400": {"name": "Bipolar Disorder", "codes": ["F31.9"], "hcc": "155"},
    "I5500": {"name": "Depression", "codes": ["F33.9"], "hcc": "155",
              "specificity_hint": "Specify severity: mild (F33.0), moderate (F33.1→HCC155), severe (F33.2→HCC155)"},
    "I5600": {"name": "Schizophrenia", "codes": ["F20.9"], "hcc": "57"},
    "I5700": {"name": "PTSD", "codes": ["F43.10"], "hcc": None},

    # Pulmonary
    "I6000": {"name": "Asthma/COPD/Chronic Lung Disease", "codes": ["J44.1"], "hcc": "111",
              "specificity_hint": "Distinguish asthma (J45.xx) vs COPD (J44.x). Specify exacerbation status."},

    # Skin
    "I7900": {"name": "Skin Ulcer (not pressure)", "codes": ["L97.909"], "hcc": "161"},

    # Infections
    "I8000": {"name": "Pneumonia", "codes": ["J18.9"], "hcc": "114"},
    "I8500": {"name": "HIV/AIDS", "codes": ["B20"], "hcc": "1"},

    # Renal
    "I1500": {"name": "Renal Insufficiency/Failure/ESRD", "codes": ["N18.9"], "hcc": "138",
              "specificity_hint": "MUST specify stage: Stage 3a (N18.31→HCC138), 3b (N18.32→HCC138), 4 (N18.4→HCC138), 5 (N18.5→HCC326). Check eGFR for staging."},
}


# ---------------------------------------------------------------------------
# Section M: Skin Conditions — Pressure Ulcers
# ---------------------------------------------------------------------------

SECTION_M_PRESSURE_ULCER = {
    # M0300 - Current Number of Unhealed Pressure Ulcers at Each Stage
    "M0300A": {"stage": 1, "codes": ["L89.90"], "hcc": None, "raf": 0,
               "desc": "Stage 1 pressure ulcer"},
    "M0300B1": {"stage": 2, "codes": ["L89.90"], "hcc": "382", "raf": 0.234,
                "desc": "Stage 2 pressure ulcer",
                "specificity_hint": "Specify anatomic site for proper coding (sacral L89.15x, hip L89.2xx, etc.)"},
    "M0300C1": {"stage": 3, "codes": ["L89.90"], "hcc": "381", "raf": 0.516,
                "desc": "Stage 3 pressure ulcer",
                "specificity_hint": "Specify anatomic site. Stage 3 = full thickness tissue loss"},
    "M0300D1": {"stage": 4, "codes": ["L89.90"], "hcc": "379", "raf": 0.516,
                "desc": "Stage 4 pressure ulcer",
                "specificity_hint": "Specify anatomic site. Stage 4 = full thickness with exposed bone/tendon"},
    "M0300E1": {"stage": "unstageable_deep_tissue", "codes": ["L89.90"], "hcc": "381", "raf": 0.516,
                "desc": "Unstageable pressure ulcer — deep tissue injury",
                "specificity_hint": "Specify anatomic site. Document reason unstageable (slough/eschar)."},
    "M0300F1": {"stage": "unstageable_slough", "codes": ["L89.90"], "hcc": "381", "raf": 0.516,
                "desc": "Unstageable pressure ulcer — slough/eschar",
                "specificity_hint": "Specify anatomic site."},
}


# ---------------------------------------------------------------------------
# Section K: Nutritional Status
# ---------------------------------------------------------------------------

SECTION_K_RULES = {
    # K0300 - Weight Loss
    "K0300": {
        "1": {  # 5%+ in last month or 10%+ in last 6 months
            "desc": "Significant weight loss",
            "codes": [
                {"code": "R63.4", "desc": "Abnormal weight loss", "specificity": "symptom"},
                {"code": "E44.0", "desc": "Moderate protein-calorie malnutrition", "specificity": "specified"},
            ],
            "hcc": "21", "raf": 0.455, "confidence": 80,
            "category": "nutrition", "action": "suspect",
            "evidence": "MDS K0300=1: Weight loss ≥5% in 30 days or ≥10% in 180 days — evaluate for protein-calorie malnutrition. If albumin <3.5 and BMI <22, high probability of HCC 21.",
        },
    },

    # K0510A - Parenteral/IV Feeding
    "K0510A": {
        "1": {
            "desc": "Receiving parenteral/IV nutrition",
            "codes": [
                {"code": "E44.0", "desc": "Moderate protein-calorie malnutrition", "specificity": "specified"},
                {"code": "Z99.11", "desc": "Dependence on parenteral nutrition", "specificity": "status"},
            ],
            "hcc": "21", "raf": 0.455, "confidence": 85,
            "category": "nutrition", "action": "suspect",
            "evidence": "MDS K0510A=1: On parenteral nutrition — strongly suggests protein-calorie malnutrition (HCC 21, RAF 0.455)",
        },
    },

    # K0510B - Tube Feeding
    "K0510B": {
        "1": {
            "desc": "Receiving tube feeding",
            "codes": [
                {"code": "Z93.1", "desc": "Gastrostomy status", "specificity": "status"},
                {"code": "R13.10", "desc": "Dysphagia, unspecified", "specificity": "unspecified"},
            ],
            "hcc": None, "raf": 0, "confidence": 75,
            "category": "nutrition", "action": "suspect",
            "evidence": "MDS K0510B=1: Tube feeding — evaluate for dysphagia etiology and malnutrition status",
        },
    },
}


# ---------------------------------------------------------------------------
# Section J: Health Conditions — Pain, Falls, Dyspnea
# ---------------------------------------------------------------------------

SECTION_J_RULES = {
    # J0300-J0600 - Pain Assessment
    "_PAIN_SEVERE": {
        "threshold": {
            "desc": "Severe pain identified",
            "codes": [
                {"code": "G89.29", "desc": "Other chronic pain", "specificity": "specified"},
                {"code": "G89.4", "desc": "Chronic pain syndrome", "specificity": "specified"},
            ],
            "hcc": None, "raf": 0, "confidence": 70,
            "category": "pain", "action": "care_gap",
            "evidence": "MDS pain assessment indicates severe pain (score {score}) — evaluate for chronic pain documentation and management plan",
        },
    },

    # J1100A - Shortness of Breath
    "J1100A": {
        "1": {
            "desc": "Shortness of breath with exertion",
            "codes": [
                {"code": "R06.00", "desc": "Dyspnea, unspecified", "specificity": "symptom"},
            ],
            "hcc": None, "raf": 0, "confidence": 65,
            "category": "medical", "action": "care_gap",
            "evidence": "MDS J1100A=1: Dyspnea on exertion — evaluate for underlying cause (CHF, COPD, anemia)",
        },
    },

    # J1800 - Any Falls Since Admission
    "J1800": {
        "1": {
            "desc": "Falls documented since admission/prior assessment",
            "codes": [
                {"code": "R29.6", "desc": "Repeated falls", "specificity": "specified"},
                {"code": "Z91.81", "desc": "History of falling", "specificity": "status"},
            ],
            "hcc": None, "raf": 0, "confidence": 85,
            "category": "functional", "action": "auto_code",
            "evidence": "MDS J1800=1: Falls documented — code R29.6 for repeated falls and evaluate fall etiology",
        },
    },
}


# ---------------------------------------------------------------------------
# Core parsing engine
# ---------------------------------------------------------------------------

def parse_occ_assessment(items: dict, hospital_diagnoses: list = None) -> OCCParseResult:
    """
    Parse OCC/MDS assessment items and generate clinical findings.

    Args:
        items: dict of MDS item codes to values, e.g. {"B0100": "0", "C0500": "13", "D0300": "08"}
        hospital_diagnoses: optional list of diagnosis strings from hospital discharge (for cross-referencing)

    Returns:
        OCCParseResult with confirmed codes, suspects, specificity upgrades, care gaps
    """
    result = OCCParseResult(raw_items=items)
    findings = []

    # --- Section B: Hearing/Vision ---
    findings.extend(_apply_section_rules(items, SECTION_B_RULES))

    # --- Section C: Cognitive ---
    findings.extend(_apply_section_rules(items, SECTION_C_RULES))
    bims_score = _calculate_bims(items)
    if bims_score is not None:
        result.cognitive_summary["bims_score"] = bims_score
        result.cognitive_summary["bims_interpretation"] = (
            "Severe impairment" if bims_score <= 7
            else "Moderate impairment" if bims_score <= 12
            else "Intact"
        )
        findings.extend(_apply_bims_rules(bims_score))

    cam_result = _evaluate_cam(items)
    if cam_result:
        result.cognitive_summary["cam_positive"] = True
        findings.extend(_apply_cam_rules())

    # --- Section D: Mood (PHQ-9) ---
    findings.extend(_apply_section_rules(items, SECTION_D_RULES))
    phq9_score = _calculate_phq9(items)
    if phq9_score is not None:
        result.cognitive_summary["phq9_score"] = phq9_score
        findings.extend(_apply_phq9_rules(phq9_score))

    # --- Section GG: Functional Abilities ---
    func_summary = _analyze_functional_status(items)
    result.functional_summary = func_summary
    findings.extend(_apply_functional_rules(func_summary))

    # --- Section I: Active Diagnoses ---
    findings.extend(_parse_section_i(items))

    # --- Section K: Nutritional Status ---
    findings.extend(_apply_section_rules(items, SECTION_K_RULES))

    # --- Section J: Health Conditions ---
    findings.extend(_apply_section_rules(items, SECTION_J_RULES))

    # --- Section M: Pressure Ulcers ---
    findings.extend(_parse_pressure_ulcers(items))

    # --- Cross-reference with hospital diagnoses ---
    if hospital_diagnoses:
        findings = _cross_reference_hospital(findings, hospital_diagnoses)

    # Categorize findings
    for f in findings:
        if f.action == "auto_code":
            result.confirmed_codes.append(f)
        elif f.action == "suspect":
            result.suspect_hccs.append(f)
        elif f.action == "specificity_upgrade":
            result.specificity_upgrades.append(f)
        elif f.action == "care_gap":
            result.care_gaps.append(f)

    # Sort suspects by RAF value descending
    result.suspect_hccs.sort(key=lambda f: f.raf, reverse=True)
    result.confirmed_codes.sort(key=lambda f: f.raf, reverse=True)

    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _apply_section_rules(items: dict, rules: dict) -> list:
    """Apply a section's rule mapping to the provided items."""
    findings = []
    for item_code, value_rules in rules.items():
        if item_code.startswith("_"):
            continue  # Skip computed rules (BIMS, PHQ9, etc.)
        value = items.get(item_code)
        if value is not None and str(value) in value_rules:
            rule = value_rules[str(value)]
            findings.append(OCCFinding(
                mds_item=item_code,
                mds_value=str(value),
                description=rule["desc"],
                icd10_codes=rule["codes"],
                hcc=rule.get("hcc"),
                raf=rule.get("raf", 0),
                confidence=rule.get("confidence", 70),
                evidence_text=rule.get("evidence", ""),
                category=rule.get("category", "medical"),
                action=rule.get("action", "suspect"),
            ))
    return findings


def _calculate_bims(items: dict) -> int | None:
    """Calculate BIMS total from C0200-C0500 items."""
    bims_items = ["C0200", "C0300", "C0400", "C0500"]
    values = []
    for item in bims_items:
        val = items.get(item)
        if val is not None:
            try:
                values.append(int(val))
            except ValueError:
                pass
    return sum(values) if len(values) >= 3 else None


def _apply_bims_rules(score: int) -> list:
    """Generate findings based on BIMS total score."""
    findings = []
    rules = SECTION_C_RULES["_BIMS_TOTAL"]
    if score <= 7:
        rule = rules["range_0_7"]
    elif score <= 12:
        rule = rules["range_8_12"]
    else:
        return findings  # Cognitively intact

    findings.append(OCCFinding(
        mds_item="BIMS_TOTAL",
        mds_value=str(score),
        description=rule["desc"],
        icd10_codes=rule["codes"],
        hcc=rule.get("hcc"),
        raf=rule.get("raf", 0),
        confidence=rule.get("confidence", 70),
        evidence_text=rule["evidence"].format(score=score),
        category=rule["category"],
        action=rule["action"],
    ))
    return findings


def _evaluate_cam(items: dict) -> bool:
    """Evaluate CAM (Confusion Assessment Method) from C1310 items."""
    # CAM positive = acute onset (C1310A=1) + inattention (C1310B=1)
    #                + (disorganized thinking (C1310C=1) OR altered consciousness (C1310D=1))
    acute_onset = items.get("C1310A") == "1"
    inattention = items.get("C1310B") == "1"
    disorganized = items.get("C1310C") == "1"
    altered_loc = items.get("C1310D") == "1"
    return acute_onset and inattention and (disorganized or altered_loc)


def _apply_cam_rules() -> list:
    """Generate findings for CAM-positive delirium."""
    rule = SECTION_C_RULES["_CAM_POSITIVE"]["positive"]
    return [OCCFinding(
        mds_item="CAM_COMPOSITE",
        mds_value="positive",
        description=rule["desc"],
        icd10_codes=rule["codes"],
        hcc=rule.get("hcc"),
        raf=rule.get("raf", 0),
        confidence=rule.get("confidence", 90),
        evidence_text=rule["evidence"],
        category=rule["category"],
        action=rule["action"],
    )]


def _calculate_phq9(items: dict) -> int | None:
    """Calculate PHQ-9 total from D0200-D0300 items."""
    # D0200A1-D0200I1 are the 9 PHQ items, or D0300 is the total
    d0300 = items.get("D0300")
    if d0300 is not None:
        try:
            return int(d0300)
        except ValueError:
            pass

    # Fallback: sum individual items
    phq_items = [f"D0200{chr(65+i)}1" for i in range(9)]  # D0200A1 through D0200I1
    values = []
    for item in phq_items:
        val = items.get(item)
        if val is not None:
            try:
                values.append(int(val))
            except ValueError:
                pass
    return sum(values) if len(values) >= 7 else None


def _apply_phq9_rules(score: int) -> list:
    """Generate findings based on PHQ-9 score."""
    findings = []
    rules = SECTION_D_RULES["_PHQ9_TOTAL"]
    if 10 <= score <= 14:
        rule = rules["range_10_14"]
    elif 15 <= score <= 19:
        rule = rules["range_15_19"]
    elif score >= 20:
        rule = rules["range_20_27"]
    else:
        return findings  # Score < 10, minimal/mild

    findings.append(OCCFinding(
        mds_item="PHQ9_TOTAL",
        mds_value=str(score),
        description=rule["desc"],
        icd10_codes=rule["codes"],
        hcc=rule.get("hcc"),
        raf=rule.get("raf", 0),
        confidence=rule.get("confidence", 80),
        evidence_text=rule["evidence"].format(score=score),
        category=rule["category"],
        action=rule["action"],
    ))
    return findings


def _analyze_functional_status(items: dict) -> dict:
    """Analyze GG functional items for summary and clinical triggers."""
    self_care_scores = {}
    mobility_scores = {}

    for item, label in GG_SELF_CARE_ITEMS.items():
        # Admission performance is coded as item + "1" (e.g. GG0130A1)
        val = items.get(item + "1") or items.get(item)
        if val is not None:
            try:
                score = int(val)
                if score <= 6:  # Valid functional scores only
                    self_care_scores[label] = score
            except ValueError:
                pass

    for item, label in GG_MOBILITY_ITEMS.items():
        val = items.get(item + "1") or items.get(item)
        if val is not None:
            try:
                score = int(val)
                if score <= 6:
                    mobility_scores[label] = score
            except ValueError:
                pass

    # Calculate averages and dependence counts
    all_scores = list(self_care_scores.values()) + list(mobility_scores.values())
    dep_count = sum(1 for s in all_scores if s <= 2)  # Dependent or maximal assist
    assist_count = sum(1 for s in all_scores if s <= 3)  # Including moderate assist
    total = len(all_scores)

    return {
        "self_care": self_care_scores,
        "mobility": mobility_scores,
        "avg_self_care": round(sum(self_care_scores.values()) / max(len(self_care_scores), 1), 1),
        "avg_mobility": round(sum(mobility_scores.values()) / max(len(mobility_scores), 1), 1),
        "dependent_count": dep_count,
        "assist_count": assist_count,
        "total_items": total,
        "non_ambulatory": all(
            mobility_scores.get(k, 6) <= 1
            for k in ["Walk 10 feet", "Walk 50 feet with two turns", "Walk 150 feet"]
            if k in mobility_scores
        ) if mobility_scores else False,
    }


def _apply_functional_rules(func_summary: dict) -> list:
    """Generate findings based on functional status analysis."""
    findings = []

    # Non-ambulatory check
    if func_summary.get("non_ambulatory"):
        rule = SECTION_GG_RULES["_NON_AMBULATORY"]["threshold"]
        findings.append(OCCFinding(
            mds_item="GG_MOBILITY_COMPOSITE",
            mds_value="non_ambulatory",
            description=rule["desc"],
            icd10_codes=rule["codes"],
            hcc=rule.get("hcc"),
            raf=rule.get("raf", 0),
            confidence=rule.get("confidence", 80),
            evidence_text=rule["evidence"],
            category=rule["category"],
            action=rule["action"],
        ))

    # Total dependence check
    total = func_summary.get("total_items", 0)
    dep = func_summary.get("dependent_count", 0)
    if total > 0 and dep / total >= 0.6:
        rule = SECTION_GG_RULES["_TOTAL_DEPENDENCE"]["threshold"]
        findings.append(OCCFinding(
            mds_item="GG_DEPENDENCE_COMPOSITE",
            mds_value=f"{dep}/{total}",
            description=rule["desc"],
            icd10_codes=rule["codes"],
            hcc=rule.get("hcc"),
            raf=rule.get("raf", 0),
            confidence=rule.get("confidence", 70),
            evidence_text=rule["evidence"].format(dep_count=dep, total_count=total),
            category=rule["category"],
            action=rule["action"],
        ))

    return findings


def _parse_section_i(items: dict) -> list:
    """Parse Section I active diagnosis checkboxes."""
    findings = []
    for item_code, dx_info in SECTION_I_DIAGNOSIS_MAP.items():
        val = items.get(item_code)
        if val == "1" or val == 1:  # Checked
            hcc = dx_info.get("hcc")
            has_specificity_hint = "specificity_hint" in dx_info

            action = "auto_code"
            if has_specificity_hint and hcc:
                action = "specificity_upgrade"  # We can code it but could upgrade

            findings.append(OCCFinding(
                mds_item=item_code,
                mds_value="1",
                description=f"Active diagnosis: {dx_info['name']}",
                icd10_codes=[{"code": c, "desc": dx_info["name"], "specificity": "from_mds"} for c in dx_info["codes"]],
                hcc=hcc,
                raf=0,  # Will be enriched by coding_service
                confidence=90,
                evidence_text=f"MDS Section I {item_code} checked: {dx_info['name']} documented as active diagnosis"
                    + (f". NOTE: {dx_info['specificity_hint']}" if has_specificity_hint else ""),
                category="medical",
                action=action,
            ))
    return findings


def _parse_pressure_ulcers(items: dict) -> list:
    """Parse Section M pressure ulcer items."""
    findings = []
    for item_code, pu_info in SECTION_M_PRESSURE_ULCER.items():
        val = items.get(item_code)
        if val is not None:
            try:
                count = int(val)
            except ValueError:
                continue
            if count > 0:
                findings.append(OCCFinding(
                    mds_item=item_code,
                    mds_value=str(count),
                    description=f"{pu_info['desc']} (x{count})",
                    icd10_codes=[{"code": c, "desc": pu_info["desc"], "specificity": "needs_site"} for c in pu_info["codes"]],
                    hcc=pu_info.get("hcc"),
                    raf=pu_info.get("raf", 0),
                    confidence=92,
                    evidence_text=f"MDS {item_code}: {count} {pu_info['desc']}(s) documented. "
                        + (pu_info.get("specificity_hint", "")),
                    category="skin",
                    action="auto_code" if not pu_info.get("specificity_hint") else "specificity_upgrade",
                ))
    return findings


def _cross_reference_hospital(findings: list, hospital_dx: list) -> list:
    """Cross-reference OCC findings with hospital discharge diagnoses.

    Boosts confidence when hospital data confirms OCC findings.
    Adds suspects when hospital dx aren't captured in OCC.
    """
    hospital_dx_lower = [dx.lower() for dx in hospital_dx]

    for finding in findings:
        # Check if any hospital dx mentions the same condition
        for dx in hospital_dx_lower:
            for code_info in finding.icd10_codes:
                code_desc = code_info.get("desc", "").lower()
                # Simple keyword overlap check
                keywords = code_desc.split()
                if any(kw in dx for kw in keywords if len(kw) > 4):
                    finding.confidence = min(finding.confidence + 8, 99)
                    finding.evidence_text += f" | CONFIRMED by hospital record: '{dx}'"
                    break

    return findings


# ---------------------------------------------------------------------------
# Pipeline integration: convert OCC findings to coding_service-compatible format
# ---------------------------------------------------------------------------

def occ_findings_to_extractions(result: OCCParseResult) -> list:
    """Convert OCCParseResult into the extraction format expected by
    the existing SNF Admit Assist pipeline (hpi_service/coding_service).

    This allows OCC data to flow through the same code_optimizer → raf_service
    pipeline that hospital documents use.
    """
    # Build a synthetic "extraction" that looks like a Pass 1 output
    diagnoses = []
    key_findings = []

    for finding in result.confirmed_codes + result.suspect_hccs + result.specificity_upgrades:
        for code_info in finding.icd10_codes:
            diagnoses.append(f"{finding.description} [{code_info['code']}]")

        key_findings.append({
            "finding": finding.description,
            "type": "assessment",
            "value": finding.mds_value,
            "units": None,
            "date": None,
            "abnormal": finding.action in ("suspect", "auto_code"),
        })

    return [{
        "document_type": "occ_mds_assessment",
        "dates": {"document_date": None, "admission": None, "discharge": None},
        "demographics": {},
        "diagnoses": diagnoses,
        "key_findings": key_findings,
        "assessment_and_plans": [],
        "medications": [],
        "allergies": [],
        "code_status": None,
        "_source": {
            "document_type": "occ_mds_assessment",
            "document_index": -1,  # Special marker for OCC data
            "start_page": None,
            "end_page": None,
        },
    }]


def occ_findings_to_note_sections(result: OCCParseResult, patient_name: str = "") -> dict:
    """Generate pre-populated note sections from OCC findings for the clinician.

    Returns dict with HPI snippet, problem list entries, and A&P entries
    ready to merge into the SNF admission note.
    """
    sections = {
        "functional_status_paragraph": "",
        "cognitive_status_paragraph": "",
        "skin_assessment_paragraph": "",
        "mood_paragraph": "",
        "nutritional_paragraph": "",
        "problem_list_additions": [],
        "care_gap_alerts": [],
    }

    # Functional status narrative
    fs = result.functional_summary
    if fs.get("self_care") or fs.get("mobility"):
        sc_avg = fs.get("avg_self_care", 0)
        mob_avg = fs.get("avg_mobility", 0)
        sc_label = "independent" if sc_avg >= 5 else "supervision" if sc_avg >= 4 else "moderate assist" if sc_avg >= 3 else "maximal assist" if sc_avg >= 2 else "dependent"
        mob_label = "independent" if mob_avg >= 5 else "supervision" if mob_avg >= 4 else "moderate assist" if mob_avg >= 3 else "maximal assist" if mob_avg >= 2 else "dependent"

        sections["functional_status_paragraph"] = (
            f"Functional assessment on admission: Self-care overall {sc_label} level "
            f"(avg score {sc_avg}/6). Mobility overall {mob_label} level "
            f"(avg score {mob_avg}/6). "
        )
        if fs.get("non_ambulatory"):
            sections["functional_status_paragraph"] += "Patient is non-ambulatory per GG mobility assessment. "
        sections["functional_status_paragraph"] += (
            f"{fs.get('dependent_count', 0)} of {fs.get('total_items', 0)} items at dependent/maximal assist level."
        )

    # Cognitive summary
    cs = result.cognitive_summary
    if cs.get("bims_score") is not None:
        sections["cognitive_status_paragraph"] = (
            f"BIMS score: {cs['bims_score']}/15 ({cs.get('bims_interpretation', 'N/A')}). "
        )
        if cs.get("cam_positive"):
            sections["cognitive_status_paragraph"] += "CAM positive for delirium. "
        if cs.get("phq9_score") is not None:
            sections["cognitive_status_paragraph"] += f"PHQ-9: {cs['phq9_score']}/27. "

    # Build problem list additions from confirmed + suspects
    for finding in result.confirmed_codes + result.suspect_hccs:
        if finding.icd10_codes:
            primary_code = finding.icd10_codes[0]
            sections["problem_list_additions"].append({
                "problem": finding.description,
                "icd10": primary_code["code"],
                "hcc": finding.hcc,
                "raf": finding.raf,
                "evidence": finding.evidence_text,
                "status": "confirmed" if finding.action == "auto_code" else "suspect",
                "source": f"OCC/MDS {finding.mds_item}",
            })

    # Care gap alerts
    for finding in result.care_gaps:
        sections["care_gap_alerts"].append({
            "alert": finding.description,
            "evidence": finding.evidence_text,
            "action_needed": f"Evaluate and document: {finding.icd10_codes[0]['desc']}" if finding.icd10_codes else finding.description,
        })

    return sections
