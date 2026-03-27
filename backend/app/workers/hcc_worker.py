"""
Background job processor for HCC suspect analysis.

Uses arq (Redis-based async task queue) to run HCC engine analysis
across an entire tenant population after claims ingestion completes.
"""

import logging
from typing import Any

from app.config import settings
from app.services.hcc_engine import analyze_population
from app.services.provider_service import refresh_provider_scorecards
from app.workers import get_tenant_session

logger = logging.getLogger(__name__)


async def run_hcc_analysis(ctx: dict, tenant_schema: str) -> dict[str, Any]:
    """
    arq task: Run HCC suspect analysis for all members in a tenant.

    Triggered automatically after claims or pharmacy data ingestion, or
    can be enqueued manually for a full population refresh.

    Args:
        ctx: arq worker context (contains Redis pool).
        tenant_schema: Schema name for the tenant.

    Returns:
        Dict with analysis summary (total_members, total_suspects, etc.).
    """
    logger.info("Starting HCC analysis job for tenant: %s", tenant_schema)
    db = await get_tenant_session(tenant_schema)

    try:
        result = await analyze_population(tenant_schema, db)
        logger.info(
            "HCC analysis job completed for %s: %d suspects found across %d members",
            tenant_schema,
            result.get("total_suspects", 0),
            result.get("total_members", 0),
        )

        # Refresh provider/group scorecards now that suspects are up to date
        try:
            scorecard_result = await refresh_provider_scorecards(db)
            logger.info(
                "Provider scorecard refresh completed for %s: %d providers, %d groups",
                tenant_schema,
                scorecard_result.get("providers_updated", 0),
                scorecard_result.get("groups_updated", 0),
            )
            result["scorecard_refresh"] = scorecard_result
        except Exception as sc_err:
            logger.error(
                "Provider scorecard refresh failed for %s: %s",
                tenant_schema, sc_err, exc_info=True,
            )
            result["scorecard_refresh_error"] = str(sc_err)

        return result

    except Exception as e:
        logger.error("HCC analysis job failed for %s: %s", tenant_schema, e, exc_info=True)
        return {"error": str(e)}

    finally:
        await db.close()


# ---------------------------------------------------------------------------
# arq Worker Settings
# ---------------------------------------------------------------------------

class WorkerSettings:
    """Configuration for the arq worker process.

    Start the worker with:
        arq app.workers.hcc_worker.WorkerSettings
    """

    functions = [run_hcc_analysis]
    redis_settings = None  # Configured at import time below
    max_jobs = 3
    job_timeout = 1800  # 30 minutes — population analysis can be slow
    queue_name = "default"

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        logger.info("HCC analysis worker started")

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        logger.info("HCC analysis worker shutting down")


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
