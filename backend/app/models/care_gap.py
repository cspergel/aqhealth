from datetime import date, datetime
from sqlalchemy import String, Date, DateTime, Integer, ForeignKey, Numeric, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class GapStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    excluded = "excluded"


class GapMeasure(Base, TimestampMixin):
    """Configurable quality measure definition (HEDIS, Stars, custom)."""
    __tablename__ = "gap_measures"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), index=True)  # e.g., "CDC-HbA1c"
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)  # HEDIS domain
    stars_weight: Mapped[int] = mapped_column(Integer, default=1)  # 1x, 3x for triple-weighted
    target_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    star_3_cutpoint: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    star_4_cutpoint: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    star_5_cutpoint: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    detection_logic: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Rules for identifying gaps


class MemberGap(Base, TimestampMixin):
    """Individual care gap for a member."""
    __tablename__ = "member_gaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    measure_id: Mapped[int] = mapped_column(ForeignKey("gap_measures.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    closed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    measurement_year: Mapped[int] = mapped_column(Integer, index=True)
    responsible_provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"), nullable=True)

    # --- Soft-delete / HIPAA §164.528 disclosure accounting ---
    # TODO: reads that should skip deleted rows must add
    # `.where(MemberGap.deleted_at.is_(None))`. See member.py for rationale.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
