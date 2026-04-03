"""
Tuva baseline data — trusted numbers from Tuva's community-validated models.

These records store Tuva's calculated values alongside AQSoft's values.
Discrepancies are flagged for review rather than silently resolved.
"""

from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Integer, Numeric, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TuvaRafBaseline(Base, TimestampMixin):
    """Tuva's RAF calculation for a member — compared against AQSoft's HCC engine.

    Three-tier comparison:
    - tuva_raf_score: Tuva's community-validated, claims-only V28 RAF
    - aqsoft_confirmed_raf: AQSoft's claims-only RAF (should be close to Tuva)
    - aqsoft_projected_raf: AQSoft's RAF including suspected HCCs (the opportunity)

    The gap between confirmed and projected = capture opportunity.
    The gap between Tuva and AQSoft confirmed = engine validation.
    """
    __tablename__ = "tuva_raf_baselines"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[str] = mapped_column(String(50), index=True)
    payment_year: Mapped[int] = mapped_column(Integer)

    # Tuva's numbers (trusted baseline — claims-only)
    tuva_raf_score: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)
    tuva_hcc_list: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # AQSoft confirmed (claims-only, should match Tuva closely)
    aqsoft_confirmed_raf: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)
    # AQSoft projected (confirmed + suspects — the opportunity)
    aqsoft_projected_raf: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)
    aqsoft_hcc_list: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Capture opportunity = projected - confirmed
    capture_opportunity_raf: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)

    # Discrepancy tracking (between Tuva confirmed and AQSoft confirmed)
    has_discrepancy: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    discrepancy_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    raf_difference: Mapped[Decimal | None] = mapped_column(Numeric(8, 3), nullable=True)

    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TuvaPmpmBaseline(Base, TimestampMixin):
    """Tuva's PMPM calculation — compared against AQSoft's expenditure engine."""
    __tablename__ = "tuva_pmpm_baselines"

    id: Mapped[int] = mapped_column(primary_key=True)
    period: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    service_category: Mapped[str | None] = mapped_column(String(50), nullable=True)

    tuva_pmpm: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    aqsoft_pmpm: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    has_discrepancy: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    discrepancy_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)

    member_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
