from datetime import date
from decimal import Decimal
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric, Enum as SAEnum, Text
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
    near_miss = "near_miss"             # Close to disease interaction bonus
    historical = "historical"           # Previously coded, dropped off
    new_suspect = "new_suspect"         # New evidence from claims patterns


class HccSuspect(Base, TimestampMixin):
    """Individual suspect HCC for a member."""
    __tablename__ = "hcc_suspects"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    payment_year: Mapped[int] = mapped_column(Integer)

    # HCC details
    hcc_code: Mapped[int] = mapped_column(Integer)
    hcc_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    icd10_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    icd10_label: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # RAF impact
    raf_value: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    annual_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Classification
    suspect_type: Mapped[SuspectType] = mapped_column(SAEnum(SuspectType))
    status: Mapped[SuspectStatus] = mapped_column(SAEnum(SuspectStatus), default=SuspectStatus.open)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100

    # Evidence
    evidence_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_claims: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tracking
    identified_date: Mapped[date] = mapped_column(Date)
    captured_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dismissed_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dismissed_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)


class RafHistory(Base, TimestampMixin):
    """Point-in-time RAF snapshot for a member."""
    __tablename__ = "raf_history"

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
