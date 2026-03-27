"""
One-command database setup for AQSoft Health Platform.

Drops and recreates everything from scratch:
  1. platform + demo_mso schemas (clean slate)
  2. All tables via SQLAlchemy models
  3. Seed data (tenant, users, members, claims, suspects, care gaps, etc.)
  4. Extended data (insights, learning, ADT, alerts, annotations, etc.)

Usage:
    cd backend
    python -m scripts.setup_db
"""

import json
import os
import random
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

from passlib.context import CryptContext
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Imports — SQLAlchemy models (this loads Base + all tables)
# ---------------------------------------------------------------------------

from app.models import Base
from app.models.tenant import Tenant
from app.models.user import User

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql+psycopg2://aqsoft:aqsoft@localhost:5433/aqsoft_health",
)

PLATFORM_SCHEMA = "platform"
TENANT_SCHEMA = "demo_mso"

engine = create_engine(DATABASE_URL, echo=False)

# Second engine with search_path pre-set for tenant seed operations
tenant_engine = create_engine(
    DATABASE_URL, echo=False,
    connect_args={"options": f"-csearch_path={TENANT_SCHEMA},public"},
)

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def _today() -> date:
    return date(2026, 3, 25)


def _months_ago(n: int) -> date:
    t = _today()
    month = t.month - n
    year = t.year
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def _random_dob(min_age: int = 55, max_age: int = 90) -> date:
    days_offset = random.randint(min_age * 365, max_age * 365)
    return _today() - timedelta(days=days_offset)


def _random_date_in_year(year: int = 2025) -> date:
    start = date(year, 1, 1)
    return start + timedelta(days=random.randint(0, 364))


def _random_recent_datetime(days_back: int = 90) -> datetime:
    t = _today()
    offset = random.randint(0, days_back)
    d = t - timedelta(days=offset)
    return datetime(d.year, d.month, d.day,
                    random.randint(6, 22), random.randint(0, 59), 0)


def _random_recent_date(days_back: int = 180) -> date:
    return _today() - timedelta(days=random.randint(0, days_back))


# ===========================================================================
# STEP 1 & 2 & 3: Drop schemas, recreate, create tables via SQLAlchemy
# ===========================================================================

# Tables whose schema is explicitly "platform" in the model
PLATFORM_TABLE_NAMES = {"tenants", "users"}


def _get_tenant_tables():
    """All tables that are NOT platform-scoped (schema is None in models)."""
    return [t for t in Base.metadata.sorted_tables if t.schema is None]


def _get_platform_tables():
    """Tables explicitly in the platform schema."""
    return [t for t in Base.metadata.sorted_tables if t.schema == "platform"]


def setup_schemas_and_tables():
    """Drop + recreate schemas and create all tables."""
    print("  [1/3] Dropping old schemas...")
    with engine.connect() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {TENANT_SCHEMA} CASCADE"))
        conn.execute(text(f"DROP SCHEMA IF EXISTS {PLATFORM_SCHEMA} CASCADE"))

        # Drop all custom enum types in public schema
        rows = conn.execute(text(
            "SELECT typname FROM pg_type "
            "WHERE typtype = 'e' AND typnamespace = "
            "(SELECT oid FROM pg_namespace WHERE nspname = 'public')"
        )).fetchall()
        for (name,) in rows:
            conn.execute(text(f"DROP TYPE IF EXISTS public.{name} CASCADE"))

        conn.execute(text(f"CREATE SCHEMA {PLATFORM_SCHEMA}"))
        conn.execute(text(f"CREATE SCHEMA {TENANT_SCHEMA}"))
        conn.commit()

    print("  [2/3] Creating platform tables (tenants, users)...")
    with engine.connect() as conn:
        # Create platform tables via SQLAlchemy metadata
        platform_tables = _get_platform_tables()
        Base.metadata.create_all(engine, tables=platform_tables)

    print("  [3/3] Creating tenant tables in demo_mso schema...")
    tenant_tables = _get_tenant_tables()

    # Temporarily reassign schema to demo_mso
    original_schemas = {}
    for table in tenant_tables:
        original_schemas[table.name] = table.schema
        table.schema = TENANT_SCHEMA

    try:
        Base.metadata.create_all(engine, tables=tenant_tables)
    finally:
        # Reset schemas back to None
        for table in tenant_tables:
            table.schema = original_schemas[table.name]

    # Count tables created
    with engine.connect() as conn:
        result = conn.execute(text(
            f"SELECT count(*) FROM information_schema.tables "
            f"WHERE table_schema = '{TENANT_SCHEMA}'"
        ))
        count = result.scalar()
    print(f"       Created {count} tables in {TENANT_SCHEMA} schema")


# ===========================================================================
# STEP 4: Seed base data (from seed.py logic)
# ===========================================================================

def _load_quality_measures():
    """Load all 37 quality measures from quality_measures.json."""
    measures_path = os.path.join(os.path.dirname(__file__), "..", "data", "quality_measures.json")
    with open(measures_path, "r") as f:
        data = json.load(f)
    return data["measures"]


DEFAULT_MEASURES = _load_quality_measures()

PRACTICE_GROUPS = [
    {"name": "ISG Tampa", "client_code": "ISG-TPA", "city": "Tampa", "state": "FL", "zip_code": "33602"},
    {"name": "FMG St. Pete", "client_code": "FMG-STP", "city": "St. Petersburg", "state": "FL", "zip_code": "33701"},
    {"name": "ISG Brandon", "client_code": "ISG-BRN", "city": "Brandon", "state": "FL", "zip_code": "33511"},
    {"name": "FMG Clearwater", "client_code": "FMG-CLW", "city": "Clearwater", "state": "FL", "zip_code": "33755"},
    {"name": "TPSG Downtown", "client_code": "TPSG-DT", "city": "Tampa", "state": "FL", "zip_code": "33601"},
]

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

CLAIM_TYPES = ["professional", "institutional", "pharmacy"]
SERVICE_CATEGORIES = ["inpatient", "ed_observation", "professional", "snf_postacute", "pharmacy", "home_health", "dme", "other"]
DX_CODES = ["E11.9", "I10", "J44.1", "E78.5", "N18.3", "F32.9", "M54.5", "I25.10", "E11.65", "G47.33",
            "K21.0", "J45.20", "E03.9", "M17.11", "I48.91"]
