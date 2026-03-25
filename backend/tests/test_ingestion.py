"""Tests for ingestion service logic (no database needed)."""

import pytest

from app.services.ingestion_service import classify_service_category


def test_classify_service_category_inpatient():
    """POS 21 with a DRG code should classify as inpatient."""
    claim_data = {
        "pos_code": "21",
        "claim_type": "institutional",
        "drg_code": "470",
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "inpatient"


def test_classify_service_category_inpatient_drg_only():
    """Any claim with a DRG code (regardless of POS) should classify as inpatient."""
    claim_data = {
        "pos_code": "11",
        "claim_type": "professional",
        "drg_code": "470",
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "inpatient"


def test_classify_service_category_ed():
    """POS 23 should classify as ed_observation."""
    claim_data = {
        "pos_code": "23",
        "claim_type": "",
        "drg_code": None,
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "ed_observation"


def test_classify_service_category_pharmacy():
    """claim_type pharmacy should classify as pharmacy regardless of POS."""
    claim_data = {
        "pos_code": "01",
        "claim_type": "pharmacy",
        "drg_code": None,
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "pharmacy"


def test_classify_service_category_pharmacy_by_ndc():
    """Presence of NDC code should classify as pharmacy."""
    claim_data = {
        "pos_code": "11",
        "claim_type": "",
        "drg_code": None,
        "ndc_code": "12345678901",
    }
    assert classify_service_category(claim_data) == "pharmacy"


def test_classify_service_category_snf():
    """POS 31 and 32 should classify as snf_postacute."""
    for pos in ("31", "32"):
        claim_data = {
            "pos_code": pos,
            "claim_type": "",
            "drg_code": None,
            "ndc_code": None,
        }
        assert classify_service_category(claim_data) == "snf_postacute", f"Failed for POS {pos}"


def test_classify_service_category_professional():
    """POS 11 (Office) without DRG should classify as professional."""
    claim_data = {
        "pos_code": "11",
        "claim_type": "",
        "drg_code": None,
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "professional"


def test_classify_service_category_home_health():
    """POS 12 should classify as home_health."""
    claim_data = {
        "pos_code": "12",
        "claim_type": "",
        "drg_code": None,
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "home_health"


def test_classify_service_category_other():
    """Unknown POS and claim_type should return other."""
    claim_data = {
        "pos_code": "99",
        "claim_type": "",
        "drg_code": None,
        "ndc_code": None,
    }
    assert classify_service_category(claim_data) == "other"
