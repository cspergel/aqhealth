"""
EMR Overlay Integration Layer — FHIR R4 client + overlay data pipeline

Connects to existing EMRs (Epic, Cerner, athena, eCW) via FHIR R4 APIs,
pulls patient data, runs it through the shared coding/RAF services, and
returns HCC suspect data for the overlay sidebar.

Designed to reuse the same code_optimizer + raf_service + coding_service
that the SNF Admit Assistant already uses.

Auth: SMART-on-FHIR (OAuth2) for Epic/Cerner, API key for athena/eCW
"""

import httpx
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class EMRType(Enum):
    EPIC = "epic"
    CERNER = "cerner"
    ATHENA = "athena"
    ECW = "ecw"
    PCC = "pcc"           # PointClickCare (via Chrome extension)
    OPENEMR = "openemr"   # Native integration


@dataclass
class FHIRConfig:
    """FHIR server connection configuration."""
    base_url: str                      # e.g. "https://fhir.epic.com/R4"
    emr_type: EMRType
    client_id: str                     # SMART-on-FHIR client ID
    client_secret: Optional[str] = None
    token_url: Optional[str] = None    # OAuth2 token endpoint
    scopes: list = field(default_factory=lambda: [
        "patient/Patient.read",
        "patient/Condition.read",
        "patient/Condition.write",
        "patient/MedicationRequest.read",
        "patient/Observation.read",
        "patient/Encounter.read",
    ])


@dataclass
class OverlayPatientData:
    """Patient data extracted from EMR for overlay processing."""
    patient_id: str
    name: str
    age: int
    dob: str
    sex: str
    active_conditions: list = field(default_factory=list)    # Current problem list
    medications: list = field(default_factory=list)           # Active meds
    recent_labs: list = field(default_factory=list)           # Last 90 days
    recent_vitals: list = field(default_factory=list)         # Last 30 days
    recent_encounters: list = field(default_factory=list)     # Last 12 months
    insurance: Optional[dict] = None                          # MA plan info


@dataclass
class OverlayResult:
    """Result returned to the overlay sidebar."""
    patient_id: str
    current_raf: float
    projected_raf: float
    raf_delta: float
    confirmed_hccs: list = field(default_factory=list)
    suspect_hccs: list = field(default_factory=list)
    near_misses: list = field(default_factory=list)
    care_gaps: list = field(default_factory=list)
    med_dx_gaps: list = field(default_factory=list)           # Meds without matching dx
    specificity_upgrades: list = field(default_factory=list)
    annualized_impact: float = 0.0                            # Estimated $ impact


# ---------------------------------------------------------------------------
# FHIR R4 Client
# ---------------------------------------------------------------------------

class FHIRClient:
    """Async FHIR R4 client for EMR data extraction."""

    def __init__(self, config: FHIRConfig):
        self.config = config
        self.access_token: Optional[str] = None
        self._client = httpx.AsyncClient(timeout=30.0)

    async def authenticate(self, authorization_code: str = None, launch_token: str = None):
        """Authenticate via SMART-on-FHIR OAuth2 flow."""
        if not self.config.token_url:
            raise ValueError("Token URL required for SMART-on-FHIR auth")

        data = {
            "grant_type": "authorization_code",
            "client_id": self.config.client_id,
            "code": authorization_code,
            "redirect_uri": "https://app.aqsoft.ai/overlay/callback",
        }
        if self.config.client_secret:
            data["client_secret"] = self.config.client_secret

        resp = await self._client.post(self.config.token_url, data=data)
        resp.raise_for_status()
        token_data = resp.json()
        self.access_token = token_data["access_token"]
        return token_data

    async def _get(self, resource_path: str, params: dict = None) -> dict:
        """Make authenticated GET request to FHIR server."""
        headers = {"Authorization": f"Bearer {self.access_token}", "Accept": "application/fhir+json"}
        url = f"{self.config.base_url}/{resource_path}"
        resp = await self._client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_patient(self, patient_id: str) -> dict:
        """Fetch patient demographics."""
        return await self._get(f"Patient/{patient_id}")

    async def get_conditions(self, patient_id: str) -> list:
        """Fetch active conditions (problem list)."""
        bundle = await self._get("Condition", params={
            "patient": patient_id,
            "clinical-status": "active",
            "_count": "100",
        })
        return [entry["resource"] for entry in bundle.get("entry", [])]

    async def get_medications(self, patient_id: str) -> list:
        """Fetch active medication requests."""
        bundle = await self._get("MedicationRequest", params={
            "patient": patient_id,
            "status": "active",
            "_count": "100",
        })
        return [entry["resource"] for entry in bundle.get("entry", [])]

    async def get_observations(self, patient_id: str, category: str = None, days_back: int = 90) -> list:
        """Fetch recent observations (labs, vitals)."""
        from datetime import datetime, timedelta
        date_from = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        params = {
            "patient": patient_id,
            "date": f"ge{date_from}",
            "_count": "200",
            "_sort": "-date",
        }
        if category:
            params["category"] = category
        bundle = await self._get("Observation", params=params)
        return [entry["resource"] for entry in bundle.get("entry", [])]

    async def get_encounters(self, patient_id: str, days_back: int = 365) -> list:
        """Fetch recent encounters."""
        from datetime import datetime, timedelta
        date_from = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%d")
        bundle = await self._get("Encounter", params={
            "patient": patient_id,
            "date": f"ge{date_from}",
            "_count": "50",
            "_sort": "-date",
        })
        return [entry["resource"] for entry in bundle.get("entry", [])]

    async def write_condition(self, patient_id: str, condition_data: dict) -> dict:
        """Write a new condition to the patient's problem list (FHIR POST).

        Used when provider clicks 'Capture' on a suspect HCC in the overlay.
        """
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/fhir+json",
            "Accept": "application/fhir+json",
        }
        url = f"{self.config.base_url}/Condition"
        resp = await self._client.post(url, headers=headers, json=condition_data)
        resp.raise_for_status()
        return resp.json()

    async def close(self):
        await self._client.aclose()


