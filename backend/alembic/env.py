"""Alembic env.py — sync (psycopg2) migrations, multi-tenant aware.

Two migration targets:

1. **Platform schema** (``platform.*``): one-off tables like tenants/users.
   Baseline + any future platform-only migration runs once.

2. **Per-tenant schemas**: every row in ``platform.tenants`` has a
   corresponding schema carrying Member/Claim/etc. The runner iterates
   those schemas, sets ``search_path``, and re-runs the migration chain
   for each.

A migration flagged ``tenant_scope = True`` runs per-tenant AND on a
fresh tenant at provisioning time. A migration without that flag runs
once against the shared DB.

Set ``ALEMBIC_SKIP_TENANTS=1`` to run only the platform pass (useful in
CI when no tenants exist yet).
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlalchemy import create_engine, pool, text
from sqlalchemy.engine import Connection

from alembic import context

# ---------------------------------------------------------------------------
# Load .env so DATABASE_URL is available
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Import ALL models so Base.metadata is fully populated
# ---------------------------------------------------------------------------
from app.models.base import Base
from app.models import (  # noqa: F401 — side-effect imports
    Tenant, User,
    Member, Claim, PracticeGroup, Provider,
    HccSuspect, RafHistory,
    GapMeasure, MemberGap,
    UploadJob, MappingTemplate, MappingRule,
    Insight,
    PredictionOutcome, LearningMetric, UserInteraction,
    ADTSource, ADTEvent, CareAlert,
    Annotation, WatchlistItem, ActionItem,
    ReportTemplate, GeneratedReport,
    SavedFilter,
)

# ---------------------------------------------------------------------------
# Alembic Config
# ---------------------------------------------------------------------------
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_sync_url() -> str:
    """Return a psycopg2 database URL."""
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        url = config.get_main_option("sqlalchemy.url", "")

    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "+psycopg2")
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    return url


def _list_tenant_schemas(connection: Connection) -> list[str]:
    """Return all active tenant schema names.

    Safe if the tenants table doesn't exist yet (first-time run / fresh DB):
    returns an empty list so the platform pass still proceeds.
    """
    try:
        result = connection.execute(
            text(
                "SELECT schema_name FROM platform.tenants "
                "WHERE status = 'active' ORDER BY id"
            )
        )
        return [row.schema_name for row in result if row.schema_name]
    except Exception:
        return []


def _run_once(connection: Connection, label: str) -> None:
    """Run the migration chain against a single connection scope."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    """Emit SQL to stdout — single-pass, no tenants."""
    url = get_sync_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations: once for platform, then once per active tenant."""
    url = get_sync_url()
    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        # --- Platform pass (default search_path, no tenant scope) ---
        _run_once(connection, label="platform")

        # --- Per-tenant pass ---
        if os.getenv("ALEMBIC_SKIP_TENANTS", "").lower() in ("1", "true", "yes"):
            return

        schemas = _list_tenant_schemas(connection)
        for schema in schemas:
            # Commit the platform pass before flipping search_path so any
            # platform-level migration that tenant migrations depend on is
            # visible.
            connection.commit()

            # Re-open a clean transaction pinned to the tenant schema.
            # SET LOCAL only scopes within a transaction; we use SET so the
            # alembic transaction inherits it.
            connection.execute(text(f'SET search_path TO "{schema}", public'))
            try:
                _run_once(connection, label=f"tenant:{schema}")
            finally:
                connection.execute(text("RESET search_path"))


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
