"""
Background job processor for AI insight generation.

Uses arq (Redis-based async task queue) to run cross-module insight
generation after data ingestion, HCC analysis, or on schedule.
"""

import logging
from typing import Any

from app.config import settings
from app.services.insight_service import generate_insights
from app.services.discovery_service import run_full_discovery
from app.workers import TenantSession

logger = logging.getLogger(__name__)


async def run_insight_generation(ctx: dict, tenant_schema: str) -> dict[str, Any]:
    """
    arq task: Generate AI insights for a tenant's population.

    Triggered automatically after data ingestion, after HCC analysis,
    or on a daily schedule.

    Args:
        ctx: arq worker context (contains Redis pool).
        tenant_schema: Schema name for the tenant.

    Returns:
        Dict with generation summary.
    """
    logger.info("Starting insight generation job for tenant: %s", tenant_schema)

    try:
        async with TenantSession(tenant_schema) as db:
            results = await generate_insights(db, tenant_schema=tenant_schema)

            for r in results:
                scan_type = r.get("scan_type", "llm_synthesis")
                r["source_scan"] = scan_type

            logger.info(
                "Insight generation completed for %s: %d insights created (discovery-powered)",
                tenant_schema,
                len(results),
            )

            scan_counts: dict[str, int] = {}
            for r in results:
                st = r.get("source_scan", "unknown")
                scan_counts[st] = scan_counts.get(st, 0) + 1

            return {
                "insights_created": len(results),
                "insights": results,
                "scan_summary": scan_counts,
            }

    except Exception as e:
        logger.error("Insight generation failed for %s: %s", tenant_schema, e, exc_info=True)
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# arq Worker Settings
# ---------------------------------------------------------------------------

class WorkerSettings:
    """Configuration for the arq worker process.

    Start the worker with:
        arq app.workers.insight_worker.WorkerSettings
    """

    functions = [run_insight_generation]
    redis_settings = None  # Configured at import time below
    max_jobs = 2
    job_timeout = 600  # 10 minutes
    queue_name = "default"

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        logger.info("Insight generation worker started")

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        logger.info("Insight generation worker shutting down")


def _configure_redis_settings() -> None:
    """Parse Redis URL from settings and configure arq."""
    try:
        from arq.connections import RedisSettings
        from urllib.parse import urlparse

        parsed = urlparse(settings.redis_url)
        WorkerSettings.redis_settings = RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or "0"),
            password=parsed.password,
        )
    except Exception as e:
        logger.warning("Could not configure Redis settings for arq: %s", e)


_configure_redis_settings()