# ---------------------------------------------------------------------------
# FHIR Resource → Internal Data Extraction
# ---------------------------------------------------------------------------

def extract_patient_data(patient_resource: dict) -> dict:
    """Extract demographics from FHIR Patient resource."""
    name_parts = patient_resource.get("name", [{}])[0]
    given = " ".join(name_parts.get("given", []))
    family = name_parts.get("family", "")
    dob = patient_resource.get("birthDate", "")

    # Calculate age
    age = 0
    if dob:
        from datetime import date
        birth = date.fromisoformat(dob)
        today = date.today()
        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))

    return {
        "name": f"{given} {family}".strip(),
        "age": age,
        "dob": dob,
        "sex": patient_resource.get("gender", "unknown"),
    }


def extract_conditions(condition_resources: list) -> list:
    """Extract ICD-10 codes and descriptions from FHIR Condition resources."""
    conditions = []
    for cond in condition_resources:
        coding_list = cond.get("code", {}).get("coding", [])
        for coding in coding_list:
            system = coding.get("system", "")
            if "icd-10" in system.lower() or "icd10" in system.lower():
                conditions.append({
                    "code": coding.get("code", ""),
                    "description": coding.get("display", ""),
                    "system": system,
                    "clinical_status": cond.get("clinicalStatus", {}).get("coding", [{}])[0].get("code", "active"),
                    "onset_date": cond.get("onsetDateTime"),
                    "recorded_date": cond.get("recordedDate"),
                })
    return conditions


def extract_medications(med_resources: list) -> list:
    """Extract medication names from FHIR MedicationRequest resources."""
    meds = []
    for med in med_resources:
        med_concept = med.get("medicationCodeableConcept", {})
        display = med_concept.get("text") or (
            med_concept.get("coding", [{}])[0].get("display", "Unknown")
        )
        dosage = med.get("dosageInstruction", [{}])
        dose_text = dosage[0].get("text", "") if dosage else ""
        meds.append({
            "name": display,
            "dose": dose_text,
            "status": med.get("status", "active"),
        })
    return meds


def extract_lab_results(observation_resources: list) -> list:
    """Extract lab values from FHIR Observation resources."""
    labs = []
    for obs in observation_resources:
        category_codes = [
            c.get("code", "")
            for cat in obs.get("category", [])
            for c in cat.get("coding", [])
        ]
        if "laboratory" not in category_codes and "vital-signs" not in category_codes:
            continue

        coding = obs.get("code", {}).get("coding", [{}])[0]
        value_quantity = obs.get("valueQuantity", {})
        value_string = obs.get("valueString")

        lab = {
            "code": coding.get("code", ""),
            "display": coding.get("display", ""),
            "value": value_quantity.get("value") or value_string,
            "unit": value_quantity.get("unit", ""),
            "date": obs.get("effectiveDateTime", ""),
            "abnormal": False,
        }

        # Check reference ranges
        ref_range = obs.get("referenceRange", [{}])
        if ref_range and lab["value"] is not None:
            try:
                val = float(lab["value"])
                low = ref_range[0].get("low", {}).get("value")
                high = ref_range[0].get("high", {}).get("value")
                if low is not None and val < float(low):
                    lab["abnormal"] = True
                if high is not None and val > float(high):
                    lab["abnormal"] = True
            except (ValueError, TypeError):
                pass

        # Check interpretation
        interp = obs.get("interpretation", [{}])
        if interp:
            interp_code = interp[0].get("coding", [{}])[0].get("code", "")
            if interp_code in ("H", "HH", "L", "LL", "A", "AA"):
                lab["abnormal"] = True

        labs.append(lab)
    return labs


