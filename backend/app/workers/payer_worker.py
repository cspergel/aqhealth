"""
Payer API background worker.

Runs payer FHIR syncs (Humana, eCW) out-of-band of the HTTP request
thread. Lives on the `default` queue because payer syncs are tenant-
scoped and don't need the dedicated isolation the Tuva pipeline gets.
"""

import logging
from typing import Any

from app.config import settings
from app.services import payer_api_service
from app.workers import TenantSession

logger = logging.getLogger(__name__)


async def sync_payer_data_job(
    ctx: dict,
    tenant_schema: str,
    payer_name: str,
    data_types: list[str] | None,
) -> dict[str, Any]:
    """arq task: run a payer data sync for one tenant/payer combo.

    The HTTP handler returns 202 immediately and hands off to here. This
    function holds the tenant session for the full duration of the sync
    (possibly 30+ minutes for a large Humana panel) so long-running
    connection pools in the web tier stay free.
    """
    logger.info("Payer sync job starting: tenant=%s payer=%s", tenant_schema, payer_name)
    try:
        async with TenantSession(tenant_schema) as db:
            result = await payer_api_service.sync_payer_data(
                db=db,
                payer_name=payer_name,
                tenant_schema=tenant_schema,
                data_types=data_types,
            )
            logger.info(
                "Payer sync completed: tenant=%s payer=%s synced=%s errors=%d",
                tenant_schema, payer_name,
                result.get("synced"), len(result.get("errors", []) or []),
            )
            return result
    except Exception as e:
        logger.exception("Payer sync job failed: tenant=%s payer=%s", tenant_schema, payer_name)
        return {"status": "error", "message": str(e), "payer": payer_name, "tenant": tenant_schema}


# ---------------------------------------------------------------------------
# arq Worker Settings
# ---------------------------------------------------------------------------


class PayerWorkerSettings:
    """Configuration for the payer arq worker.

    Start with:
        arq app.workers.payer_worker.PayerWorkerSettings
    """

    functions = [sync_payer_data_job]
    redis_settings = None
    max_jobs = 3          # modest — payer APIs rate-limit anyway
    job_timeout = 3600    # 60 min for large panels
    queue_name = "default"


def _configure_redis_settings() -> None:
    try:
        from arq.connections import RedisSettings
        from urllib.parse import urlparse

        parsed = urlparse(settings.redis_url)
        PayerWorkerSettings.redis_settings = RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or "0"),
            password=parsed.password,
        )
    except Exception as e:
        logger.warning("Could not configure Redis settings for payer worker: %s", e)


_configure_redis_settings()