CPT_CODES = ["99213", "99214", "99215", "99232", "99233", "99291", "36415", "80053", "83036", "85025",
             "71046", "93000", "90837", "77067", "45378"]


def seed_base_data():
    """Seed tenant, users, practice groups, providers, members, claims, suspects, care gaps."""
    random.seed(42)

    with Session(tenant_engine) as session:
        # 1. Demo tenant
        session.execute(text(
            f"INSERT INTO {PLATFORM_SCHEMA}.tenants (name, schema_name, status) "
            "VALUES (:name, :schema, :status)"
        ), {"name": "Demo MSO", "schema": "demo_mso", "status": "active"})
        session.commit()
        tenant_id = session.execute(
            text(f"SELECT id FROM {PLATFORM_SCHEMA}.tenants WHERE schema_name = 'demo_mso'")
        ).scalar()
        print(f"  Created tenant 'Demo MSO' (id={tenant_id})")

        # 2. Users
        for email, pw, name, role, tid in [
            ("admin@aqsoft.ai", "admin123", "AQSoft Admin", "superadmin", None),
            ("demo@aqsoft.ai", "demo123", "Demo MSO Admin", "mso_admin", tenant_id),
        ]:
            hashed = pwd_ctx.hash(pw)
            session.execute(text(
                f"INSERT INTO {PLATFORM_SCHEMA}.users "
                "(email, hashed_password, full_name, role, tenant_id, is_active) "
                "VALUES (:email, :pw, :name, :role, :tid, true)"
            ), {"email": email, "pw": hashed, "name": name, "role": role, "tid": tid})
            session.commit()
            print(f"  Created user '{email}' (role={role})")

        # 3. Practice groups
        for g in PRACTICE_GROUPS:
            session.execute(text(
                "INSERT INTO practice_groups (name, client_code, city, state, zip_code) "
                "VALUES (:name, :cc, :city, :state, :zip)"
            ), {"name": g["name"], "cc": g["client_code"], "city": g["city"], "state": g["state"], "zip": g["zip_code"]})
        session.commit()
        group_ids = [r[0] for r in session.execute(text("SELECT id FROM practice_groups ORDER BY id")).fetchall()]
        print(f"  Created {len(group_ids)} practice groups")

        # 4. Providers
        for p in PROVIDERS:
            gid = group_ids[p["group_idx"]]
            session.execute(text(
                "INSERT INTO providers (npi, practice_group_id, first_name, last_name, specialty, practice_name) "
                "VALUES (:npi, :gid, :fn, :ln, :spec, :pname)"
            ), {
                "npi": p["npi"], "gid": gid, "fn": p["first_name"], "ln": p["last_name"],
                "spec": p["specialty"], "pname": PRACTICE_GROUPS[p["group_idx"]]["name"],
            })
        session.commit()
        provider_ids = [r[0] for r in session.execute(text("SELECT id FROM providers ORDER BY id")).fetchall()]
        print(f"  Created {len(provider_ids)} providers")

        # 5. Gap measures — all 37 from quality_measures.json
        for m in DEFAULT_MEASURES:
            cutpoints = m.get("star_cutpoints", {})
            session.execute(text(
                "INSERT INTO gap_measures (code, name, description, category, stars_weight, "
                "target_rate, star_3_cutpoint, star_4_cutpoint, star_5_cutpoint, is_custom, is_active) "
                "VALUES (:code, :name, :desc, :cat, :sw, :tr, :s3, :s4, :s5, false, true)"
            ), {
                "code": m["code"],
                "name": m["name"],
                "desc": m.get("description"),
                "cat": m.get("category"),
                "sw": m.get("stars_weight", 1),
                "tr": cutpoints.get("4"),  # use star_4_cutpoint as target_rate
                "s3": cutpoints.get("3"),
                "s4": cutpoints.get("4"),
                "s5": cutpoints.get("5"),
            })
        session.commit()
        measure_ids = [r[0] for r in session.execute(text("SELECT id FROM gap_measures ORDER BY id")).fetchall()]
        print(f"  Created {len(measure_ids)} quality measures (from quality_measures.json)")

        # 6. Members (30)
        for i in range(30):
            gender = "M" if i < 15 else "F"
            fn = FIRST_NAMES_M[i % len(FIRST_NAMES_M)] if gender == "M" else FIRST_NAMES_F[(i - 15) % len(FIRST_NAMES_F)]
            ln = LAST_NAMES[i % len(LAST_NAMES)]
            dob = _random_dob()
            raf = round(random.uniform(0.4, 4.5), 3)
            proj_raf = round(raf + random.uniform(-0.3, 0.8), 3)
            member_ext_id = f"H{random.randint(100000000, 999999999)}"

            session.execute(text(
                "INSERT INTO members (member_id, first_name, last_name, date_of_birth, gender, zip_code, "
                "health_plan, plan_product, coverage_start, pcp_provider_id, current_raf, projected_raf, risk_tier, "
                "medicaid_status, disability_status, institutional) "
                "VALUES (:mid, :fn, :ln, :dob, :g, :zip, :hp, :pp, :cs, :pcp, :raf, :praf, :tier, "
                "false, false, false)"
            ), {
                "mid": member_ext_id, "fn": fn, "ln": ln, "dob": dob, "g": gender,
                "zip": random.choice(ZIP_CODES), "hp": random.choice(HEALTH_PLANS),
                "pp": random.choice(PLAN_PRODUCTS),
                "cs": date(2025, 1, 1), "pcp": random.choice(provider_ids),
                "raf": raf, "praf": proj_raf, "tier": random.choice(RISK_TIERS),
            })
        session.commit()
        member_ids = [r[0] for r in session.execute(text("SELECT id FROM members ORDER BY id")).fetchall()]
        print(f"  Created {len(member_ids)} members (IDs: {member_ids[0]}-{member_ids[-1]})")

        # 7. Claims
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
                "billed_amount, allowed_amount, paid_amount, service_category, "
                "data_tier, is_estimated, reconciled) "
                "VALUES (:mid, :cid, :ct, :sd, :pd, :dx, :cpt, :pid, :ba, :aa, :pa, :sc, "
                "'record', false, false)"
            ), {
                "mid": mid, "cid": claim_ext_id, "ct": ctype, "sd": svc_date, "pd": paid_date,
                "dx": dx, "cpt": cpt, "pid": pid,
                "ba": billed, "aa": allowed, "pa": paid, "sc": svc_cat,
            })
        session.commit()
        print(f"  Created {num_claims} claims")

        # 8. HCC suspects
        suspects_data = [
            {"hcc": 37, "label": "Diabetes with Complications", "icd": "E11.65", "icd_label": "Type 2 DM with hyperglycemia", "raf": 0.166, "type": "recapture"},
            {"hcc": 226, "label": "Congestive Heart Failure", "icd": "I50.9", "icd_label": "Heart failure, unspecified", "raf": 0.360, "type": "med_dx_gap"},
            {"hcc": 280, "label": "Chronic Obstructive Pulmonary Disease", "icd": "J44.1", "icd_label": "COPD with acute exacerbation", "raf": 0.319, "type": "historical"},
            {"hcc": 38, "label": "Diabetes without Complications", "icd": "E11.9", "icd_label": "Type 2 DM without complications", "raf": 0.166, "type": "specificity"},
        ]
        for s in suspects_data:
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
        print(f"  Created {len(suspects_data)} HCC suspects")

        # 9. Care gaps
        gap_count = 0
        for mid in member_ids:
            if random.random() < 0.4:
                meas = random.choice(measure_ids)
                pid = random.choice(provider_ids)
                session.execute(text(
                    "INSERT INTO member_gaps (member_id, measure_id, status, due_date, measurement_year, responsible_provider_id) "
                    "VALUES (:mid, :meas, 'open', :due, 2026, :pid)"
                ), {"mid": mid, "meas": meas, "due": date(2026, 12, 31), "pid": pid})
                gap_count += 1
        for _ in range(5):
            mid = random.choice(member_ids)
            meas = random.choice(measure_ids)
            pid = random.choice(provider_ids)
            closed = _random_date_in_year(2025)
            session.execute(text(
                "INSERT INTO member_gaps (member_id, measure_id, status, closed_date, measurement_year, responsible_provider_id) "
                "VALUES (:mid, :meas, 'closed', :cd, 2025, :pid)"
            ), {"mid": mid, "meas": meas, "cd": closed, "pid": pid})
            gap_count += 1
        session.commit()
        print(f"  Created {gap_count} care gaps")

        return member_ids, provider_ids, group_ids, measure_ids


