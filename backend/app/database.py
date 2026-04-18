import re

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event, text, create_engine

from app.config import settings


RESERVED_SCHEMAS = {"public", "pg_catalog", "information_schema", "platform"}


def validate_schema_name(name: str) -> str:
    """Validate a schema name to prevent SQL injection.

    Only allows lowercase letters, digits, and underscores.
    Must start with a letter and be between 2 and 63 characters.
    Rejects reserved PostgreSQL/platform schema names.
    Raises ValueError if the name is invalid.
    """
    if not re.match(r"^[a-z][a-z0-9_]{1,62}$", name):
        raise ValueError(f"Invalid schema name: {name!r}")
    if name in RESERVED_SCHEMAS:
        raise ValueError(f"Cannot use reserved schema name: {name}")
    return name

engine = create_async_engine(settings.database_url, echo=False, pool_size=20, max_overflow=10, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    """Get a plain session (platform schema). Use get_tenant_session for tenant-scoped queries."""
    async with async_session_factory() as session:
        yield session


async def get_tenant_session(tenant_schema: str) -> AsyncSession:
    """Get a session scoped to a specific tenant schema.

    Sets search_path at the start and RESETS it on cleanup to prevent
    tenant data from bleeding across pooled connections. SET is session-scoped
    in PostgreSQL (not transaction-scoped), so we must explicitly reset.
    """
    validate_schema_name(tenant_schema)
    async with async_session_factory() as session:
        await session.execute(text(f'SET search_path TO "{tenant_schema}", public'))
        try:
            yield session
        finally:
            # Reset search_path to prevent tenant bleed on connection reuse
            try:
                await session.execute(text('RESET search_path'))
            except Exception:
                pass  # Connection may already be closed


async def create_tenant_schema(schema_name: str):
    """Provision a new tenant schema and run migrations."""
    validate_schema_name(schema_name)
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))


def _get_sync_database_url() -> str:
    """Convert the async database URL to a sync one for metadata operations."""
    url = settings.database_url
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "+psycopg2")
    return url


def create_tenant_tables(schema_name: str) -> int:
    """Create all tenant-scoped tables inside an existing schema.

    Uses a synchronous engine because SQLAlchemy's ``create_all()``
    inspects the database via the Inspector protocol, which is only
    synchronous.  Safe to call on an existing schema — uses
    ``CREATE TABLE IF NOT EXISTS`` semantics (``checkfirst=True`` by
    default in ``create_all``).

    Returns the number of tables that now exist in the schema.
    """
    validate_schema_name(schema_name)

    # Import models so Base.metadata is fully populated
    import app.models  # noqa: F401
    from app.models.base import Base

    sync_engine = create_engine(_get_sync_database_url(), echo=False)

    # Identify tenant tables — those whose model does NOT specify a schema
    # (platform tables like tenants/users have schema="platform")
    tenant_tables = [t for t in Base.metadata.sorted_tables if t.schema is None]

    # Temporarily set each table's schema to the target tenant schema
    original_schemas: dict[str, str | None] = {}
    for table in tenant_tables:
        original_schemas[table.name] = table.schema
        table.schema = schema_name

    try:
        Base.metadata.create_all(sync_engine, tables=tenant_tables)
    finally:
        # Always restore original schemas to avoid polluting global state
        for table in tenant_tables:
            table.schema = original_schemas[table.name]

    # Count how many tables are in the schema now
    with sync_engine.connect() as conn:
        result = conn.execute(text(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = :schema"
        ), {"schema": schema_name})
        count = result.scalar()

    sync_engine.dispose()
    return count


async def create_tenant_schema_with_tables(schema_name: str) -> int:
    """Create the schema AND all tenant tables in one call.

    Returns the number of tables created.
    """
    await create_tenant_schema(schema_name)
    return create_tenant_tables(schema_name)


async def init_db():
    """Bring the database to the current Alembic head on startup.

    Replaces the historical ``Base.metadata.create_all`` approach. Running
    migrations on boot keeps deploy scripts simple: ``git pull && restart``
    is enough to pick up any new revision.

    The baseline migration (``0001_baseline``) is itself a ``create_all``
    wrapper, so fresh databases still get their schema in one shot. Existing
    databases should run ``alembic stamp 0001_baseline`` once to mark the DB
    as already at baseline before first upgrade.

    Set ``AQSOFT_SKIP_AUTO_MIGRATE=1`` to skip auto-migration (useful when
    running migrations out-of-band from deploy tooling).
    """
    import logging
    import os

    logger = logging.getLogger(__name__)

    if os.getenv("AQSOFT_SKIP_AUTO_MIGRATE", "").lower() in ("1", "true", "yes"):
        logger.info("init_db: AQSOFT_SKIP_AUTO_MIGRATE set, skipping migrations")
        return

    # Alembic needs the sync URL. Load config relative to the repo so this
    # works regardless of which directory the process was launched from.
    from pathlib import Path
    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parent.parent  # backend/
    alembic_ini = backend_dir / "alembic.ini"
    if not alembic_ini.exists():
        logger.warning(
            "init_db: alembic.ini not found at %s; falling back to create_all. "
            "Schema changes will not be tracked.", alembic_ini,
        )
        await _legacy_create_all()
        return

    cfg = Config(str(alembic_ini))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    cfg.set_main_option("sqlalchemy.url", _get_sync_database_url())

    # Running alembic.command.upgrade is blocking; offload off the event loop
    # so startup doesn't block asyncio.
    import asyncio
    loop = asyncio.get_event_loop()

    def _run_upgrade() -> None:
        command.upgrade(cfg, "head")

    try:
        await loop.run_in_executor(None, _run_upgrade)
        logger.info("init_db: Alembic upgrade head completed")
    except Exception:
        logger.exception("init_db: Alembic upgrade failed")
        raise


async def _legacy_create_all() -> None:
    """Fallback path — only used if alembic.ini is missing. Keeps dev
    quickstarts working but warns loudly."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
        await conn.execute(text(
            "DO $$ BEGIN CREATE TYPE platform.tenantstatus AS ENUM "
            "('active','onboarding','suspended'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
        ))
        await conn.execute(text(
            "DO $$ BEGIN CREATE TYPE platform.userrole AS ENUM ("
            "'superadmin','mso_admin','analyst','provider',"
            "'auditor','care_manager','outreach','financial'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
        ))

    import app.models  # noqa: F401
    from app.models.base import Base
    sync_engine = create_engine(_get_sync_database_url(), echo=False)
    platform_tables = [t for t in Base.metadata.sorted_tables if t.schema == "platform"]
    try:
        Base.metadata.create_all(sync_engine, tables=platform_tables)
    finally:
        sync_engine.dispose()