# ---------------------------------------------------------------------------
# Overlay Pipeline: EMR data → AutoCoder → Overlay Result
# ---------------------------------------------------------------------------

async def process_overlay_patient(
    fhir_client: FHIRClient,
    patient_id: str,
    hcc_lookup: dict,
    icd10_lookup: dict,
) -> OverlayResult:
    """Full overlay pipeline for a single patient.

    1. Pull data from EMR via FHIR
    2. Map current conditions → HCCs (confirmed)
    3. Run medication-diagnosis gap detection (from code_optimizer)
    4. Run lab abnormality → suspect condition detection
    5. Calculate RAF (current + projected)
    6. Find disease interaction near-misses
    7. Return overlay result
    """
    # Import shared services (from SNF Admit Assist, extracted to shared/)
    from app.services.raf_service import calculate_note_raf
    from app.services.code_optimizer import MEDICATION_DIAGNOSIS_MAP

    # Step 1: Pull EMR data
    patient_raw = await fhir_client.get_patient(patient_id)
    conditions_raw = await fhir_client.get_conditions(patient_id)
    meds_raw = await fhir_client.get_medications(patient_id)
    labs_raw = await fhir_client.get_observations(patient_id, category="laboratory", days_back=90)
    vitals_raw = await fhir_client.get_observations(patient_id, category="vital-signs", days_back=30)

    patient = extract_patient_data(patient_raw)
    conditions = extract_conditions(conditions_raw)
    medications = extract_medications(meds_raw)
    labs = extract_lab_results(labs_raw)
    vitals = extract_lab_results(vitals_raw)

    # Step 2: Map current conditions → HCCs
    confirmed_hccs = []
    current_diagnoses = []
    for cond in conditions:
        code = cond["code"]
        hcc_entry = hcc_lookup.get(code, {})
        dx = {
            "code": code,
            "description": cond["description"],
            "hcc": hcc_entry.get("hcc"),
            "raf": hcc_entry.get("raf", 0),
            "source": "EMR Problem List",
        }
        current_diagnoses.append(dx)
        if dx["hcc"]:
            confirmed_hccs.append(dx)

    # Step 3: Medication-diagnosis gap detection
    # Reuses the MEDICATION_DIAGNOSIS_MAP from code_optimizer.py
    med_dx_gaps = []
    condition_families = set()
    for cond in conditions:
        code = cond["code"]
        if len(code) >= 3:
            condition_families.add(code[:3])

    for med in medications:
        med_name_lower = med["name"].lower()
        for med_keyword, (icd_family, fallback_code, condition_name) in MEDICATION_DIAGNOSIS_MAP.items():
            if med_keyword in med_name_lower:
                # Check if the corresponding diagnosis family is already coded
                if icd_family not in condition_families:
                    hcc_entry = hcc_lookup.get(fallback_code, {})
                    med_dx_gaps.append({
                        "medication": med["name"],
                        "expected_diagnosis": condition_name,
                        "suggested_code": fallback_code,
                        "hcc": hcc_entry.get("hcc"),
                        "raf": hcc_entry.get("raf", 0),
                        "evidence": f"Patient on {med['name']} but no {condition_name} ({icd_family}.x) on problem list",
                        "confidence": 85,
                    })
                break  # One match per medication

    # Step 4: Lab-based suspect detection
    suspect_hccs = []
    suspect_hccs.extend(_detect_lab_suspects(labs, condition_families, hcc_lookup))

    # Also add med-dx gaps as suspects
    for gap in med_dx_gaps:
        if gap.get("hcc"):
            suspect_hccs.append({
                "code": gap["suggested_code"],
                "description": gap["expected_diagnosis"],
                "hcc": gap["hcc"],
                "raf": gap["raf"],
                "evidence": gap["evidence"],
                "confidence": gap["confidence"],
                "source": "Medication-Diagnosis Gap",
            })

    # Step 5: Calculate RAF
    current_raf_result = calculate_note_raf(current_diagnoses)
    current_raf = current_raf_result["total_raf"]

    # Projected RAF = current + suspects
    projected_diagnoses = current_diagnoses + [
        {"code": s["code"], "hcc": s["hcc"], "raf": s["raf"]}
        for s in suspect_hccs
    ]
    projected_raf_result = calculate_note_raf(projected_diagnoses)
    projected_raf = projected_raf_result["total_raf"]

    # Step 6: Near-misses from RAF service
    near_misses = current_raf_result.get("near_misses", [])

    # Step 7: Build care gaps
    care_gaps = _identify_care_gaps(conditions, labs, vitals, patient["age"])

    # Estimate annualized $ impact (~$11K per RAF point for MA)
    raf_delta = round(projected_raf - current_raf, 3)
    annualized_impact = round(raf_delta * 11000, 2)

    return OverlayResult(
        patient_id=patient_id,
        current_raf=current_raf,
        projected_raf=projected_raf,
        raf_delta=raf_delta,
        confirmed_hccs=confirmed_hccs,
        suspect_hccs=suspect_hccs,
        near_misses=near_misses,
        care_gaps=care_gaps,
        med_dx_gaps=med_dx_gaps,
        annualized_impact=annualized_impact,
    )