# ===========================================================================
# STEP 5: Seed extended data (from seed_extended.py logic)
# ===========================================================================

INSIGHTS = [
    {
        "category": "revenue",
        "title": "42 recapture suspects expiring within 60 days",
        "description": "There are 42 HCC recapture suspects across ISG Tampa and FMG St. Pete whose annual visit window closes in the next 60 days. If captured, estimated revenue impact is $187,000 in annualized RAF value.",
        "dollar_impact": 187000.00,
        "recommended_action": "Prioritize scheduling annual wellness visits for these members. Focus on the 12 complex-tier members first ($94K of the total impact).",
        "confidence": 91,
        "status": "active",
        "source_modules": ["hcc_suspects", "members"],
    },
    {
        "category": "revenue",
        "title": "Provider Dr. Chen has 18% lower capture rate than peers",
        "description": "Dr. James Chen's HCC capture rate is 52% vs. the group average of 70%. His panel of 45 members has an estimated $63K in uncaptured RAF value this payment year.",
        "dollar_impact": 63000.00,
        "recommended_action": "Schedule a provider education session with Dr. Chen focusing on suspect documentation workflows. Consider pairing with a coder for the next 2 weeks.",
        "confidence": 87,
        "status": "active",
        "source_modules": ["providers", "hcc_suspects"],
    },
    {
        "category": "cost",
        "title": "ER utilization spike in 33602 zip code",
        "description": "Members in zip 33602 had a 34% increase in ED visits over the last 30 days compared to the prior quarter. 8 of 12 visits were for ambulatory-sensitive conditions that could have been managed in primary care.",
        "dollar_impact": 48000.00,
        "recommended_action": "Deploy care coordinator outreach to the 8 members with avoidable ED visits. Evaluate whether after-hours access is adequate for ISG Tampa panel.",
        "confidence": 84,
        "status": "active",
        "source_modules": ["claims", "adt_events"],
    },
    {
        "category": "cost",
        "title": "3 members account for 28% of total spend",
        "description": "Members #5, #12, and #22 have combined claims of $312K in the last 6 months, representing 28% of total plan spend. Two have unmanaged CHF and one has recurrent SNF admissions.",
        "dollar_impact": 312000.00,
        "recommended_action": "Enroll all three in intensive care management. Member #22 should be evaluated for home health to reduce SNF readmissions.",
        "confidence": 95,
        "status": "bookmarked",
        "source_modules": ["claims", "members"],
    },
    {
        "category": "quality",
        "title": "Breast Cancer Screening gap closure behind target",
        "description": "BCS measure is at 62% closure vs. 75% target with 3 months remaining in the measurement year. 18 eligible members have not yet completed screening.",
        "dollar_impact": 22000.00,
        "recommended_action": "Send targeted outreach to the 18 members. Partner with Tampa Imaging Center for a bulk scheduling campaign.",
        "confidence": 88,
        "status": "active",
        "source_modules": ["care_gaps", "members"],
    },
    {
        "category": "quality",
        "title": "Medication Reconciliation post-discharge at 41%",
        "description": "MRP measure is significantly below the 60% target. Of 22 eligible discharges in the last 90 days, only 9 had documented medication reconciliation within 30 days.",
        "dollar_impact": 15000.00,
        "recommended_action": "Implement automated ADT-triggered workflow to schedule pharmacist reconciliation within 48 hours of discharge notification.",
        "confidence": 92,
        "status": "active",
        "source_modules": ["care_gaps", "adt_events"],
    },
    {
        "category": "provider",
        "title": "FMG Clearwater coding specificity opportunities",
        "description": "FMG Clearwater providers are using unspecified diabetes codes (E11.9) in 67% of encounters vs. best practice of <30%. This is leaving an estimated $41K in RAF value on the table.",
        "dollar_impact": 41000.00,
        "recommended_action": "Conduct coding education session focused on diabetes specificity. Provide quick-reference cards for common E11.xx specificity codes.",
        "confidence": 89,
        "status": "active",
        "source_modules": ["claims", "providers", "hcc_suspects"],
    },
    {
        "category": "provider",
        "title": "Dr. Rodriguez outperforming on Stars measures",
        "description": "Dr. Maria Rodriguez has achieved 92% gap closure rate across all weighted Stars measures, the highest in the network. Her documentation and follow-up workflows could serve as a model.",
        "dollar_impact": 0.00,
        "recommended_action": "Document Dr. Rodriguez's workflow and share as best practice across all groups. Consider a provider spotlight in next quarterly meeting.",
        "confidence": 96,
        "status": "active",
        "source_modules": ["care_gaps", "providers"],
    },
    {
        "category": "cross_module",
        "title": "ADT-Claims correlation: 5 admits without matching claims",
        "description": "Five inpatient ADT admit events from the last 45 days have no corresponding institutional claims. These may represent claims lag, denied claims, or out-of-network admissions requiring investigation.",
        "dollar_impact": 85000.00,
        "recommended_action": "Investigate the 5 unmatched admissions. Contact facilities for claim status. If out-of-network, initiate single case agreements.",
        "confidence": 78,
        "status": "active",
        "source_modules": ["adt_events", "claims"],
    },
    {
        "category": "cross_module",
        "title": "Rising-risk cohort trending toward complex tier",
        "description": "7 members currently in the rising-risk tier show RAF trajectory increases averaging +0.4 over 3 months. Without intervention, projected reclassification to complex tier within 60 days.",
        "dollar_impact": 156000.00,
        "recommended_action": "Activate proactive care management for these 7 members. Schedule PCP visits and address open HCC suspects to ensure accurate risk capture before tier transition.",
        "confidence": 82,
        "status": "active",
        "source_modules": ["members", "hcc_suspects", "claims"],
    },
]


