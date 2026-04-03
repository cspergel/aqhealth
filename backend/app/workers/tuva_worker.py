"""
Tuva Worker — runs the full Tuva pipeline as a background job.

Pipeline: Export PG → DuckDB → dbt run → Sync outputs back to PG

OPT-IN ONLY: This worker is triggered manually or via API endpoint.
It does NOT run as part of the standard ingestion pipeline.
"""

import logging
import os
from typing import Any

from app.config import settings
from app.services.tuva_export_service import TuvaExportService, get_duckdb_path
from app.services.tuva_runner_service import TuvaRunnerService
from app.services.tuva_sync_service import TuvaSyncService
from app.workers import get_tenant_session

logger = logging.getLogger(__name__)


async def tuva_pipeline_job(ctx: dict, tenant_schema: str) -> dict[str, Any]:
    """
    Full Tuva pipeline:
    1. Export tenant data from PostgreSQL → DuckDB
    2. Run dbt seed + build (Tuva transforms)
    3. Sync Tuva outputs back to PostgreSQL

    This is opt-in only — triggered manually, not part of standard pipeline.
    """
    logger.info("Starting Tuva pipeline for tenant: %s", tenant_schema)
    results: dict[str, Any] = {"tenant": tenant_schema, "phases": {}}

    # Per-tenant DuckDB file for data isolation
    duckdb_path = get_duckdb_path(tenant_schema)

    # ── Phase 1: Export PG → DuckDB ──────────────────────────────────────
    export_service = TuvaExportService(duckdb_path=duckdb_path)
    db = await get_tenant_session(tenant_schema)
    try:
        export_counts = await export_service.export_all(db)
        results["phases"]["export"] = {"success": True, **export_counts}
        logger.info("Export complete: %s", export_counts)
    except Exception as e:
        logger.error("Export failed: %s", e, exc_info=True)
        results["phases"]["export"] = {"success": False, "error": str(e)}
        return {"success": False, **results}
    finally:
        await db.close()
        export_service.close()

    # ── Phase 2: dbt seed (terminology tables) ───────────────────────────
    runner = TuvaRunnerService()

    seed_result = runner.run_seeds()
    results["phases"]["seed"] = {"success": seed_result["success"]}
    if not seed_result["success"]:
        logger.error("dbt seed failed: %s", seed_result.get("stderr", ""))
        return {"success": False, **results}

    # ── Phase 3: dbt run (Tuva models) ───────────────────────────────────
    build_result = runner.run_models()
    results["phases"]["build"] = {"success": build_result["success"]}
    if not build_result["success"]:
        logger.error("dbt run failed: %s", build_result.get("stderr", ""))
        return {"success": False, **results}

    # ── Phase 4: Sync Tuva outputs back to PG ────────────────────────────
    db = await get_tenant_session(tenant_schema)
    try:
        sync_service = TuvaSyncService(duckdb_path=duckdb_path)
        sync_result = await sync_service.sync_all(db)
        await db.commit()
        results["phases"]["sync"] = {"success": True, **sync_result}
        logger.info("Sync complete: %s", sync_result)
    except Exception as e:
        logger.error("Sync failed: %s", e, exc_info=True)
        results["phases"]["sync"] = {"success": False, "error": str(e)}
        return {"success": False, **results}
    finally:
        await db.close()

    results["success"] = True
    logger.info("Tuva pipeline complete for tenant %s", tenant_schema)
    return results


# ---------------------------------------------------------------------------
# arq Worker Settings — separate queue from main workers
# ---------------------------------------------------------------------------

class TuvaWorkerSettings:
    """Configuration for the Tuva arq worker process.

    Start with:
        arq app.workers.tuva_worker.TuvaWorkerSettings
    """

    functions = [tuva_pipeline_job]
    redis_settings = None  # Configured at import time below
    max_jobs = 1  # Only one Tuva pipeline at a time
    job_timeout = 3600  # 60 minutes — dbt builds can be slow
    queue_name = "tuva"  # Separate queue from main workers

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        logger.info("Tuva pipeline worker started")

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
        logger.info("Tuva pipeline worker shutting down")


def _configure_redis_settings() -> None:
    """Parse Redis URL from settings and configure arq."""
    try:
        from arq.connections import RedisSettings
        from urllib.parse import urlparse

        parsed = urlparse(settings.redis_url)
        TuvaWorkerSettings.redis_settings = RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or "0"),
            password=parsed.password,
        )
    except Exception as e:
        logger.warning("Could not configure Redis settings for Tuva worker: %s", e)


_configure_redis_settings()
