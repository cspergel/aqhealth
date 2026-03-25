"""Tests for HCC engine local fallback logic (no SNF service needed)."""

import pytest
from decimal import Decimal
from datetime import date
from unittest.mock import patch

from app.services.hcc_engine import (
    MED_DX_MAPPINGS,
    LOCAL_HCC_RAF,
    _local_med_dx_gaps,
    _local_raf_calculation,
    _determine_risk_tier,
    get_current_payment_year,
)
from app.models.member import RiskTier


# ---------------------------------------------------------------------------
# Local medication-to-diagnosis mapping tests
# ---------------------------------------------------------------------------

def test_local_med_dx_mapping_metformin_to_diabetes():
    """Metformin without any E11 diagnosis should produce a diabetes gap."""
    medications = ["metformin 500mg"]
    diagnosis_codes: set[str] = set()  # no diagnoses at all
    gaps = _local_med_dx_gaps(medications, diagnosis_codes)

    assert len(gaps) >= 1
    metformin_gap = next((g for g in gaps if "metformin" in g["medication"]), None)
    assert metformin_gap is not None
    assert metformin_gap["missing_diagnosis"] == "Type 2 diabetes mellitus"
    assert "E11.9" in metformin_gap["suggested_codes"]
    assert metformin_gap["hcc"] == 37


def test_local_med_dx_mapping_warfarin_to_afib():
    """Warfarin without I48 diagnosis should produce an atrial fibrillation gap."""
    medications = ["warfarin 5mg"]
    diagnosis_codes: set[str] = set()
    gaps = _local_med_dx_gaps(medications, diagnosis_codes)

    warfarin_gap = next((g for g in gaps if "warfarin" in g["medication"]), None)
    assert warfarin_gap is not None
    assert warfarin_gap["missing_diagnosis"] == "Atrial fibrillation"
    assert warfarin_gap["hcc"] == 96
    assert warfarin_gap["raf"] == pytest.approx(0.268)


def test_local_med_dx_mapping_unknown_med_returns_none():
    """An unknown medication should not produce any gaps."""
    medications = ["acetaminophen 500mg"]
    diagnosis_codes: set[str] = set()
    gaps = _local_med_dx_gaps(medications, diagnosis_codes)
    assert len(gaps) == 0


def test_local_med_dx_no_gap_when_diagnosis_present():
    """If the diagnosis is already coded, no gap should be produced."""
    medications = ["metformin 500mg"]
    diagnosis_codes = {"E11.9"}  # diabetes already coded
    gaps = _local_med_dx_gaps(medications, diagnosis_codes)

    metformin_gap = next((g for g in gaps if "metformin" in g["medication"]), None)
    assert metformin_gap is None


# ---------------------------------------------------------------------------
# Local RAF lookup tests
# ---------------------------------------------------------------------------

def test_local_raf_lookup_known_hcc():
    """Known HCC codes should return their mapped RAF values."""
    # HCC 85 = Congestive Heart Failure = 0.331
    assert LOCAL_HCC_RAF[85] == Decimal("0.331")
    # HCC 18 = Diabetes with Chronic Complications = 0.302
    assert LOCAL_HCC_RAF[18] == Decimal("0.302")
    # HCC 111 = COPD = 0.328
    assert LOCAL_HCC_RAF[111] == Decimal("0.328")


def test_local_raf_lookup_unknown_hcc():
    """Unknown HCC code should not be in the lookup table."""
    assert 999 not in LOCAL_HCC_RAF
    assert 0 not in LOCAL_HCC_RAF


def test_local_raf_calculation_with_hcc_list():
    """RAF calculation with known HCC items should sum correctly."""
    hcc_list = [
        {"hcc": 85, "description": "CHF"},
        {"hcc": 37, "description": "Diabetes without Complication"},
    ]
    result = _local_raf_calculation(set(), hcc_list=hcc_list)
    expected = float(Decimal("0.331") + Decimal("0.105"))
    assert result["total_raf"] == pytest.approx(expected)
    assert result["disease_raf"] == pytest.approx(expected)
    assert result["demographic_raf"] == 0.0
    assert len(result["hcc_list"]) == 2


def test_local_raf_calculation_empty():
    """Empty inputs should return zero RAF."""
    result = _local_raf_calculation(set())
    assert result["total_raf"] == 0.0
    assert result["hcc_list"] == []


# ---------------------------------------------------------------------------
# Risk tier assignment tests
# ---------------------------------------------------------------------------

def test_risk_tier_assignment():
    """Test risk tier boundaries: low < 0.8, rising 0.8-1.5, high 1.5-3.0, complex >= 3.0."""
    assert _determine_risk_tier(0.0) == RiskTier.low
    assert _determine_risk_tier(0.5) == RiskTier.low
    assert _determine_risk_tier(0.79) == RiskTier.low
    assert _determine_risk_tier(0.8) == RiskTier.rising
    assert _determine_risk_tier(1.0) == RiskTier.rising
    assert _determine_risk_tier(1.49) == RiskTier.rising
    assert _determine_risk_tier(1.5) == RiskTier.high
    assert _determine_risk_tier(2.5) == RiskTier.high
    assert _determine_risk_tier(2.99) == RiskTier.high
    assert _determine_risk_tier(3.0) == RiskTier.complex
    assert _determine_risk_tier(5.0) == RiskTier.complex


# ---------------------------------------------------------------------------
# Payment year test
# ---------------------------------------------------------------------------

def test_get_current_payment_year_returns_current_year():
    """get_current_payment_year should return the current calendar year."""
    expected = date.today().year
    assert get_current_payment_year() == expected
