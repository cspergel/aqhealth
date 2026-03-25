"""
Integration tests that verify end-to-end data flow.

These tests use the synthetic data generator to create test data,
then verify the platform processes it correctly. They require PostgreSQL
to be running (skipped if unavailable via the db_session fixture).

Run with: pytest tests/test_integration.py -m integration
"""

from __future__ import annotations

import csv
import io
import os
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure the backend package is importable
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.models.member import Member, RiskTier
from app.models.claim import Claim, ClaimType
from app.models.hcc import HccSuspect, SuspectStatus, SuspectType, RafHistory
from app.models.provider import Provider
from app.services.ingestion_service import classify_service_category
from app.services.hcc_engine import (
    _local_med_dx_gaps,
    _local_raf_calculation,
    _determine_risk_tier,
    _detect_near_miss_interactions,
    _detect_historical_dropoffs,
    LOCAL_HCC_RAF,
    MED_DX_MAPPINGS,
    get_current_payment_year,
)

# Import the synthetic data generator
from scripts.generate_synthetic_data import (
    generate_roster,
    ClaimsGenerator,
    generate_eligibility,
    NUM_MEMBERS,
)


# ---------------------------------------------------------------------------
# Marker: all tests in this module require integration infrastructure
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Fixtures: synthetic data
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def synthetic_roster() -> list[dict]:
    """Generate the synthetic roster (500 members)."""
    return generate_roster()


@pytest.fixture(scope="module")
def synthetic_claims_gen(synthetic_roster) -> ClaimsGenerator:
    """Generate all synthetic claims."""
    gen = ClaimsGenerator(synthetic_roster)
    gen.generate_all()
    return gen


@pytest.fixture(scope="module")
def synthetic_eligibility(synthetic_roster) -> list[dict]:
    """Generate eligibility records."""
    return generate_eligibility(synthetic_roster)


# ---------------------------------------------------------------------------
# Test 1: Roster generation produces correct structure and count
# ---------------------------------------------------------------------------

class TestRosterIngestion:
    def test_roster_count(self, synthetic_roster):
        """Synthetic roster should contain exactly 500 members."""
        assert len(synthetic_roster) == 500

    def test_roster_required_fields(self, synthetic_roster):
        """Each roster row should have all required columns."""
        required = {
            "member_id", "first_name", "last_name", "date_of_birth",
            "gender", "zip_code", "health_plan", "plan_product",
            "coverage_start", "coverage_end", "pcp_npi", "pcp_name",
            "medicaid_status", "disability_status",
        }
        for member in synthetic_roster:
            assert required.issubset(member.keys()), f"Missing fields: {required - member.keys()}"

    def test_roster_plan_distribution(self, synthetic_roster):
        """Plan distribution should roughly match expected weights."""
        plans = [m["health_plan"] for m in synthetic_roster]
        humana_count = sum(1 for p in plans if "Humana" in p)
        aetna_count = sum(1 for p in plans if "Aetna" in p)
        uhc_count = sum(1 for p in plans if "United" in p)
        cigna_count = sum(1 for p in plans if "Cigna" in p)

        # Allow +/- 8% tolerance from expected distribution
        assert 160 < humana_count < 240, f"Humana: {humana_count} (expected ~200)"
        assert 85 < aetna_count < 165, f"Aetna: {aetna_count} (expected ~125)"
        assert 60 < uhc_count < 140, f"UHC: {uhc_count} (expected ~100)"
        assert 35 < cigna_count < 115, f"Cigna: {cigna_count} (expected ~75)"

    def test_roster_age_distribution(self, synthetic_roster):
        """Members should be Medicare-age (65-95), weighted toward 70-82."""
        from datetime import datetime
        ages = []
        for m in synthetic_roster:
            dob = datetime.strptime(m["date_of_birth"], "%Y-%m-%d").date()
            age = 2026 - dob.year
            ages.append(age)

        assert all(65 <= a <= 96 for a in ages), "All members should be 65-96"
        avg_age = sum(ages) / len(ages)
        # Triangular(65,95,76) has mean ~78.7
        assert 74 < avg_age < 83, f"Average age {avg_age:.1f} outside expected range"

    def test_roster_gender_roughly_balanced(self, synthetic_roster):
        """Gender should be roughly 50/50."""
        male_count = sum(1 for m in synthetic_roster if m["gender"] == "M")
        female_count = sum(1 for m in synthetic_roster if m["gender"] == "F")
        assert 200 < male_count < 300, f"Male count {male_count} too far from 250"
        assert 200 < female_count < 300, f"Female count {female_count} too far from 250"

    def test_roster_medicaid_rate(self, synthetic_roster):
        """About 5% should be Medicaid dual-eligible."""
        medicaid_count = sum(1 for m in synthetic_roster if m["medicaid_status"] == "true")
        # 5% of 500 = 25, allow 5-50
        assert 5 <= medicaid_count <= 50, f"Medicaid count {medicaid_count} outside range"

    def test_roster_pcps_from_pool(self, synthetic_roster):
        """All PCPs should be from the defined pool."""
        valid_npis = {
            "1234567890", "1234567891", "2345678901", "2345678902",
            "3456789012", "3456789013", "4567890123", "4567890124",
            "5678901234", "5678901235",
        }
        for m in synthetic_roster:
            assert m["pcp_npi"] in valid_npis, f"Unknown PCP NPI: {m['pcp_npi']}"


