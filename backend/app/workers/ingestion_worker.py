"""
Background job processor for data ingestion.

Uses arq (Redis-based async task queue) to process uploaded files
in the background after the user confirms column mapping.
"""

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.config import settings
from app.services.ingestion_service import process_upload
from app.workers import TenantSession

logger = logging.getLogger(__name__)


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
    """
    try:
        async with TenantSession(tenant_schema) as db:
            # 1. Load the UploadJob
            result = await db.execute(
                text("SELECT id, filename, column_mapping, detected_type, status, "
                     "cleaned_file_path FROM upload_jobs WHERE id = :jid"),
                {"jid": job_id},
            )
            job = result.mappings().first()

            if not job:
                logger.error("UploadJob %d not found in schema %s", job_id, tenant_schema)
                return {"error": f"Job {job_id} not found"}

            if job["status"] not in ("validating", "mapping"):
                logger.warning("Job %d has unexpected status '%s', proceeding anyway", job_id, job["status"])

            # 2. Update status to processing
            await db.execute(
                text("UPDATE upload_jobs SET status = 'processing', updated_at = NOW() WHERE id = :jid"),
                {"jid": job_id},
            )
            await db.commit()

            # 3. Build file path and run processing
            uploads_dir = Path(settings.uploads_dir if hasattr(settings, "uploads_dir") else "uploads")
            file_path = job.get("cleaned_file_path") or str(uploads_dir / job["filename"])

            column_mapping = job["column_mapping"]
            if isinstance(column_mapping, str):
                column_mapping = json.loads(column_mapping)

            data_type = job["detected_type"] or "unknown"

            # 3a. Data protection: detect file anomalies BEFORE processing
            try:
                from app.services.data_protection_service import detect_file_anomalies
                from app.services.ingestion_service import read_file_headers_and_sample

                headers, sample_rows = read_file_headers_and_sample(file_path, max_rows=50)
                sample_dicts = [
                    {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
                    for row in sample_rows
                ]

                async with TenantSession(tenant_schema) as anomaly_db:
                    anomaly_report = await detect_file_anomalies(
                        headers=headers, data=sample_dicts,
                        source_name=job["filename"], db=anomaly_db,
                    )
                    if not anomaly_report.get("safe"):
                        critical = [a for a in anomaly_report.get("anomalies", []) if a.get("severity") == "critical"]
                        if critical:
                            logger.warning("Job %d: critical anomalies: %s", job_id, [a["detail"] for a in critical])
            except Exception as anomaly_err:
                logger.warning("Data protection anomaly detection failed (non-blocking): %s", anomaly_err)

            # 3b. Run the main file processing. Thread the UploadJob ID
            # through so quarantined_records + data_lineage rows can be
            # correlated back to this load (and `rollback_batch` can target
            # it).
            async with TenantSession(tenant_schema) as processing_db:
                results = await process_upload(
                    file_path=file_path, column_mapping=column_mapping,
                    data_type=data_type, db=processing_db, tenant_schema=tenant_schema,
                    ingestion_job_id=job_id,
                )

            # 3c. Create an IngestionBatch record for rollback tracking
            try:
                async with TenantSession(tenant_schema) as batch_db:
                    await batch_db.execute(
                        text("""INSERT INTO ingestion_batches
                            (upload_job_id, source_name, record_count, status, created_at)
                            VALUES (:job_id, :source, :count, 'active', NOW())"""),
                        {"job_id": job_id, "source": job["filename"], "count": results.get("processed_rows", 0)},
                    )
                    await batch_db.commit()
            except Exception as batch_err:
                logger.warning("Failed to create IngestionBatch record (non-blocking): %s", batch_err)

            # 4. Update job with results
            await db.execute(
                text("""UPDATE upload_jobs
                    SET status = 'completed', total_rows = :total, processed_rows = :processed,
                        error_rows = :errors, errors = :error_details::jsonb, updated_at = NOW()
                    WHERE id = :jid"""),
                {"jid": job_id, "total": results["total_rows"], "processed": results["processed_rows"],
                 "errors": results["error_rows"], "error_details": json.dumps(results["errors"])},
            )
            await db.commit()

            # 4b. Analyze correction patterns for auto-learning
            try:
                from app.services.data_learning_service import analyze_correction_patterns
                async with TenantSession(tenant_schema) as learning_db:
                    patterns = await analyze_correction_patterns(learning_db)
                    if patterns:
                        logger.info("Job %d: found %d correction patterns", job_id, len(patterns))
            except Exception as learn_err:
                logger.warning("Correction pattern analysis failed (non-blocking): %s", learn_err)

            # 4c. Process cross-loop learning events
            try:
                from app.services.learning_events import process_cross_loop_events
                async with TenantSession(tenant_schema) as events_db:
                    event_summary = await process_cross_loop_events(events_db, tenant_schema)
                    if event_summary.get("processed", 0) > 0:
                        logger.info("Job %d: processed %d cross-loop events", job_id, event_summary["processed"])
            except Exception as events_err:
                logger.warning("Cross-loop event processing failed (non-blocking): %s", events_err)

            # 5. Run data quality checks
            try:
                from app.services.data_quality_service import run_quality_checks
                async with TenantSession(tenant_schema) as quality_db:
                    quality_report = await run_quality_checks(quality_db, job_id)
                    logger.info("Job %d quality score: %s", job_id, quality_report.get("score", "N/A"))
            except Exception as quality_err:
                logger.warning("Quality checks failed (non-blocking): %s", quality_err)

            # 6. Trigger downstream recalculations
            if data_type in ("claims", "pharmacy", "roster", "eligibility"):
                await _trigger_downstream(ctx, tenant_schema, data_type)

            logger.info("Job %d completed: %d rows processed", job_id, results["processed_rows"])
            return results

    except Exception as e:
        logger.error("Job %d failed: %s", job_id, e, exc_info=True)

        # Mark job as failed
        try:
            async with TenantSession(tenant_schema) as fail_db:
                await fail_db.execute(
                    text("""UPDATE upload_jobs SET status = 'failed',
                        errors = :err::jsonb, updated_at = NOW() WHERE id = :jid"""),
                    {"jid": job_id, "err": json.dumps([{"row": 0, "field": "system", "error": str(e)}])},
                )
                await fail_db.commit()
        except Exception as update_err:
            logger.error("Failed to update job status: %s", update_err)

        return {"error": str(e)}


async def _trigger_downstream(ctx: dict, tenant_schema: str, data_type: str) -> None:
    """Enqueue downstream recalculation jobs after successful data ingestion."""
    redis = ctx.get("redis")
    if not redis:
        logger.warning("No Redis connection in worker context; skipping downstream triggers")
        return

    try:
        from arq.connections import ArqRedis

        if not isinstance(redis, ArqRedis):
            logger.warning("Redis pool is not an ArqRedis instance; skipping downstream triggers")
            return

        if data_type in ("claims", "pharmacy", "roster", "eligibility"):
            await redis.enqueue_job("run_hcc_analysis", tenant_schema, _queue_name="default")
            logger.info("Enqueued HCC analysis for %s", tenant_schema)

        await redis.enqueue_job("run_insight_generation", tenant_schema, _queue_name="default")
        logger.info("Enqueued insight generation for %s", tenant_schema)

    except Exception as e:
        logger.warning("Failed to trigger downstream tasks: %s", e)


# ---------------------------------------------------------------------------
# arq Worker Settings
# ---------------------------------------------------------------------------

class WorkerSettings:
    """Configuration for the arq worker process.

    Start the worker with:
        arq app.workers.ingestion_worker.WorkerSettings
    """

    functions = [process_ingestion_job]
    redis_settings = None
    max_jobs = 5
    job_timeout = 600  # 10 minutes
    queue_name = "ingestion"

    @staticmethod
    async def on_startup(ctx: dict) -> None:
        logger.info("Ingestion worker started")

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
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
        logger.warning("Could not configure Redis settings for arq: %s", e)


_configure_redis_settings()
