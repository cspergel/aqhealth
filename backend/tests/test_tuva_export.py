"""Tests for the Tuva DuckDB export service."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.tuva_export_service import TuvaExportService


@pytest.mark.asyncio
async def test_export_creates_raw_claims_table():
    """Verify export creates the raw.claims table in DuckDB."""
    service = TuvaExportService(duckdb_path=":memory:")

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.mappings.return_value.all.return_value = [
        {
            "id": 1, "member_id": 101, "claim_id": "CLM001",
            "claim_type": "professional", "service_date": "2026-01-15",
            "paid_date": "2026-02-01", "diagnosis_codes": ["E11.65", "I10"],
            "procedure_code": "99213", "drg_code": None, "ndc_code": None,
            "billing_npi": "1234567890", "billing_tin": "123456789",
            "facility_npi": None, "billed_amount": 150.00,
            "allowed_amount": 120.00, "paid_amount": 96.00,
            "member_liability": 24.00, "service_category": "professional",
            "pos_code": "11", "drug_name": None, "drug_class": None,
            "quantity": None, "days_supply": None, "los": None,
            "status": "paid", "data_tier": "record",
        }
    ]
    mock_session.execute.return_value = mock_result

    count = await service.export_claims(mock_session)
    assert count == 1

    con = service._get_connection()
    row = con.execute("SELECT claim_id, claim_type FROM raw.claims").fetchone()
    assert row[0] == "CLM001"
    assert row[1] == "professional"

    service.close()


@pytest.mark.asyncio
async def test_export_creates_raw_members_table():
    """Verify export creates the raw.members table in DuckDB."""
    service = TuvaExportService(duckdb_path=":memory:")

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.mappings.return_value.all.return_value = [
        {
            "member_id": "M001", "first_name": "John", "last_name": "Doe",
            "date_of_birth": "1955-03-15", "gender": "M", "zip_code": "33701",
            "health_plan": "Humana Gold Plus", "plan_product": "MAPD",
            "coverage_start": "2026-01-01", "coverage_end": None,
            "medicaid_status": False, "disability_status": False,
            "institutional": False,
        }
    ]
    mock_session.execute.return_value = mock_result

    count = await service.export_members(mock_session)
    assert count == 1

    con = service._get_connection()
    row = con.execute("SELECT member_id, first_name FROM raw.members").fetchone()
    assert row[0] == "M001"
    assert row[1] == "John"

    service.close()


@pytest.mark.asyncio
async def test_export_all_returns_counts():
    """Verify export_all returns counts for all tables."""
    service = TuvaExportService(duckdb_path=":memory:")

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.mappings.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    result = await service.export_all(mock_session)
    assert "claims" in result
    assert "members" in result
    assert result["claims"] == 0
    assert result["members"] == 0

    service.close()