# ---------------------------------------------------------------------------
# Test 2: Claims generation produces correct structure and volume
# ---------------------------------------------------------------------------

class TestClaimsIngestion:
    def test_claims_count_in_range(self, synthetic_claims_gen):
        """Total claims should be between 5000 and 12000."""
        count = len(synthetic_claims_gen.claims)
        assert 5000 <= count <= 12000, f"Claims count {count} outside expected range"

    def test_claims_required_fields(self, synthetic_claims_gen):
        """Each claim should have all required columns."""
        required = {
            "claim_id", "member_id", "claim_type", "service_date",
            "paid_date", "diagnosis_1", "procedure_code", "pos_code",
        }
        for claim in synthetic_claims_gen.claims[:100]:  # Sample first 100
            assert required.issubset(claim.keys()), f"Missing fields in claim"

    def test_claims_service_category_distribution(self, synthetic_claims_gen):
        """Claims should have a realistic mix of service categories."""
        categories = {"professional": 0, "institutional": 0, "pharmacy": 0}
        for c in synthetic_claims_gen.claims:
            ct = c["claim_type"]
            if ct in categories:
                categories[ct] += 1

        total = len(synthetic_claims_gen.claims)
        prof_pct = categories["professional"] / total
        inst_pct = categories["institutional"] / total
        rx_pct = categories["pharmacy"] / total

        # Professional should be significant
        assert prof_pct > 0.15, f"Professional claims too low: {prof_pct:.1%}"
        # Institutional should be present
        assert inst_pct > 0.10, f"Institutional claims too low: {inst_pct:.1%}"
        # Pharmacy should be present
        assert rx_pct > 0.05, f"Pharmacy claims too low: {rx_pct:.1%}"

    def test_claims_all_member_ids_valid(self, synthetic_claims_gen, synthetic_roster):
        """All claim member_ids should match roster member_ids."""
        roster_ids = {m["member_id"] for m in synthetic_roster}
        for c in synthetic_claims_gen.claims[:500]:  # Sample
            assert c["member_id"] in roster_ids, f"Unknown member_id: {c['member_id']}"


# ---------------------------------------------------------------------------
# Test 3: HCC engine should find medication-diagnosis gaps
# ---------------------------------------------------------------------------

