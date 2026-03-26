"""
Alembic env.py — uses SYNC engine (psycopg2) for reliable migrations.

Imports all models so that Base.metadata contains every table for autogenerate.
Converts asyncpg URLs to psycopg2 automatically.
"""

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
    """
    Get a psycopg2 database URL.
    Reads from DATABASE_URL env var and converts asyncpg -> psycopg2 if needed.
    Falls back to the alembic.ini sqlalchemy.url.
    """
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        url = config.get_main_option("sqlalchemy.url", "")

    # Convert asyncpg driver to psycopg2
    if "+asyncpg" in url:
        url = url.replace("+asyncpg", "+psycopg2")
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL to stdout."""
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
    """Run migrations using a sync psycopg2 engine."""
    url = get_sync_url()

    connectable = create_engine(url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
