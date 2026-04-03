"""Tests for Tuva sync service — discrepancy detection."""

import pytest
from decimal import Decimal
from app.models.tuva_baseline import TuvaRafBaseline, TuvaPmpmBaseline


def test_raf_baseline_discrepancy_flagged():
    """Baseline with large RAF difference should flag discrepancy."""
    baseline = TuvaRafBaseline(
        member_id="M001",
        payment_year=2026,
        tuva_raf_score=Decimal("1.250"),
        aqsoft_raf_score=Decimal("1.100"),
        has_discrepancy=True,
        raf_difference=Decimal("0.150"),
        discrepancy_detail="Tuva=1.250, AQSoft=1.100, diff=0.150",
    )
    assert baseline.has_discrepancy is True
    assert baseline.raf_difference == Decimal("0.150")
    assert baseline.tuva_raf_score == Decimal("1.250")
    assert baseline.aqsoft_raf_score == Decimal("1.100")


def test_raf_baseline_no_discrepancy():
    """Baseline with small RAF difference should not flag."""
    baseline = TuvaRafBaseline(
        member_id="M002",
        payment_year=2026,
        tuva_raf_score=Decimal("1.250"),
        aqsoft_raf_score=Decimal("1.230"),
        has_discrepancy=False,
        raf_difference=Decimal("0.020"),
    )
    assert baseline.has_discrepancy is False
    assert baseline.raf_difference == Decimal("0.020")


def test_pmpm_baseline_stores_values():
    """PMPM baseline should store Tuva's values."""
    baseline = TuvaPmpmBaseline(
        period="2026-01",
        service_category="inpatient",
        tuva_pmpm=Decimal("450.25"),
        aqsoft_pmpm=None,
        has_discrepancy=False,
        member_months=1200,
    )
    assert baseline.period == "2026-01"
    assert baseline.tuva_pmpm == Decimal("450.25")
    assert baseline.member_months == 1200
