"""Tests for database schema validation (no database connection needed)."""

import pytest

from app.database import validate_schema_name


def test_validate_schema_name_valid():
    """Valid schema names should pass through unchanged."""
    assert validate_schema_name("sunstate") == "sunstate"
    assert validate_schema_name("acme_health") == "acme_health"
    assert validate_schema_name("tenant_01") == "tenant_01"
    assert validate_schema_name("ab") == "ab"  # minimum length


def test_validate_schema_name_invalid_chars():
    """Schema names with special characters should be rejected."""
    with pytest.raises(ValueError):
        validate_schema_name("my-tenant")
    with pytest.raises(ValueError):
        validate_schema_name("my tenant")
    with pytest.raises(ValueError):
        validate_schema_name("my.tenant")
    with pytest.raises(ValueError):
        validate_schema_name("UPPER")
    with pytest.raises(ValueError):
        validate_schema_name("has@symbol")


def test_validate_schema_name_too_long():
    """Schema names over 63 characters should be rejected."""
    long_name = "a" * 64
    with pytest.raises(ValueError):
        validate_schema_name(long_name)


def test_validate_schema_name_starts_with_number():
    """Schema names starting with a number should be rejected."""
    with pytest.raises(ValueError):
        validate_schema_name("1tenant")
    with pytest.raises(ValueError):
        validate_schema_name("9_schema")


def test_validate_schema_name_sql_injection_attempt():
    """SQL injection attempts should be rejected."""
    with pytest.raises(ValueError):
        validate_schema_name("tenant; DROP TABLE users;--")
    with pytest.raises(ValueError):
        validate_schema_name("' OR 1=1 --")
    with pytest.raises(ValueError):
        validate_schema_name("tenant\"; DROP SCHEMA public CASCADE;--")
    with pytest.raises(ValueError):
        validate_schema_name("")
    with pytest.raises(ValueError):
        validate_schema_name("a")  # too short (min 2 chars)


def test_validate_schema_name_underscore_start():
    """Schema names starting with underscore should be rejected (must start with letter)."""
    with pytest.raises(ValueError):
        validate_schema_name("_private")