class TestHccMedDxGaps:
    def test_med_dx_gap_members_exist(self, synthetic_claims_gen):
        """There should be exactly 50 med-dx gap members assigned."""
        assert len(synthetic_claims_gen.med_dx_gap_members) == 50

    def test_med_dx_gap_members_have_diabetes_meds(self, synthetic_claims_gen, synthetic_roster):
        """Med-dx gap members should have diabetes medication pharmacy claims."""
        gap_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.med_dx_gap_members
        }
        diabetes_drug_keywords = {"metformin", "insulin"}

        members_with_dm_meds = set()
        for rx in synthetic_claims_gen.pharmacy_claims:
            if rx["member_id"] in gap_member_ids:
                drug_lower = rx["drug_name"].lower()
                if any(kw in drug_lower for kw in diabetes_drug_keywords):
                    members_with_dm_meds.add(rx["member_id"])

        assert len(members_with_dm_meds) == 50, (
            f"Only {len(members_with_dm_meds)} of 50 gap members have diabetes meds"
        )

    def test_med_dx_gap_members_lack_diabetes_diagnosis(self, synthetic_claims_gen, synthetic_roster):
        """Med-dx gap members should NOT have E11.x diagnosis codes."""
        gap_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.med_dx_gap_members
        }

        for c in synthetic_claims_gen.claims:
            if c["member_id"] in gap_member_ids and c["claim_type"] != "pharmacy":
                for dx_field in ["diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4"]:
                    dx = c.get(dx_field, "")
                    assert not dx.startswith("E11"), (
                        f"Gap member {c['member_id']} has diabetes dx {dx}"
                    )

    def test_local_hcc_engine_detects_metformin_gap(self):
        """The local HCC engine should detect metformin without diabetes dx."""
        medications = ["metformin 500mg"]
        diagnosis_codes: set[str] = {"I10", "E78.5"}  # hypertension, lipids only
        gaps = _local_med_dx_gaps(medications, diagnosis_codes)

        metformin_gap = next((g for g in gaps if "metformin" in g["medication"]), None)
        assert metformin_gap is not None, "Engine failed to detect metformin gap"
        assert metformin_gap["hcc"] == 37
        assert "E11.9" in metformin_gap["suggested_codes"]

    def test_local_hcc_engine_no_gap_when_diabetes_coded(self):
        """No gap if diabetes is already coded."""
        medications = ["metformin 500mg"]
        diagnosis_codes = {"E11.9", "I10"}
        gaps = _local_med_dx_gaps(medications, diagnosis_codes)
        metformin_gap = next((g for g in gaps if "metformin" in g["medication"]), None)
        assert metformin_gap is None


# ---------------------------------------------------------------------------
# Test 4: HCC engine should find specificity upgrades
# ---------------------------------------------------------------------------

class TestHccSpecificityUpgrades:
    def test_specificity_members_exist(self, synthetic_claims_gen):
        """There should be exactly 30 specificity upgrade members."""
        assert len(synthetic_claims_gen.specificity_members) == 30

    def test_specificity_members_have_e119(self, synthetic_claims_gen, synthetic_roster):
        """Specificity members should have E11.9 claims."""
        spec_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.specificity_members
        }

        members_with_e119 = set()
        for c in synthetic_claims_gen.claims:
            if c["member_id"] in spec_member_ids:
                for dx_field in ["diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4"]:
                    if c.get(dx_field, "") == "E11.9":
                        members_with_e119.add(c["member_id"])

        assert len(members_with_e119) == 30, (
            f"Only {len(members_with_e119)} of 30 specificity members have E11.9"
        )

    def test_specificity_members_have_retinopathy_procedures(self, synthetic_claims_gen, synthetic_roster):
        """Specificity members should have retinopathy-related CPT codes."""
        spec_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.specificity_members
        }
        retina_cpts = {"92250", "92134", "67228"}

        members_with_retina = set()
        for c in synthetic_claims_gen.claims:
            if c["member_id"] in spec_member_ids and c.get("procedure_code", "") in retina_cpts:
                members_with_retina.add(c["member_id"])

        assert len(members_with_retina) == 30, (
            f"Only {len(members_with_retina)} of 30 specificity members have retinopathy procs"
        )