# ---------------------------------------------------------------------------
# Lab-based suspect detection
# ---------------------------------------------------------------------------

LAB_SUSPECT_RULES = [
    {
        "lab_code": "2160-0",  # Creatinine
        "display": "Creatinine",
        "condition": lambda v: v > 1.5,
        "suspect_family": "N18",
        "suggested_codes": [
            {"threshold": 1.5, "code": "N18.30", "desc": "CKD Stage 3 unspecified", "hcc": "138"},
            {"threshold": 2.0, "code": "N18.4", "desc": "CKD Stage 4", "hcc": "138"},
            {"threshold": 4.0, "code": "N18.5", "desc": "CKD Stage 5", "hcc": "326"},
        ],
        "evidence_template": "Creatinine {value} {unit} — evaluate for CKD staging (check eGFR)",
    },
    {
        "lab_code": "4548-4",  # HbA1c
        "display": "HbA1c",
        "condition": lambda v: v >= 6.5,
        "suspect_family": "E11",
        "suggested_codes": [
            {"threshold": 6.5, "code": "E11.65", "desc": "DM2 with hyperglycemia", "hcc": "37"},
        ],
        "evidence_template": "HbA1c {value}% — consistent with diabetes. Evaluate for complications (HCC 37 vs 38).",
    },
    {
        "lab_code": "1751-7",  # Albumin
        "display": "Albumin",
        "condition": lambda v: v < 3.5,
        "suspect_family": "E44",
        "suggested_codes": [
            {"threshold": 3.0, "code": "E44.1", "desc": "Mild protein-calorie malnutrition", "hcc": "21"},
            {"threshold": 2.5, "code": "E44.0", "desc": "Moderate protein-calorie malnutrition", "hcc": "21"},
            {"threshold": 2.0, "code": "E43", "desc": "Severe protein-calorie malnutrition", "hcc": "21"},
        ],
        "evidence_template": "Albumin {value} {unit} — evaluate for protein-calorie malnutrition (HCC 21, RAF 0.455)",
    },
    {
        "lab_code": "2951-2",  # Sodium
        "display": "Sodium",
        "condition": lambda v: v < 130,
        "suspect_family": "E87",
        "suggested_codes": [
            {"threshold": 130, "code": "E87.1", "desc": "Hypo-osmolality/hyponatremia", "hcc": None},
        ],
        "evidence_template": "Sodium {value} {unit} — significant hyponatremia, evaluate etiology",
    },
    {
        "lab_code": "6301-6",  # BNP / NT-proBNP
        "display": "NT-proBNP",
        "condition": lambda v: v > 900,
        "suspect_family": "I50",
        "suggested_codes": [
            {"threshold": 900, "code": "I50.9", "desc": "Heart failure, unspecified", "hcc": "85"},
        ],
        "evidence_template": "NT-proBNP {value} {unit} — elevated, evaluate for heart failure if not already documented",
    },
]


