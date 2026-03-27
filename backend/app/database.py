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

    Note: This creates a new session per request and sets search_path via SQL.
    An alternative approach would be to use per-tenant engines or connection-level
    events, but the current pattern is adequate for our request-scoped usage since
    each session is used by a single request and disposed at the end.
    """
    validate_schema_name(tenant_schema)
    async with async_session_factory() as session:
        await session.execute(text(f'SET search_path TO "{tenant_schema}", public'))
        yield session


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
    """Create platform schema and tables on startup.

    Ensures the platform.tenants and platform.users tables exist so the
    auth system works even before running the full seed script.
    """
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))

        # Create enum types if they don't exist yet
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE platform.tenantstatus AS ENUM ('active','onboarding','suspended');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))
        await conn.execute(text("""
            DO $$ BEGIN
                CREATE TYPE platform.userrole AS ENUM (
                    'superadmin','mso_admin','analyst','provider',
                    'auditor','care_manager','outreach','financial'
                );
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """))

        # Create platform tables if they don't exist
        await conn.execute(text("""
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
        await conn.execute(text("""
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
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_platform_users_email ON platform.users(email)"
        ))
