from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import event, text

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_size=20, max_overflow=10)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncSession:
    """Get a plain session (platform schema). Use get_tenant_session for tenant-scoped queries."""
    async with async_session_factory() as session:
        yield session


async def get_tenant_session(tenant_schema: str) -> AsyncSession:
    """Get a session scoped to a specific tenant schema."""
    async with async_session_factory() as session:
        await session.execute(text(f"SET search_path TO {tenant_schema}, public"))
        yield session


async def create_tenant_schema(schema_name: str):
    """Provision a new tenant schema and run migrations."""
    async with engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_name}"))


async def init_db():
    """Create platform schema tables on startup."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS platform"))