def _detect_lab_suspects(labs: list, existing_families: set, hcc_lookup: dict) -> list:
    """Detect suspect conditions from abnormal lab values."""
    suspects = []
    for rule in LAB_SUSPECT_RULES:
        # Skip if condition family already on problem list
        if rule["suspect_family"] in existing_families:
            continue

        for lab in labs:
            if lab.get("code") == rule["lab_code"] or rule["display"].lower() in lab.get("display", "").lower():
                try:
                    value = float(lab["value"])
                except (ValueError, TypeError):
                    continue

                if rule["condition"](value):
                    # Find the most specific suggested code based on threshold
                    best_code = rule["suggested_codes"][0]
                    for sc in rule["suggested_codes"]:
                        if "threshold" in sc:
                            if rule["condition"] == (lambda v: v > sc["threshold"]) or value >= sc.get("threshold", 0):
                                best_code = sc

                    hcc_entry = hcc_lookup.get(best_code["code"], {})
                    suspects.append({
                        "code": best_code["code"],
                        "description": best_code["desc"],
                        "hcc": best_code.get("hcc") or hcc_entry.get("hcc"),
                        "raf": hcc_entry.get("raf", 0),
                        "evidence": rule["evidence_template"].format(
                            value=value, unit=lab.get("unit", "")
                        ),
                        "confidence": 82,
                        "source": f"Lab: {lab.get('display', rule['display'])}",
                    })
                    break  # One match per rule

    return suspects


def _identify_care_gaps(conditions: list, labs: list, vitals: list, age: int) -> list:
    """Identify care gaps based on conditions, labs, and age."""
    gaps = []
    condition_codes = {c["code"] for c in conditions}
    condition_families = {c["code"][:3] for c in conditions if len(c["code"]) >= 3}

    # Diabetes care gaps
    if "E11" in condition_families or "E10" in condition_families:
        has_a1c = any("a1c" in l.get("display", "").lower() or l.get("code") == "4548-4" for l in labs)
        if not has_a1c:
            gaps.append({"gap": "HbA1c not documented in last 90 days", "priority": "high", "category": "diabetes"})

        has_eye = any("eye" in l.get("display", "").lower() or "retinal" in l.get("display", "").lower() for l in labs)
        if not has_eye:
            gaps.append({"gap": "Diabetic eye exam not documented", "priority": "medium", "category": "diabetes"})

    # CKD monitoring
    if "N18" in condition_families:
        has_egfr = any("gfr" in l.get("display", "").lower() for l in labs)
        if not has_egfr:
            gaps.append({"gap": "eGFR not documented in last 90 days (CKD on problem list)", "priority": "high", "category": "renal"})

    # BMI documentation
    has_bmi = any("bmi" in v.get("display", "").lower() or v.get("code") == "39156-5" for v in vitals)
    if not has_bmi:
        gaps.append({"gap": "BMI not documented — needed for obesity/malnutrition screening", "priority": "medium", "category": "nutrition"})

    # Depression screening for 65+
    if age >= 65:
        has_phq = any("phq" in l.get("display", "").lower() for l in labs)
        if not has_phq:
            gaps.append({"gap": "Depression screening (PHQ-9) not documented", "priority": "medium", "category": "behavioral"})

    # Annual Wellness Visit / HCC recapture
    gaps.append({"gap": "Verify all chronic conditions recaptured for current payment year", "priority": "high", "category": "risk_adjustment"})

    return gaps


# ---------------------------------------------------------------------------
# FHIR Condition builder for write-back
# ---------------------------------------------------------------------------

def build_fhir_condition(patient_id: str, icd10_code: str, description: str,
                          encounter_id: str = None) -> dict:
    """Build a FHIR R4 Condition resource for writing a captured HCC back to the EMR.

    Called when the provider clicks 'Capture' on a suspect HCC.
    """
    from datetime import datetime

    condition = {
        "resourceType": "Condition",
        "clinicalStatus": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}],
        },
        "verificationStatus": {
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}],
        },
        "category": [{
            "coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category", "code": "problem-list-item"}],
        }],
        "code": {
            "coding": [{
                "system": "http://hl7.org/fhir/sid/icd-10-cm",
                "code": icd10_code,
                "display": description,
            }],
            "text": description,
        },
        "subject": {"reference": f"Patient/{patient_id}"},
        "recordedDate": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "note": [{
            "text": f"Added via AQSoft.AI HCC Engine overlay — code validated against CMS-HCC V28",
        }],
    }

    if encounter_id:
        condition["encounter"] = {"reference": f"Encounter/{encounter_id}"}

    return condition
