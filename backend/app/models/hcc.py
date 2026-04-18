from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import String, Date, DateTime, Integer, ForeignKey, Numeric, Text, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class SuspectStatus(str, enum.Enum):
    open = "open"
    captured = "captured"
    dismissed = "dismissed"
    expired = "expired"


class SuspectType(str, enum.Enum):
    med_dx_gap = "med_dx_gap"          # Medication without matching diagnosis
    specificity = "specificity"         # Unspecified code upgradeable
    recapture = "recapture"             # Prior year HCC not yet recaptured
    near_miss = "near_miss"             # Near-miss interaction WITH supporting evidence
    historical = "historical"           # Previously coded, dropped off
    new_suspect = "new_suspect"         # New evidence from claims patterns
    watch_item = "watch_item"           # Near-miss interaction WITHOUT evidence (monitor only)


class HccSuspect(Base, TimestampMixin):
    """Individual suspect HCC for a member."""
    __tablename__ = "hcc_suspects"
    __table_args__ = (
        # Suspect lookups — the hot dedup path in hcc_engine._analyze_member
        # filters by (member_id, payment_year, hcc_code, suspect_type, status).
        # Keeping status as an included column lets the index cover the common
        # (member_id, status, payment_year) dashboard pulls.
        Index(
            "ix_hcc_suspects_dedup",
            "member_id", "payment_year", "hcc_code", "suspect_type", "status",
        ),
        # Fast "open suspects for this member" lookups (member detail page)
        Index("ix_hcc_suspects_member_status_year", "member_id", "status", "payment_year"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    payment_year: Mapped[int] = mapped_column(Integer, index=True)

    # HCC details
    hcc_code: Mapped[int] = mapped_column(Integer)
    hcc_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    icd10_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    icd10_label: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # RAF impact
    raf_value: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    annual_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Classification
    suspect_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100

    # Evidence
    evidence_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_claims: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tracking
    identified_date: Mapped[date] = mapped_column(Date)
    captured_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dismissed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dismissed_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # --- Soft-delete / HIPAA §164.528 disclosure accounting ---
    # TODO: reads that should skip deleted rows must add
    # `.where(HccSuspect.deleted_at.is_(None))`. See member.py for rationale.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class RafHistory(Base, TimestampMixin):
    """Point-in-time RAF snapshot for a member."""
    __tablename__ = "raf_history"
    __table_args__ = (
        # One RAF snapshot per member per (payment_year, calculation_date).
        # Prevents the same end-of-day sync appending duplicate history rows
        # when a worker crashes mid-commit and is re-run.
        UniqueConstraint(
            "member_id", "payment_year", "calculation_date",
            name="uq_raf_history_snapshot",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    calculation_date: Mapped[date] = mapped_column(Date)
    payment_year: Mapped[int] = mapped_column(Integer)

    # RAF components
    demographic_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    disease_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    interaction_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    total_raf: Mapped[Decimal] = mapped_column(Numeric(8, 3))

    hcc_count: Mapped[int] = mapped_column(Integer, default=0)
    suspect_count: Mapped[int] = mapped_column(Integer, default=0)

    # --- Soft-delete / HIPAA §164.528 disclosure accounting ---
    # TODO: reads that should skip deleted rows must add
    # `.where(RafHistory.deleted_at.is_(None))`. See member.py for rationale.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
