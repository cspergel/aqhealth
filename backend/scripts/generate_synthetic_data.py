"""
Synthetic MSO data generator for the AQSoft Health Platform.

Generates realistic CSV files that can be uploaded through the actual
ingestion pipeline. Includes intentional patterns that the HCC engine
and analytics modules should detect.

Usage:
    python -m scripts.generate_synthetic_data

Output directory: backend/data/synthetic/
"""

from __future__ import annotations

import csv
import os
import random
import string
from datetime import date, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Reproducibility
# ---------------------------------------------------------------------------
SEED = 42
random.seed(SEED)

# ---------------------------------------------------------------------------
# Output directory
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR.parent / "data" / "synthetic"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
NUM_MEMBERS = 500
CURRENT_YEAR = 2026
PRIOR_YEAR = 2025

# Date helpers
def _date(year: int, month: int, day: int) -> date:
    return date(year, month, day)


def _random_date(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, max(delta, 0)))


def _format_date(d: date) -> str:
    return d.strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Name pools
# ---------------------------------------------------------------------------
FIRST_NAMES_M = [
    "James", "Robert", "John", "Michael", "William", "David", "Richard",
    "Joseph", "Thomas", "Charles", "Daniel", "Frank", "Edward", "George",
    "Henry", "Paul", "Donald", "Kenneth", "Ronald", "Arthur", "Gerald",
    "Larry", "Raymond", "Eugene", "Wayne", "Roy", "Harold", "Carl",
    "Ralph", "Albert", "Ernest", "Jack", "Howard", "Fred", "Walter",
]
FIRST_NAMES_F = [
    "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth",
    "Susan", "Jessica", "Sarah", "Margaret", "Dorothy", "Nancy", "Helen",
    "Betty", "Carol", "Ruth", "Sharon", "Sandra", "Donna", "Virginia",
    "Diane", "Judith", "Frances", "Joyce", "Janet", "Shirley", "Gloria",
    "Evelyn", "Jean", "Cheryl", "Martha", "Phyllis", "Alice", "Norma",
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas",
    "Jackson", "White", "Harris", "Martin", "Thompson", "Robinson",
    "Clark", "Lewis", "Lee", "Walker", "Hall", "Allen", "Young",
    "King", "Wright", "Scott", "Green", "Adams", "Baker", "Nelson",
    "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips",
    "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart",
    "Morris", "Murphy", "Cook", "Rogers", "Morgan", "Peterson",
    "Cooper", "Reed", "Bailey", "Bell", "Gomez", "Kelly", "Howard",
    "Ward", "Cox", "Diaz", "Richardson", "Wood", "Watson", "Brooks",
    "Bennett", "Gray", "James", "Reyes", "Cruz", "Hughes", "Price",
]

# ---------------------------------------------------------------------------
# Plan distribution
# ---------------------------------------------------------------------------
PLANS = [
    ("Humana Gold Plus", "MAPD", 0.40),
    ("Aetna Medicare Advantage", "MA", 0.25),
    ("UnitedHealthcare AARP", "MAPD", 0.20),
    ("Cigna Medicare Select", "MA", 0.15),
]


def _pick_plan() -> tuple[str, str]:
    r = random.random()
    cumulative = 0.0
    for name, product, weight in PLANS:
        cumulative += weight
        if r < cumulative:
            return name, product
    return PLANS[-1][0], PLANS[-1][1]


# ---------------------------------------------------------------------------
# PCP / Practice groups
# ---------------------------------------------------------------------------
PRACTICE_GROUPS = [
    "Coastal Family Medicine",
    "Suncoast Primary Care",
    "Bay Area Medical Associates",
    "Gulf Health Partners",
    "Meridian Physicians Group",
]

