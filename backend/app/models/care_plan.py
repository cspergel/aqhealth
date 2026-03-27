"""Care Plan models — plans, goals, and interventions for member care management."""

from datetime import date
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CarePlan(Base, TimestampMixin):
    __tablename__ = "care_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int]
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="active")  # "draft", "active", "completed", "discontinued"
    created_by: Mapped[int]
    care_manager_id: Mapped[int | None]
    start_date: Mapped[date]
    target_end_date: Mapped[date | None]
    actual_end_date: Mapped[date | None]
    notes: Mapped[str | None] = mapped_column(Text)


class CarePlanGoal(Base, TimestampMixin):
    __tablename__ = "care_plan_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    care_plan_id: Mapped[int] = mapped_column(ForeignKey("care_plans.id"))
    description: Mapped[str] = mapped_column(Text)  # "Reduce A1c below 8%"
    target_metric: Mapped[str | None] = mapped_column(String(50))  # "hba1c", "bmi", "bp_systolic", "er_visits"
    target_value: Mapped[str | None] = mapped_column(String(50))  # "<8.0", "<30", "<140"
    baseline_value: Mapped[str | None] = mapped_column(String(50))  # "9.2"
    current_value: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # "not_started", "in_progress", "met", "not_met", "deferred"
    target_date: Mapped[date | None]


class CarePlanIntervention(Base, TimestampMixin):
    __tablename__ = "care_plan_interventions"

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("care_plan_goals.id"))
    description: Mapped[str] = mapped_column(Text)  # "Refer to endocrinology"
    intervention_type: Mapped[str] = mapped_column(String(50))  # "referral", "medication", "education", "screening", "outreach", "follow_up"
    assigned_to: Mapped[str | None] = mapped_column(String(200))
    due_date: Mapped[date | None]
    completed_date: Mapped[date | None]
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending", "in_progress", "completed", "cancelled"
    notes: Mapped[str | None] = mapped_column(Text)
