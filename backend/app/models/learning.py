"""
Self-Learning Feedback System models — tracks prediction outcomes,
learning metrics, and user interactions to make the AI smarter over time.
"""

from datetime import date
from sqlalchemy import String, Integer, Numeric, Date, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PredictionOutcome(Base, TimestampMixin):
    """Tracks whether a prediction/insight was correct."""
    __tablename__ = "prediction_outcomes"

    id: Mapped[int] = mapped_column(primary_key=True)
    prediction_type: Mapped[str] = mapped_column(String(50))
    # "hcc_suspect", "cost_recommendation", "gap_prediction", "pattern_match"
    prediction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # What we predicted
    predicted_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # What actually happened
    outcome: Mapped[str] = mapped_column(String(20))
    # "confirmed", "rejected", "partial", "pending", "expired"
    actual_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Accuracy tracking
    was_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Context for learning
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    lesson_learned: Mapped[str | None] = mapped_column(Text, nullable=True)


class LearningMetric(Base, TimestampMixin):
    """Aggregate accuracy metrics for the learning system."""
    __tablename__ = "learning_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    metric_date: Mapped[date] = mapped_column(Date)
    prediction_type: Mapped[str] = mapped_column(String(50))

    total_predictions: Mapped[int] = mapped_column(Integer, default=0)
    confirmed: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    pending: Mapped[int] = mapped_column(Integer, default=0)
    accuracy_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Breakdown by sub-category
    breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class UserInteraction(Base, TimestampMixin):
    """Tracks how users interact with insights and recommendations."""
    __tablename__ = "user_interactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    interaction_type: Mapped[str] = mapped_column(String(30))
    # "view", "bookmark", "dismiss", "act_on", "ask_question", "export", "capture"
    target_type: Mapped[str] = mapped_column(String(30))
    # "insight", "suspect", "playbook", "chase_list", "query"
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    page_context: Mapped[str | None] = mapped_column(String(200), nullable=True)
    interaction_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