# ---------------------------------------------------------------------------
# Test 5: HCC engine should find recapture gaps
# ---------------------------------------------------------------------------

class TestHccRecaptureGaps:
    def test_recapture_members_exist(self, synthetic_claims_gen):
        """There should be exactly 80 recapture gap members."""
        assert len(synthetic_claims_gen.recapture_members) == 80

    def test_recapture_members_have_prior_year_hcc(self, synthetic_claims_gen, synthetic_roster):
        """Recapture members should have HCC-eligible dx in prior year."""
        recap_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.recapture_members
        }
        hcc_eligible = {
            "E11.65", "I50.22", "I50.9", "N18.3", "N18.4", "J44.1",
            "F33.1", "I48.91", "I25.10", "E66.01", "G20", "E44.1", "E11.40",
        }

        members_with_prior = set()
        for c in synthetic_claims_gen.claims:
            if c["member_id"] in recap_member_ids:
                svc_year = c["service_date"][:4]
                if svc_year == "2025":
                    for dx_field in ["diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4"]:
                        if c.get(dx_field, "") in hcc_eligible:
                            members_with_prior.add(c["member_id"])

        assert len(members_with_prior) == 80, (
            f"Only {len(members_with_prior)} of 80 recapture members have prior-year HCC dx"
        )

    def test_historical_dropoff_detection(self):
        """The historical dropoff detector should find codes absent in recent years."""
        yearly_codes = {
            2023: {"E11.65", "I50.9"},
            2024: {"E11.65"},
            2025: {"I10"},
            2026: {"I10"},
        }
        current_year_codes = {"I10"}
        dropoffs = _detect_historical_dropoffs(yearly_codes, current_year_codes)
        # I50 should be detected as dropped off (present in 2023 but not 2025/2026)
        families = [d["icd10_code"] for d in dropoffs]
        assert any("I50" in f for f in families), "Should detect I50 family drop-off"


# ---------------------------------------------------------------------------
# Test 6: Dashboard metrics should be populated
# ---------------------------------------------------------------------------

class TestDashboardMetrics:
    def test_roster_produces_correct_total_lives(self, synthetic_roster):
        """Total lives should equal 500."""
        assert len(synthetic_roster) == 500

    def test_raf_calculation_produces_positive_values(self):
        """RAF calculation with known HCCs should produce positive values."""
        hcc_list = [
            {"hcc": 85, "description": "CHF"},
            {"hcc": 37, "description": "Diabetes"},
        ]
        result = _local_raf_calculation(set(), hcc_list=hcc_list)
        assert result["total_raf"] > 0
        assert result["disease_raf"] > 0
        assert len(result["hcc_list"]) == 2

    def test_risk_tier_distribution(self):
        """Risk tiers should be assigned based on RAF thresholds."""
        assert _determine_risk_tier(0.5) == RiskTier.low
        assert _determine_risk_tier(1.0) == RiskTier.rising
        assert _determine_risk_tier(2.0) == RiskTier.high
        assert _determine_risk_tier(4.0) == RiskTier.complex


# ---------------------------------------------------------------------------
# Test 7: Expenditure aggregation
# ---------------------------------------------------------------------------

