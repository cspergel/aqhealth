"""
ADT (Admit-Discharge-Transfer) data models.

Tracks real-time ADT events from multiple sources (Bamboo Health, Availity,
health plan SFTPs, HL7 feeds) and generates care management alerts.
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ADTSource(Base, TimestampMixin):
    """Configured ADT data source (Bamboo Health, Availity, health plan SFTP, etc.)"""
    __tablename__ = "adt_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))  # "Bamboo Health", "Availity", "Humana SFTP"
    source_type: Mapped[str] = mapped_column(String(50))  # "webhook", "rest_api", "sftp", "hl7_mllp", "manual"
    config: Mapped[dict] = mapped_column(JSONB)  # API keys, endpoints, SFTP creds, etc.
    is_active: Mapped[bool] = mapped_column(default=True)
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    events_received: Mapped[int] = mapped_column(Integer, default=0)


class ADTEvent(Base, TimestampMixin):
    """Individual ADT event -- admit, discharge, transfer, ER visit."""
    __tablename__ = "adt_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("adt_sources.id"))
    event_type: Mapped[str] = mapped_column(String(50), index=True)  # "admit", "discharge", "transfer", "ed_visit", "observation"
    event_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    raw_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Patient matching
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True, index=True)
    patient_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    patient_dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    patient_mrn: Mapped[str | None] = mapped_column(String(50), nullable=True)
    external_member_id: Mapped[str | None] = mapped_column(String(100), nullable=True)  # plan member ID from ADT message
    match_confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100 matching confidence

    # Encounter details
    patient_class: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "inpatient", "outpatient", "emergency", "observation"
    admit_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discharge_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    admit_source: Mapped[str | None] = mapped_column(String(100), nullable=True)  # "emergency", "physician_referral", "transfer"
    discharge_disposition: Mapped[str | None] = mapped_column(String(100), nullable=True)  # "home", "snf", "home_health", "expired", "ama"
    diagnosis_codes: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Facility
    facility_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    facility_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)
    facility_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "acute", "ed", "snf", "rehab"

    # Providers
    attending_provider: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attending_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pcp_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    pcp_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Insurance
    plan_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    plan_member_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Processing
    is_processed: Mapped[bool] = mapped_column(default=False)
    alerts_sent: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # which alerts were triggered

    # --- Dual Data Tier: cost estimation ---
    estimated_total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # estimated cost based on DRG averages
    estimated_daily_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    actual_claim_id: Mapped[int | None] = mapped_column(ForeignKey("claims.id"), nullable=True)  # linked when actual claim arrives
    estimation_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)  # calculated after reconciliation


class CareAlert(Base, TimestampMixin):
    """Alert generated from an ADT event for care management."""
    __tablename__ = "care_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    adt_event_id: Mapped[int] = mapped_column(ForeignKey("adt_events.id"))
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True)

    alert_type: Mapped[str] = mapped_column(String(50))  # "admission", "er_visit", "discharge_planning", "readmission_risk", "snf_placement", "hcc_opportunity"
    priority: Mapped[str] = mapped_column(String(20))  # "critical", "high", "medium", "low"
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_action: Mapped[str | None] = mapped_column(Text, nullable=True)

    assigned_to: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user ID of care manager
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)  # "open", "acknowledged", "in_progress", "resolved"
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
