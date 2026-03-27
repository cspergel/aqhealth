"""
Data Ingestion API endpoints.

Handles file uploads, AI column mapping, job management,
mapping templates, and mapping rules.
"""

import asyncio
import json
import logging
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_tenant_db
from app.services.data_preprocessor import preprocess_file
from app.services.ingestion_service import read_file_headers_and_sample
from app.services.mapping_service import propose_mapping

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingestion", tags=["ingestion"])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

UPLOADS_DIR = Path(
    getattr(settings, "uploads_dir", None) or
    os.environ.get("UPLOADS_DIR", "uploads")
)

MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}


def _ensure_uploads_dir() -> Path:
    """Create the uploads directory if it doesn't exist."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOADS_DIR


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ColumnMappingEntry(BaseModel):
    platform_field: str | None = None
    confidence: float = 0.0
    transform: dict | None = None


class PreprocessingInfo(BaseModel):
    original_encoding: str | None = None
    changes_made: list[dict] = []
    rows_removed: int = 0
    columns_removed: list[str] = []
    date_format_detected: dict[str, str] = {}
    diagnosis_columns_merged: bool = False
    merged_dx_columns: list[str] = []
    warnings: list[str] = []


class UploadResponse(BaseModel):
    job_id: int
    filename: str
    detected_type: str
    proposed_mapping: dict[str, ColumnMappingEntry]
    sample_rows: list[list[str]]
    headers: list[str]
    preprocessing: PreprocessingInfo | None = None


class ConfirmMappingRequest(BaseModel):
    column_mapping: dict[str, str] = Field(
        ..., description="Confirmed mapping: {source_column: platform_field}"
    )
    data_type: str | None = Field(
        None, description="Override detected data type (roster, claims, etc.)"
    )
    save_as_template: bool = False
    template_name: str | None = None
    source_name: str | None = None


class ConfirmMappingResponse(BaseModel):
    job_id: int
    status: str
    message: str


class JobSummary(BaseModel):
    id: int
    filename: str
    detected_type: str | None
    status: str
    total_rows: int | None
    processed_rows: int | None
    error_rows: int | None
    uploaded_by: int | None
    created_at: str
    updated_at: str


class JobDetail(BaseModel):
    id: int
    filename: str
    file_size: int | None
    detected_type: str | None
    status: str
    column_mapping: dict | None
    total_rows: int | None
    processed_rows: int | None
    error_rows: int | None
    errors: list[dict] | None
    uploaded_by: int | None
    created_at: str
    updated_at: str


class PaginatedJobs(BaseModel):
    items: list[JobSummary]
    total: int
    page: int
    page_size: int


class TemplateCreate(BaseModel):
    name: str
    source_name: str | None = None
    data_type: str
    column_mapping: dict[str, str]
    transformation_rules: dict | None = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    source_name: str | None
    data_type: str
    column_mapping: dict
    transformation_rules: dict | None
    created_at: str


class RuleCreate(BaseModel):
    source_name: str | None = None
    rule_type: str = Field(..., description="column_rename, value_transform, or filter")
    rule_config: dict
    description: str | None = None


class RuleResponse(BaseModel):
    id: int
    source_name: str | None
    rule_type: str
    rule_config: dict
    description: str | None
    is_active: bool
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    template_id: int | None = Query(None, description="Apply existing mapping template"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Upload a data file (CSV or Excel) for ingestion.

    Creates an UploadJob record, stores the file to disk, triggers AI column
    mapping analysis, and returns the proposed mapping for user review.
    """
    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read file content and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB",
        )

    # Generate unique filename and save to disk
    uploads_dir = _ensure_uploads_dir()
    unique_name = f"{uuid.uuid4().hex}_{file.filename}"
    file_path = uploads_dir / unique_name

    with open(file_path, "wb") as f:
        f.write(content)

    # Step 0: Pre-process the raw file to fix encoding, headers, empty rows, etc.
    preprocessing_info = None
    effective_path = str(file_path)
    try:
        prep_result = await asyncio.to_thread(preprocess_file, str(file_path))
        preprocessing_info = PreprocessingInfo(
            original_encoding=prep_result.get("original_encoding"),
            changes_made=prep_result.get("changes_made", []),
            rows_removed=prep_result.get("rows_removed", 0),
            columns_removed=prep_result.get("columns_removed", []),
            date_format_detected=prep_result.get("date_format_detected", {}),
            diagnosis_columns_merged=prep_result.get("diagnosis_columns_merged", False),
            merged_dx_columns=prep_result.get("merged_dx_columns", []),
            warnings=prep_result.get("warnings", []),
        )
        if prep_result.get("cleaned_path"):
            effective_path = prep_result["cleaned_path"]
        for change in prep_result.get("changes_made", []):
            logger.info(f"Upload pre-processed: {change['description']}")
    except Exception as prep_err:
        logger.warning(f"Pre-processing failed (continuing with original file): {prep_err}")

    # Read headers and sample data (from preprocessed file if available)
    try:
        headers, sample_rows = read_file_headers_and_sample(effective_path, max_rows=5)
    except Exception as e:
        # Clean up the file if we can't read it
        file_path.unlink(missing_ok=True)
        logger.error(f"Failed to read uploaded file: {e}")
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    # Load existing mapping rules for this source
    rules_result = await db.execute(
        text("SELECT source_name, rule_type, rule_config, is_active "
             "FROM mapping_rules WHERE is_active = true")
    )
    existing_rules = [dict(r._mapping) for r in rules_result]

    # If a template was specified, use its mapping directly
    template_mapping = None
    template_data_type = None
    if template_id:
        tmpl_result = await db.execute(
            text("SELECT column_mapping, data_type FROM mapping_templates WHERE id = :tid"),
            {"tid": template_id},
        )
        tmpl = tmpl_result.mappings().first()
        if tmpl:
            template_mapping = tmpl["column_mapping"]
            if isinstance(template_mapping, str):
                template_mapping = json.loads(template_mapping)
            template_data_type = tmpl["data_type"]

    # Propose mapping (AI or heuristic)
    if template_mapping:
        # Convert template mapping {src: field} to proposal format
        proposed = {
            src: {"platform_field": field, "confidence": 1.0}
            for src, field in template_mapping.items()
            if src in headers
        }
        # Add unmapped headers
        for h in headers:
            if h not in proposed:
                proposed[h] = {"platform_field": None, "confidence": 0.0}
        data_type = template_data_type or "unknown"
    else:
        result = await propose_mapping(headers, sample_rows, existing_rules, tenant_schema=current_user["tenant_schema"])
        data_type = result["data_type"]
        proposed = result["mapping"]

    # Create UploadJob record and retrieve its ID via RETURNING
    # Store the effective (cleaned) file path so the background worker
    # doesn't need to re-preprocess.
    mapping_json = json.dumps(proposed)
    id_result = await db.execute(
        text("""
            INSERT INTO upload_jobs
                (filename, file_size, detected_type, status, column_mapping,
                 mapping_template_id, uploaded_by, cleaned_file_path)
            VALUES
                (:filename, :file_size, :detected_type, 'mapping',
                 :mapping::jsonb, :template_id, :user_id, :cleaned_path)
            RETURNING id
        """),
        {
            "filename": unique_name,
            "file_size": len(content),
            "detected_type": data_type,
            "mapping": mapping_json,
            "template_id": template_id,
            "user_id": current_user["user_id"],
            "cleaned_path": effective_path,
        },
    )
    job_id = id_result.scalar_one()
    await db.commit()

    # Best-effort: fingerprint the source file for data protection tracking
    try:
        from app.services.data_protection_service import fingerprint_source
        await fingerprint_source(
            db=db,
            headers=headers,
            sample_rows=sample_rows,
            source_name=unique_name,
            upload_job_id=job_id,
        )
        await db.commit()
    except Exception as fp_err:
        logger.warning("Source fingerprinting failed (non-blocking): %s", fp_err)

    # Convert proposed mapping to response format
    mapping_response = {}
    for src, info in proposed.items():
        if isinstance(info, dict):
            mapping_response[src] = ColumnMappingEntry(**info)
        else:
            mapping_response[src] = ColumnMappingEntry(platform_field=info)

    return UploadResponse(
        job_id=job_id,
        filename=file.filename,
        detected_type=data_type,
        proposed_mapping=mapping_response,
        sample_rows=sample_rows,
        headers=headers,
        preprocessing=preprocessing_info,
    )


