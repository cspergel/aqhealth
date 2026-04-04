"""Background worker utilities shared across all arq task modules."""

import logging

from sqlalchemy import text

from app.database import async_session_factory, validate_schema_name

logger = logging.getLogger(__name__)


class TenantSession:
    """Context manager for tenant-scoped sessions in background workers.

    Resets search_path on cleanup to prevent tenant bleed, matching the
    fix applied to database.get_tenant_session for the FastAPI path.
    """

    def __init__(self, tenant_schema: str):
        validate_schema_name(tenant_schema)
        self.tenant_schema = tenant_schema
        self._session = None

    async def __aenter__(self):
        self._session = async_session_factory()
        await self._session.execute(text(f'SET search_path TO "{self.tenant_schema}", public'))
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            try:
                await self._session.execute(text('RESET search_path'))
            except Exception:
                pass
            await self._session.close()
