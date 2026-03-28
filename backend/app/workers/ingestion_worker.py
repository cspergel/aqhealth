"""
Background job processor for data ingestion.

Uses arq (Redis-based async task queue) to process uploaded files
in the background after the user confirms column mapping.
"""

import logging
from typing import Any

from sqlalchemy import text

from app.config import settings
from app.services.ingestion_service import process_upload
from app.workers import get_tenant_session

logger = logging.getLogger(__name__)


# Alias for backward-compat within this module
_get_tenant_session = get_tenant_session


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
            text("SELECT id, filename, column_mapping, detected_type, status, "
                 "cleaned_file_path FROM upload_jobs WHERE id = :jid"),
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
        # Prefer cleaned_file_path (pre-processed) if available
        if job.get("cleaned_file_path"):
            file_path = job["cleaned_file_path"]
        else:
            file_path = str(uploads_dir / job["filename"])

        column_mapping = job["column_mapping"]
        if isinstance(column_mapping, str):
            column_mapping = json.loads(column_mapping)

        data_type = job["detected_type"] or "unknown"

        # 3a. Data protection: detect file anomalies BEFORE processing
        try:
            from app.services.data_protection_service import detect_file_anomalies
            from app.services.ingestion_service import read_file_headers_and_sample

            headers, sample_rows = read_file_headers_and_sample(file_path, max_rows=50)
            # Convert sample rows to list-of-dicts for anomaly detection
            sample_dicts = [
                {headers[i]: row[i] for i in range(min(len(headers), len(row)))}
                for row in sample_rows
            ]

            anomaly_session = await _get_tenant_session(tenant_schema)
            try:
                anomaly_report = await detect_file_anomalies(
                    headers=headers,
                    data=sample_dicts,
                    source_name=job["filename"],
                    db=anomaly_session,
                )
                if not anomaly_report.get("safe"):
                    critical_anomalies = [
                        a for a in anomaly_report.get("anomalies", [])
                        if a.get("severity") == "critical"
                    ]
                    if critical_anomalies:
                        logger.warning(
                            f"Job {job_id}: critical anomalies detected: "
                            f"{[a['detail'] for a in critical_anomalies]}"
                        )
                    else:
                        logger.info(
                            f"Job {job_id}: anomaly warnings: "
                            f"{[a['detail'] for a in anomaly_report.get('anomalies', [])]}"
                        )
            finally:
                await anomaly_session.close()
        except Exception as anomaly_err:
            logger.warning(f"Data protection anomaly detection failed (non-blocking): {anomaly_err}")

        # 3b. Run the main file processing
        processing_db = await _get_tenant_session(tenant_schema)
        try:
            results = await process_upload(
                file_path=file_path,
                column_mapping=column_mapping,
                data_type=data_type,
                db=processing_db,
                tenant_schema=tenant_schema,
            )
        finally:
            await processing_db.close()

        # 3c. Create an IngestionBatch record for rollback tracking
        try:
            batch_db = await _get_tenant_session(tenant_schema)
            try:
                await batch_db.execute(
                    text("""
                        INSERT INTO ingestion_batches
                            (upload_job_id, source_name, record_count, status, created_at)
                        VALUES (:job_id, :source, :count, 'active', NOW())
                    """),
                    {
                        "job_id": job_id,
                        "source": job["filename"],
                        "count": results.get("processed_rows", 0),
                    },
                )
                await batch_db.commit()
            finally:
                await batch_db.close()
        except Exception as batch_err:
            logger.warning(f"Failed to create IngestionBatch record (non-blocking): {batch_err}")

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

        # 4b. Analyze correction patterns to auto-learn transformation rules
        try:
            from app.services.data_learning_service import analyze_correction_patterns

            learning_db = await _get_tenant_session(tenant_schema)
            try:
                patterns = await analyze_correction_patterns(learning_db)
                if patterns:
                    logger.info(
                        f"Job {job_id}: found {len(patterns)} correction patterns for rule creation"
                    )
            finally:
                await learning_db.close()
        except Exception as learn_err:
            logger.warning(f"Correction pattern analysis failed (non-blocking): {learn_err}")

        # 5. Run data quality checks after processing
        try:
            from app.services.data_quality_service import run_quality_checks

            quality_db = await _get_tenant_session(tenant_schema)
            try:
                quality_report = await run_quality_checks(quality_db, job_id)
                logger.info(f"Job {job_id} quality score: {quality_report.get('score', 'N/A')}")
            finally:
                await quality_db.close()
        except Exception as quality_err:
            logger.warning(f"Quality checks failed (non-blocking): {quality_err}")

        # 6. Trigger downstream recalculations
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
        from arq.connections import ArqRedis

        if not isinstance(redis, ArqRedis):
            logger.warning("Redis pool is not an ArqRedis instance; skipping downstream triggers")
            return

        # After claims/pharmacy: trigger HCC analysis
        if data_type in ("claims", "pharmacy"):
            await redis.enqueue_job(
                "run_hcc_analysis",
                tenant_schema,
                _queue_name="default",
            )
            logger.info(f"Enqueued HCC analysis for {tenant_schema}")

        # After roster/eligibility: may need to recalculate RAF scores
        if data_type in ("roster", "eligibility"):
            await redis.enqueue_job(
                "run_hcc_analysis",
                tenant_schema,
                _queue_name="default",
            )
            logger.info(f"Enqueued HCC analysis (roster/eligibility) for {tenant_schema}")

        # After any ingestion type: trigger AI insight generation
        await redis.enqueue_job(
            "run_insight_generation",
            tenant_schema,
            _queue_name="default",
        )
        logger.info(f"Enqueued insight generation for {tenant_schema}")

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
    async def on_startup(ctx: dict) -> None:
        """Called when the worker starts."""
        logger.info("Ingestion worker started")

    @staticmethod
    async def on_shutdown(ctx: dict) -> None:
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
