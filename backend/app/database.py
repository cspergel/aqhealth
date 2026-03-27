import re

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event, text

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


async def init_db():
    """Create platform schema tables on startup."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
