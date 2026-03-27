"""
Transformation Rule and Pipeline Run models.

Tracks auto-learned data transformation rules and logs for each
data processing run through the AI pipeline.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TransformationRule(Base, TimestampMixin):
    """Auto-learned data transformation rule."""
    __tablename__ = "transformation_rules"

    id: Mapped[int] = mapped_column(primary_key=True)

    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # "Humana 837 Feed" or None for universal
    data_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "claims", "roster", etc.
    field: Mapped[str] = mapped_column(String(100))  # "gender", "date_of_birth", "diagnosis_1"

    rule_type: Mapped[str] = mapped_column(String(50))  # "value_map", "format_convert", "default_fill", "regex_transform", "code_correction"
    condition: Mapped[dict] = mapped_column(JSONB)  # {"value": "1"} or {"pattern": "\\d{2}/\\d{2}/\\d{4}"}
    transformation: Mapped[dict] = mapped_column(JSONB)  # {"to": "M"} or {"format": "YYYY-MM-DD"}

    # Learning metadata
    created_from: Mapped[str] = mapped_column(String(20), default="human")  # "human", "ai", "pattern"
    times_applied: Mapped[int] = mapped_column(default=0)
    times_overridden: Mapped[int] = mapped_column(default=0)  # human corrected the rule's output
    accuracy: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)


class PipelineRun(Base, TimestampMixin):
    """Log of each data processing run."""
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    interface_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    format_detected: Mapped[str | None] = mapped_column(String(30), nullable=True)
    data_type_detected: Mapped[str | None] = mapped_column(String(50), nullable=True)

    total_records: Mapped[int] = mapped_column(default=0)
    clean_records: Mapped[int] = mapped_column(default=0)
    quarantined_records: Mapped[int] = mapped_column(default=0)
    ai_cleaned: Mapped[int] = mapped_column(default=0)  # records AI fixed
    rules_applied: Mapped[int] = mapped_column(default=0)
    rules_created: Mapped[int] = mapped_column(default=0)
    entities_matched: Mapped[int] = mapped_column(default=0)

    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    errors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
