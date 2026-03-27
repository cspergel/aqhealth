"""
Data Protection models.

Supports source fingerprinting, golden records, data contracts,
and ingestion batch tracking for rollback capability.
"""

from datetime import datetime

from sqlalchemy import String, Integer, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SourceFingerprint(Base, TimestampMixin):
    """Fingerprint of a data source for zero-config re-import."""
    __tablename__ = "source_fingerprints"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str] = mapped_column(String(200))
    fingerprint_hash: Mapped[str] = mapped_column(String(64))  # SHA256 of column structure
    column_count: Mapped[int] = mapped_column(Integer)
    column_names: Mapped[dict] = mapped_column(JSONB)  # ordered list of column names
    date_formats: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    value_patterns: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    mapping_template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    times_matched: Mapped[int] = mapped_column(Integer, default=0)


class GoldenRecord(Base, TimestampMixin):
    """Best-known version of each field for a member."""
    __tablename__ = "golden_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(Integer)
    field_name: Mapped[str] = mapped_column(String(50))
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(200))
    source_priority: Mapped[int] = mapped_column(Integer, default=50)
    confidence: Mapped[int] = mapped_column(Integer, default=80)


class DataContract(Base, TimestampMixin):
    """Schema contract that incoming files must satisfy."""
    __tablename__ = "data_contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contract_rules: Mapped[dict] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class IngestionBatch(Base, TimestampMixin):
    """Tracks a batch of ingested records for potential rollback."""
    __tablename__ = "ingestion_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    upload_job_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")  # "active", "rolled_back"
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rollback_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
