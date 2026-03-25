"""
Alembic env.py — supports both sync (autogenerate) and async migrations.

Imports all models so that Base.metadata contains every table for autogenerate.
Uses DATABASE_URL from environment or falls back to the app config default.
"""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool, engine_from_config, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

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

# Override sqlalchemy.url with env var if available
db_url = os.environ.get("DATABASE_URL")
if db_url:
    # Normalise driver — Alembic needs asyncpg for async mode
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    config.set_main_option("sqlalchemy.url", db_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL to stdout."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Helper used by both sync and async paths."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine (the normal runtime path)."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Detect whether we're in an async context and act accordingly."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Already inside an event loop (e.g. Jupyter) — schedule as a task
        loop.create_task(run_async_migrations())
    else:
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
