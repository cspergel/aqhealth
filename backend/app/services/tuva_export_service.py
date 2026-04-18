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

    ``None`` and the ``"platform"`` sentinel both resolve to the shared
    ``tuva_warehouse.duckdb`` — the latter is what the auth layer emits
    for non-tenanted superadmin contexts, so treating them the same
    preserves backward compatibility with the pre-multitenant setup.
    """
    os.makedirs(_DATA_DIR, exist_ok=True)
    if tenant_schema and tenant_schema != "platform":
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
        Exports everything we have — claims, members, providers, attribution,
        plus the broader clinical input tables (condition/encounter/medication/
        procedure/observation) that Tuva's ``clinical_enabled`` marts need.
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

        # Clinical input tables for Tuva's hcc_suspecting / hcc_recapture /
        # chronic_conditions marts. These derive from existing claims+suspect
        # data — no new upstream feed required, just a reshape.
        for name, func in (
            ("condition", self.export_conditions),
            ("encounter", self.export_encounters),
            ("medication", self.export_medications),
            ("procedure", self.export_procedures),
            ("observation", self.export_observations_tuva),
        ):
            try:
                counts[name] = await func(session)
            except Exception as e:
                logger.debug("%s export skipped: %s", name, e)

        return counts

    # -----------------------------------------------------------------
    # Broadened clinical export surface — condition / encounter /
    # medication / procedure / observation. Each table matches Tuva's
    # ``input_layer__<name>`` contract (see
    # ``dbt_packages/the_tuva_project/models/input_layer/*.yml`` and
    # ``tuva_demo_data/models/*.sql`` for the canonical column sets).
    # -----------------------------------------------------------------

    async def export_conditions(self, session: AsyncSession) -> int:
        """Export conditions derived from ICD-10 codes on claims.

        Tuva's ``condition`` input table is a long table with one row per
        (claim, diagnosis position, code). We unnest ``diagnosis_codes``
        from each record-tier claim so that HCC / chronic-conditions /
        suspecting marts have a proper condition stream to work with.
        """
        result = await session.execute(text("""
            WITH exploded AS (
                SELECT
                    c.id                      AS claim_row_id,
                    c.claim_id                AS claim_id,
                    m.member_id               AS person_id,
                    c.service_date            AS recorded_date,
                    unnest(c.diagnosis_codes) AS source_code,
                    generate_subscripts(c.diagnosis_codes, 1) AS position,
                    c.claim_type              AS claim_type
                FROM claims c
                JOIN members m ON c.member_id = m.id
                WHERE c.data_tier = 'record'
                  AND c.diagnosis_codes IS NOT NULL
                  AND c.deleted_at IS NULL
            )
            SELECT
                (claim_row_id::text || '-' || position::text) AS condition_id,
                person_id,
                claim_id,
                recorded_date,
                source_code,
                position,
                CASE
                    WHEN claim_type = 'institutional' AND position = 1 THEN 'admitting'
                    ELSE 'billing'
                END AS condition_type
            FROM exploded
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.condition")
        con.execute("""
            CREATE TABLE raw.condition (
                condition_id VARCHAR,
                payer VARCHAR,
                person_id VARCHAR,
                patient_id VARCHAR,
                encounter_id VARCHAR,
                claim_id VARCHAR,
                recorded_date DATE,
                onset_date DATE,
                resolved_date DATE,
                status VARCHAR,
                condition_type VARCHAR,
                source_code_type VARCHAR,
                source_code VARCHAR,
                source_description VARCHAR,
                normalized_code_type VARCHAR,
                normalized_code VARCHAR,
                normalized_description VARCHAR,
                condition_rank INTEGER,
                present_on_admit_code VARCHAR,
                present_on_admit_description VARCHAR,
                data_source VARCHAR,
                file_name VARCHAR,
                ingest_datetime TIMESTAMP
            )
        """)

        _COLS = [
            "condition_id", "payer", "person_id", "patient_id", "encounter_id",
            "claim_id", "recorded_date", "onset_date", "resolved_date", "status",
            "condition_type", "source_code_type", "source_code", "source_description",
            "normalized_code_type", "normalized_code", "normalized_description",
            "condition_rank", "present_on_admit_code", "present_on_admit_description",
            "data_source", "file_name", "ingest_datetime",
        ]
        for r in rows:
            d = dict(r)
            row_data = [
                d["condition_id"],            # condition_id
                "medicare",                    # payer (TODO: derive from member)
                str(d["person_id"]),           # person_id
                str(d["person_id"]),           # patient_id (alias)
                None,                          # encounter_id
                d.get("claim_id"),             # claim_id
                d.get("recorded_date"),        # recorded_date
                None,                          # onset_date
                None,                          # resolved_date
                "active",                       # status
                d.get("condition_type", "billing"),  # condition_type
                "icd-10-cm",                   # source_code_type
                d.get("source_code"),          # source_code
                None,                          # source_description
                "icd-10-cm",                   # normalized_code_type
                d.get("source_code"),          # normalized_code
                None,                          # normalized_description
                d.get("position"),             # condition_rank
                None,                          # present_on_admit_code
                None,                          # present_on_admit_description
                "aqsoft",                      # data_source
                None,                          # file_name
                None,                          # ingest_datetime — let dbt stamp
            ]
            con.execute(
                f"INSERT INTO raw.condition ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                row_data,
            )

        count = con.execute("SELECT count(*) FROM raw.condition").fetchone()[0]
        logger.info("Exported %d condition rows to DuckDB raw.condition", count)
        return count

    async def export_encounters(self, session: AsyncSession) -> int:
        """Export encounters derived from claims.

        Tuva's ``encounter`` represents an acute or ambulatory visit. We
        map each record-tier claim to one encounter row, using
        ``service_category`` → ``encounter_type`` per Tuva's categorization.
        """
        result = await session.execute(text("""
            SELECT
                c.id                   AS encounter_row_id,
                c.claim_id             AS claim_id,
                m.member_id            AS person_id,
                c.service_date         AS encounter_start_date,
                c.paid_date            AS paid_date,
                c.service_category     AS service_category,
                c.claim_type           AS claim_type,
                c.los                  AS los,
                c.facility_name        AS facility_name,
                c.facility_npi         AS facility_id,
                c.drg_code             AS drg_code,
                c.paid_amount          AS paid_amount,
                c.allowed_amount       AS allowed_amount,
                c.billed_amount        AS billed_amount,
                (c.diagnosis_codes)[1] AS primary_diagnosis_code
            FROM claims c
            JOIN members m ON c.member_id = m.id
            WHERE c.data_tier = 'record'
              AND c.deleted_at IS NULL
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.encounter")
        con.execute("""
            CREATE TABLE raw.encounter (
                encounter_id VARCHAR,
                person_id VARCHAR,
                patient_id VARCHAR,
                encounter_type VARCHAR,
                encounter_start_date DATE,
                encounter_end_date DATE,
                length_of_stay INTEGER,
                admit_source_code VARCHAR,
                admit_source_description VARCHAR,
                admit_type_code VARCHAR,
                admit_type_description VARCHAR,
                discharge_disposition_code VARCHAR,
                discharge_disposition_description VARCHAR,
                attending_provider_id VARCHAR,
                attending_provider_name VARCHAR,
                facility_id VARCHAR,
                facility_name VARCHAR,
                primary_diagnosis_code_type VARCHAR,
                primary_diagnosis_code VARCHAR,
                primary_diagnosis_description VARCHAR,
                drg_code_type VARCHAR,
                drg_code VARCHAR,
                drg_description VARCHAR,
                paid_amount DOUBLE,
                allowed_amount DOUBLE,
                charge_amount DOUBLE,
                data_source VARCHAR,
                file_name VARCHAR,
                ingest_datetime TIMESTAMP
            )
        """)

        # Tuva encounter_type vocabulary — see
        # dbt_packages/the_tuva_project/seeds/terminology/terminology__encounter_type.csv.
        # Map our service_category into the closest Tuva bucket; anything
        # unknown falls through to "office visit".
        _CATEGORY_TO_ENCOUNTER_TYPE = {
            "inpatient": "acute inpatient",
            "ed_observation": "emergency department",
            "ed": "emergency department",
            "snf_postacute": "skilled nursing",
            "snf": "skilled nursing",
            "home_health": "home health",
            "dme": "durable medical equipment",
            "pharmacy": "pharmacy",
            "professional": "office visit",
        }

        _COLS = [
            "encounter_id", "person_id", "patient_id", "encounter_type",
            "encounter_start_date", "encounter_end_date", "length_of_stay",
            "admit_source_code", "admit_source_description", "admit_type_code",
            "admit_type_description", "discharge_disposition_code",
            "discharge_disposition_description", "attending_provider_id",
            "attending_provider_name", "facility_id", "facility_name",
            "primary_diagnosis_code_type", "primary_diagnosis_code",
            "primary_diagnosis_description", "drg_code_type", "drg_code",
            "drg_description", "paid_amount", "allowed_amount", "charge_amount",
            "data_source", "file_name", "ingest_datetime",
        ]
        for r in rows:
            d = dict(r)
            enc_type = _CATEGORY_TO_ENCOUNTER_TYPE.get(
                (d.get("service_category") or "").lower(), "office visit"
            )
            start_date = d.get("encounter_start_date")
            los = d.get("los")
            end_date = None
            if start_date and los:
                # DuckDB accepts date arithmetic but we compute in Python to
                # keep the INSERT typed simply.
                from datetime import timedelta
                try:
                    end_date = start_date + timedelta(days=int(los))
                except Exception:
                    end_date = start_date
            elif start_date:
                end_date = start_date
            row_data = [
                str(d["encounter_row_id"]),                  # encounter_id
                str(d["person_id"]),                         # person_id
                str(d["person_id"]),                         # patient_id
                enc_type,                                    # encounter_type
                start_date,                                  # encounter_start_date
                end_date,                                    # encounter_end_date
                los,                                         # length_of_stay
                None, None, None, None, None, None,          # admit/discharge fields
                None, None,                                  # attending provider
                d.get("facility_id"), d.get("facility_name"),
                "icd-10-cm" if d.get("primary_diagnosis_code") else None,
                d.get("primary_diagnosis_code"),
                None,                                        # primary_diagnosis_description
                "ms-drg" if d.get("drg_code") else None,
                d.get("drg_code"),
                None,                                        # drg_description
                float(d["paid_amount"]) if d.get("paid_amount") is not None else None,
                float(d["allowed_amount"]) if d.get("allowed_amount") is not None else None,
                float(d["billed_amount"]) if d.get("billed_amount") is not None else None,
                "aqsoft",                                    # data_source
                None,                                        # file_name
                None,                                        # ingest_datetime
            ]
            con.execute(
                f"INSERT INTO raw.encounter ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                row_data,
            )

        count = con.execute("SELECT count(*) FROM raw.encounter").fetchone()[0]
        logger.info("Exported %d encounter rows to DuckDB raw.encounter", count)
        return count

    async def export_medications(self, session: AsyncSession) -> int:
        """Export dispensed medications from pharmacy claims.

        Tuva's ``hcc_suspecting__int_medication_suspects`` reads from
        ``input_layer__medication`` — a pharmacy-only stream with NDC +
        dates. We filter claims to ``service_category = 'pharmacy'`` so
        we don't accidentally surface a billed CPT as a medication.
        """
        result = await session.execute(text("""
            SELECT
                c.id           AS medication_row_id,
                c.claim_id     AS claim_id,
                m.member_id    AS person_id,
                c.service_date AS dispensing_date,
                c.ndc_code     AS ndc_code,
                c.drug_name    AS drug_name,
                c.quantity     AS quantity,
                c.days_supply  AS days_supply
            FROM claims c
            JOIN members m ON c.member_id = m.id
            WHERE c.service_category = 'pharmacy'
              AND c.data_tier = 'record'
              AND c.deleted_at IS NULL
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.medication")
        con.execute("""
            CREATE TABLE raw.medication (
                medication_id VARCHAR,
                person_id VARCHAR,
                payer VARCHAR,
                patient_id VARCHAR,
                encounter_id VARCHAR,
                dispensing_date DATE,
                prescribing_date DATE,
                source_code_type VARCHAR,
                source_code VARCHAR,
                source_description VARCHAR,
                ndc_code VARCHAR,
                ndc_description VARCHAR,
                rxnorm_code VARCHAR,
                rxnorm_description VARCHAR,
                atc_code VARCHAR,
                atc_description VARCHAR,
                route VARCHAR,
                strength VARCHAR,
                quantity INTEGER,
                quantity_unit VARCHAR,
                days_supply INTEGER,
                practitioner_id VARCHAR,
                data_source VARCHAR,
                file_name VARCHAR,
                ingest_datetime TIMESTAMP
            )
        """)

        _COLS = [
            "medication_id", "person_id", "payer", "patient_id", "encounter_id",
            "dispensing_date", "prescribing_date", "source_code_type", "source_code",
            "source_description", "ndc_code", "ndc_description", "rxnorm_code",
            "rxnorm_description", "atc_code", "atc_description", "route",
            "strength", "quantity", "quantity_unit", "days_supply", "practitioner_id",
            "data_source", "file_name", "ingest_datetime",
        ]
        for r in rows:
            d = dict(r)
            qty = d.get("quantity")
            try:
                qty_int = int(qty) if qty is not None else None
            except (ValueError, TypeError):
                qty_int = None
            row_data = [
                str(d["medication_row_id"]),   # medication_id
                str(d["person_id"]),           # person_id
                "medicare",                     # payer
                str(d["person_id"]),           # patient_id
                None,                          # encounter_id
                d.get("dispensing_date"),      # dispensing_date
                None,                          # prescribing_date
                "ndc",                          # source_code_type
                d.get("ndc_code"),             # source_code
                d.get("drug_name"),            # source_description
                d.get("ndc_code"),             # ndc_code
                d.get("drug_name"),            # ndc_description
                None, None, None, None,        # rxnorm_*, atc_*
                None, None,                    # route, strength
                qty_int,                       # quantity
                None,                          # quantity_unit
                d.get("days_supply"),          # days_supply
                None,                          # practitioner_id
                "aqsoft",                      # data_source
                None, None,                    # file_name, ingest_datetime
            ]
            con.execute(
                f"INSERT INTO raw.medication ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                row_data,
            )

        count = con.execute("SELECT count(*) FROM raw.medication").fetchone()[0]
        logger.info("Exported %d medication rows to DuckDB raw.medication", count)
        return count

    async def export_procedures(self, session: AsyncSession) -> int:
        """Export procedures from ``claims.procedure_code``.

        One row per non-null ``procedure_code`` on a record-tier claim.
        Tuva's procedure-based suspects and quality measures key off
        this table.
        """
        result = await session.execute(text("""
            SELECT
                c.id             AS procedure_row_id,
                c.claim_id       AS claim_id,
                m.member_id      AS person_id,
                c.service_date   AS procedure_date,
                c.procedure_code AS procedure_code
            FROM claims c
            JOIN members m ON c.member_id = m.id
            WHERE c.procedure_code IS NOT NULL
              AND c.data_tier = 'record'
              AND c.deleted_at IS NULL
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.procedure")
        con.execute("""
            CREATE TABLE raw.procedure (
                procedure_id VARCHAR,
                person_id VARCHAR,
                patient_id VARCHAR,
                encounter_id VARCHAR,
                claim_id VARCHAR,
                procedure_date DATE,
                source_code_type VARCHAR,
                source_code VARCHAR,
                source_description VARCHAR,
                normalized_code_type VARCHAR,
                normalized_code VARCHAR,
                normalized_description VARCHAR,
                modifier_1 VARCHAR,
                modifier_2 VARCHAR,
                modifier_3 VARCHAR,
                modifier_4 VARCHAR,
                modifier_5 VARCHAR,
                practitioner_id VARCHAR,
                data_source VARCHAR,
                file_name VARCHAR,
                ingest_datetime TIMESTAMP
            )
        """)

        _COLS = [
            "procedure_id", "person_id", "patient_id", "encounter_id", "claim_id",
            "procedure_date", "source_code_type", "source_code", "source_description",
            "normalized_code_type", "normalized_code", "normalized_description",
            "modifier_1", "modifier_2", "modifier_3", "modifier_4", "modifier_5",
            "practitioner_id", "data_source", "file_name", "ingest_datetime",
        ]
        for r in rows:
            d = dict(r)
            row_data = [
                str(d["procedure_row_id"]),    # procedure_id
                str(d["person_id"]),           # person_id
                str(d["person_id"]),           # patient_id
                None,                          # encounter_id
                d.get("claim_id"),             # claim_id
                d.get("procedure_date"),       # procedure_date
                "hcpcs",                        # source_code_type
                d.get("procedure_code"),       # source_code
                None,                          # source_description
                "hcpcs",                        # normalized_code_type
                d.get("procedure_code"),       # normalized_code
                None,                          # normalized_description
                None, None, None, None, None,   # modifiers
                None,                          # practitioner_id
                "aqsoft",                      # data_source
                None, None,                    # file_name, ingest_datetime
            ]
            con.execute(
                f"INSERT INTO raw.procedure ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                row_data,
            )

        count = con.execute("SELECT count(*) FROM raw.procedure").fetchone()[0]
        logger.info("Exported %d procedure rows to DuckDB raw.procedure", count)
        return count

    async def export_observations_tuva(self, session: AsyncSession) -> int:
        """Export observations in Tuva's ``observation`` contract.

        Distinct from ``export_observations`` (which targets
        ``input_layer__lab_result``). Tuva keeps observations (vitals,
        social history, assessments) in a separate table with a slightly
        different schema. We populate from signal-tier observation
        claims and from any service-category values that Tuva treats as
        observations rather than labs.
        """
        result = await session.execute(text("""
            SELECT
                c.id                           AS observation_row_id,
                m.member_id                    AS person_id,
                c.service_date                 AS observation_date,
                c.procedure_code               AS source_code,
                c.extra->>'test_name'          AS test_name,
                c.extra->>'result_value'       AS result_value,
                c.extra->>'result_string'      AS result_string,
                c.extra->>'result_units'       AS result_units,
                c.service_category             AS service_category
            FROM claims c
            JOIN members m ON c.member_id = m.id
            WHERE c.data_tier IN ('record', 'signal')
              AND c.deleted_at IS NULL
              AND (c.signal_source = 'ecw_observation'
                   OR c.service_category IN ('vital-signs', 'social-history', 'assessment'))
        """))
        rows = result.mappings().all()

        con = self._get_connection()
        con.execute("DROP TABLE IF EXISTS raw.observation")
        con.execute("""
            CREATE TABLE raw.observation (
                observation_id VARCHAR,
                person_id VARCHAR,
                payer VARCHAR,
                patient_id VARCHAR,
                encounter_id VARCHAR,
                panel_id VARCHAR,
                observation_date DATE,
                observation_type VARCHAR,
                source_code_type VARCHAR,
                source_code VARCHAR,
                source_description VARCHAR,
                normalized_code_type VARCHAR,
                normalized_code VARCHAR,
                normalized_description VARCHAR,
                result VARCHAR,
                source_units VARCHAR,
                normalized_units VARCHAR,
                source_reference_range_low VARCHAR,
                source_reference_range_high VARCHAR,
                normalized_reference_range_low VARCHAR,
                normalized_reference_range_high VARCHAR,
                data_source VARCHAR,
                file_name VARCHAR,
                ingest_datetime TIMESTAMP
            )
        """)

        _COLS = [
            "observation_id", "person_id", "payer", "patient_id", "encounter_id",
            "panel_id", "observation_date", "observation_type", "source_code_type",
            "source_code", "source_description", "normalized_code_type",
            "normalized_code", "normalized_description", "result", "source_units",
            "normalized_units", "source_reference_range_low", "source_reference_range_high",
            "normalized_reference_range_low", "normalized_reference_range_high",
            "data_source", "file_name", "ingest_datetime",
        ]
        for r in rows:
            d = dict(r)
            # Pick result_value (numeric) if present, else result_string.
            result_val = d.get("result_value") or d.get("result_string")
            row_data = [
                str(d["observation_row_id"]),  # observation_id
                str(d["person_id"]),           # person_id
                "medicare",                     # payer
                str(d["person_id"]),           # patient_id
                None,                          # encounter_id
                None,                          # panel_id
                d.get("observation_date"),     # observation_date
                d.get("service_category"),     # observation_type
                "loinc",                        # source_code_type
                d.get("source_code"),          # source_code
                d.get("test_name"),            # source_description
                "loinc",                        # normalized_code_type
                d.get("source_code"),          # normalized_code
                d.get("test_name"),            # normalized_description
                result_val,                    # result
                d.get("result_units"),         # source_units
                d.get("result_units"),         # normalized_units
                None, None, None, None,         # reference ranges
                "aqsoft",                      # data_source
                None, None,                    # file_name, ingest_datetime
            ]
            con.execute(
                f"INSERT INTO raw.observation ({', '.join(_COLS)}) VALUES ({', '.join('?' for _ in _COLS)})",
                row_data,
            )

        count = con.execute("SELECT count(*) FROM raw.observation").fetchone()[0]
        logger.info("Exported %d observation rows to DuckDB raw.observation", count)
        return count

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
