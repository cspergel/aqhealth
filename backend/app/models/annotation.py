from datetime import date, datetime

from sqlalchemy import Index, Text, Integer, String, Boolean, Date, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Annotation(Base, TimestampMixin):
    """Note/annotation attached to any entity in the system."""
    __tablename__ = "annotations"

    id: Mapped[int] = mapped_column(primary_key=True)

    # What this note is attached to
    entity_type: Mapped[str] = mapped_column(String(50))
    # "member", "provider", "group", "facility", "suspect", "alert", "insight"
    entity_id: Mapped[int] = mapped_column(Integer)

    # The note itself
    content: Mapped[str] = mapped_column(Text)
    note_type: Mapped[str] = mapped_column(String(50), default="general")
    # Types: "general", "call_log", "outreach", "clinical", "care_plan",
    #        "follow_up", "internal"

    # Who wrote it
    author_id: Mapped[int] = mapped_column(Integer)
    author_name: Mapped[str] = mapped_column(String(200))

    # Optional: follow-up tracking
    requires_follow_up: Mapped[bool] = mapped_column(Boolean, default=False)
    follow_up_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    follow_up_completed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Pinned notes stay at top
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- Soft-delete / HIPAA §164.528 disclosure accounting ---
    # TODO: reads that should skip deleted rows must add
    # `.where(Annotation.deleted_at.is_(None))`. See member.py for rationale.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_annotations_entity", "entity_type", "entity_id"),
    )