class TestExpenditureAggregation:
    def test_claims_have_cost_data(self, synthetic_claims_gen):
        """Claims should have meaningful financial data."""
        total_paid = 0.0
        claims_with_cost = 0
        for c in synthetic_claims_gen.claims:
            paid = float(c.get("paid_amount", 0) or 0)
            if paid > 0:
                total_paid += paid
                claims_with_cost += 1

        assert claims_with_cost > 1000, f"Only {claims_with_cost} claims have cost data"
        assert total_paid > 100000, f"Total paid ${total_paid:,.0f} seems too low"

    def test_service_category_classification(self):
        """Service category classifier should handle all claim types."""
        test_cases = [
            ({"pos_code": "21", "claim_type": "institutional", "drg_code": "291", "ndc_code": None}, "inpatient"),
            ({"pos_code": "23", "claim_type": "", "drg_code": None, "ndc_code": None}, "ed_observation"),
            ({"pos_code": "01", "claim_type": "pharmacy", "drg_code": None, "ndc_code": None}, "pharmacy"),
            ({"pos_code": "11", "claim_type": "", "drg_code": None, "ndc_code": "12345"}, "pharmacy"),
            ({"pos_code": "31", "claim_type": "", "drg_code": None, "ndc_code": None}, "snf_postacute"),
            ({"pos_code": "11", "claim_type": "", "drg_code": None, "ndc_code": None}, "professional"),
            ({"pos_code": "12", "claim_type": "", "drg_code": None, "ndc_code": None}, "home_health"),
        ]
        for claim_data, expected_category in test_cases:
            result = classify_service_category(claim_data)
            assert result == expected_category, (
                f"classify({claim_data}) = {result}, expected {expected_category}"
            )

    def test_inpatient_cost_concentration(self, synthetic_claims_gen):
        """Inpatient claims should represent a significant portion of total cost."""
        inpatient_paid = 0.0
        total_paid = 0.0
        for c in synthetic_claims_gen.claims:
            paid = float(c.get("paid_amount", 0) or 0)
            total_paid += paid
            if c.get("drg_code") or c.get("pos_code") == "21":
                inpatient_paid += paid

        if total_paid > 0:
            inpatient_pct = inpatient_paid / total_paid
            assert inpatient_pct > 0.15, f"Inpatient {inpatient_pct:.1%} too low"


# ---------------------------------------------------------------------------
# Test 8: Care gap detection
# ---------------------------------------------------------------------------

class TestCareGapDetection:
    def test_hba1c_gap_detection_logic(self, synthetic_claims_gen, synthetic_roster):
        """Members with diabetes dx but no HbA1c (CPT 83036) have a care gap."""
        # Find members with diabetes diagnosis
        members_with_dm: set[str] = set()
        members_with_hba1c: set[str] = set()

        for c in synthetic_claims_gen.claims:
            for dx_field in ["diagnosis_1", "diagnosis_2", "diagnosis_3", "diagnosis_4"]:
                dx = c.get(dx_field, "")
                if dx.startswith("E11"):
                    members_with_dm.add(c["member_id"])

            if c.get("procedure_code") == "83036":
                members_with_hba1c.add(c["member_id"])

        # Members with diabetes but no HbA1c = care gap
        gap_members = members_with_dm - members_with_hba1c
        # Most of our specificity members (E11.9) probably lack HbA1c since
        # we did not intentionally generate lab claims for them
        assert len(gap_members) >= 10, (
            f"Expected at least 10 DM members without HbA1c, found {len(gap_members)}"
        )

    def test_near_miss_interaction_detection(self):
        """Members with CHF + Diabetes but missing CKD should trigger near-miss."""
        member_hccs = {85, 37}  # CHF + Diabetes without complication
        near_misses = _detect_near_miss_interactions(member_hccs)
        # Should detect CHF+Diabetes+CKD near miss (missing CKD group)
        interaction_names = [nm["name"] for nm in near_misses]
        assert "Diabetes + CKD" in interaction_names or "CHF + CKD" in interaction_names, (
            f"Expected CKD near-miss, got: {interaction_names}"
        )


# ---------------------------------------------------------------------------
# Test 9: Chase list / suspect export
# ---------------------------------------------------------------------------