@router.post("/{job_id}/confirm-mapping", response_model=ConfirmMappingResponse)
async def confirm_mapping(
    job_id: int,
    body: ConfirmMappingRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """
    Confirm or correct the proposed column mapping and trigger background processing.

    Optionally saves the mapping as a reusable template.
    """
    # Load the job
    result = await db.execute(
        text("SELECT id, status, detected_type FROM upload_jobs WHERE id = :jid"),
        {"jid": job_id},
    )
    job = result.mappings().first()
    if not job:
        raise HTTPException(status_code=404, detail="Upload job not found")

    if job["status"] not in ("mapping", "failed"):
        raise HTTPException(
            status_code=400,
            detail=f"Job is in '{job['status']}' status and cannot accept mapping confirmation",
        )

    # Determine data type
    data_type = body.data_type or job["detected_type"] or "unknown"

    # Convert simple mapping to full format for storage
    full_mapping = {
        src: {"platform_field": field, "confidence": 1.0}
        for src, field in body.column_mapping.items()
    }
    mapping_json = json.dumps(full_mapping)

    # Update the job
    await db.execute(
        text("""
            UPDATE upload_jobs
            SET column_mapping = :mapping::jsonb,
                detected_type = :dtype,
                status = 'validating',
                updated_at = NOW()
            WHERE id = :jid
        """),
        {"jid": job_id, "mapping": mapping_json, "dtype": data_type},
    )

    # Optionally save as template
    if body.save_as_template and body.template_name:
        template_mapping = json.dumps(body.column_mapping)
        await db.execute(
            text("""
                INSERT INTO mapping_templates (name, source_name, data_type, column_mapping)
                VALUES (:name, :source, :dtype, :mapping::jsonb)
            """),
            {
                "name": body.template_name,
                "source": body.source_name,
                "dtype": data_type,
                "mapping": template_mapping,
            },
        )

    await db.commit()

    # Enqueue background processing job via arq
    tenant_schema = current_user["tenant_schema"]
    try:
        from arq.connections import ArqRedis, create_pool, RedisSettings
        from urllib.parse import urlparse

        parsed = urlparse(settings.redis_url)
        redis = await create_pool(RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or "0"),
            password=parsed.password,
        ))
        await redis.enqueue_job(
            "process_ingestion_job",
            job_id,
            tenant_schema,
            _queue_name="ingestion",
        )
        await redis.close()
        message = "Mapping confirmed. Processing started in background."
    except Exception as e:
        logger.warning(f"Could not enqueue background job (Redis may be unavailable): {e}")
        # Fallback: process inline (not ideal for production but works for dev)
        message = (
            "Mapping confirmed. Background queue unavailable — "
            "job will be processed when the worker starts."
        )

    return ConfirmMappingResponse(
        job_id=job_id,
        status="validating",
        message=message,
    )


