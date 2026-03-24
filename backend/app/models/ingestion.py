from datetime import datetime
from sqlalchemy import String, Integer, Enum as SAEnum, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class UploadStatus(str, enum.Enum):
    pending = "pending"
    mapping = "mapping"          # AI column mapping in progress
    validating = "validating"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class UploadJob(Base, TimestampMixin):
    """Tracks a file upload and its processing status."""
    __tablename__ = "upload_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detected_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    status: Mapped[UploadStatus] = mapped_column(SAEnum(UploadStatus), default=UploadStatus.pending)

    # Mapping
    column_mapping: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    mapping_template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Results
    total_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processed_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    errors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # [{row, field, error}]

    uploaded_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class MappingTemplate(Base, TimestampMixin):
    """Saved column mapping template for repeated uploads from same source."""
    __tablename__ = "mapping_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # e.g., "Humana Monthly Roster"
    data_type: Mapped[str] = mapped_column(String(50))  # roster, claims, eligibility, pharmacy, etc.
    column_mapping: Mapped[dict] = mapped_column(JSONB)  # {source_col: platform_field}
    transformation_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Learnable rules


class MappingRule(Base, TimestampMixin):
    """User-created rule for data mapping corrections. Accumulates over time."""
    __tablename__ = "mapping_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rule_type: Mapped[str] = mapped_column(String(50))  # column_rename, value_transform, filter, etc.
    rule_config: Mapped[dict] = mapped_column(JSONB)  # The actual rule definition
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
