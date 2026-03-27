"""
Bootstrap the first superadmin user for AQSoft Health Platform.

This script creates the platform schema, tables, and a single superadmin
user without seeding any demo/tenant data.  Safe to run multiple times --
it will skip if the user already exists.

Usage:
    cd backend
    python -m scripts.bootstrap_admin                        # interactive prompt
    python -m scripts.bootstrap_admin --email admin@example.com --password s3cret --name "Admin"
"""

import argparse
import getpass
import os
import sys

from passlib.context import CryptContext
from sqlalchemy import create_engine, text

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_async_url = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health",
)
DATABASE_URL = _async_url.replace("+asyncpg", "+psycopg2")
if "+psycopg2" not in DATABASE_URL and "psycopg2" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://")

engine = create_engine(DATABASE_URL, echo=False)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def bootstrap(email: str, password: str, full_name: str) -> None:
    with engine.begin() as conn:
        # 1. Ensure platform schema exists
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))

        # 2. Enum types
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE platform.tenantstatus AS ENUM ('active','onboarding','suspended');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))
        conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE platform.userrole AS ENUM (
                    'superadmin','mso_admin','analyst','provider',
                    'auditor','care_manager','outreach','financial'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))

        # 3. Platform tables
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
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_platform_users_email ON platform.users(email)"
        ))

    # 4. Create superadmin if not exists
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id FROM platform.users WHERE email = :e"),
            {"e": email},
        ).fetchone()

        if existing:
            print(f"User '{email}' already exists (id={existing[0]}). No changes made.")
            return

        hashed = pwd_ctx.hash(password)
        conn.execute(text(
            "INSERT INTO platform.users (email, hashed_password, full_name, role, is_active) "
            "VALUES (:email, :pw, :name, 'superadmin', true)"
        ), {"email": email, "pw": hashed, "name": full_name})

    print(f"Created superadmin user: {email}")
    print("You can now log in at the frontend.")


def main():
    parser = argparse.ArgumentParser(description="Bootstrap first superadmin user")
    parser.add_argument("--email", help="Admin email address")
    parser.add_argument("--password", help="Admin password (prompted if omitted)")
    parser.add_argument("--name", help="Full name", default="Platform Admin")
    args = parser.parse_args()

    email = args.email or input("Admin email: ").strip()
    if not email:
        print("Email is required.")
        sys.exit(1)

    password = args.password or getpass.getpass("Admin password: ")
    if not password:
        print("Password is required.")
        sys.exit(1)

    full_name = args.name

    bootstrap(email, password, full_name)


if __name__ == "__main__":
    main()
