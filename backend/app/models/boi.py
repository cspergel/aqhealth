"""
BOI (Benefit of Investment) model — tracked clinical and operational interventions.

Tracks the ROI of specific interventions: investment amount, baseline vs current
metrics, estimated vs actual financial returns.
"""

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Intervention(Base, TimestampMixin):
    """A tracked clinical or operational intervention."""

    __tablename__ = "interventions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    intervention_type: Mapped[str] = mapped_column(String(50))  # "education", "outreach", "staffing", "technology", "program", "process"
    target: Mapped[str | None] = mapped_column(String(100))  # "diabetes_capture", "readmission_reduction", "gap_closure", "cost_reduction"

    # Investment
    investment_amount: Mapped[float] = mapped_column(Numeric(12, 2))
    investment_period: Mapped[str | None] = mapped_column(String(20))  # "one_time", "monthly", "annual"
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Measured outcomes
    baseline_metric: Mapped[float | None] = mapped_column(Numeric(12, 2))
    current_metric: Mapped[float | None] = mapped_column(Numeric(12, 2))
    metric_name: Mapped[str | None] = mapped_column(String(50))  # "capture_rate", "readmit_rate", "pmpm", "gap_closure"

    # Financial impact
    estimated_return: Mapped[float | None] = mapped_column(Numeric(12, 2))
    actual_return: Mapped[float | None] = mapped_column(Numeric(12, 2))
    roi_percentage: Mapped[float | None] = mapped_column(Numeric(8, 2))

    # Scope
    affected_members: Mapped[int | None] = mapped_column(Integer, nullable=True)
    affected_providers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    practice_group_id: Mapped[int | None] = mapped_column(ForeignKey("practice_groups.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # "planned", "active", "completed", "cancelled"
