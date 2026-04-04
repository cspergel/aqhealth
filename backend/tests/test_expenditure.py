"""Tests for expenditure analytics service."""

from app.services.expenditure_service import SERVICE_CATEGORIES, CATEGORY_LABELS


def test_service_categories_defined():
    """All service categories have labels."""
    for cat in SERVICE_CATEGORIES:
        assert cat in CATEGORY_LABELS, f"Missing label for category: {cat}"


def test_category_labels_complete():
    """Category labels cover all service categories."""
    assert len(CATEGORY_LABELS) >= len(SERVICE_CATEGORIES)


def test_expected_categories():
    """Core categories exist."""
    expected = {"inpatient", "professional", "pharmacy", "ed_observation"}
    assert expected.issubset(set(SERVICE_CATEGORIES))
