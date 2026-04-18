"""Flexible tagging system — attach custom labels to any entity."""

from sqlalchemy import Index, String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Tag(Base, TimestampMixin):
    """A custom label/tag that can be applied to entities."""
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))  # "High Priority", "Pilot Program", etc.
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color like "#16a34a"
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "priority", "program", "contract", "status", "custom"
    created_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class EntityTag(Base, TimestampMixin):
    """Associates a tag with any entity (member, provider, group, etc.)."""
    __tablename__ = "entity_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), index=True)
    entity_type: Mapped[str] = mapped_column(String(50))  # "member", "provider", "group", "claim", "insight", "action"
    entity_id: Mapped[int] = mapped_column(Integer)
    applied_by: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_entity_tags_entity", "entity_type", "entity_id"),
    )
