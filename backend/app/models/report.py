"""
Automated Report Generation models.

Templates define the structure and sections of auto-generated reports.
GeneratedReport stores each instance with structured content and AI narratives.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ReportTemplate(Base, TimestampMixin):
    """Template for auto-generated reports."""
    __tablename__ = "report_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300))  # "Monthly Plan Report", "Quarterly Board Report", "RADV Audit Package"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    report_type: Mapped[str] = mapped_column(String(50))  # "plan_report", "board_report", "regulatory", "provider_summary", "custom"

    # What sections to include
    sections: Mapped[dict] = mapped_column(JSONB)
    # e.g., [{"type": "raf_summary", "title": "Risk Adjustment Performance"}, {"type": "quality_metrics"}, ...]

    # Schedule (optional)
    schedule: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "monthly", "quarterly", "on_demand"
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)


class GeneratedReport(Base, TimestampMixin):
    """An instance of a generated report."""
    __tablename__ = "generated_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("report_templates.id"), index=True)

    title: Mapped[str] = mapped_column(String(500))
    period: Mapped[str] = mapped_column(String(100))  # "Q1 2026", "March 2026", etc.
    status: Mapped[str] = mapped_column(String(50), default="generating")  # "generating", "ready", "failed"

    # The report content
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # structured sections with data + narratives
    ai_narrative: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI-written executive summary

    generated_by: Mapped[int] = mapped_column(Integer)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # URL to downloadable PDF/Excel
