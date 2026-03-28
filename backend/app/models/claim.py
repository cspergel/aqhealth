from datetime import date
from decimal import Decimal
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class ClaimType(str, enum.Enum):
    professional = "professional"  # 837P
    institutional = "institutional"  # 837I
    pharmacy = "pharmacy"


class Claim(Base, TimestampMixin):
    """Individual claim line from ingested claims data."""
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    claim_id: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Payer claim number
    claim_type: Mapped[str] = mapped_column(String(20), index=True)

    # Dates
    service_date: Mapped[date] = mapped_column(Date, index=True)
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Codes
    diagnosis_codes: Mapped[list[str] | None] = mapped_column(ARRAY(String(10)), nullable=True)
    procedure_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # CPT/HCPCS
    drg_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    ndc_code: Mapped[str | None] = mapped_column(String(15), nullable=True)  # Pharmacy

    # Provider / Facility
    rendering_provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"), nullable=True)
    practice_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("practice_groups.id"), nullable=True, index=True
    )  # Which office this claim is attributed to (set during ingestion auto-routing)
    billing_tin: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    billing_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)
    facility_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    facility_npi: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # Financial
    billed_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    allowed_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    paid_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    member_liability: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Classification (for expenditure analytics)
    service_category: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    # Values: inpatient, ed_observation, professional, snf_postacute, pharmacy, home_health, dme, other

    # Place of service
    pos_code: Mapped[str | None] = mapped_column(String(5), nullable=True)

    # Drug info (pharmacy claims)
    drug_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    drug_class: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    days_supply: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Primary diagnosis (first element of diagnosis_codes, denormalized for query perf)
    primary_diagnosis: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Length of stay (inpatient / SNF claims)
    los: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Claim adjudication status (pending, paid, denied, adjusted)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True, default="paid")

    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # --- Dual Data Tier fields ---
    data_tier: Mapped[str] = mapped_column(String(10), default="record", index=True)  # "signal" or "record"
    is_estimated: Mapped[bool] = mapped_column(default=False)
    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # signal-tier estimate
    signal_source: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "adt_event", "census", "prediction"
    signal_event_id: Mapped[int | None] = mapped_column(ForeignKey("adt_events.id"), nullable=True, index=True)  # FK to ADT event
    reconciled: Mapped[bool] = mapped_column(default=False)  # has this signal been matched to a record?
    reconciled_claim_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"), nullable=True, index=True)  # record-tier claim that replaced this signal
