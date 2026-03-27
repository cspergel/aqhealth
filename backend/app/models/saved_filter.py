"""
Saved Filter model — user-created custom filters that can be saved and reused
across any page context in the platform.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Index, String, Text, Integer, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SavedFilter(Base, TimestampMixin):
    """User-created custom filter that can be saved and reused."""

    __tablename__ = "saved_filters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_context: Mapped[str] = mapped_column(String(50))
    # "members", "suspects", "expenditure", "providers", "care_gaps", "census", "claims"

    # The filter definition as JSON
    conditions: Mapped[dict] = mapped_column(JSONB)
    # Structure: { "logic": "AND", "rules": [{ "field": "raf", "operator": ">=", "value": 2.0 }, ...] }
    # Supports nested groups: { "logic": "OR", "rules": [{ "logic": "AND", "rules": [...] }, ...] }

    # Ownership
    created_by: Mapped[int] = mapped_column(Integer)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    # Usage tracking
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_saved_filters_context_user", "page_context", "created_by"),
    )
