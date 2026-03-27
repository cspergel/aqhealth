"""
Create a new tenant with schema, tables, admin user, and default quality measures.

Non-destructive: will NOT touch existing schemas or data.

Usage:
    cd backend
    python -m scripts.create_tenant \
        --name "Pinellas MSO" \
        --schema pinellas_mso \
        --admin-email admin@pinellas.com \
        --admin-password SomeSecurePassword123
"""

import argparse
import os
import sys

from passlib.context import CryptContext
from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# Ensure app package is importable
# ---------------------------------------------------------------------------
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from app.models import Base  # noqa: E402 — loads all models into metadata
from app.models.tenant import Tenant
from app.models.user import User
from app.database import validate_schema_name, create_tenant_tables  # noqa: E402

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DATABASE_URL = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql+psycopg2://aqsoft:aqsoft@localhost:5433/aqsoft_health",
)

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_platform_schema(engine):
    """Make sure the platform schema and its tables exist."""
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
        conn.commit()
    platform_tables = [t for t in Base.metadata.sorted_tables if t.schema == "platform"]
    Base.metadata.create_all(engine, tables=platform_tables)


def _tenant_exists(engine, schema_name: str) -> bool:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :s"),
            {"s": schema_name},
        )
        return result.scalar() is not None


def _tenant_record_exists(engine, schema_name: str) -> int | None:
    """Return the tenant PK if a record already exists in platform.tenants."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id FROM platform.tenants WHERE schema_name = :s"),
            {"s": schema_name},
        )
        return result.scalar()


def _create_tenant_record(engine, name: str, schema_name: str) -> int:
    """Insert a tenant row and return its PK."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "INSERT INTO platform.tenants (name, schema_name, status, created_at, updated_at) "
                "VALUES (:name, :schema, 'active', NOW(), NOW()) RETURNING id"
            ),
            {"name": name, "schema": schema_name},
        )
        tenant_id = result.scalar()
        conn.commit()
        return tenant_id


def _create_admin_user(engine, tenant_id: int, email: str, password: str) -> int:
    """Insert an admin user row and return its PK."""
    hashed = pwd_ctx.hash(password)
    with engine.connect() as conn:
        # Check if user already exists
        existing = conn.execute(
            text("SELECT id FROM platform.users WHERE email = :email"),
            {"email": email},
        )
        existing_id = existing.scalar()
        if existing_id:
            print(f"  User {email} already exists (id={existing_id}), skipping.")
            return existing_id

        result = conn.execute(
            text(
                "INSERT INTO platform.users "
                "(email, hashed_password, full_name, role, tenant_id, is_active, created_at, updated_at) "
                "VALUES (:email, :pw, :name, 'mso_admin', :tid, true, NOW(), NOW()) RETURNING id"
            ),
            {"email": email, "pw": hashed, "name": f"Admin ({email})", "tid": tenant_id},
        )
        user_id = result.scalar()
        conn.commit()
        return user_id


def _seed_quality_measures(schema_name: str):
    """Seed default quality measures into the tenant schema using async."""
    import asyncio
    from app.database import async_session_factory
    from app.services.care_gap_service import seed_default_measures

    async def _seed():
        async with async_session_factory() as db:
            await db.execute(text(f'SET search_path TO "{schema_name}", public'))
            count = await seed_default_measures(db)
            await db.commit()
            return count

    return asyncio.run(_seed())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Create a new tenant in the AQSoft Health Platform."
    )
    parser.add_argument("--name", required=True, help="Human-friendly tenant name, e.g. 'Pinellas MSO'")
    parser.add_argument("--schema", required=True, help="PostgreSQL schema name (lowercase, a-z/0-9/_)")
    parser.add_argument("--admin-email", required=True, help="Email for the initial admin user")
    parser.add_argument("--admin-password", required=True, help="Password for the initial admin user")

    args = parser.parse_args()

    schema_name = args.schema.lower().strip()
    validate_schema_name(schema_name)

    engine = create_engine(DATABASE_URL, echo=False)

    print(f"Creating tenant: {args.name} (schema: {schema_name})")
    print()

    # Step 0: Ensure platform schema
    print("[0/5] Ensuring platform schema exists...")
    _ensure_platform_schema(engine)

    # Step 1: Create tenant record
    print("[1/5] Creating tenant record in platform.tenants...")
    existing_tid = _tenant_record_exists(engine, schema_name)
    if existing_tid:
        tenant_id = existing_tid
        print(f"  Tenant record already exists (id={tenant_id}), reusing.")
    else:
        tenant_id = _create_tenant_record(engine, args.name, schema_name)
        print(f"  Created tenant record (id={tenant_id}).")

    # Step 2: Create schema
    print("[2/5] Creating PostgreSQL schema...")
    if _tenant_exists(engine, schema_name):
        print(f"  Schema '{schema_name}' already exists, will add missing tables.")
    else:
        with engine.connect() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
            conn.commit()
        print(f"  Schema '{schema_name}' created.")

    # Step 3: Create all tenant tables
    print("[3/5] Creating tenant tables...")
    table_count = create_tenant_tables(schema_name)
    print(f"  {table_count} tables now in schema '{schema_name}'.")

    # Step 4: Create admin user
    print("[4/5] Creating admin user...")
    user_id = _create_admin_user(engine, tenant_id, args.admin_email, args.admin_password)
    print(f"  Admin user ready (id={user_id}).")

    # Step 5: Seed quality measures
    print("[5/5] Seeding default quality measures...")
    try:
        measures = _seed_quality_measures(schema_name)
        print(f"  {measures} quality measures seeded.")
    except Exception as e:
        print(f"  Warning: could not seed measures: {e}")

    engine.dispose()

    print()
    print("=" * 60)
    print(f"Tenant '{args.name}' is ready!")
    print(f"  Schema:  {schema_name}")
    print(f"  Admin:   {args.admin_email}")
    print(f"  Tables:  {table_count}")
    print()
    print("Next steps:")
    print(f"  1. Upload data via the ingestion API (schema={schema_name})")
    print(f"  2. Run post-ingestion: python -m scripts.post_ingestion --schema {schema_name}")
    print("=" * 60)


if __name__ == "__main__":
    main()
