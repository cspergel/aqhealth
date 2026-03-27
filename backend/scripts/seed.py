"""
Seed script for AQSoft Health Platform.

Creates the demo tenant, users, and sample data.
Run from the backend directory:  python -m scripts.seed

Uses synchronous SQLAlchemy for simplicity.
"""

import os
import sys
import random
from datetime import date, timedelta
from decimal import Decimal

from passlib.context import CryptContext
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Database URL — sync driver (psycopg2)
# ---------------------------------------------------------------------------

_async_url = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health",
)
# Convert async URL to sync
DATABASE_URL = _async_url.replace("+asyncpg", "+psycopg2").replace("postgresql://", "postgresql+psycopg2://") \
    if "+asyncpg" not in _async_url and "psycopg2" not in _async_url \
    else _async_url.replace("+asyncpg", "+psycopg2")

engine = create_engine(DATABASE_URL, echo=False)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

SCHEMA = "demo_mso"

# ---------------------------------------------------------------------------
# HEDIS gap measure definitions (same 13 as care_gap_service)
# ---------------------------------------------------------------------------

DEFAULT_MEASURES = [
    {"code": "CDC-HbA1c", "name": "Diabetes Care -- HbA1c Testing", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 85.0},
    {"code": "CDC-Eye", "name": "Diabetes Care -- Eye Exam", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 68.0},
    {"code": "BCS", "name": "Breast Cancer Screening", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 75.0},
    {"code": "COL", "name": "Colorectal Cancer Screening", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 72.0},
    {"code": "CBP", "name": "Controlling Blood Pressure", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 70.0},
    {"code": "COA-MedReview", "name": "Care for Older Adults -- Medication Review", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 72.0},
    {"code": "COA-Pain", "name": "Care for Older Adults -- Pain Assessment", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 72.0},
    {"code": "COA-Functional", "name": "Care for Older Adults -- Functional Status Assessment", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 72.0},
    {"code": "MRP", "name": "Medication Reconciliation Post-Discharge", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 60.0},
    {"code": "FMC", "name": "Follow-Up After ED Visit for Mental Health", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 55.0},
    {"code": "SPD", "name": "Statin Use in Persons with Diabetes", "category": "Medication Adherence", "stars_weight": 3, "target_rate": 85.0},
    {"code": "KED", "name": "Kidney Health Evaluation for Patients with Diabetes", "category": "Effectiveness of Care", "stars_weight": 1, "target_rate": 40.0},
    {"code": "AAP", "name": "Adults' Access to Preventive/Ambulatory Services", "category": "Access to Care", "stars_weight": 1, "target_rate": 90.0},
]

# ---------------------------------------------------------------------------
# Practice groups
# ---------------------------------------------------------------------------

PRACTICE_GROUPS = [
    {"name": "ISG Tampa", "client_code": "ISG-TPA", "city": "Tampa", "state": "FL", "zip_code": "33602"},
    {"name": "FMG St. Pete", "client_code": "FMG-STP", "city": "St. Petersburg", "state": "FL", "zip_code": "33701"},
    {"name": "ISG Brandon", "client_code": "ISG-BRN", "city": "Brandon", "state": "FL", "zip_code": "33511"},
    {"name": "FMG Clearwater", "client_code": "FMG-CLW", "city": "Clearwater", "state": "FL", "zip_code": "33755"},
    {"name": "TPSG Downtown", "client_code": "TPSG-DT", "city": "Tampa", "state": "FL", "zip_code": "33601"},
]

# ---------------------------------------------------------------------------
# Providers (10, spread across groups)
# ---------------------------------------------------------------------------

PROVIDERS = [
    {"npi": "1234567890", "first_name": "Maria", "last_name": "Rodriguez", "specialty": "Internal Medicine", "group_idx": 0},
    {"npi": "1234567891", "first_name": "James", "last_name": "Chen", "specialty": "Family Medicine", "group_idx": 0},
    {"npi": "1234567892", "first_name": "Sarah", "last_name": "Patel", "specialty": "Internal Medicine", "group_idx": 1},
    {"npi": "1234567893", "first_name": "Robert", "last_name": "Kim", "specialty": "Geriatrics", "group_idx": 1},
    {"npi": "1234567894", "first_name": "Lisa", "last_name": "Nguyen", "specialty": "Family Medicine", "group_idx": 2},
    {"npi": "1234567895", "first_name": "David", "last_name": "Thompson", "specialty": "Internal Medicine", "group_idx": 2},
    {"npi": "1234567896", "first_name": "Amanda", "last_name": "Garcia", "specialty": "Geriatrics", "group_idx": 3},
    {"npi": "1234567897", "first_name": "Michael", "last_name": "Johnson", "specialty": "Family Medicine", "group_idx": 3},
    {"npi": "1234567898", "first_name": "Jennifer", "last_name": "Williams", "specialty": "Internal Medicine", "group_idx": 4},
    {"npi": "1234567899", "first_name": "Christopher", "last_name": "Brown", "specialty": "Family Medicine", "group_idx": 4},
]

