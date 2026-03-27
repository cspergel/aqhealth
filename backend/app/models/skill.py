"""
Skill and SkillExecution models.

A Skill is a learned, reusable workflow that the platform can execute.
Skills can be triggered manually, on a schedule, by an event, or by a condition.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Skill(Base, TimestampMixin):
    """A learned, reusable workflow that the platform can execute."""
    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Trigger
    trigger_type: Mapped[str] = mapped_column(String(30))
    # "manual", "schedule", "event", "condition"
    trigger_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # schedule: {"cron": "0 8 1 * *"}  (first of month at 8am)
    # event: {"event_type": "adt_admit", "filter": {"patient_class": "inpatient"}}
    # condition: {"metric": "capture_rate", "operator": "lt", "threshold": 50}

    # Steps
    steps: Mapped[dict] = mapped_column(JSONB)
    # [{
    #   "order": 1,
    #   "action": "run_hcc_engine",
    #   "params": {"scope": "new_claims_only"},
    #   "description": "Run HCC suspect detection on new claims"
    # }, ...]

    # Metadata
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_from: Mapped[str] = mapped_column(String(20), default="manual")
    # "manual" (user created), "observed" (AI observed user pattern), "suggested" (AI recommended)

    is_active: Mapped[bool] = mapped_column(default=True)
    times_executed: Mapped[int] = mapped_column(default=0)
    last_executed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    avg_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Scope
    scope: Mapped[str] = mapped_column(String(20), default="tenant")
    # "tenant" (this MSO only), "global" (shared across MSOs, anonymized)


class SkillExecution(Base, TimestampMixin):
    """Record of a skill being executed."""
    __tablename__ = "skill_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"))
    triggered_by: Mapped[str] = mapped_column(String(30))  # "manual", "schedule", "event", "condition"
    status: Mapped[str] = mapped_column(String(20), default="running")  # "running", "completed", "failed", "cancelled"

    steps_completed: Mapped[int] = mapped_column(default=0)
    steps_total: Mapped[int] = mapped_column(default=0)

    results: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Per-step results: [{step: 1, status: "completed", output: {...}}, ...]

    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    executed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