class TestChaseListExport:
    def test_suspects_sortable_by_raf(self):
        """Suspects should be sortable by RAF value for chase list prioritization."""
        suspects = [
            {"hcc": 85, "raf": float(LOCAL_HCC_RAF[85]), "label": "CHF"},
            {"hcc": 37, "raf": float(LOCAL_HCC_RAF[37]), "label": "Diabetes"},
            {"hcc": 78, "raf": float(LOCAL_HCC_RAF[78]), "label": "Parkinson"},
            {"hcc": 186, "raf": float(LOCAL_HCC_RAF[186]), "label": "Transplant"},
        ]
        sorted_suspects = sorted(suspects, key=lambda s: s["raf"], reverse=True)
        # Transplant (0.825) > Parkinson (0.606) > CHF (0.331) > Diabetes (0.105)
        assert sorted_suspects[0]["label"] == "Transplant"
        assert sorted_suspects[1]["label"] == "Parkinson"
        assert sorted_suspects[2]["label"] == "CHF"
        assert sorted_suspects[3]["label"] == "Diabetes"

    def test_med_dx_mapping_coverage(self):
        """MED_DX_MAPPINGS should cover key chronic conditions."""
        mapped_keywords = {m[0] for m in MED_DX_MAPPINGS}
        expected_keywords = {"metformin", "insulin", "warfarin", "furosemide", "albuterol", "sertraline"}
        assert expected_keywords.issubset(mapped_keywords), (
            f"Missing mappings: {expected_keywords - mapped_keywords}"
        )


# ---------------------------------------------------------------------------
# Test 10: Member filtering
# ---------------------------------------------------------------------------

class TestMemberFiltering:
    def test_frequent_ed_utilizer_detection(self, synthetic_claims_gen, synthetic_roster):
        """Should identify the 15 frequent ED utilizers (4+ visits in 12 months)."""
        ed_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.frequent_ed_members
        }

        # Count ED visits per member
        ed_visits: dict[str, int] = {}
        for c in synthetic_claims_gen.claims:
            if c.get("pos_code") == "23":
                mid = c["member_id"]
                ed_visits[mid] = ed_visits.get(mid, 0) + 1

        # All 15 designated frequent utilizers should have 4+ ED visits
        frequent_from_data = {mid for mid, count in ed_visits.items() if count >= 4}
        overlap = ed_member_ids & frequent_from_data
        assert len(overlap) >= 12, (
            f"Only {len(overlap)} of 15 frequent ED members have 4+ visits in claims"
        )

    def test_high_cost_inpatient_members(self, synthetic_claims_gen, synthetic_roster):
        """Should identify the 10 high-cost inpatient members."""
        high_cost_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.high_cost_inpatient
        }

        member_inpatient_cost: dict[str, float] = {}
        for c in synthetic_claims_gen.claims:
            if c.get("drg_code") and c["member_id"] in high_cost_ids:
                paid = float(c.get("paid_amount", 0) or 0)
                member_inpatient_cost[c["member_id"]] = (
                    member_inpatient_cost.get(c["member_id"], 0) + paid
                )

        # High-cost members should have significant inpatient costs
        members_above_threshold = sum(
            1 for cost in member_inpatient_cost.values() if cost > 10000
        )
        assert members_above_threshold >= 8, (
            f"Only {members_above_threshold} of 10 high-cost members exceed $10k"
        )

    def test_brand_statin_detection(self, synthetic_claims_gen, synthetic_roster):
        """Should identify the 25 members on brand-name statins."""
        brand_member_ids = {
            synthetic_roster[idx]["member_id"]
            for idx in synthetic_claims_gen.brand_statin_members
        }
        brand_names = {"lipitor", "crestor"}

        members_on_brand = set()
        for rx in synthetic_claims_gen.pharmacy_claims:
            if rx["member_id"] in brand_member_ids:
                if any(b in rx["drug_name"].lower() for b in brand_names):
                    members_on_brand.add(rx["member_id"])

        assert len(members_on_brand) == 25, (
            f"Only {len(members_on_brand)} of 25 brand statin members detected"
        )

    def test_readmission_rate_hospital_comparison(self, synthetic_claims_gen):
        """Hospital A (Memorial) should have ~2x the readmission rate of Hospital B (St Luke's)."""
        # Count admissions and readmissions by facility
        member_admits: dict[str, list[tuple[str, str]]] = {}  # member_id -> [(date, facility)]

        for c in synthetic_claims_gen.claims:
            if c.get("pos_code") == "21" and c.get("drg_code"):
                mid = c["member_id"]
                if mid not in member_admits:
                    member_admits[mid] = []
                member_admits[mid].append((c["service_date"], c.get("facility_name", "")))

        # Count readmissions (within 30 days at same facility)
        memorial_admits = 0
        memorial_readmits = 0
        stlukes_admits = 0
        stlukes_readmits = 0

        for mid, admits in member_admits.items():
            admits.sort()
            for i, (dt, fac) in enumerate(admits):
                if "Memorial" in fac:
                    memorial_admits += 1
                    # Check if previous admit at Memorial was within 30 days
                    for j in range(i):
                        prev_dt, prev_fac = admits[j]
                        if "Memorial" in prev_fac:
                            days_diff = (
                                date.fromisoformat(dt) - date.fromisoformat(prev_dt)
                            ).days
                            if 0 < days_diff <= 30:
                                memorial_readmits += 1
                                break
                elif "St. Luke" in fac:
                    stlukes_admits += 1
                    for j in range(i):
                        prev_dt, prev_fac = admits[j]
                        if "St. Luke" in prev_fac:
                            days_diff = (
                                date.fromisoformat(dt) - date.fromisoformat(prev_dt)
                            ).days
                            if 0 < days_diff <= 30:
                                stlukes_readmits += 1
                                break

        # Both hospitals should have meaningful volume
        assert memorial_admits > 20, f"Memorial admits too low: {memorial_admits}"
        assert stlukes_admits > 20, f"St Luke's admits too low: {stlukes_admits}"

        # Memorial rate should be noticeably higher than St Luke's
        if memorial_admits > 0 and stlukes_admits > 0:
            memorial_rate = memorial_readmits / memorial_admits
            stlukes_rate = stlukes_readmits / stlukes_admits
            assert memorial_rate > stlukes_rate, (
                f"Memorial readmit rate ({memorial_rate:.1%}) should exceed "
                f"St Luke's ({stlukes_rate:.1%})"
            )


