"""
Alert Rule models — user-defined alerting rules and trigger records.
"""

from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Numeric, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AlertRule(Base, TimestampMixin):
    """User-defined alerting rule that triggers notifications."""
    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What to monitor
    entity_type: Mapped[str] = mapped_column(String(50))  # "member", "provider", "group", "facility", "measure", "population"
    metric: Mapped[str] = mapped_column(String(50))  # "spend_12mo", "capture_rate", "raf_score", etc.

    # Condition
    operator: Mapped[str] = mapped_column(String(20))  # "gt", "lt", "gte", "lte", "eq", "change_gt", "change_lt"
    threshold: Mapped[float] = mapped_column(Numeric(12, 2))

    # Optional scope
    scope_filter: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # e.g., {"provider_id": 5}

    # Notification
    notify_channels: Mapped[dict] = mapped_column(JSONB, default=dict)  # {"in_app": true, "email": "user@example.com"}
    severity: Mapped[str] = mapped_column(String(20), default="medium")  # "critical", "high", "medium", "low"

    # State
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[int] = mapped_column(Integer)
    last_evaluated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_triggered: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)

    # Self-learning fields
    effectiveness_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_high_value: Mapped[bool] = mapped_column(Boolean, default=False)
    adjustment_proposals: Mapped[int] = mapped_column(Integer, default=0)  # times threshold adjustment proposed
    last_auto_adjusted: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    adjustment_history: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # log of auto-adjustments


class AlertRuleTrigger(Base, TimestampMixin):
    """Record of a rule being triggered."""
    __tablename__ = "alert_rule_triggers"

    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("alert_rules.id"))

    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    entity_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    metric_value: Mapped[float] = mapped_column(Numeric(12, 2))
    threshold: Mapped[float] = mapped_column(Numeric(12, 2))
    message: Mapped[str] = mapped_column(Text)

    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_by: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # User action tracking for self-learning
    acted_on: Mapped[bool] = mapped_column(Boolean, default=False)
    dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    action_taken: Mapped[str | None] = mapped_column(String(200), nullable=True)  # freetext: what the user did
    action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
