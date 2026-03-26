from sqlalchemy import String, Integer, Numeric, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class InsightCategory(str, enum.Enum):
    revenue = "revenue"
    cost = "cost"
    quality = "quality"
    provider = "provider"
    trend = "trend"
    cross_module = "cross_module"  # Insights that connect data across multiple modules


class InsightStatus(str, enum.Enum):
    active = "active"
    dismissed = "dismissed"
    bookmarked = "bookmarked"
    acted_on = "acted_on"


class Insight(Base, TimestampMixin):
    """AI-generated insight surfaced across the platform."""
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    dollar_impact: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100
    status: Mapped[str] = mapped_column(String(20), default="active")

    # What this insight is about
    affected_members: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    affected_providers: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Which module surfaces this
    surface_on: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # e.g., ["dashboard", "expenditure.inpatient", "provider.dr_smith"]

    # Cross-module connections — links data points across modules that form this insight
    # e.g., {"hcc_suspects": [12, 34], "claims": [456], "care_gaps": [78], "expenditure_category": "pharmacy"}
    connections: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Source modules that contributed data to this insight
    source_modules: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    # e.g., ["hcc_engine", "expenditure", "care_gaps", "provider_scorecard"]