# ---------------------------------------------------------------------------
# Sample members (30)
# ---------------------------------------------------------------------------

FIRST_NAMES_M = ["John", "William", "Richard", "Thomas", "Charles", "George", "Edward", "Frank", "Henry", "Albert",
                 "Arthur", "Walter", "Harold", "Raymond", "Donald"]
FIRST_NAMES_F = ["Mary", "Patricia", "Linda", "Barbara", "Elizabeth", "Margaret", "Dorothy", "Ruth", "Virginia", "Helen",
                 "Frances", "Catherine", "Evelyn", "Martha", "Gloria"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Anderson",
              "Taylor", "Thomas", "Hernandez", "Moore", "Martin", "Jackson", "Thompson", "White", "Lopez", "Lee",
              "Gonzalez", "Harris", "Clark", "Lewis", "Robinson", "Walker", "Perez", "Hall", "Young", "Allen"]

ZIP_CODES = ["33602", "33701", "33511", "33755", "33601", "33609", "33629", "33606", "33610", "33614"]
HEALTH_PLANS = ["Humana Gold Plus", "Aetna Medicare Advantage", "UnitedHealthcare MAPD", "Cigna HealthSpring"]
PLAN_PRODUCTS = ["MA", "MAPD", "DSNP"]
RISK_TIERS = ["low", "rising", "high", "complex"]

# ---------------------------------------------------------------------------
# Claims data helpers
# ---------------------------------------------------------------------------

CLAIM_TYPES = ["professional", "institutional", "pharmacy"]
SERVICE_CATEGORIES = ["inpatient", "ed_observation", "professional", "snf_postacute", "pharmacy", "home_health", "dme", "other"]
DX_CODES = ["E11.9", "I10", "J44.1", "E78.5", "N18.3", "F32.9", "M54.5", "I25.10", "E11.65", "G47.33",
            "K21.0", "J45.20", "E03.9", "M17.11", "I48.91"]
CPT_CODES = ["99213", "99214", "99215", "99232", "99233", "99291", "36415", "80053", "83036", "85025",
             "71046", "93000", "90837", "77067", "45378"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _random_dob(min_age: int = 55, max_age: int = 90) -> date:
    """Random DOB for a Medicare-age member."""
    days_offset = random.randint(min_age * 365, max_age * 365)
    return date.today() - timedelta(days=days_offset)


def _random_date_in_year(year: int = 2025) -> date:
    start = date(year, 1, 1)
    return start + timedelta(days=random.randint(0, 364))


# ---------------------------------------------------------------------------
# Main seed logic
# ---------------------------------------------------------------------------


def seed() -> None:
    random.seed(42)  # reproducible

    with engine.connect() as conn:
        # ----- Create platform schema and tables if not present -----
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
        conn.commit()

    with engine.connect() as conn:
        # Check if platform.tenants exists already
        result = conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='platform' AND table_name='tenants')"
        ))
        platform_tables_exist = result.scalar()

    if not platform_tables_exist:
        # Run the migration upgrade to create platform tables
        # We'll create them directly via raw SQL for the seed script
        _create_platform_tables()

    with Session(engine) as session:
        # ----------------------------------------------------------------
        # 1. Demo tenant
        # ----------------------------------------------------------------
        existing = session.execute(
            text("SELECT id FROM platform.tenants WHERE schema_name = :s"),
            {"s": "demo_mso"},
        ).fetchone()

        if existing:
            tenant_id = existing[0]
            print(f"  Tenant 'Demo MSO' already exists (id={tenant_id})")
        else:
            session.execute(text(
                "INSERT INTO platform.tenants (name, schema_name, status) "
                "VALUES (:name, :schema, :status)"
            ), {"name": "Demo MSO", "schema": "demo_mso", "status": "active"})
            session.commit()
            tenant_id = session.execute(
                text("SELECT id FROM platform.tenants WHERE schema_name = 'demo_mso'")
            ).scalar()
            print(f"  Created tenant 'Demo MSO' (id={tenant_id})")

        # ----------------------------------------------------------------
        # 2. Users
        # ----------------------------------------------------------------
        _seed_user(session, "admin@aqsoft.ai", "admin123", "AQSoft Admin", "superadmin", None)
        _seed_user(session, "demo@aqsoft.ai", "demo123", "Demo MSO Admin", "mso_admin", tenant_id)

        # ----------------------------------------------------------------
        # 3. Create demo_mso schema + tenant tables
        # ----------------------------------------------------------------
        session.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        session.commit()

        # Check if tables exist
        has_members = session.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            f"WHERE table_schema='{SCHEMA}' AND table_name='members')"
        )).scalar()

        if not has_members:
            _create_tenant_tables_sql(session)
            session.commit()
            print(f"  Created tenant tables in schema '{SCHEMA}'")
        else:
            print(f"  Tenant tables already exist in schema '{SCHEMA}'")

        # Set search path for remaining inserts
        session.execute(text(f"SET search_path TO {SCHEMA}, public"))

        # ----------------------------------------------------------------
        # 4. Practice groups
        # ----------------------------------------------------------------
        group_ids = _seed_practice_groups(session)

        # ----------------------------------------------------------------
        # 5. Providers
        # ----------------------------------------------------------------
        provider_ids = _seed_providers(session, group_ids)

        # ----------------------------------------------------------------
        # 6. Gap measures
        # ----------------------------------------------------------------
        measure_ids = _seed_gap_measures(session)

        # ----------------------------------------------------------------
        # 7. Members
        # ----------------------------------------------------------------
        member_ids = _seed_members(session, provider_ids)

        # ----------------------------------------------------------------
        # 8. Claims
        # ----------------------------------------------------------------
        _seed_claims(session, member_ids, provider_ids)

        # ----------------------------------------------------------------
        # 9. HCC suspects
        # ----------------------------------------------------------------
        _seed_hcc_suspects(session, member_ids)

        # ----------------------------------------------------------------
        # 10. Care gaps
        # ----------------------------------------------------------------
        _seed_care_gaps(session, member_ids, measure_ids, provider_ids)

        session.commit()

    print()
    print("=" * 60)
    print("  Seed complete!")
    print("=" * 60)
    print()
    print("  Superadmin login : admin@aqsoft.ai / admin123")
    print("  MSO admin login  : demo@aqsoft.ai  / demo123")
    print()


