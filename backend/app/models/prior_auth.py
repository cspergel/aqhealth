"""Prior Authorization / Utilization Management models."""

from datetime import date
from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PriorAuth(Base, TimestampMixin):
    __tablename__ = "prior_authorizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    auth_number: Mapped[str | None] = mapped_column(String(50))
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)

    # Request details
    service_type: Mapped[str] = mapped_column(String(100))  # "inpatient", "outpatient_surgery", "imaging", "DME", "home_health", "SNF", "specialist_referral", "medication"
    procedure_code: Mapped[str | None] = mapped_column(String(10))
    diagnosis_code: Mapped[str | None] = mapped_column(String(10))
    requesting_provider_npi: Mapped[str | None] = mapped_column(String(15))
    requesting_provider_name: Mapped[str | None] = mapped_column(String(200))
    servicing_provider_npi: Mapped[str | None] = mapped_column(String(15))
    servicing_facility: Mapped[str | None] = mapped_column(String(200))

    # Dates
    request_date: Mapped[date] = mapped_column(Date)
    decision_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    auth_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    auth_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Decision
    urgency: Mapped[str] = mapped_column(String(20), default="standard")  # "urgent", "standard"
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # "pending", "approved", "denied", "partial", "appealed", "withdrawn"
    decision: Mapped[str | None] = mapped_column(String(20))
    approved_units: Mapped[int | None] = mapped_column(Integer, nullable=True)
    denial_reason: Mapped[str | None] = mapped_column(Text)

    # Appeal
    appeal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    appeal_status: Mapped[str | None] = mapped_column(String(20))
    peer_to_peer_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Compliance tracking
    turnaround_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)  # calculated from request to decision
    compliant: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # within CMS timeframes?

    reviewer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reviewer_name: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