# 10 PCPs across 5 practice groups (2 per group)
PCPS: list[tuple[str, str, str]] = []  # (npi, name, practice_group)
_pcp_npis = [
    "1234567890", "1234567891", "2345678901", "2345678902",
    "3456789012", "3456789013", "4567890123", "4567890124",
    "5678901234", "5678901235",
]
_pcp_names = [
    "Dr. Sarah Chen", "Dr. Michael Rivera", "Dr. Angela Patel",
    "Dr. Robert Kim", "Dr. Lisa Thompson", "Dr. James Wilson",
    "Dr. Maria Santos", "Dr. David Chang", "Dr. Karen O'Brien",
    "Dr. William Foster",
]
for i, (npi, name) in enumerate(zip(_pcp_npis, _pcp_names)):
    PCPS.append((npi, name, PRACTICE_GROUPS[i // 2]))

# ---------------------------------------------------------------------------
# Zip codes (Florida-ish)
# ---------------------------------------------------------------------------
ZIP_CODES = [
    "33601", "33602", "33609", "33611", "33614", "33626", "33629",
    "33701", "33702", "33710", "33716", "34102", "34108", "34201",
    "34207", "34231", "34236", "34741", "34747", "34748", "32801",
    "32803", "32806", "32819", "32836",
]

# ---------------------------------------------------------------------------
# Facilities
# ---------------------------------------------------------------------------
FACILITIES = [
    ("Memorial Hospital", "6789012345"),
    ("St. Luke's Medical Center", "6789012346"),
    ("Bayfront Health", "6789012347"),
    ("Tampa General Hospital", "6789012348"),
    ("Mercy Hospital", "6789012349"),
    ("Lakeside Community Hospital", "6789012350"),
    ("Sarasota Memorial", "6789012351"),
]

# Hospital A = Memorial Hospital, Hospital B = St. Luke's (for readmission rate comparison)
HOSPITAL_A = FACILITIES[0]  # 2x readmission rate
HOSPITAL_B = FACILITIES[1]

# ---------------------------------------------------------------------------
# ICD-10 code pools
# ---------------------------------------------------------------------------
DIABETES_UNSPECIFIED = "E11.9"
DIABETES_WITH_COMPLICATIONS = "E11.65"
DIABETES_WITH_RETINOPATHY = "E11.311"
CHF_SYSTOLIC_CHRONIC = "I50.22"
CHF_UNSPECIFIED = "I50.9"
CKD_STAGE_3 = "N18.3"
CKD_STAGE_4 = "N18.4"
COPD_ACUTE_EXACERBATION = "J44.1"
DEPRESSION_RECURRENT = "F33.1"
PROTEIN_CALORIE_MALNUTRITION = "E44.1"
AFIB = "I48.91"
ISCHEMIC_HEART = "I25.10"
MORBID_OBESITY = "E66.01"
PARKINSONS = "G20"
HYPERTENSION = "I10"
HYPERLIPIDEMIA = "E78.5"
HYPOTHYROID = "E03.9"
OSTEOARTHRITIS_KNEE = "M17.11"
OSTEOPOROSIS = "M81.0"
GERD = "K21.0"
TYPE2_DM_NEUROPATHY = "E11.40"
UTI = "N39.0"
PNEUMONIA = "J18.9"
CELLULITIS = "L03.115"
ANEMIA = "D64.9"
DVT = "I82.401"
PE = "I26.99"

# HCC-eligible diagnoses for recapture gap generation
HCC_ELIGIBLE_CODES = [
    DIABETES_WITH_COMPLICATIONS, CHF_SYSTOLIC_CHRONIC, CHF_UNSPECIFIED,
    CKD_STAGE_3, CKD_STAGE_4, COPD_ACUTE_EXACERBATION, DEPRESSION_RECURRENT,
    AFIB, ISCHEMIC_HEART, MORBID_OBESITY, PARKINSONS,
    PROTEIN_CALORIE_MALNUTRITION, TYPE2_DM_NEUROPATHY,
]

# Common non-HCC codes for filler claims
COMMON_DX_CODES = [
    HYPERTENSION, HYPERLIPIDEMIA, HYPOTHYROID, OSTEOARTHRITIS_KNEE,
    OSTEOPOROSIS, GERD, UTI, PNEUMONIA, ANEMIA, "R10.9",  # abdominal pain
    "R05.9",  # cough
    "M54.5",  # low back pain
    "J06.9",  # URI
    "R51.9",  # headache
    "Z00.00",  # general exam
]

# Retinopathy-related procedure codes
RETINOPATHY_CPT = ["92250", "92134", "67228"]  # fundus photo, OCT, retinal laser

# ---------------------------------------------------------------------------
# CPT codes
# ---------------------------------------------------------------------------
OFFICE_VISIT_CPT = ["99213", "99214", "99215"]
HOSPITAL_ADMIT_CPT = ["99221", "99222", "99223"]
HOSPITAL_SUBSEQUENT_CPT = ["99231", "99232", "99233"]
HOSPITAL_DISCHARGE_CPT = ["99238", "99239"]
ED_CPT = ["99281", "99282", "99283", "99284", "99285"]
CRITICAL_CARE_CPT = ["99291"]
SNF_CPT = ["99304", "99305", "99306"]
PREVENTIVE_CPT = ["99385", "99386", "99387", "99395", "99396", "99397"]
LAB_CPT = ["80053", "80061", "83036", "85025"]  # CMP, lipid, HbA1c, CBC

# HbA1c specifically
HBAC1_CPT = "83036"

# ---------------------------------------------------------------------------
# DRG codes
# ---------------------------------------------------------------------------
CHF_DRGS = ["291", "292"]
PNEUMONIA_DRGS = ["193", "194"]
JOINT_DRG = "470"
SEPSIS_DRGS = ["871", "872"]
COPD_DRGS = ["190", "191"]
GI_DRGS = ["392", "378"]
UTI_DRG = "689"
RENAL_DRG = "683"

INPATIENT_DRGS = CHF_DRGS + PNEUMONIA_DRGS + [JOINT_DRG] + SEPSIS_DRGS + COPD_DRGS + GI_DRGS + [UTI_DRG, RENAL_DRG]

# ---------------------------------------------------------------------------
# Drug pools
# ---------------------------------------------------------------------------
DIABETES_DRUGS = [
    ("metformin 500mg", "00093-7214-01", "Biguanide", 60, 30),
    ("metformin 1000mg", "00093-7215-01", "Biguanide", 60, 30),
    ("insulin glargine 100units/ml", "00088-2220-33", "Insulin", 1, 30),
    ("insulin lispro 100units/ml", "00002-7510-01", "Insulin", 1, 30),
]

BRAND_STATINS = [
    ("Lipitor 40mg", "00071-0157-23", "Statin", 30, 30),
    ("Crestor 20mg", "00310-0754-30", "Statin", 30, 30),
]

GENERIC_STATINS = [
    ("atorvastatin 40mg", "00093-5057-01", "Statin", 30, 30),
    ("rosuvastatin 20mg", "00093-7193-01", "Statin", 30, 30),
    ("simvastatin 40mg", "00093-7155-01", "Statin", 30, 30),
]

COMMON_DRUGS = [
    ("lisinopril 10mg", "00093-7339-01", "ACE Inhibitor", 30, 30),
    ("lisinopril 20mg", "00093-7340-01", "ACE Inhibitor", 30, 30),
    ("amlodipine 5mg", "00093-3171-01", "CCB", 30, 30),
    ("warfarin 5mg", "00093-0861-01", "Anticoagulant", 30, 30),
    ("apixaban 5mg", "00003-0894-21", "Anticoagulant", 60, 30),
    ("furosemide 40mg", "00093-5271-01", "Loop Diuretic", 30, 30),
    ("sertraline 50mg", "00093-7196-01", "SSRI", 30, 30),
    ("albuterol inhaler", "00173-0682-20", "Bronchodilator", 1, 30),
    ("carvedilol 12.5mg", "00093-7298-01", "Beta Blocker", 60, 30),
    ("omeprazole 20mg", "00093-2274-01", "PPI", 30, 30),
    ("levothyroxine 50mcg", "00074-6625-90", "Thyroid", 30, 30),
    ("gabapentin 300mg", "00093-6392-01", "Anticonvulsant", 90, 30),
    ("prednisone 10mg", "00093-8740-01", "Corticosteroid", 21, 7),
    ("tramadol 50mg", "00093-0058-01", "Opioid", 30, 30),
]

# ---------------------------------------------------------------------------
# Member generation
# ---------------------------------------------------------------------------

def _generate_dob() -> date:
    """Generate DOB for Medicare-age population (65-95, weighted toward 70-82)."""
    # Triangular distribution: min=65, mode=76, max=95
    age = int(random.triangular(65, 95, 76))
    age = max(65, min(95, age))
    year = CURRENT_YEAR - age
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return date(year, month, day)


def _generate_member_id() -> str:
    """Generate a realistic health plan member ID."""
    prefix = random.choice(["H", "A", "U", "C"])
    num = "".join(random.choices(string.digits, k=9))
    return f"{prefix}{num}"


def generate_roster() -> list[dict]:
    """Generate 500 synthetic members."""
    members = []
    for i in range(NUM_MEMBERS):
        gender = random.choice(["M", "F"])
        if gender == "M":
            first_name = random.choice(FIRST_NAMES_M)
        else:
            first_name = random.choice(FIRST_NAMES_F)

        last_name = random.choice(LAST_NAMES)
        dob = _generate_dob()
        plan, product = _pick_plan()
        pcp = random.choice(PCPS)

        coverage_start = _random_date(date(2023, 1, 1), date(2025, 6, 1))
        coverage_end = date(2026, 12, 31)

        # 5% Medicaid dual-eligible
        medicaid = random.random() < 0.05
        # 3% originally disabled
        disability = random.random() < 0.03

        members.append({
            "member_id": _generate_member_id(),
            "first_name": first_name,
            "last_name": last_name,
            "date_of_birth": _format_date(dob),
            "gender": gender,
            "zip_code": random.choice(ZIP_CODES),
            "health_plan": plan,
            "plan_product": product,
            "coverage_start": _format_date(coverage_start),
            "coverage_end": _format_date(coverage_end),
            "pcp_npi": pcp[0],
            "pcp_name": pcp[1],
            "medicaid_status": str(medicaid).lower(),
            "disability_status": str(disability).lower(),
        })

    return members


# ---------------------------------------------------------------------------
# Claims generation
# ---------------------------------------------------------------------------

class ClaimsGenerator:
    """Generates synthetic claims with intentional patterns."""

    def __init__(self, members: list[dict]):
        self.members = members
        self.claims: list[dict] = []
        self.pharmacy_claims: list[dict] = []
        self.claim_counter = 0

        # Track member assignments for patterns
        self.med_dx_gap_members: list[int] = []       # 50 members on diabetes meds, no dx
        self.specificity_members: list[int] = []       # 30 members E11.9 + retinopathy
        self.recapture_members: list[int] = []         # 80 members prior-year HCC, not this year
        self.chf_dm_no_ckd_members: list[int] = []    # 20 members CHF+DM, no CKD
        self.frequent_ed_members: list[int] = []       # 15 frequent ED
        self.high_cost_inpatient: list[int] = []       # 10 high-cost inpatient
        self.brand_statin_members: list[int] = []      # 25 brand-name statins

        self._assign_pattern_members()

    def _assign_pattern_members(self):
        """Assign specific members to each intentional pattern."""
        indices = list(range(NUM_MEMBERS))
        random.shuffle(indices)
        pos = 0

        self.med_dx_gap_members = indices[pos:pos + 50]
        pos += 50
        self.specificity_members = indices[pos:pos + 30]
        pos += 30
        self.recapture_members = indices[pos:pos + 80]
        pos += 80
        self.chf_dm_no_ckd_members = indices[pos:pos + 20]
        pos += 20
        self.frequent_ed_members = indices[pos:pos + 15]
        pos += 15
        self.high_cost_inpatient = indices[pos:pos + 10]
        pos += 10
        self.brand_statin_members = indices[pos:pos + 25]
        pos += 25

    def _next_claim_id(self) -> str:
        self.claim_counter += 1
        return f"CLM{self.claim_counter:07d}"

    def _next_rx_claim_id(self) -> str:
        self.claim_counter += 1
        return f"RX{self.claim_counter:07d}"

    def _random_provider_npi(self) -> str:
        return random.choice(_pcp_npis)

    def _random_facility(self) -> tuple[str, str]:
        return random.choice(FACILITIES)

    def _add_claim(
        self,
        member_idx: int,
        claim_type: str,
        service_date: date,
        dx_codes: list[str],
        procedure_code: str | None = None,
        drg_code: str | None = None,
        facility: tuple[str, str] | None = None,
        pos_code: str = "11",
        billed: float = 0,
        allowed: float = 0,
        paid: float = 0,
        ndc_code: str | None = None,
        drug_name: str | None = None,
        quantity: float | None = None,
        days_supply: int | None = None,
    ):
        paid_date = service_date + timedelta(days=random.randint(14, 60))
        fac = facility or (None, None)

        dx1 = dx_codes[0] if len(dx_codes) > 0 else ""
        dx2 = dx_codes[1] if len(dx_codes) > 1 else ""
        dx3 = dx_codes[2] if len(dx_codes) > 2 else ""
        dx4 = dx_codes[3] if len(dx_codes) > 3 else ""

        self.claims.append({
            "claim_id": self._next_claim_id(),
            "member_id": self.members[member_idx]["member_id"],
            "claim_type": claim_type,
            "service_date": _format_date(service_date),
            "paid_date": _format_date(paid_date),
            "diagnosis_1": dx1,
            "diagnosis_2": dx2,
            "diagnosis_3": dx3,
            "diagnosis_4": dx4,
            "procedure_code": procedure_code or "",
            "drg_code": drg_code or "",
            "rendering_provider_npi": self._random_provider_npi(),
            "facility_name": fac[0] or "",
            "facility_npi": fac[1] or "",
            "billed_amount": f"{billed:.2f}",
            "allowed_amount": f"{allowed:.2f}",
            "paid_amount": f"{paid:.2f}",
            "pos_code": pos_code,
            "ndc_code": ndc_code or "",
            "drug_name": drug_name or "",
            "quantity": f"{quantity:.2f}" if quantity else "",
            "days_supply": str(days_supply) if days_supply else "",
        })

    def _add_pharmacy_claim(
        self,
        member_idx: int,
        service_date: date,
        drug: tuple[str, str, str, int, int],
        paid: float | None = None,
    ):
        drug_name, ndc, drug_class, qty, days = drug
        if paid is None:
            paid = round(random.uniform(5, 200), 2)

        self.pharmacy_claims.append({
            "claim_id": self._next_rx_claim_id(),
            "member_id": self.members[member_idx]["member_id"],
            "service_date": _format_date(service_date),
            "ndc_code": ndc,
            "drug_name": drug_name,
            "drug_class": drug_class,
            "quantity": str(qty),
            "days_supply": str(days),
            "paid_amount": f"{paid:.2f}",
            "prescribing_provider_npi": self._random_provider_npi(),
        })

        # Also add to main claims as pharmacy claim type
        self._add_claim(
            member_idx=member_idx,
            claim_type="pharmacy",
            service_date=service_date,
            dx_codes=[],
            pos_code="01",
            ndc_code=ndc,
            drug_name=drug_name,
            quantity=qty,
            days_supply=days,
            billed=paid * 1.3,
            allowed=paid * 1.1,
            paid=paid,
        )

    def generate_all(self):
        """Generate all claims with intentional patterns."""
        self._generate_med_dx_gap_claims()
        self._generate_specificity_claims()
        self._generate_recapture_gap_claims()
        self._generate_chf_dm_no_ckd_claims()
        self._generate_frequent_ed_claims()
        self._generate_high_cost_inpatient_claims()
        self._generate_brand_statin_claims()
        self._generate_readmission_pattern_claims()
        self._generate_baseline_claims()
        self._generate_additional_pharmacy()

    # -- Pattern 1: 50 members on metformin/insulin but NO diabetes diagnosis --
    def _generate_med_dx_gap_claims(self):
        for idx in self.med_dx_gap_members:
            # Give them diabetes medications
            for _ in range(random.randint(2, 5)):
                drug = random.choice(DIABETES_DRUGS)
                svc_date = _random_date(date(2025, 7, 1), date(2026, 3, 15))
                self._add_pharmacy_claim(idx, svc_date, drug)

            # Give them office visits with NON-diabetes diagnoses only
            for _ in range(random.randint(1, 3)):
                svc_date = _random_date(date(2025, 7, 1), date(2026, 3, 15))
                dx = random.sample([HYPERTENSION, HYPERLIPIDEMIA, HYPOTHYROID, GERD], k=random.randint(1, 2))
                cpt = random.choice(OFFICE_VISIT_CPT)
                cost = round(random.uniform(100, 250), 2)
                self._add_claim(idx, "professional", svc_date, dx, cpt,
                                billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

    # -- Pattern 2: 30 members with E11.9 who have retinopathy claims --
    def _generate_specificity_claims(self):
        for idx in self.specificity_members:
            # Office visit with E11.9 (unspecified diabetes)
            for _ in range(random.randint(1, 3)):
                svc_date = _random_date(date(2025, 7, 1), date(2026, 3, 15))
                dx = [DIABETES_UNSPECIFIED, HYPERTENSION]
                cpt = random.choice(OFFICE_VISIT_CPT)
                cost = round(random.uniform(100, 250), 2)
                self._add_claim(idx, "professional", svc_date, dx, cpt,
                                billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

            # Retinopathy procedure claim (evidence of diabetic retinopathy)
            svc_date = _random_date(date(2025, 9, 1), date(2026, 2, 28))
            retina_cpt = random.choice(RETINOPATHY_CPT)
            # Note: the dx on the retinopathy claim is still E11.9, not E11.311
            # This is the specificity gap — should be upgraded to E11.311
            cost = round(random.uniform(150, 400), 2)
            self._add_claim(idx, "professional", svc_date, [DIABETES_UNSPECIFIED],
                            retina_cpt, billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

    # -- Pattern 3: 80 members had HCC-eligible dx LAST year but not THIS year --
    def _generate_recapture_gap_claims(self):
        for idx in self.recapture_members:
            hcc_dx = random.choice(HCC_ELIGIBLE_CODES)

            # Prior year claim WITH the HCC diagnosis
            svc_date = _random_date(date(2025, 1, 1), date(2025, 12, 31))
            cpt = random.choice(OFFICE_VISIT_CPT)
            cost = round(random.uniform(100, 300), 2)
            self._add_claim(idx, "professional", svc_date, [hcc_dx, HYPERTENSION], cpt,
                            billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

            # Current year claims WITHOUT the HCC diagnosis (only non-HCC codes)
            for _ in range(random.randint(1, 3)):
                svc_date = _random_date(date(2026, 1, 1), date(2026, 3, 15))
                filler_dx = random.sample(COMMON_DX_CODES, k=random.randint(1, 2))
                cpt = random.choice(OFFICE_VISIT_CPT)
                cost = round(random.uniform(100, 250), 2)
                self._add_claim(idx, "professional", svc_date, filler_dx, cpt,
                                billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

    # -- Pattern 4: 20 members with CHF + diabetes but NO CKD --
    def _generate_chf_dm_no_ckd_claims(self):
        for idx in self.chf_dm_no_ckd_members:
            # CHF + Diabetes claims
            for _ in range(random.randint(2, 4)):
                svc_date = _random_date(date(2025, 7, 1), date(2026, 3, 15))
                dx = [random.choice([CHF_SYSTOLIC_CHRONIC, CHF_UNSPECIFIED]),
                      DIABETES_WITH_COMPLICATIONS, HYPERTENSION]
                cpt = random.choice(OFFICE_VISIT_CPT)
                cost = round(random.uniform(150, 350), 2)
                self._add_claim(idx, "professional", svc_date, dx, cpt,
                                billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

            # Lab claim with elevated creatinine (evidence of potential CKD)
            svc_date = _random_date(date(2025, 10, 1), date(2026, 2, 28))
            self._add_claim(idx, "professional", svc_date,
                            [DIABETES_WITH_COMPLICATIONS],
                            "80053",  # CMP (includes creatinine)
                            billed=45.0, allowed=35.0, paid=30.0)

            # CHF medications
            chf_drugs = [
                ("furosemide 40mg", "00093-5271-01", "Loop Diuretic", 30, 30),
                ("carvedilol 12.5mg", "00093-7298-01", "Beta Blocker", 60, 30),
            ]
            for drug in chf_drugs:
                svc_date = _random_date(date(2025, 7, 1), date(2026, 3, 15))
                self._add_pharmacy_claim(idx, svc_date, drug)

    # -- Pattern 5: 15 frequent ER utilizers (4+ visits in 12 months) --
    def _generate_frequent_ed_claims(self):
        for idx in self.frequent_ed_members:
            num_visits = random.randint(4, 8)
            for _ in range(num_visits):
                svc_date = _random_date(date(2025, 4, 1), date(2026, 3, 15))
                dx = random.sample(
                    [HYPERTENSION, "R10.9", "R51.9", "R05.9", "M54.5",
                     CHF_UNSPECIFIED, COPD_ACUTE_EXACERBATION, UTI],
                    k=random.randint(1, 3),
                )
                cpt = random.choice(ED_CPT)
                cost = round(random.uniform(500, 3500), 2)
                facility = self._random_facility()
                self._add_claim(idx, "institutional", svc_date, dx, cpt,
                                facility=facility, pos_code="23",
                                billed=cost * 2, allowed=cost * 1.3, paid=cost)

    # -- Pattern 6: 10 high-cost inpatient cases --
    def _generate_high_cost_inpatient_claims(self):
        high_cost_facilities = [FACILITIES[0], FACILITIES[3]]  # Memorial, Tampa General
        for idx in self.high_cost_inpatient:
            facility = random.choice(high_cost_facilities)
            drg = random.choice(SEPSIS_DRGS + CHF_DRGS + [RENAL_DRG])
            dx = [random.choice([CHF_SYSTOLIC_CHRONIC, COPD_ACUTE_EXACERBATION, PNEUMONIA]),
                  HYPERTENSION, HYPERLIPIDEMIA]

            svc_date = _random_date(date(2025, 6, 1), date(2026, 2, 28))
            cost = round(random.uniform(25000, 75000), 2)

            # Admission
            self._add_claim(idx, "institutional", svc_date, dx,
                            random.choice(HOSPITAL_ADMIT_CPT), drg_code=drg,
                            facility=facility, pos_code="21",
                            billed=cost * 1.8, allowed=cost * 1.2, paid=cost)

            # Subsequent days
            for day in range(1, random.randint(3, 8)):
                self._add_claim(idx, "institutional", svc_date + timedelta(days=day), dx,
                                random.choice(HOSPITAL_SUBSEQUENT_CPT), drg_code=drg,
                                facility=facility, pos_code="21",
                                billed=0, allowed=0, paid=0)

            # Discharge
            los = random.randint(4, 10)
            self._add_claim(idx, "institutional", svc_date + timedelta(days=los), dx,
                            random.choice(HOSPITAL_DISCHARGE_CPT),
                            facility=facility, pos_code="21",
                            billed=0, allowed=0, paid=0)

    # -- Pattern 7: Hospital A has 2x readmission rate of Hospital B --
    def _generate_readmission_pattern_claims(self):
        """Generate inpatient claims where Memorial Hospital has double the readmission rate."""
        readmission_drgs = CHF_DRGS + PNEUMONIA_DRGS + COPD_DRGS

        # Pick 40 members for Hospital A (Memorial), 40 for Hospital B (St Luke's)
        available = [i for i in range(NUM_MEMBERS) if i not in self.high_cost_inpatient]
        random.shuffle(available)
        hosp_a_members = available[:40]
        hosp_b_members = available[40:80]

        # Hospital A: ~50% readmission rate (20 of 40 readmitted)
        for i, idx in enumerate(hosp_a_members):
            drg = random.choice(readmission_drgs)
            dx = [random.choice([CHF_UNSPECIFIED, PNEUMONIA, COPD_ACUTE_EXACERBATION]),
                  HYPERTENSION]
            svc_date = _random_date(date(2025, 4, 1), date(2025, 12, 31))
            cost = round(random.uniform(8000, 20000), 2)
            self._add_claim(idx, "institutional", svc_date, dx,
                            random.choice(HOSPITAL_ADMIT_CPT), drg_code=drg,
                            facility=HOSPITAL_A, pos_code="21",
                            billed=cost * 1.8, allowed=cost * 1.2, paid=cost)

            # 50% get readmitted within 30 days
            if i < 20:
                readmit_date = svc_date + timedelta(days=random.randint(3, 28))
                cost2 = round(random.uniform(8000, 18000), 2)
                self._add_claim(idx, "institutional", readmit_date, dx,
                                random.choice(HOSPITAL_ADMIT_CPT), drg_code=drg,
                                facility=HOSPITAL_A, pos_code="21",
                                billed=cost2 * 1.8, allowed=cost2 * 1.2, paid=cost2)

        # Hospital B: ~25% readmission rate (10 of 40 readmitted)
        for i, idx in enumerate(hosp_b_members):
            drg = random.choice(readmission_drgs)
            dx = [random.choice([CHF_UNSPECIFIED, PNEUMONIA, COPD_ACUTE_EXACERBATION]),
                  HYPERTENSION]
            svc_date = _random_date(date(2025, 4, 1), date(2025, 12, 31))
            cost = round(random.uniform(8000, 20000), 2)
            self._add_claim(idx, "institutional", svc_date, dx,
                            random.choice(HOSPITAL_ADMIT_CPT), drg_code=drg,
                            facility=HOSPITAL_B, pos_code="21",
                            billed=cost * 1.8, allowed=cost * 1.2, paid=cost)

            # 25% get readmitted
            if i < 10:
                readmit_date = svc_date + timedelta(days=random.randint(3, 28))
                cost2 = round(random.uniform(8000, 18000), 2)
                self._add_claim(idx, "institutional", readmit_date, dx,
                                random.choice(HOSPITAL_ADMIT_CPT), drg_code=drg,
                                facility=HOSPITAL_B, pos_code="21",
                                billed=cost2 * 1.8, allowed=cost2 * 1.2, paid=cost2)

    # -- Pattern 8: 25 members on brand-name statins where generics exist --
    def _generate_brand_statin_claims(self):
        for idx in self.brand_statin_members:
            drug = random.choice(BRAND_STATINS)
            for _ in range(random.randint(2, 5)):
                svc_date = _random_date(date(2025, 7, 1), date(2026, 3, 15))
                self._add_pharmacy_claim(idx, svc_date, drug, paid=round(random.uniform(80, 250), 2))

    # -- Baseline claims for all members --
    def _generate_baseline_claims(self):
        """Generate 5-15 routine claims per member to reach 5000-8000 total."""
        target_min = 5000
        target_max = 8000
        current_count = len(self.claims)
        remaining = random.randint(max(0, target_min - current_count), max(0, target_max - current_count))
        claims_per_member = max(1, remaining // NUM_MEMBERS)

        for idx in range(NUM_MEMBERS):
            num_claims = random.randint(max(1, claims_per_member - 3), claims_per_member + 5)
            for _ in range(num_claims):
                svc_date = _random_date(date(2025, 1, 1), date(2026, 3, 15))

                # Service category distribution: 40% professional, 25% inpatient, 10% ED, 5% SNF, 5% other
                category_roll = random.random()
                if category_roll < 0.40:
                    # Professional / office visit
                    dx = random.sample(COMMON_DX_CODES, k=random.randint(1, 3))
                    cpt = random.choice(OFFICE_VISIT_CPT + PREVENTIVE_CPT + LAB_CPT)
                    cost = round(random.uniform(50, 350), 2)
                    self._add_claim(idx, "professional", svc_date, dx, cpt,
                                    billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

                elif category_roll < 0.65:
                    # Inpatient
                    drg = random.choice(INPATIENT_DRGS)
                    dx = random.sample(COMMON_DX_CODES + [CHF_UNSPECIFIED, PNEUMONIA, UTI], k=random.randint(1, 3))
                    facility = self._random_facility()
                    cost = round(random.uniform(5000, 25000), 2)
                    self._add_claim(idx, "institutional", svc_date, dx,
                                    random.choice(HOSPITAL_ADMIT_CPT), drg_code=drg,
                                    facility=facility, pos_code="21",
                                    billed=cost * 1.8, allowed=cost * 1.2, paid=cost)

                elif category_roll < 0.75:
                    # ED visit
                    dx = random.sample(COMMON_DX_CODES, k=random.randint(1, 2))
                    cpt = random.choice(ED_CPT)
                    facility = self._random_facility()
                    cost = round(random.uniform(300, 3000), 2)
                    self._add_claim(idx, "institutional", svc_date, dx, cpt,
                                    facility=facility, pos_code="23",
                                    billed=cost * 2, allowed=cost * 1.3, paid=cost)

                elif category_roll < 0.80:
                    # SNF
                    dx = random.sample(COMMON_DX_CODES, k=random.randint(1, 2))
                    cpt = random.choice(SNF_CPT)
                    cost = round(random.uniform(200, 800), 2)
                    self._add_claim(idx, "institutional", svc_date, dx, cpt,
                                    pos_code="31",
                                    billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

                else:
                    # Other / home health
                    dx = random.sample(COMMON_DX_CODES, k=random.randint(1, 2))
                    cpt = random.choice(OFFICE_VISIT_CPT)
                    cost = round(random.uniform(50, 300), 2)
                    self._add_claim(idx, "professional", svc_date, dx, cpt,
                                    pos_code="12",
                                    billed=cost * 1.5, allowed=cost * 1.1, paid=cost)

    # -- Additional pharmacy claims to reach ~3000 total --
    def _generate_additional_pharmacy(self):
        target_rx = 3000
        current_rx = len(self.pharmacy_claims)
        remaining = max(0, target_rx - current_rx)

        for _ in range(remaining):
            idx = random.randint(0, NUM_MEMBERS - 1)
            drug = random.choice(COMMON_DRUGS + GENERIC_STATINS)
            svc_date = _random_date(date(2025, 1, 1), date(2026, 3, 15))
            self._add_pharmacy_claim(idx, svc_date, drug)


# ---------------------------------------------------------------------------
# Eligibility generation
# ---------------------------------------------------------------------------

def generate_eligibility(members: list[dict]) -> list[dict]:
    """Generate eligibility rows matching the roster."""
    return [
        {
            "member_id": m["member_id"],
            "plan_name": m["health_plan"],
            "plan_product": m["plan_product"],
            "coverage_start": m["coverage_start"],
            "coverage_end": m["coverage_end"],
            "pcp_npi": m["pcp_npi"],
        }
        for m in members
    ]


# ---------------------------------------------------------------------------
# CSV writing
# ---------------------------------------------------------------------------

def _write_csv(filepath: Path, rows: list[dict], fieldnames: list[str] | None = None):
    if not rows:
        return
    if fieldnames is None:
        fieldnames = list(rows[0].keys())
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  Written {len(rows):,} rows -> {filepath.name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("AQSoft Health Platform — Synthetic Data Generator")
    print("=" * 60)
    print(f"Seed: {SEED}")
    print(f"Output: {OUTPUT_DIR}")
    print()

    # 1. Roster
    print("[1/4] Generating roster...")
    members = generate_roster()
    roster_fields = [
        "member_id", "first_name", "last_name", "date_of_birth", "gender",
        "zip_code", "health_plan", "plan_product", "coverage_start",
        "coverage_end", "pcp_npi", "pcp_name", "medicaid_status",
        "disability_status",
    ]
    _write_csv(OUTPUT_DIR / "roster.csv", members, roster_fields)

    # 2. Claims
    print("[2/4] Generating claims...")
    gen = ClaimsGenerator(members)
    gen.generate_all()
    claims_fields = [
        "claim_id", "member_id", "claim_type", "service_date", "paid_date",
        "diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4",
        "procedure_code", "drg_code", "rendering_provider_npi",
        "facility_name", "facility_npi", "billed_amount", "allowed_amount",
        "paid_amount", "pos_code", "ndc_code", "drug_name", "quantity",
        "days_supply",
    ]
    _write_csv(OUTPUT_DIR / "claims.csv", gen.claims, claims_fields)

    # 3. Pharmacy
    print("[3/4] Generating pharmacy claims...")
    pharmacy_fields = [
        "claim_id", "member_id", "service_date", "ndc_code", "drug_name",
        "drug_class", "quantity", "days_supply", "paid_amount",
        "prescribing_provider_npi",
    ]
    _write_csv(OUTPUT_DIR / "pharmacy.csv", gen.pharmacy_claims, pharmacy_fields)

    # 4. Eligibility
    print("[4/4] Generating eligibility...")
    eligibility = generate_eligibility(members)
    eligibility_fields = [
        "member_id", "plan_name", "plan_product", "coverage_start",
        "coverage_end", "pcp_npi",
    ]
    _write_csv(OUTPUT_DIR / "eligibility.csv", eligibility, eligibility_fields)

    # Summary
    print()
    print("=" * 60)
    print("Summary:")
    print(f"  Roster:      {len(members):,} members")
    print(f"  Claims:      {len(gen.claims):,} claims")
    print(f"  Pharmacy:    {len(gen.pharmacy_claims):,} pharmacy claims")
    print(f"  Eligibility: {len(eligibility):,} rows")
    print()
    print("Intentional patterns embedded:")
    print(f"  Med-Dx gaps (diabetes meds, no dx):     {len(gen.med_dx_gap_members)}")
    print(f"  Specificity upgrades (E11.9 -> E11.311): {len(gen.specificity_members)}")
    print(f"  Recapture gaps (prior-year HCC):         {len(gen.recapture_members)}")
    print(f"  CHF+DM without CKD:                      {len(gen.chf_dm_no_ckd_members)}")
    print(f"  Frequent ED utilizers (4+ visits):        {len(gen.frequent_ed_members)}")
    print(f"  High-cost inpatient:                      {len(gen.high_cost_inpatient)}")
    print(f"  Brand-name statins:                       {len(gen.brand_statin_members)}")
    print(f"  Readmission pattern (Hospital A vs B):    80 members (40+40)")
    print("=" * 60)


if __name__ == "__main__":
    main()