@router.get("/jobs", response_model=PaginatedJobs)
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List upload jobs with status, paginated."""
    # Build query
    where_clause = ""
    params: dict[str, Any] = {}

    if status:
        where_clause = "WHERE status = :status"
        params["status"] = status

    # Count total
    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM upload_jobs {where_clause}"),
        params,
    )
    total = count_result.scalar_one()

    # Fetch page
    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT id, filename, detected_type, status, total_rows,
                   processed_rows, error_rows, uploaded_by,
                   created_at, updated_at
            FROM upload_jobs
            {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.mappings().all()

    items = [
        JobSummary(
            id=r["id"],
            filename=r["filename"],
            detected_type=r["detected_type"],
            status=r["status"],
            total_rows=r["total_rows"],
            processed_rows=r["processed_rows"],
            error_rows=r["error_rows"],
            uploaded_by=r["uploaded_by"],
            created_at=str(r["created_at"]),
            updated_at=str(r["updated_at"]),
        )
        for r in rows
    ]

    return PaginatedJobs(items=items, total=total, page=page, page_size=page_size)


@router.get("/jobs/{job_id}", response_model=JobDetail)  # note: registered before /{job_id}
async def get_job(
    job_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Get detailed information about a specific upload job, including error summary."""
    result = await db.execute(
        text("""
            SELECT id, filename, file_size, detected_type, status,
                   column_mapping, total_rows, processed_rows, error_rows,
                   errors, uploaded_by, created_at, updated_at
            FROM upload_jobs
            WHERE id = :jid
        """),
        {"jid": job_id},
    )
    row = result.mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Upload job not found")

    return JobDetail(
        id=row["id"],
        filename=row["filename"],
        file_size=row["file_size"],
        detected_type=row["detected_type"],
        status=row["status"],
        column_mapping=row["column_mapping"],
        total_rows=row["total_rows"],
        processed_rows=row["processed_rows"],
        error_rows=row["error_rows"],
        errors=row["errors"],
        uploaded_by=row["uploaded_by"],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


# ---------------------------------------------------------------------------
# Mapping Templates
# ---------------------------------------------------------------------------

@router.post("/templates", response_model=TemplateResponse, status_code=201)
async def create_template(
    body: TemplateCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Save a new mapping template for future use."""
    mapping_json = json.dumps(body.column_mapping)
    rules_json = json.dumps(body.transformation_rules) if body.transformation_rules else None

    result = await db.execute(
        text("""
            INSERT INTO mapping_templates
                (name, source_name, data_type, column_mapping, transformation_rules)
            VALUES
                (:name, :source, :dtype, :mapping::jsonb, :rules::jsonb)
            RETURNING id, name, source_name, data_type, column_mapping,
                      transformation_rules, created_at
        """),
        {
            "name": body.name,
            "source": body.source_name,
            "dtype": body.data_type,
            "mapping": mapping_json,
            "rules": rules_json,
        },
    )
    row = result.mappings().first()
    await db.commit()

    return TemplateResponse(
        id=row["id"],
        name=row["name"],
        source_name=row["source_name"],
        data_type=row["data_type"],
        column_mapping=row["column_mapping"],
        transformation_rules=row["transformation_rules"],
        created_at=str(row["created_at"]),
    )


@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all saved mapping templates."""
    result = await db.execute(
        text("""
            SELECT id, name, source_name, data_type, column_mapping,
                   transformation_rules, created_at
            FROM mapping_templates
            ORDER BY name ASC
        """)
    )
    rows = result.mappings().all()

    return [
        TemplateResponse(
            id=r["id"],
            name=r["name"],
            source_name=r["source_name"],
            data_type=r["data_type"],
            column_mapping=r["column_mapping"],
            transformation_rules=r["transformation_rules"],
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Mapping Rules
# ---------------------------------------------------------------------------

@router.post("/rules", response_model=RuleResponse, status_code=201)
async def create_rule(
    body: RuleCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a new mapping rule."""
    valid_types = ("column_rename", "value_transform", "filter")
    if body.rule_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rule_type. Must be one of: {', '.join(valid_types)}",
        )

    config_json = json.dumps(body.rule_config)

    result = await db.execute(
        text("""
            INSERT INTO mapping_rules
                (source_name, rule_type, rule_config, description, is_active)
            VALUES
                (:source, :rtype, :config::jsonb, :desc, true)
            RETURNING id, source_name, rule_type, rule_config, description,
                      is_active, created_at
        """),
        {
            "source": body.source_name,
            "rtype": body.rule_type,
            "config": config_json,
            "desc": body.description,
        },
    )
    row = result.mappings().first()
    await db.commit()

    return RuleResponse(
        id=row["id"],
        source_name=row["source_name"],
        rule_type=row["rule_type"],
        rule_config=row["rule_config"],
        description=row["description"],
        is_active=row["is_active"],
        created_at=str(row["created_at"]),
    )


@router.get("/rules", response_model=list[RuleResponse])
async def list_rules(
    source_name: str | None = Query(None),
    active_only: bool = Query(True),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List mapping rules, optionally filtered by source and active status."""
    conditions = []
    params: dict[str, Any] = {}

    if source_name:
        conditions.append("source_name = :source")
        params["source"] = source_name

    if active_only:
        conditions.append("is_active = true")

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    result = await db.execute(
        text(f"""
            SELECT id, source_name, rule_type, rule_config, description,
                   is_active, created_at
            FROM mapping_rules
            {where_clause}
            ORDER BY created_at DESC
        """),
        params,
    )
    rows = result.mappings().all()

    return [
        RuleResponse(
            id=r["id"],
            source_name=r["source_name"],
            rule_type=r["rule_type"],
            rule_config=r["rule_config"],
            description=r["description"],
            is_active=r["is_active"],
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]
