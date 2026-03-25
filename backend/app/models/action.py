"""
Action Tracking models.

Closes the loop: insight -> action -> outcome. Tracks whether recommendations
are acted on, by whom, and what the measured outcome was.
"""

from datetime import date

from sqlalchemy import Boolean, Date, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ActionItem(Base, TimestampMixin):
    """Tracked action item created from an insight, alert, or manual entry."""
    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(primary_key=True)

    # What triggered this action
    source_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "insight", "alert", "report", "manual", "discovery"
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # FK to the source insight/alert/etc.

    # The action
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_type: Mapped[str] = mapped_column(String(50))  # "outreach", "scheduling", "coding_education", "referral", "care_plan", "investigation", "other"

    # Assignment
    assigned_to: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user ID
    assigned_to_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Priority and status
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # "critical", "high", "medium", "low"
    status: Mapped[str] = mapped_column(String(20), default="open")  # "open", "in_progress", "completed", "cancelled"
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Affected entities
    member_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    provider_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Outcome tracking
    expected_impact: Mapped[str | None] = mapped_column(String(500), nullable=True)  # "$12K RAF uplift" or "reduce readmissions by 15%"
    actual_outcome: Mapped[str | None] = mapped_column(String(500), nullable=True)  # what actually happened
    outcome_measured: Mapped[bool] = mapped_column(Boolean, default=False)

    # Resolution
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