# ---------------------------------------------------------------------------
# Platform table creation (raw SQL fallback when alembic hasn't run)
# ---------------------------------------------------------------------------


def _create_platform_tables() -> None:
    """Create platform.tenants and platform.users via raw SQL."""
    with engine.connect() as conn:
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE platform.tenantstatus AS ENUM ('active','onboarding','suspended');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE platform.userrole AS ENUM ('superadmin','mso_admin','analyst','provider','auditor','care_manager','outreach','financial');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.tenants (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                schema_name VARCHAR(63) UNIQUE NOT NULL,
                status platform.tenantstatus DEFAULT 'onboarding',
                config JSONB,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS platform.users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                hashed_password VARCHAR(255) NOT NULL,
                full_name VARCHAR(200) NOT NULL,
                role platform.userrole NOT NULL,
                tenant_id INTEGER REFERENCES platform.tenants(id),
                is_active BOOLEAN DEFAULT true,
                mfa_secret VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_platform_users_email ON platform.users(email)"))
        conn.commit()
    print("  Created platform tables (raw SQL)")


# ---------------------------------------------------------------------------
# Tenant table creation (raw SQL)
# ---------------------------------------------------------------------------


def _create_tenant_tables_sql(session: Session) -> None:
    """Create all tenant-scoped tables in demo_mso schema via SQL."""
    s = SCHEMA

    # --- Enum types (created in public schema for tenant use) ---
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE risktier AS ENUM ('low','rising','high','complex'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE claimtype AS ENUM ('professional','institutional','pharmacy'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE suspectstatus AS ENUM ('open','captured','dismissed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE suspecttype AS ENUM ('med_dx_gap','specificity','recapture','near_miss','historical','new_suspect'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE gapstatus AS ENUM ('open','closed','excluded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE uploadstatus AS ENUM ('pending','mapping','validating','processing','completed','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE insightcategory AS ENUM ('revenue','cost','quality','provider','trend','cross_module'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))
    session.execute(text("""
        DO $$ BEGIN CREATE TYPE insightstatus AS ENUM ('active','dismissed','bookmarked','acted_on'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.members (
            id SERIAL PRIMARY KEY,
            member_id VARCHAR(50),
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            date_of_birth DATE NOT NULL,
            gender VARCHAR(1) NOT NULL,
            zip_code VARCHAR(10),
            health_plan VARCHAR(200),
            plan_product VARCHAR(100),
            coverage_start DATE,
            coverage_end DATE,
            pcp_provider_id INTEGER,
            medicaid_status BOOLEAN DEFAULT false,
            disability_status BOOLEAN DEFAULT false,
            institutional BOOLEAN DEFAULT false,
            current_raf NUMERIC(8,3),
            projected_raf NUMERIC(8,3),
            risk_tier risktier,
            extra JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_members_member_id ON {s}.members(member_id)"))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.practice_groups (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            client_code VARCHAR(50),
            address VARCHAR(300),
            city VARCHAR(100),
            state VARCHAR(2),
            zip_code VARCHAR(10),
            provider_count INTEGER,
            total_panel_size INTEGER,
            avg_capture_rate NUMERIC(5,2),
            avg_recapture_rate NUMERIC(5,2),
            avg_raf NUMERIC(8,3),
            group_pmpm NUMERIC(10,2),
            gap_closure_rate NUMERIC(5,2),
            targets JSONB,
            extra JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.providers (
            id SERIAL PRIMARY KEY,
            npi VARCHAR(15) NOT NULL,
            practice_group_id INTEGER REFERENCES {s}.practice_groups(id),
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            specialty VARCHAR(100),
            practice_name VARCHAR(200),
            tin VARCHAR(15),
            panel_size INTEGER,
            capture_rate NUMERIC(5,2),
            recapture_rate NUMERIC(5,2),
            avg_panel_raf NUMERIC(8,3),
            panel_pmpm NUMERIC(10,2),
            gap_closure_rate NUMERIC(5,2),
            targets JSONB,
            extra JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_providers_npi ON {s}.providers(npi)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_providers_group ON {s}.providers(practice_group_id)"))

    # FK members -> providers
    session.execute(text(f"""
        DO $$ BEGIN
            ALTER TABLE {s}.members ADD CONSTRAINT fk_members_pcp_provider
                FOREIGN KEY (pcp_provider_id) REFERENCES {s}.providers(id);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.adt_sources (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            source_type VARCHAR(50) NOT NULL,
            config JSONB NOT NULL,
            is_active BOOLEAN DEFAULT true,
            last_sync TIMESTAMPTZ,
            events_received INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.adt_events (
            id SERIAL PRIMARY KEY,
            source_id INTEGER NOT NULL REFERENCES {s}.adt_sources(id),
            event_type VARCHAR(50) NOT NULL,
            event_timestamp TIMESTAMPTZ NOT NULL,
            raw_message_id VARCHAR(200),
            member_id INTEGER REFERENCES {s}.members(id),
            patient_name VARCHAR(200),
            patient_dob DATE,
            patient_mrn VARCHAR(50),
            external_member_id VARCHAR(100),
            match_confidence INTEGER,
            patient_class VARCHAR(50),
            admit_date TIMESTAMPTZ,
            discharge_date TIMESTAMPTZ,
            admit_source VARCHAR(100),
            discharge_disposition VARCHAR(100),
            diagnosis_codes JSONB,
            facility_name VARCHAR(200),
            facility_npi VARCHAR(20),
            facility_type VARCHAR(50),
            attending_provider VARCHAR(200),
            attending_npi VARCHAR(20),
            pcp_name VARCHAR(200),
            pcp_npi VARCHAR(20),
            plan_name VARCHAR(200),
            plan_member_id VARCHAR(100),
            is_processed BOOLEAN DEFAULT false,
            alerts_sent JSONB,
            estimated_total_cost NUMERIC(12,2),
            estimated_daily_cost NUMERIC(12,2),
            actual_claim_id INTEGER,
            estimation_accuracy FLOAT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.claims (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES {s}.members(id),
            claim_id VARCHAR(50),
            claim_type claimtype NOT NULL,
            service_date DATE NOT NULL,
            paid_date DATE,
            diagnosis_codes VARCHAR(10)[],
            procedure_code VARCHAR(10),
            drg_code VARCHAR(10),
            ndc_code VARCHAR(15),
            rendering_provider_id INTEGER REFERENCES {s}.providers(id),
            facility_name VARCHAR(200),
            facility_npi VARCHAR(15),
            billed_amount NUMERIC(12,2),
            allowed_amount NUMERIC(12,2),
            paid_amount NUMERIC(12,2),
            member_liability NUMERIC(12,2),
            service_category VARCHAR(50),
            pos_code VARCHAR(5),
            drug_name VARCHAR(200),
            drug_class VARCHAR(100),
            quantity NUMERIC(10,2),
            days_supply INTEGER,
            extra JSONB,
            data_tier VARCHAR(10) DEFAULT 'record',
            is_estimated BOOLEAN DEFAULT false,
            estimated_amount NUMERIC(12,2),
            signal_source VARCHAR(50),
            signal_event_id INTEGER REFERENCES {s}.adt_events(id),
            reconciled BOOLEAN DEFAULT false,
            reconciled_claim_id INTEGER,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_claims_member ON {s}.claims(member_id)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_claims_type ON {s}.claims(claim_type)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_claims_svc_date ON {s}.claims(service_date)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_claims_svc_cat ON {s}.claims(service_category)"))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.hcc_suspects (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES {s}.members(id),
            payment_year INTEGER NOT NULL,
            hcc_code INTEGER NOT NULL,
            hcc_label VARCHAR(200),
            icd10_code VARCHAR(10),
            icd10_label VARCHAR(300),
            raf_value NUMERIC(8,3) NOT NULL,
            annual_value NUMERIC(10,2),
            suspect_type suspecttype NOT NULL,
            status suspectstatus DEFAULT 'open',
            confidence INTEGER,
            evidence_summary TEXT,
            source_claims TEXT,
            identified_date DATE NOT NULL,
            captured_date DATE,
            dismissed_date DATE,
            dismissed_reason VARCHAR(200),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_hcc_member ON {s}.hcc_suspects(member_id)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_hcc_year ON {s}.hcc_suspects(payment_year)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_hcc_status ON {s}.hcc_suspects(status)"))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.raf_history (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES {s}.members(id),
            calculation_date DATE NOT NULL,
            payment_year INTEGER NOT NULL,
            demographic_raf NUMERIC(8,3) NOT NULL,
            disease_raf NUMERIC(8,3) NOT NULL,
            interaction_raf NUMERIC(8,3) NOT NULL,
            total_raf NUMERIC(8,3) NOT NULL,
            hcc_count INTEGER DEFAULT 0,
            suspect_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_raf_member ON {s}.raf_history(member_id)"))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.gap_measures (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) NOT NULL,
            name VARCHAR(200) NOT NULL,
            description TEXT,
            category VARCHAR(50),
            stars_weight INTEGER DEFAULT 1,
            target_rate NUMERIC(5,2),
            star_3_cutpoint NUMERIC(5,2),
            star_4_cutpoint NUMERIC(5,2),
            star_5_cutpoint NUMERIC(5,2),
            is_custom BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            detection_logic JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_gapmeasures_code ON {s}.gap_measures(code)"))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.member_gaps (
            id SERIAL PRIMARY KEY,
            member_id INTEGER NOT NULL REFERENCES {s}.members(id),
            measure_id INTEGER NOT NULL REFERENCES {s}.gap_measures(id),
            status gapstatus DEFAULT 'open',
            due_date DATE,
            closed_date DATE,
            measurement_year INTEGER NOT NULL,
            responsible_provider_id INTEGER REFERENCES {s}.providers(id),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_memgaps_member ON {s}.member_gaps(member_id)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_memgaps_measure ON {s}.member_gaps(measure_id)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_memgaps_status ON {s}.member_gaps(status)"))
    session.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_memgaps_year ON {s}.member_gaps(measurement_year)"))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.upload_jobs (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(500) NOT NULL,
            file_size INTEGER,
            detected_type VARCHAR(50),
            status uploadstatus DEFAULT 'pending',
            column_mapping JSONB,
            mapping_template_id INTEGER,
            total_rows INTEGER,
            processed_rows INTEGER,
            error_rows INTEGER,
            errors JSONB,
            uploaded_by INTEGER,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.mapping_templates (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            source_name VARCHAR(200),
            data_type VARCHAR(50) NOT NULL,
            column_mapping JSONB NOT NULL,
            transformation_rules JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.mapping_rules (
            id SERIAL PRIMARY KEY,
            source_name VARCHAR(200),
            rule_type VARCHAR(50) NOT NULL,
            rule_config JSONB NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.insights (
            id SERIAL PRIMARY KEY,
            category insightcategory NOT NULL,
            title VARCHAR(300) NOT NULL,
            description TEXT NOT NULL,
            dollar_impact NUMERIC(12,2),
            recommended_action TEXT,
            confidence INTEGER,
            status insightstatus DEFAULT 'active',
            affected_members JSONB,
            affected_providers JSONB,
            surface_on JSONB,
            connections JSONB,
            source_modules JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.prediction_outcomes (
            id SERIAL PRIMARY KEY,
            prediction_type VARCHAR(50) NOT NULL,
            prediction_id INTEGER,
            predicted_value TEXT,
            confidence INTEGER,
            outcome VARCHAR(20) NOT NULL,
            actual_value TEXT,
            was_correct BOOLEAN,
            context JSONB,
            lesson_learned TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.learning_metrics (
            id SERIAL PRIMARY KEY,
            metric_date DATE NOT NULL,
            prediction_type VARCHAR(50) NOT NULL,
            total_predictions INTEGER DEFAULT 0,
            confirmed INTEGER DEFAULT 0,
            rejected INTEGER DEFAULT 0,
            pending INTEGER DEFAULT 0,
            accuracy_rate NUMERIC(5,2),
            breakdown JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.user_interactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            interaction_type VARCHAR(30) NOT NULL,
            target_type VARCHAR(30) NOT NULL,
            target_id INTEGER,
            page_context VARCHAR(200),
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.care_alerts (
            id SERIAL PRIMARY KEY,
            adt_event_id INTEGER NOT NULL REFERENCES {s}.adt_events(id),
            member_id INTEGER REFERENCES {s}.members(id),
            alert_type VARCHAR(50) NOT NULL,
            priority VARCHAR(20) NOT NULL,
            title VARCHAR(300) NOT NULL,
            description TEXT,
            recommended_action TEXT,
            assigned_to INTEGER,
            status VARCHAR(30) DEFAULT 'open',
            resolved_at TIMESTAMPTZ,
            resolution_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.annotations (
            id SERIAL PRIMARY KEY,
            entity_type VARCHAR(50) NOT NULL,
            entity_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            note_type VARCHAR(50) DEFAULT 'general',
            author_id INTEGER NOT NULL,
            author_name VARCHAR(200) NOT NULL,
            requires_follow_up BOOLEAN DEFAULT false,
            follow_up_date DATE,
            follow_up_completed BOOLEAN DEFAULT false,
            is_pinned BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.watchlist_items (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            entity_type VARCHAR(50) NOT NULL,
            entity_id INTEGER NOT NULL,
            entity_name VARCHAR(300) NOT NULL,
            reason TEXT,
            watch_for JSONB,
            last_snapshot JSONB,
            changes_detected JSONB,
            last_checked TIMESTAMPTZ,
            has_changes BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.action_items (
            id SERIAL PRIMARY KEY,
            source_type VARCHAR(50),
            source_id INTEGER,
            title VARCHAR(500) NOT NULL,
            description TEXT,
            action_type VARCHAR(50) NOT NULL,
            assigned_to INTEGER,
            assigned_to_name VARCHAR(200),
            priority VARCHAR(20) DEFAULT 'medium',
            status VARCHAR(20) DEFAULT 'open',
            due_date DATE,
            completed_date DATE,
            member_id INTEGER,
            provider_id INTEGER,
            group_id INTEGER,
            expected_impact VARCHAR(500),
            actual_outcome VARCHAR(500),
            outcome_measured BOOLEAN DEFAULT false,
            resolution_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.report_templates (
            id SERIAL PRIMARY KEY,
            name VARCHAR(300) NOT NULL,
            description TEXT,
            report_type VARCHAR(50) NOT NULL,
            sections JSONB NOT NULL,
            schedule VARCHAR(50),
            is_system BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.generated_reports (
            id SERIAL PRIMARY KEY,
            template_id INTEGER NOT NULL REFERENCES {s}.report_templates(id),
            title VARCHAR(500) NOT NULL,
            period VARCHAR(100) NOT NULL,
            status VARCHAR(50) DEFAULT 'generating',
            content JSONB,
            ai_narrative TEXT,
            generated_by INTEGER NOT NULL,
            file_url VARCHAR(500),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    session.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {s}.saved_filters (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            description TEXT,
            page_context VARCHAR(50) NOT NULL,
            conditions JSONB NOT NULL,
            created_by INTEGER NOT NULL,
            is_shared BOOLEAN DEFAULT false,
            is_system BOOLEAN DEFAULT false,
            use_count INTEGER DEFAULT 0,
            last_used TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_user(session: Session, email: str, password: str, name: str, role: str, tenant_id: int | None) -> None:
    existing = session.execute(
        text("SELECT id FROM platform.users WHERE email = :e"), {"e": email}
    ).fetchone()
    if existing:
        print(f"  User '{email}' already exists")
        return
    hashed = pwd_ctx.hash(password)
    session.execute(text(
        "INSERT INTO platform.users (email, hashed_password, full_name, role, tenant_id, is_active) "
        "VALUES (:email, :pw, :name, :role, :tid, true)"
    ), {"email": email, "pw": hashed, "name": name, "role": role, "tid": tenant_id})
    session.commit()
    print(f"  Created user '{email}' (role={role})")


def _seed_practice_groups(session: Session) -> list[int]:
    existing = session.execute(text("SELECT count(*) FROM practice_groups")).scalar()
    if existing and existing > 0:
        rows = session.execute(text("SELECT id FROM practice_groups ORDER BY id")).fetchall()
        print(f"  Practice groups already seeded ({existing})")
        return [r[0] for r in rows]

    ids = []
    for g in PRACTICE_GROUPS:
        session.execute(text(
            "INSERT INTO practice_groups (name, client_code, city, state, zip_code) "
            "VALUES (:name, :cc, :city, :state, :zip)"
        ), {"name": g["name"], "cc": g["client_code"], "city": g["city"], "state": g["state"], "zip": g["zip_code"]})
    session.commit()
    rows = session.execute(text("SELECT id FROM practice_groups ORDER BY id")).fetchall()
    ids = [r[0] for r in rows]
    print(f"  Created {len(ids)} practice groups")
    return ids


def _seed_providers(session: Session, group_ids: list[int]) -> list[int]:
    existing = session.execute(text("SELECT count(*) FROM providers")).scalar()
    if existing and existing > 0:
        rows = session.execute(text("SELECT id FROM providers ORDER BY id")).fetchall()
        print(f"  Providers already seeded ({existing})")
        return [r[0] for r in rows]

    for p in PROVIDERS:
        gid = group_ids[p["group_idx"]] if p["group_idx"] < len(group_ids) else None
        session.execute(text(
            "INSERT INTO providers (npi, practice_group_id, first_name, last_name, specialty, practice_name) "
            "VALUES (:npi, :gid, :fn, :ln, :spec, :pname)"
        ), {
            "npi": p["npi"], "gid": gid, "fn": p["first_name"], "ln": p["last_name"],
            "spec": p["specialty"], "pname": PRACTICE_GROUPS[p["group_idx"]]["name"],
        })
    session.commit()
    rows = session.execute(text("SELECT id FROM providers ORDER BY id")).fetchall()
    ids = [r[0] for r in rows]
    print(f"  Created {len(ids)} providers")
    return ids


def _seed_gap_measures(session: Session) -> list[int]:
    existing = session.execute(text("SELECT count(*) FROM gap_measures")).scalar()
    if existing and existing > 0:
        rows = session.execute(text("SELECT id FROM gap_measures ORDER BY id")).fetchall()
        print(f"  Gap measures already seeded ({existing})")
        return [r[0] for r in rows]

    for m in DEFAULT_MEASURES:
        session.execute(text(
            "INSERT INTO gap_measures (code, name, category, stars_weight, target_rate) "
            "VALUES (:code, :name, :cat, :sw, :tr)"
        ), {"code": m["code"], "name": m["name"], "cat": m["category"], "sw": m["stars_weight"], "tr": m["target_rate"]})
    session.commit()
    rows = session.execute(text("SELECT id FROM gap_measures ORDER BY id")).fetchall()
    ids = [r[0] for r in rows]
    print(f"  Created {len(ids)} HEDIS gap measures")
    return ids


def _seed_members(session: Session, provider_ids: list[int]) -> list[int]:
    existing = session.execute(text("SELECT count(*) FROM members")).scalar()
    if existing and existing > 0:
        rows = session.execute(text("SELECT id FROM members ORDER BY id")).fetchall()
        print(f"  Members already seeded ({existing})")
        return [r[0] for r in rows]

    for i in range(30):
        gender = "M" if i < 15 else "F"
        if gender == "M":
            fn = FIRST_NAMES_M[i % len(FIRST_NAMES_M)]
        else:
            fn = FIRST_NAMES_F[(i - 15) % len(FIRST_NAMES_F)]
        ln = LAST_NAMES[i % len(LAST_NAMES)]
        dob = _random_dob()
        zip_code = random.choice(ZIP_CODES)
        plan = random.choice(HEALTH_PLANS)
        product = random.choice(PLAN_PRODUCTS)
        pcp = random.choice(provider_ids)
        raf = round(random.uniform(0.4, 4.5), 3)
        proj_raf = round(raf + random.uniform(-0.3, 0.8), 3)
        tier = random.choice(RISK_TIERS)
        member_ext_id = f"H{random.randint(100000000, 999999999)}"

        session.execute(text(
            "INSERT INTO members (member_id, first_name, last_name, date_of_birth, gender, zip_code, "
            "health_plan, plan_product, coverage_start, pcp_provider_id, current_raf, projected_raf, risk_tier) "
            "VALUES (:mid, :fn, :ln, :dob, :g, :zip, :hp, :pp, :cs, :pcp, :raf, :praf, :tier)"
        ), {
            "mid": member_ext_id, "fn": fn, "ln": ln, "dob": dob, "g": gender,
            "zip": zip_code, "hp": plan, "pp": product,
            "cs": date(2025, 1, 1), "pcp": pcp, "raf": raf, "praf": proj_raf, "tier": tier,
        })
    session.commit()
    rows = session.execute(text("SELECT id FROM members ORDER BY id")).fetchall()
    ids = [r[0] for r in rows]
    print(f"  Created {len(ids)} members")
    return ids


def _seed_claims(session: Session, member_ids: list[int], provider_ids: list[int]) -> None:
    existing = session.execute(text("SELECT count(*) FROM claims")).scalar()
    if existing and existing > 0:
        print(f"  Claims already seeded ({existing})")
        return

    num_claims = random.randint(120, 180)
    for i in range(num_claims):
        mid = random.choice(member_ids)
        pid = random.choice(provider_ids)
        ctype = random.choice(CLAIM_TYPES)
        svc_date = _random_date_in_year(2025)
        paid_date = svc_date + timedelta(days=random.randint(14, 60))
        dx = random.sample(DX_CODES, k=random.randint(1, 3))
        cpt = random.choice(CPT_CODES)
        billed = round(random.uniform(50, 15000), 2)
        allowed = round(billed * random.uniform(0.5, 0.9), 2)
        paid = round(allowed * random.uniform(0.7, 1.0), 2)
        svc_cat = random.choice(SERVICE_CATEGORIES)
        claim_ext_id = f"CLM{random.randint(1000000, 9999999)}"

        session.execute(text(
            "INSERT INTO claims (member_id, claim_id, claim_type, service_date, paid_date, "
            "diagnosis_codes, procedure_code, rendering_provider_id, "
            "billed_amount, allowed_amount, paid_amount, service_category) "
            "VALUES (:mid, :cid, :ct, :sd, :pd, :dx, :cpt, :pid, :ba, :aa, :pa, :sc)"
        ), {
            "mid": mid, "cid": claim_ext_id, "ct": ctype, "sd": svc_date, "pd": paid_date,
            "dx": dx, "cpt": cpt, "pid": pid,
            "ba": billed, "aa": allowed, "pa": paid, "sc": svc_cat,
        })
    session.commit()
    print(f"  Created {num_claims} claims")


def _seed_hcc_suspects(session: Session, member_ids: list[int]) -> None:
    existing = session.execute(text("SELECT count(*) FROM hcc_suspects")).scalar()
    if existing and existing > 0:
        print(f"  HCC suspects already seeded ({existing})")
        return

    suspects = [
        {"hcc": 37, "label": "Diabetes with Complications", "icd": "E11.65", "icd_label": "Type 2 DM with hyperglycemia", "raf": 0.166, "type": "recapture"},
        {"hcc": 226, "label": "Congestive Heart Failure", "icd": "I50.9", "icd_label": "Heart failure, unspecified", "raf": 0.360, "type": "med_dx_gap"},
        {"hcc": 280, "label": "Chronic Obstructive Pulmonary Disease", "icd": "J44.1", "icd_label": "COPD with acute exacerbation", "raf": 0.319, "type": "historical"},
        {"hcc": 38, "label": "Diabetes without Complications", "icd": "E11.9", "icd_label": "Type 2 DM without complications", "raf": 0.166, "type": "specificity"},
    ]

    for s in suspects:
        mid = random.choice(member_ids)
        annual = round(float(s["raf"]) * 13200, 2)  # CMS_ANNUAL_BASE = $1,100 PMPM * 12
        session.execute(text(
            "INSERT INTO hcc_suspects (member_id, payment_year, hcc_code, hcc_label, icd10_code, "
            "icd10_label, raf_value, annual_value, suspect_type, status, confidence, "
            "evidence_summary, identified_date) "
            "VALUES (:mid, :py, :hcc, :hlabel, :icd, :ilabel, :raf, :av, :st, 'open', :conf, :ev, :idate)"
        ), {
            "mid": mid, "py": 2026, "hcc": s["hcc"], "hlabel": s["label"],
            "icd": s["icd"], "ilabel": s["icd_label"], "raf": s["raf"],
            "av": annual, "st": s["type"], "conf": random.randint(60, 95),
            "ev": f"Evidence: prior claims with {s['icd']} in 2024-2025",
            "idate": date(2026, 1, 15),
        })
    session.commit()
    print(f"  Created {len(suspects)} HCC suspects")


def _seed_care_gaps(session: Session, member_ids: list[int], measure_ids: list[int], provider_ids: list[int]) -> None:
    existing = session.execute(text("SELECT count(*) FROM member_gaps")).scalar()
    if existing and existing > 0:
        print(f"  Care gaps already seeded ({existing})")
        return

    count = 0
    # Give ~40% of members an open gap on a random measure
    for mid in member_ids:
        if random.random() < 0.4:
            meas = random.choice(measure_ids)
            pid = random.choice(provider_ids)
            due = date(2026, 12, 31)
            session.execute(text(
                "INSERT INTO member_gaps (member_id, measure_id, status, due_date, measurement_year, responsible_provider_id) "
                "VALUES (:mid, :meas, 'open', :due, 2026, :pid)"
            ), {"mid": mid, "meas": meas, "due": due, "pid": pid})
            count += 1

    # Add a few closed gaps
    for _ in range(5):
        mid = random.choice(member_ids)
        meas = random.choice(measure_ids)
        pid = random.choice(provider_ids)
        closed = _random_date_in_year(2025)
        session.execute(text(
            "INSERT INTO member_gaps (member_id, measure_id, status, closed_date, measurement_year, responsible_provider_id) "
            "VALUES (:mid, :meas, 'closed', :cd, 2025, :pid)"
        ), {"mid": mid, "meas": meas, "cd": closed, "pid": pid})
        count += 1

    session.commit()
    print(f"  Created {count} care gaps")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print()
    print("=" * 60)
    print("  AQSoft Health Platform — Database Seeder")
    print("=" * 60)
    print()
    seed()