def seed_extended_data(member_ids, provider_ids, group_ids):
    """Seed insights, learning metrics, prediction outcomes, ADT, alerts, annotations, etc."""
    random.seed(99)

    with Session(tenant_engine) as session:

        # 1. Insights
        for ins in INSIGHTS:
            session.execute(text(
                "INSERT INTO insights "
                "(category, title, description, dollar_impact, recommended_action, "
                "confidence, status, source_modules, created_at) "
                "VALUES (:cat, :title, :desc, :impact, :action, :conf, :status, :mods, :ts)"
            ), {
                "cat": ins["category"], "title": ins["title"], "desc": ins["description"],
                "impact": ins["dollar_impact"], "action": ins["recommended_action"],
                "conf": ins["confidence"], "status": ins["status"],
                "mods": json.dumps(ins["source_modules"]), "ts": _random_recent_datetime(30),
            })
        session.commit()
        print(f"  Created {len(INSIGHTS)} insights")

        # 2. Learning metrics (6 months x 3 types)
        prediction_types = ["hcc_suspect", "cost_estimate", "gap_closure"]
        base_accuracies = {"hcc_suspect": 84.5, "cost_estimate": 72.0, "gap_closure": 78.0}
        lm_rows = 0
        for i in range(6):
            metric_date = _months_ago(6 - i)
            for ptype in prediction_types:
                base = base_accuracies[ptype]
                accuracy = round(base + i * random.uniform(0.8, 1.5), 2)
                total = random.randint(80, 150)
                confirmed = int(total * accuracy / 100)
                rejected = total - confirmed - random.randint(2, 8)
                if rejected < 0:
                    rejected = 0
                pending = total - confirmed - rejected
                session.execute(text(
                    "INSERT INTO learning_metrics "
                    "(metric_date, prediction_type, total_predictions, confirmed, rejected, pending, accuracy_rate, created_at) "
                    "VALUES (:md, :pt, :tp, :c, :r, :p, :ar, :ts)"
                ), {
                    "md": metric_date, "pt": ptype, "tp": total, "c": confirmed,
                    "r": rejected, "p": pending, "ar": accuracy,
                    "ts": datetime(metric_date.year, metric_date.month, 1, 8, 0, 0),
                })
                lm_rows += 1
        session.commit()
        print(f"  Created {lm_rows} learning metrics rows")

        # 3. Prediction outcomes (50 rows)
        pred_types = ["hcc_suspect", "hcc_suspect", "hcc_suspect", "cost_recommendation", "cost_recommendation",
                      "gap_closure", "gap_closure", "readmission_risk", "readmission_risk", "raf_trajectory"]
        outcomes = ["confirmed", "confirmed", "confirmed", "rejected", "partial"]
        lessons = [
            "Historical dx pattern is strong predictor for recapture",
            "Pharmacy data alone insufficient for HCC confirmation",
            "Cost estimates within 15% for professional claims",
            "Institutional cost estimates need facility-type adjustment",
            "Gap closure predictions improve with outreach history data",
            "Readmission model underweights social determinants",
            "RAF trajectory accurate when 3+ months of claims available",
            None, None, None,
        ]
        po_rows = 0
        for i in range(50):
            ptype = random.choice(pred_types)
            outcome = random.choice(outcomes)
            was_correct = outcome == "confirmed"
            confidence = random.randint(55, 98)
            if ptype == "hcc_suspect":
                predicted_value = f"HCC {random.choice([37, 226, 280, 38, 48, 238, 155, 326])}"
                actual_value = predicted_value if was_correct else "Not confirmed"
            elif ptype == "cost_recommendation":
                val = random.randint(2000, 25000)
                predicted_value = f"${val}"
                actual_value = f"${int(val * random.uniform(0.7, 1.3))}" if outcome != "rejected" else "N/A"
            elif ptype == "gap_closure":
                predicted_value = random.choice(["Will close", "At risk"])
                actual_value = "Closed" if was_correct else "Still open"
            elif ptype == "readmission_risk":
                predicted_value = random.choice(["High risk", "Medium risk", "Low risk"])
                actual_value = "Readmitted" if was_correct else "No readmission"
            else:
                predicted_value = f"RAF +{round(random.uniform(0.1, 0.8), 2)}"
                actual_value = f"RAF +{round(random.uniform(0.05, 0.9), 2)}"
            session.execute(text(
                "INSERT INTO prediction_outcomes "
                "(prediction_type, prediction_id, predicted_value, confidence, "
                "outcome, actual_value, was_correct, lesson_learned, created_at) "
                "VALUES (:pt, :pid, :pv, :c, :o, :av, :wc, :ll, :ts)"
            ), {
                "pt": ptype, "pid": random.randint(1, 200), "pv": predicted_value,
                "c": confidence, "o": outcome, "av": actual_value, "wc": was_correct,
                "ll": random.choice(lessons), "ts": _random_recent_datetime(120),
            })
            po_rows += 1
        session.commit()
        print(f"  Created {po_rows} prediction outcomes")

        # 4. User interactions (30 rows)
        interaction_types = ["view", "view", "view", "bookmark", "dismiss", "capture", "drill_down", "export"]
        target_types = ["insight", "insight", "member", "member", "provider", "hcc_suspect", "care_gap", "report"]
        page_contexts = ["dashboard", "dashboard", "members_list", "member_detail",
                         "providers_list", "provider_detail", "hcc_suspects", "care_gaps",
                         "insights", "reports", "adt_events"]
        for _ in range(30):
            session.execute(text(
                "INSERT INTO user_interactions "
                "(user_id, interaction_type, target_type, target_id, page_context, created_at) "
                "VALUES (:uid, :it, :tt, :tid, :pc, :ts)"
            ), {
                "uid": random.choice([1, 2]), "it": random.choice(interaction_types),
                "tt": random.choice(target_types), "tid": random.randint(1, 30),
                "pc": random.choice(page_contexts), "ts": _random_recent_datetime(60),
            })
        session.commit()
        print(f"  Created 30 user interactions")

        # 5. ADT sources
        adt_sources = [
            {
                "name": "Bamboo Health ADT Feed", "source_type": "webhook",
                "config": {"endpoint": "https://api.bamboohealth.com/v2/adt", "auth_type": "api_key", "format": "HL7v2",
                           "event_types": ["A01", "A02", "A03", "A04", "A08"],
                           "facility_filter": ["Tampa General", "St. Joseph's Hospital", "AdventHealth Tampa"]},
                "is_active": True, "events_received": 847,
            },
            {
                "name": "Humana Claims ADT Extract", "source_type": "sftp",
                "config": {"host": "sftp.humana.com", "path": "/outbound/adt/", "schedule": "every_6_hours",
                           "format": "CSV", "delimiter": "|"},
                "is_active": True, "events_received": 1253,
            },
        ]
        for s in adt_sources:
            session.execute(text(
                "INSERT INTO adt_sources "
                "(name, source_type, config, is_active, last_sync, events_received, created_at) "
                "VALUES (:name, :st, :cfg, :ia, :ls, :er, :ts)"
            ), {
                "name": s["name"], "st": s["source_type"], "cfg": json.dumps(s["config"]),
                "ia": s["is_active"], "ls": _random_recent_datetime(1),
                "er": s["events_received"], "ts": datetime(2025, 9, 15, 10, 0, 0),
            })
        session.commit()
        source_ids = [r[0] for r in session.execute(text("SELECT id FROM adt_sources ORDER BY id")).fetchall()]
        print(f"  Created {len(adt_sources)} ADT sources")

        # 6. ADT events (20)
        facilities = [
            ("Tampa General Hospital", "1234500001", "acute_care"),
            ("St. Joseph's Hospital", "1234500002", "acute_care"),
            ("AdventHealth Tampa", "1234500003", "acute_care"),
            ("BayCare Urgent Care", "1234500004", "urgent_care"),
        ]
        event_types = ["admit", "admit", "admit", "admit", "discharge", "discharge", "discharge", "discharge",
                       "er_visit", "er_visit", "er_visit", "transfer"]
        dx_sets = [
            ["I50.9", "I10"], ["J44.1", "J96.00"], ["N17.9"], ["E11.65", "E11.9"],
            ["I63.9"], ["K92.1"], ["S72.001A"], ["J18.9"], ["I48.91", "I50.9"], ["R55"],
        ]
        for i in range(20):
            member_id = random.choice(member_ids)
            source_id = random.choice(source_ids)
            event_type = random.choice(event_types)
            facility = random.choice(facilities)
            dx = random.choice(dx_sets)
            event_ts = _random_recent_datetime(60)
            admit_dt = event_ts if event_type in ("admit", "er_visit") else event_ts - timedelta(days=random.randint(1, 7))
            discharge_dt = (event_ts if event_type == "discharge" else
                           (event_ts + timedelta(days=random.randint(1, 5)) if event_type == "admit" else
                            (event_ts + timedelta(hours=random.randint(2, 8)) if event_type == "er_visit" else None)))
            session.execute(text(
                "INSERT INTO adt_events "
                "(source_id, event_type, event_timestamp, member_id, "
                "match_confidence, patient_class, admit_date, discharge_date, "
                "diagnosis_codes, facility_name, facility_npi, facility_type, "
                "is_processed, estimated_total_cost, created_at) "
                "VALUES (:sid, :et, :ets, :mid, :mc, :pc, :ad, :dd, :dx, :fn, :fnpi, :ft, :ip, :etc, :ts)"
            ), {
                "sid": source_id, "et": event_type, "ets": event_ts, "mid": member_id,
                "mc": random.randint(85, 100),
                "pc": "inpatient" if event_type in ("admit", "discharge", "transfer") else "emergency",
                "ad": admit_dt, "dd": discharge_dt, "dx": json.dumps(dx),
                "fn": facility[0], "fnpi": facility[1], "ft": facility[2],
                "ip": random.choice([True, True, True, False]),
                "etc": round(random.uniform(3000, 45000), 2), "ts": event_ts,
            })
        session.commit()
        print(f"  Created 20 ADT events")

        # 7. Care alerts (10)
        adt_rows = session.execute(text(
            "SELECT id, member_id, event_type FROM adt_events ORDER BY id LIMIT 20"
        )).fetchall()
        alert_defs = [
            ("readmission_risk", "critical", "High readmission risk: Tampa General Hospital discharge",
             "Member was discharged and has 2+ admissions in 90 days. Readmission risk score: 82%.",
             "Initiate transitional care management within 24 hours."),
            ("readmission_risk", "critical", "30-day readmission alert",
             "Member readmitted within 18 days of prior discharge.",
             "Activate intensive care management."),
            ("admission_notification", "high", "Inpatient admission: Tampa General Hospital",
             "Member admitted for acute care. Estimated stay: 3-5 days.",
             "Notify PCP and care manager."),
            ("admission_notification", "high", "ER visit with admission: Tampa General Hospital",
             "Member presented to ER and was admitted.",
             "Review member's care plan."),
            ("admission_notification", "high", "Observation stay: Tampa General Hospital",
             "Member placed in observation status.",
             "Track observation hours."),
            ("discharge_planning", "medium", "Discharge pending: needs medication reconciliation",
             "Member expected to discharge within 24-48 hours.",
             "Schedule medication reconciliation."),
            ("discharge_planning", "medium", "Post-acute placement needed",
             "Member requires SNF placement post-discharge.",
             "Coordinate SNF bed availability."),
            ("discharge_planning", "medium", "Home health services needed post-discharge",
             "Member being discharged with new DME and wound care needs.",
             "Order home health evaluation."),
            ("follow_up_needed", "low", "7-day PCP follow-up due",
             "Member was discharged 5 days ago and has not yet scheduled PCP follow-up.",
             "Contact member to schedule PCP appointment."),
            ("follow_up_needed", "low", "Post-discharge check-in overdue",
             "Automated 48-hour post-discharge call was not completed.",
             "Escalate to care manager for direct outreach."),
        ]
        statuses = ["open", "open", "open", "acknowledged", "acknowledged", "in_progress",
                     "in_progress", "resolved", "resolved", "resolved"]
        for i, adef in enumerate(alert_defs):
            adt = adt_rows[i % len(adt_rows)]
            session.execute(text(
                "INSERT INTO care_alerts "
                "(adt_event_id, member_id, alert_type, priority, title, description, "
                "recommended_action, status, created_at) "
                "VALUES (:aeid, :mid, :at, :pri, :t, :d, :ra, :s, :ts)"
            ), {
                "aeid": adt[0], "mid": adt[1], "at": adef[0], "pri": adef[1],
                "t": adef[2], "d": adef[3], "ra": adef[4],
                "s": statuses[i], "ts": _random_recent_datetime(30),
            })
        session.commit()
        print(f"  Created {len(alert_defs)} care alerts")

        # 8. Annotations (10)
        annotations = [
            ("member", 3, "call_log", "Called member to schedule annual wellness visit. Confirmed appointment for 3/28."),
            ("member", 7, "clinical", "Member reports increased shortness of breath. PCP visit scheduled."),
            ("member", 12, "care_plan", "Initiated intensive care management program."),
            ("member", 1, "outreach", "Left voicemail regarding overdue colorectal screening. 3rd attempt."),
            ("member", 15, "clinical", "Pharmacy data shows 45-day insulin gap. Flagged for review."),
            ("member", 22, "call_log", "Spoke with member's daughter. Confirmed member is at home."),
            ("member", 5, "care_plan", "Transitioned from rising-risk to complex tier. Added CHF monitoring."),
            ("member", 18, "outreach", "Member declined breast cancer screening. Documented refusal."),
            ("member", 9, "clinical", "New HbA1c result: 8.2% (down from 9.1%). Progress noted."),
            ("member", 25, "general", "Member relocated to 33609 zip code. Updated address."),
        ]
        # Use actual member_ids (offset from 1)
        for ann in annotations:
            entity_id = member_ids[min(ann[1] - 1, len(member_ids) - 1)]
            session.execute(text(
                "INSERT INTO annotations "
                "(entity_type, entity_id, note_type, content, requires_follow_up, "
                "follow_up_completed, is_pinned, author_id, author_name, created_at) "
                "VALUES (:et, :eid, :nt, :c, false, false, false, :aid, :an, :ts)"
            ), {
                "et": ann[0], "eid": entity_id, "nt": ann[2], "c": ann[3],
                "aid": 2, "an": "Demo MSO Admin",
                "ts": _random_recent_datetime(45),
            })
        session.commit()
        print(f"  Created {len(annotations)} annotations")

        # 9. Watchlist items (5)
        watchlist_items = [
            {"entity_type": "member", "entity_id": member_ids[min(4, len(member_ids)-1)], "entity_name": "Charles Jones",
             "reason": "Complex tier, multiple ER visits.", "watch_for": ["raf_change", "new_claims", "adt_events"],
             "last_snapshot": {"raf": 3.21, "open_suspects": 4}, "changes": {"raf": {"old": 3.05, "new": 3.21}}, "has_changes": True},
            {"entity_type": "member", "entity_id": member_ids[min(11, len(member_ids)-1)], "entity_name": "Linda Williams",
             "reason": "High cost member, SNF utilization.", "watch_for": ["adt_events", "new_claims"],
             "last_snapshot": {"raf": 2.87, "total_spend_90d": 48200}, "changes": None, "has_changes": False},
            {"entity_type": "member", "entity_id": member_ids[min(21, len(member_ids)-1)], "entity_name": "Martha Moore",
             "reason": "Rising risk trajectory.", "watch_for": ["raf_change", "new_suspects"],
             "last_snapshot": {"raf": 1.98, "open_suspects": 3}, "changes": {"open_suspects": {"old": 2, "new": 3}}, "has_changes": True},
            {"entity_type": "provider", "entity_id": provider_ids[min(1, len(provider_ids)-1)], "entity_name": "Dr. James Chen",
             "reason": "Below-average capture rate.", "watch_for": ["capture_rate_change"],
             "last_snapshot": {"capture_rate": 52.0}, "changes": None, "has_changes": False},
            {"entity_type": "group", "entity_id": group_ids[0], "entity_name": "ISG Tampa",
             "reason": "Largest group, driving overall metrics.", "watch_for": ["gap_closure_rate", "capture_rate"],
             "last_snapshot": {"gap_closure_rate": 71.5}, "changes": {"gap_closure_rate": {"old": 69.2, "new": 71.5}}, "has_changes": True},
        ]
        for item in watchlist_items:
            session.execute(text(
                "INSERT INTO watchlist_items "
                "(user_id, entity_type, entity_id, entity_name, reason, "
                "watch_for, last_snapshot, changes_detected, last_checked, has_changes, created_at) "
                "VALUES (:uid, :et, :eid, :en, :r, :wf, :ls, :cd, :lc, :hc, :ts)"
            ), {
                "uid": 2, "et": item["entity_type"], "eid": item["entity_id"],
                "en": item["entity_name"], "r": item["reason"],
                "wf": json.dumps(item["watch_for"]), "ls": json.dumps(item["last_snapshot"]),
                "cd": json.dumps(item["changes"]) if item["changes"] else None,
                "lc": _random_recent_datetime(2), "hc": item["has_changes"],
                "ts": _random_recent_datetime(60),
            })
        session.commit()
        print(f"  Created {len(watchlist_items)} watchlist items")

        # 10. Action items (8)
        actions = [
            {"source_type": "insight", "source_id": 1, "title": "Schedule AWV for 42 expiring recapture suspects",
             "description": "Prioritize 12 complex-tier members first.", "action_type": "outreach_campaign",
             "priority": "high", "status": "open", "due_date": _today() + timedelta(days=14),
             "member_id": None, "provider_id": None, "group_id": group_ids[0],
             "expected_impact": "$187K annualized RAF value recovery"},
            {"source_type": "care_alert", "source_id": 1, "title": "TCM for Member post-discharge",
             "description": "PCP follow-up within 7 days. Med reconciliation needed.", "action_type": "care_coordination",
             "priority": "critical", "status": "open", "due_date": _today() + timedelta(days=3),
             "member_id": member_ids[min(6, len(member_ids)-1)], "provider_id": provider_ids[min(2, len(provider_ids)-1)], "group_id": None,
             "expected_impact": "Prevent readmission ($18K)"},
            {"source_type": "insight", "source_id": 5, "title": "BCS outreach for 18 members",
             "description": "Partner with Tampa Imaging Center.", "action_type": "quality_initiative",
             "priority": "medium", "status": "open", "due_date": _today() + timedelta(days=30),
             "member_id": None, "provider_id": None, "group_id": None,
             "expected_impact": "BCS 62% -> 75%"},
            {"source_type": "insight", "source_id": 2, "title": "Provider education: Dr. Chen HCC documentation",
             "description": "Coding specificity training + 2-week coder shadowing.", "action_type": "provider_education",
             "priority": "high", "status": "in_progress", "due_date": _today() + timedelta(days=7),
             "member_id": None, "provider_id": provider_ids[min(1, len(provider_ids)-1)], "group_id": group_ids[0],
             "expected_impact": "Capture rate 52% -> 70% ($63K)"},
            {"source_type": "insight", "source_id": 4, "title": "ICM enrollment for high-cost members",
             "description": "Enroll members #5, #12, #22.", "action_type": "care_management",
             "priority": "high", "status": "in_progress", "due_date": _today() + timedelta(days=10),
             "member_id": None, "provider_id": None, "group_id": None,
             "expected_impact": "Reduce spend 20% ($62K)"},
            {"source_type": "manual", "source_id": None, "title": "Q4 2025 provider scorecards distributed",
             "description": "Distributed to all 10 providers across 5 groups.", "action_type": "reporting",
             "priority": "medium", "status": "completed", "due_date": _today() - timedelta(days=20),
             "member_id": None, "provider_id": None, "group_id": None,
             "expected_impact": "Provider awareness"},
            {"source_type": "insight", "source_id": 7, "title": "Coding education: FMG Clearwater diabetes specificity",
             "description": "Training completed on E11.xx codes.", "action_type": "provider_education",
             "priority": "medium", "status": "completed", "due_date": _today() - timedelta(days=30),
             "member_id": None, "provider_id": None, "group_id": group_ids[min(3, len(group_ids)-1)],
             "expected_impact": "Unspecified diabetes <30%"},
            {"source_type": "manual", "source_id": None, "title": "Pilot telehealth program (cancelled)",
             "description": "Vendor contract fell through.", "action_type": "program_initiative",
             "priority": "low", "status": "cancelled", "due_date": _today() - timedelta(days=10),
             "member_id": None, "provider_id": None, "group_id": None,
             "expected_impact": "Improve access for 15 rural members"},
        ]
        for act in actions:
            session.execute(text(
                "INSERT INTO action_items "
                "(source_type, source_id, title, description, action_type, "
                "assigned_to, assigned_to_name, priority, status, due_date, "
                "member_id, provider_id, group_id, expected_impact, outcome_measured, created_at) "
                "VALUES (:st, :sid, :t, :d, :at, :ato, :atn, :p, :s, :dd, :mid, :pid, :gid, :ei, false, :ts)"
            ), {
                "st": act["source_type"], "sid": act["source_id"], "t": act["title"],
                "d": act["description"], "at": act["action_type"],
                "ato": 2, "atn": "Demo MSO Admin", "p": act["priority"], "s": act["status"],
                "dd": act["due_date"], "mid": act["member_id"], "pid": act["provider_id"],
                "gid": act["group_id"], "ei": act["expected_impact"],
                "ts": _random_recent_datetime(45),
            })
        session.commit()
        print(f"  Created {len(actions)} action items")

        # 11. Report templates (4)
        templates = [
            {"name": "Monthly Plan Performance Report", "report_type": "monthly",
             "sections": [{"key": "executive_summary", "title": "Executive Summary", "type": "narrative"},
                          {"key": "raf_overview", "title": "RAF & Revenue Performance", "type": "metrics_table"},
                          {"key": "stars_measures", "title": "Stars Measure Progress", "type": "gap_analysis"},
                          {"key": "cost_utilization", "title": "Cost & Utilization", "type": "metrics_table"}],
             "schedule": "monthly", "is_system": True},
            {"name": "Quarterly Board Report", "report_type": "quarterly",
             "sections": [{"key": "highlights", "title": "Quarter Highlights", "type": "narrative"},
                          {"key": "financial_summary", "title": "Financial Performance", "type": "metrics_table"}],
             "schedule": "quarterly", "is_system": True},
            {"name": "Provider Performance Summary", "report_type": "provider_scorecard",
             "sections": [{"key": "panel_overview", "title": "Panel Overview", "type": "metrics_table"},
                          {"key": "raf_performance", "title": "RAF & Capture Performance", "type": "comparison"}],
             "schedule": "monthly", "is_system": True},
            {"name": "RADV Audit Preparation", "report_type": "audit",
             "sections": [{"key": "audit_summary", "title": "Audit Readiness Summary", "type": "scorecard"},
                          {"key": "sample_members", "title": "Sampled Members", "type": "member_list"}],
             "schedule": None, "is_system": True},
        ]
        for t in templates:
            session.execute(text(
                "INSERT INTO report_templates "
                "(name, report_type, sections, schedule, is_system, created_at) "
                "VALUES (:n, :rt, :sec, :sch, :sys, :ts)"
            ), {
                "n": t["name"], "rt": t["report_type"], "sec": json.dumps(t["sections"]),
                "sch": t["schedule"], "sys": t["is_system"],
                "ts": datetime(2025, 10, 1, 9, 0, 0),
            })
        session.commit()
        template_id = session.execute(text("SELECT id FROM report_templates ORDER BY id LIMIT 1")).scalar()
        print(f"  Created {len(templates)} report templates")

        # 12. Generated reports (1)
        content = {
            "generated_at": "2026-03-01T08:00:00Z", "period": "February 2026",
            "sections": {
                "executive_summary": {"narrative": "February showed continued improvement in RAF capture and Stars measure closure."},
                "raf_overview": {"avg_raf": 1.82, "projected_raf": 1.95, "open_suspects": 47, "capture_rate": 68.5},
                "stars_measures": {"overall_star_rating": 3.8, "measures_at_target": 8, "measures_below_target": 5},
                "cost_utilization": {"total_pmpm": 1187.50, "ip_admits_per_1000": 245, "readmission_rate": 14.2},
            },
        }
        session.execute(text(
            "INSERT INTO generated_reports "
            "(template_id, title, period, status, content, ai_narrative, generated_by, created_at) "
            "VALUES (:tid, :t, :p, :s, :c, :ai, :gb, :ts)"
        ), {
            "tid": template_id,
            "t": "Monthly Plan Performance Report - February 2026",
            "p": "February 2026", "s": "completed",
            "c": json.dumps(content),
            "ai": "February 2026 saw positive momentum across key metrics. RAF capture rate improved to 68.5%.",
            "gb": 2, "ts": datetime(2026, 3, 1, 8, 30, 0),
        })
        session.commit()
        print(f"  Created 1 generated report")

        # 13. Saved filters (5)
        filters = [
            {"name": "High Risk Members", "page": "members", "conditions": {"risk_tier": ["high", "complex"]}, "shared": True, "system": True},
            {"name": "Open HCC Suspects", "page": "members", "conditions": {"has_open_suspects": True}, "shared": True, "system": True},
            {"name": "Care Gap Priority", "page": "members", "conditions": {"min_open_gaps": 3}, "shared": True, "system": True},
            {"name": "Recent ER Visitors", "page": "members", "conditions": {"recent_er_visit": True, "days_back": 30}, "shared": True, "system": True},
            {"name": "RAF Opportunity", "page": "members", "conditions": {"min_raf_gap": 0.5}, "shared": True, "system": True},
        ]
        for f in filters:
            session.execute(text(
                "INSERT INTO saved_filters "
                "(name, page_context, conditions, created_by, is_shared, is_system, use_count, created_at) "
                "VALUES (:n, :pc, :c, :cb, :sh, :sys, :uc, :ts)"
            ), {
                "n": f["name"], "pc": f["page"], "c": json.dumps(f["conditions"]),
                "cb": 2, "sh": f["shared"], "sys": f["system"],
                "uc": random.randint(5, 40), "ts": datetime(2025, 10, 15, 10, 0, 0),
            })
        session.commit()
        print(f"  Created {len(filters)} saved filters")

        # 14. RAF history (10 members x 6 months)
        raf_rows = 0
        for member_id in member_ids[:10]:
            base_demo = round(random.uniform(0.25, 0.55), 3)
            base_disease = round(random.uniform(0.3, 2.5), 3)
            base_interaction = round(random.uniform(0.0, 0.4), 3)
            for month_offset in range(6):
                calc_date = _months_ago(6 - month_offset)
                demo_raf = base_demo
                disease_raf = round(base_disease + month_offset * random.uniform(-0.05, 0.12), 3)
                interaction_raf = round(base_interaction + month_offset * random.uniform(-0.02, 0.05), 3)
                if interaction_raf < 0:
                    interaction_raf = 0.0
                total_raf = round(demo_raf + disease_raf + interaction_raf, 3)
                session.execute(text(
                    "INSERT INTO raf_history "
                    "(member_id, calculation_date, payment_year, demographic_raf, "
                    "disease_raf, interaction_raf, total_raf, hcc_count, suspect_count, created_at) "
                    "VALUES (:mid, :cd, :py, :dr, :dsr, :ir, :tr, :hc, :sc, :ts)"
                ), {
                    "mid": member_id, "cd": calc_date, "py": 2026,
                    "dr": demo_raf, "dsr": disease_raf, "ir": interaction_raf, "tr": total_raf,
                    "hc": random.randint(1, 8), "sc": random.randint(0, 5),
                    "ts": datetime(calc_date.year, calc_date.month, calc_date.day, 6, 0, 0),
                })
                raf_rows += 1
        session.commit()
        print(f"  Created {raf_rows} RAF history rows (10 members x 6 months)")


# ===========================================================================
# MAIN
# ===========================================================================

def main():
    print()
    print("=" * 60)
    print("  AQSoft Health Platform -- Full Database Setup")
    print("=" * 60)
    print()

    print("[STEP 1] Creating schemas and tables...")
    setup_schemas_and_tables()
    print()

    print("[STEP 2] Seeding base data...")
    member_ids, provider_ids, group_ids, measure_ids = seed_base_data()
    print()

    print("[STEP 3] Seeding extended data...")
    seed_extended_data(member_ids, provider_ids, group_ids)
    print()

    print("=" * 60)
    print("  Setup complete!")
    print("=" * 60)
    print()
    print("  Superadmin login : admin@aqsoft.ai / admin123")
    print("  MSO admin login  : demo@aqsoft.ai  / demo123")
    print()
    print(f"  Members seeded   : {len(member_ids)} (IDs: {member_ids[0]}-{member_ids[-1]})")
    print(f"  Providers seeded : {len(provider_ids)}")
    print(f"  Groups seeded    : {len(group_ids)}")
    print()
    print("  To start the API:")
    print("    cd backend && uvicorn app.main:app --reload --port 8090")
    print()


if __name__ == "__main__":
    main()
