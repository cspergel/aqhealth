"""
Data Quality & Governance models.

Tracks quality reports, quarantined records, and data lineage
for full traceability of every record in the platform.
"""

from sqlalchemy import String, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DataQualityReport(Base, TimestampMixin):
    """Quality report generated after each ingestion."""
    __tablename__ = "data_quality_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    upload_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    overall_score: Mapped[int] = mapped_column(Integer)  # 0-100
    total_rows: Mapped[int] = mapped_column(Integer)
    valid_rows: Mapped[int] = mapped_column(Integer)
    quarantined_rows: Mapped[int] = mapped_column(Integer)
    warning_rows: Mapped[int] = mapped_column(Integer)

    checks: Mapped[dict] = mapped_column(JSONB)  # [{name, status, details, severity}]
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI-generated summary


class QuarantinedRecord(Base, TimestampMixin):
    """Record that failed validation -- held for review."""
    __tablename__ = "quarantined_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    upload_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_type: Mapped[str] = mapped_column(String(50))  # "roster", "claims", "pharmacy", "eligibility"
    row_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    raw_data: Mapped[dict] = mapped_column(JSONB)  # the original row data
    errors: Mapped[list] = mapped_column(JSONB)  # validation errors
    warnings: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending", "fixed", "discarded"
    fixed_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # corrected version
    reviewed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class DataLineage(Base, TimestampMixin):
    """Tracks the origin and transformation history of every record."""
    __tablename__ = "data_lineage"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50))  # "member", "claim", "provider", etc.
    entity_id: Mapped[int] = mapped_column(Integer)

    source_system: Mapped[str] = mapped_column(String(100))  # "file_upload", "aqtracker", "adt_bamboo", "manual"
    source_file: Mapped[str | None] = mapped_column(String(500), nullable=True)  # original filename
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)  # row number in source file
    ingestion_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    field_changes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g., {"current_raf": {"old": 1.2, "new": 1.5, "reason": "hcc_capture", "timestamp": "..."}}
