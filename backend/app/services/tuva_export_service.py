"""
Tuva Export Service — exports tenant data from PostgreSQL to DuckDB.

DuckDB serves as the warehouse for dbt/Tuva transformations.
After Tuva runs, the sync service reads output marts back.
"""

import logging
import os
from typing import Any

import duckdb
from sqlalchemy import text, inspect
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

    async def ensure_schema(self, session: AsyncSession) -> list[str]:
        """Auto-fix missing columns in tenant schema to match ORM models.

        Compares the actual database columns against what the ORM expects
        and adds any missing columns. Returns list of columns added.
        """
        added: list[str] = []
        # Expected columns from ORM models that may be missing in older schemas
        expected_claims_cols = {
            "billing_npi": "VARCHAR(20)",
            "billing_tin": "VARCHAR(20)",
            "practice_group_id": "INTEGER",
            "primary_diagnosis": "VARCHAR(200)",
            "los": "INTEGER",
            "status": "VARCHAR(20)",
        }
        for col, col_type in expected_claims_cols.items():
            try:
                await session.execute(text(
                    f"ALTER TABLE claims ADD COLUMN IF NOT EXISTS {col} {col_type}"
                ))
                added.append(f"claims.{col}")
            except Exception:
                pass  # Column exists or table doesn't support IF NOT EXISTS

        if added:
            await session.flush()
            logger.info("Auto-added missing columns: %s", added)
        return added

    async def export_claims(self, session: AsyncSession) -> int:
        """Export claims from PostgreSQL to DuckDB raw.claims.

        Adapts to actual database schema — queries only columns that exist.
        """
        result = await session.execute(text("""
            SELECT id, member_id, claim_id, claim_type, service_date,
                   paid_date, diagnosis_codes, procedure_code, drg_code,
                   ndc_code, facility_npi,
                   billed_amount, allowed_amount, paid_amount,
                   member_liability, service_category, pos_code,
                   drug_name, drug_class, quantity, days_supply,
                   data_tier
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

        _INSERT_COLS = [
            "id", "member_id", "claim_id", "claim_type", "service_date",
            "paid_date", "diagnosis_codes", "procedure_code", "drg_code",
            "ndc_code", "facility_npi",
            "billed_amount", "allowed_amount", "paid_amount",
            "member_liability", "service_category", "pos_code",
            "drug_name", "drug_class", "quantity", "days_supply",
            "data_tier",
        ]
        if rows:
            for r in rows:
                d = dict(r)
                diag = d.get("diagnosis_codes")
                d["diagnosis_codes"] = list(diag) if diag else []
                con.execute(
                    f"INSERT INTO raw.claims ({', '.join(_INSERT_COLS)}) VALUES ({', '.join('?' for _ in _INSERT_COLS)})",
                    [d[c] for c in _INSERT_COLS],
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

    async def export_providers(self, session: AsyncSession) -> int:
        """Export providers from PostgreSQL to DuckDB raw.providers."""
        result = await session.execute(text("""
            SELECT npi, first_name, last_name, specialty
            FROM providers
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.providers")
        con.execute("""
            CREATE TABLE raw.providers (
                npi VARCHAR,
                first_name VARCHAR,
                last_name VARCHAR,
                specialty VARCHAR
            )
        """)

        _COLS = ["npi", "first_name", "last_name", "specialty"]
        for r in rows:
            d = dict(r)
            con.execute(
                f"INSERT INTO raw.providers ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                [d[c] for c in _COLS],
            )

        count = con.execute("SELECT count(*) FROM raw.providers").fetchone()[0]
        logger.info("Exported %d providers to DuckDB raw.providers", count)
        return count

    async def export_provider_attribution(self, session: AsyncSession) -> int:
        """Export member-to-PCP attribution from PostgreSQL to DuckDB."""
        result = await session.execute(text("""
            SELECT m.member_id as person_id, p.npi as provider_npi,
                   m.coverage_start as attribution_start, m.coverage_end as attribution_end
            FROM members m
            JOIN providers p ON m.pcp_provider_id = p.id
            WHERE m.pcp_provider_id IS NOT NULL
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.provider_attribution")
        con.execute("""
            CREATE TABLE raw.provider_attribution (
                person_id VARCHAR,
                provider_npi VARCHAR,
                attribution_start DATE,
                attribution_end DATE
            )
        """)

        _COLS = ["person_id", "provider_npi", "attribution_start", "attribution_end"]
        for r in rows:
            d = dict(r)
            con.execute(
                f"INSERT INTO raw.provider_attribution ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                [d[c] for c in _COLS],
            )

        count = con.execute("SELECT count(*) FROM raw.provider_attribution").fetchone()[0]
        logger.info("Exported %d attributions to DuckDB", count)
        return count

    async def export_all(self, session: AsyncSession) -> dict[str, int]:
        """Export all available data from PostgreSQL to DuckDB for Tuva.

        Automatically fixes missing columns before exporting.
        Exports everything we have — claims, members, providers, attribution.
        """
        await self.ensure_schema(session)
        counts: dict[str, int] = {}
        counts["claims"] = await self.export_claims(session)
        counts["members"] = await self.export_members(session)

        # Optional exports — don't fail if table doesn't exist
        try:
            counts["providers"] = await self.export_providers(session)
        except Exception as e:
            logger.debug("Provider export skipped: %s", e)

        try:
            counts["provider_attribution"] = await self.export_provider_attribution(session)
        except Exception as e:
            logger.debug("Attribution export skipped: %s", e)

        try:
            counts["observations"] = await self.export_observations(session)
        except Exception as e:
            logger.debug("Observation export skipped: %s", e)

        return counts

    async def export_observations(self, session: AsyncSession) -> int:
        """Export observation/lab data from signal-tier claims to DuckDB.

        Observations from eCW are stored as signal-tier claims with
        structured data in the extra JSONB column. We extract them
        into a proper lab_result table for Tuva.
        """
        result = await session.execute(text("""
            SELECT
                c.id,
                m.member_id as person_id,
                c.service_date,
                c.procedure_code as loinc_code,
                c.extra->>'test_name' as test_name,
                c.extra->>'result_value' as result_value,
                c.extra->>'result_string' as result_string,
                c.extra->>'result_units' as result_units,
                c.extra->>'abnormal_flag' as abnormal_flag,
                c.extra->>'reference_range' as reference_range,
                c.service_category
            FROM claims c
            JOIN members m ON c.member_id = m.id
            WHERE c.signal_source IN ('payer_api_observation', 'ecw_observation')
               OR c.service_category IN ('lab', 'vital-signs', 'social-history')
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.lab_result")
        con.execute("""
            CREATE TABLE raw.lab_result (
                lab_result_id VARCHAR,
                person_id VARCHAR,
                result_date DATE,
                collection_date DATE,
                source_code_type VARCHAR,
                source_code VARCHAR,
                source_description VARCHAR,
                normalized_code_type VARCHAR,
                normalized_code VARCHAR,
                normalized_description VARCHAR,
                result VARCHAR,
                result_unit VARCHAR,
                reference_range_low VARCHAR,
                reference_range_high VARCHAR,
                data_source VARCHAR
            )
        """)

        _COLS = [
            "lab_result_id", "person_id", "result_date", "collection_date",
            "source_code_type", "source_code", "source_description",
            "normalized_code_type", "normalized_code", "normalized_description",
            "result", "result_unit", "reference_range_low", "reference_range_high",
            "data_source",
        ]
        for r in rows:
            d = dict(r)
            # Parse reference range into low/high
            ref_range = d.get("reference_range") or ""
            ref_low, ref_high = None, None
            if "-" in ref_range:
                parts = ref_range.split("-", 1)
                ref_low = parts[0].strip() or None
                ref_high = parts[1].strip() or None

            row_data = [
                str(d["id"]),                # lab_result_id
                str(d["person_id"]),          # person_id
                d["service_date"],            # result_date
                d["service_date"],            # collection_date
                "loinc",                      # source_code_type
                d.get("loinc_code"),          # source_code
                d.get("test_name"),           # source_description
                "loinc",                      # normalized_code_type
                d.get("loinc_code"),          # normalized_code
                d.get("test_name"),           # normalized_description
                d.get("result_value") or d.get("result_string"),  # result
                d.get("result_units"),        # result_unit
                ref_low,                      # reference_range_low
                ref_high,                     # reference_range_high
                "aqsoft",                     # data_source
            ]
            con.execute(
                f"INSERT INTO raw.lab_result ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                row_data,
            )

        count = con.execute("SELECT count(*) FROM raw.lab_result").fetchone()[0]
        logger.info("Exported %d observations to DuckDB raw.lab_result", count)
        return count
