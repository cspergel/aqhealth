from datetime import datetime

from sqlalchemy import Text, Integer, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WatchlistItem(Base, TimestampMixin):
    """User's personal watchlist item -- an entity they're monitoring."""
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer)

    # What's being watched
    entity_type: Mapped[str] = mapped_column(String(50))
    # "member", "provider", "group", "facility"
    entity_id: Mapped[int] = mapped_column(Integer)
    entity_name: Mapped[str] = mapped_column(String(300))  # denormalized for quick display

    # Why (user's note about why they're watching)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # What to watch for
    watch_for: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g., {"raf_change": true, "new_admission": true, "gap_closed": true,
    #        "suspect_captured": true}

    # Change tracking
    last_snapshot: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # snapshot of key metrics at time of adding
    changes_detected: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # what changed since last check
    last_checked: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    has_changes: Mapped[bool] = mapped_column(Boolean, default=False)