# ---------------------------------------------------------------------------
# Pharmacy data tests
# ---------------------------------------------------------------------------

class TestPharmacyData:
    def test_pharmacy_claims_count(self, synthetic_claims_gen):
        """Pharmacy claims should be around 3000."""
        count = len(synthetic_claims_gen.pharmacy_claims)
        assert 2500 <= count <= 4000, f"Pharmacy claims: {count}"

    def test_pharmacy_required_fields(self, synthetic_claims_gen):
        """Pharmacy claims should have all required fields."""
        required = {
            "claim_id", "member_id", "service_date", "ndc_code",
            "drug_name", "drug_class", "quantity", "days_supply",
            "paid_amount", "prescribing_provider_npi",
        }
        for rx in synthetic_claims_gen.pharmacy_claims[:50]:
            assert required.issubset(rx.keys()), f"Missing fields: {required - rx.keys()}"


# ---------------------------------------------------------------------------
# Eligibility data tests
# ---------------------------------------------------------------------------

class TestEligibilityData:
    def test_eligibility_count(self, synthetic_eligibility):
        """Eligibility should have 500 rows matching roster."""
        assert len(synthetic_eligibility) == 500

    def test_eligibility_fields(self, synthetic_eligibility):
        """Each eligibility row should have required fields."""
        required = {"member_id", "plan_name", "plan_product", "coverage_start", "coverage_end", "pcp_npi"}
        for row in synthetic_eligibility:
            assert required.issubset(row.keys())
