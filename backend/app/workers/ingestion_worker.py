"""
Background job processor for data ingestion.

Uses arq (Redis-based async task queue) to process uploaded files
in the background after the user confirms column mapping.
"""

import logging
from typing import Any

from sqlalchemy import text

from app.config import settings
from app.database import async_session_factory, validate_schema_name
from app.services.ingestion_service import process_upload

logger = logging.getLogger(__name__)


async def _get_tenant_session(tenant_schema: str):
    """Create a tenant-scoped session for background work (outside of FastAPI DI)."""
    validate_schema_name(tenant_schema)
    session = async_session_factory()
    try:
        await session.execute(text(f"SET search_path TO {tenant_schema}, public"))
        return session
    except Exception:
        await session.close()
        raise


async def process_ingestion_job(ctx: dict, job_id: int, tenant_schema: str) -> dict[str, Any]:
    """
    arq task: Process an uploaded file after user confirms mapping.

    Steps:
    1. Load the UploadJob record
    2. Update status to 'processing'
    3. Run ingestion_service.process_upload
    4. Update job with results (row counts, errors)
    5. Update status to 'completed' or 'failed'
    6. Trigger downstream recalculation tasks if applicable

    Args:
        ctx: arq worker context (contains Redis pool).
        job_id: ID of the UploadJob record.
        tenant_schema: Schema name for the tenant.

    Returns:
        Dict with processing results.
    """
    db = await _get_tenant_session(tenant_schema)

    try:
        # 1. Load the UploadJob
        result = await db.execute(
            text("SELECT id, filename, column_mapping, detected_type, status "
                 "FROM upload_jobs WHERE id = :jid"),
            {"jid": job_id},
        )
        job = result.mappings().first()

        if not job:
            logger.error(f"UploadJob {job_id} not found in schema {tenant_schema}")
            return {"error": f"Job {job_id} not found"}

        if job["status"] not in ("validating", "mapping"):
            logger.warning(
                f"Job {job_id} has unexpected status '{job['status']}', proceeding anyway"
            )

        # 2. Update status to processing
        await db.execute(
            text("UPDATE upload_jobs SET status = 'processing', updated_at = NOW() "
                 "WHERE id = :jid"),
            {"jid": job_id},
        )
        await db.commit()

        # 3. Build file path and run processing
        # The file path is stored relative to the uploads directory
        import json
        from pathlib import Path

        uploads_dir = Path(settings.uploads_dir if hasattr(settings, "uploads_dir")
                          else "uploads")
        file_path = str(uploads_dir / job["filename"])

        column_mapping = job["column_mapping"]
        if isinstance(column_mapping, str):
            column_mapping = json.loads(column_mapping)

        data_type = job["detected_type"] or "unknown"

        # Create a fresh session for the actual processing (needs its own transaction)
        processing_db = await _get_tenant_session(tenant_schema)
        try:
            results = await process_upload(
                file_path=file_path,
                column_mapping=column_mapping,
                data_type=data_type,
                db=processing_db,
            )
        finally:
            await processing_db.close()

        # 4. Update job with results
        await db.execute(
            text("""
                UPDATE upload_jobs
                SET status = 'completed',
                    total_rows = :total,
                    processed_rows = :processed,
                    error_rows = :errors,
                    errors = :error_details::jsonb,
                    updated_at = NOW()
                WHERE id = :jid
            """),
            {
                "jid": job_id,
                "total": results["total_rows"],
                "processed": results["processed_rows"],
                "errors": results["error_rows"],
                "error_details": json.dumps(results["errors"]),
            },
        )
        await db.commit()

        # 5. Trigger downstream recalculations
        # After claims ingestion, trigger HCC analysis and expenditure aggregation
        if data_type in ("claims", "pharmacy", "roster", "eligibility"):
            await _trigger_downstream(ctx, tenant_schema, data_type)

        logger.info(f"Job {job_id} completed: {results['processed_rows']} rows processed")
        return results

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)

        # Mark job as failed
        try:
            import json as json_mod
            await db.execute(
                text("""
                    UPDATE upload_jobs
                    SET status = 'failed',
                        errors = :err::jsonb,
                        updated_at = NOW()
                    WHERE id = :jid
                """),
                {
                    "jid": job_id,
                    "err": json_mod.dumps([{"row": 0, "field": "system", "error": str(e)}]),
                },
            )
            await db.commit()
        except Exception as update_err:
            logger.error(f"Failed to update job status: {update_err}")

        return {"error": str(e)}

    finally:
        await db.close()


async def _trigger_downstream(ctx: dict, tenant_schema: str, data_type: str) -> None:
    """
    Enqueue downstream recalculation jobs after successful data ingestion.
    These are other arq tasks that rebuild analytics from the new data.
    """
    redis = ctx.get("redis")
    if not redis:
        logger.warning("No Redis connection in worker context; skipping downstream triggers")
        return

    try:
        # After claims/pharmacy: trigger HCC analysis
        if data_type in ("claims", "pharmacy"):
            from arq.connections import ArqRedis
            if isinstance(redis, ArqRedis):
                await redis.enqueue_job(
                    "run_hcc_analysis",
                    tenant_schema,
                    _queue_name="default",
                )
                logger.info(f"Enqueued HCC analysis for {tenant_schema}")

        # After roster/eligibility: may need to recalculate RAF scores
        if data_type in ("roster", "eligibility"):
            from arq.connections import ArqRedis
            if isinstance(redis, ArqRedis):
                await redis.enqueue_job(
                    "refresh_member_scores",
                    tenant_schema,
                    _queue_name="default",
                )
                logger.info(f"Enqueued member score refresh for {tenant_schema}")

    except Exception as e:
        # Don't fail the main job if downstream triggers fail
        logger.warning(f"Failed to trigger downstream tasks: {e}")


# ---------------------------------------------------------------------------
# arq Worker Settings
# ---------------------------------------------------------------------------

class WorkerSettings:
    """Configuration for the arq worker process.

    Start the worker with:
        arq app.workers.ingestion_worker.WorkerSettings
    """

    functions = [process_ingestion_job]
    redis_settings = None  # Will be configured from settings at import time
    max_jobs = 5
    job_timeout = 600  # 10 minutes max per job
    queue_name = "ingestion"

    @staticmethod
    def on_startup(ctx: dict) -> None:
        """Called when the worker starts."""
        logger.info("Ingestion worker started")

    @staticmethod
    def on_shutdown(ctx: dict) -> None:
        """Called when the worker shuts down."""
        logger.info("Ingestion worker shutting down")


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
        logger.warning(f"Could not configure Redis settings for arq: {e}")


_configure_redis_settings()
