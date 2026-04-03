"""
Tuva Export Service — exports tenant data from PostgreSQL to DuckDB.

DuckDB serves as the warehouse for dbt/Tuva transformations.
After Tuva runs, the sync service reads output marts back.
"""

import logging
import os
from typing import Any

import duckdb
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Project root — one level above backend/
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
_DATA_DIR = os.path.join(_PROJECT_ROOT, "data")


def get_duckdb_path(tenant_schema: str | None = None) -> str:
    """Get the DuckDB file path, optionally scoped to a tenant.

    Multi-tenant isolation: each tenant gets its own DuckDB file so
    concurrent/sequential pipeline runs don't overwrite each other.
    """
    os.makedirs(_DATA_DIR, exist_ok=True)
    if tenant_schema:
        return os.path.join(_DATA_DIR, f"tuva_{tenant_schema}.duckdb")
    return os.path.join(_DATA_DIR, "tuva_warehouse.duckdb")


class TuvaExportService:
    """Exports AQSoft PostgreSQL data into DuckDB raw schema for Tuva."""

    def __init__(self, duckdb_path: str | None = None):
        self.duckdb_path = duckdb_path or get_duckdb_path()
        self._con: duckdb.DuckDBPyConnection | None = None

    def _get_connection(self) -> duckdb.DuckDBPyConnection:
        if self._con is None:
            self._con = duckdb.connect(self.duckdb_path)
            self._con.execute("CREATE SCHEMA IF NOT EXISTS raw")
        return self._con

    def close(self):
        if self._con:
            self._con.close()
            self._con = None

    async def export_claims(self, session: AsyncSession) -> int:
        """Export claims from PostgreSQL to DuckDB raw.claims."""
        result = await session.execute(text("""
            SELECT id, member_id, claim_id, claim_type, service_date,
                   paid_date, diagnosis_codes, procedure_code, drg_code,
                   ndc_code, billing_npi, billing_tin, facility_npi,
                   billed_amount, allowed_amount, paid_amount,
                   member_liability, service_category, pos_code,
                   drug_name, drug_class, quantity, days_supply, los,
                   status, data_tier
            FROM claims
            WHERE data_tier = 'record'
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.claims")
        con.execute("""
            CREATE TABLE raw.claims (
                id INTEGER,
                member_id INTEGER,
                claim_id VARCHAR,
                claim_type VARCHAR,
                service_date DATE,
                paid_date DATE,
                diagnosis_codes VARCHAR[],
                procedure_code VARCHAR,
                drg_code VARCHAR,
                ndc_code VARCHAR,
                billing_npi VARCHAR,
                billing_tin VARCHAR,
                facility_npi VARCHAR,
                billed_amount DOUBLE,
                allowed_amount DOUBLE,
                paid_amount DOUBLE,
                member_liability DOUBLE,
                service_category VARCHAR,
                pos_code VARCHAR,
                drug_name VARCHAR,
                drug_class VARCHAR,
                quantity DOUBLE,
                days_supply INTEGER,
                los INTEGER,
                status VARCHAR,
                data_tier VARCHAR
            )
        """)

        _CLAIMS_COLS = [
            "id", "member_id", "claim_id", "claim_type", "service_date",
            "paid_date", "diagnosis_codes", "procedure_code", "drg_code",
            "ndc_code", "billing_npi", "billing_tin", "facility_npi",
            "billed_amount", "allowed_amount", "paid_amount",
            "member_liability", "service_category", "pos_code",
            "drug_name", "drug_class", "quantity", "days_supply", "los",
            "status", "data_tier",
        ]
        if rows:
            for r in rows:
                d = dict(r)
                diag = d.get("diagnosis_codes")
                d["diagnosis_codes"] = list(diag) if diag else []
                con.execute(
                    f"INSERT INTO raw.claims ({', '.join(_CLAIMS_COLS)}) VALUES ({', '.join('?' for _ in _CLAIMS_COLS)})",
                    [d[c] for c in _CLAIMS_COLS],
                )

        count = con.execute("SELECT count(*) FROM raw.claims").fetchone()[0]
        logger.info("Exported %d claims to DuckDB raw.claims", count)
        return count

    async def export_members(self, session: AsyncSession) -> int:
        """Export members from PostgreSQL to DuckDB raw.members."""
        result = await session.execute(text("""
            SELECT member_id, first_name, last_name, date_of_birth,
                   gender, zip_code, health_plan, plan_product,
                   coverage_start, coverage_end,
                   medicaid_status, disability_status, institutional
            FROM members
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.members")
        con.execute("""
            CREATE TABLE raw.members (
                member_id VARCHAR,
                first_name VARCHAR,
                last_name VARCHAR,
                date_of_birth DATE,
                gender VARCHAR,
                zip_code VARCHAR,
                health_plan VARCHAR,
                plan_product VARCHAR,
                coverage_start DATE,
                coverage_end DATE,
                medicaid_status BOOLEAN,
                disability_status BOOLEAN,
                institutional BOOLEAN
            )
        """)

        _MEMBER_COLS = [
            "member_id", "first_name", "last_name", "date_of_birth",
            "gender", "zip_code", "health_plan", "plan_product",
            "coverage_start", "coverage_end",
            "medicaid_status", "disability_status", "institutional",
        ]
        if rows:
            for r in rows:
                d = dict(r)
                con.execute(
                    f"INSERT INTO raw.members ({', '.join(_MEMBER_COLS)}) VALUES ({', '.join('?' for _ in _MEMBER_COLS)})",
                    [d[c] for c in _MEMBER_COLS],
                )

        count = con.execute("SELECT count(*) FROM raw.members").fetchone()[0]
        logger.info("Exported %d members to DuckDB raw.members", count)
        return count

    async def export_all(self, session: AsyncSession) -> dict[str, int]:
        """Export all data from PostgreSQL to DuckDB for Tuva."""
        claims_count = await self.export_claims(session)
        members_count = await self.export_members(session)
        return {
            "claims": claims_count,
            "members": members_count,
        }
