"""
Tenant Service — multi-tenant schema management.

Tenant isolation is currently handled by setup_db.py which creates
per-tenant PostgreSQL schemas. This service provides a programmatic
interface for tenant provisioning if needed at runtime.

For the initial implementation, tenant creation is an admin/setup operation:
    python -m app.setup_db --tenant <name>

Future: this module will support runtime tenant provisioning, schema
migrations, tenant metadata CRUD, and tenant-scoped configuration.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def create_tenant_schema(db: AsyncSession, tenant_name: str) -> dict:
    """Create a new PostgreSQL schema for a tenant.

    This is a basic implementation that creates the schema. Full table
    creation should be handled by running Alembic migrations against
    the new schema, or by calling setup_db helpers.
    """
    schema_name = f"tenant_{tenant_name}".lower().replace("-", "_").replace(" ", "_")

    try:
        await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
        await db.commit()
        logger.info("Created tenant schema: %s", schema_name)
        return {
            "tenant_name": tenant_name,
            "schema_name": schema_name,
            "status": "created",
            "message": "Schema created. Run migrations to populate tables.",
        }
    except Exception as e:
        logger.error("Failed to create tenant schema %s: %s", schema_name, e)
        return {
            "tenant_name": tenant_name,
            "schema_name": schema_name,
            "status": "error",
            "message": str(e),
        }


async def list_tenant_schemas(db: AsyncSession) -> list[str]:
    """List all tenant schemas (those prefixed with 'tenant_')."""
    result = await db.execute(
        text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name")
    )
    return [row[0] for row in result.all()]


async def tenant_exists(db: AsyncSession, tenant_name: str) -> bool:
    """Check whether a tenant schema already exists."""
    schema_name = f"tenant_{tenant_name}".lower().replace("-", "_").replace(" ", "_")
    result = await db.execute(
        text("SELECT 1 FROM information_schema.schemata WHERE schema_name = :s"),
        {"s": schema_name},
    )
    return result.scalar() is not None
