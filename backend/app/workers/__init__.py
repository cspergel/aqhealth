"""Background worker utilities shared across all arq task modules."""

import logging

from sqlalchemy import text

from app.database import async_session_factory, validate_schema_name

logger = logging.getLogger(__name__)


async def get_tenant_session(tenant_schema: str):
    """Create a tenant-scoped async DB session for background work (outside FastAPI DI).

    The caller is responsible for closing the returned session.
    """
    validate_schema_name(tenant_schema)
    session = async_session_factory()
    try:
        await session.execute(text(f'SET search_path TO "{tenant_schema}", public'))
        return session
    except Exception:
        await session.close()
        raise
