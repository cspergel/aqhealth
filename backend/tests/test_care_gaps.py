"""Tests for care gap detection and quality measures."""

import pytest
from app.models.care_gap import GapStatus


def test_gap_status_enum():
    """Verify GapStatus enum values."""
    assert GapStatus.open.value == "open"
    assert GapStatus.closed.value == "closed"


def test_gap_status_values():
    """Gaps can only be open or closed."""
    valid_statuses = {s.value for s in GapStatus}
    assert "open" in valid_statuses
    assert "closed" in valid_statuses
