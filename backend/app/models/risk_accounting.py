"""
Risk / Capitation Accounting models.

Complete financial management for risk-bearing MSOs: capitation payments,
subcapitation, and risk pool tracking.
"""

from datetime import date

from sqlalchemy import Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CapitationPayment(Base, TimestampMixin):
    """Monthly capitation payment received from a health plan."""

    __tablename__ = "capitation_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_name: Mapped[str] = mapped_column(String(200))
    product_type: Mapped[str | None] = mapped_column(String(50))  # "MA", "MAPD", "DSNP", "commercial"
    payment_month: Mapped[date]
    member_count: Mapped[int]
    pmpm_rate: Mapped[float] = mapped_column(Numeric(10, 2))
    total_payment: Mapped[float] = mapped_column(Numeric(12, 2))
    adjustment_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))  # retro adjustments
    notes: Mapped[str | None] = mapped_column(Text)


class SubcapPayment(Base, TimestampMixin):
    """Subcapitation payment to a downstream provider or group."""

    __tablename__ = "subcap_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int | None]
    practice_group_id: Mapped[int | None]
    specialty: Mapped[str | None] = mapped_column(String(100))
    payment_month: Mapped[date]
    member_count: Mapped[int]
    pmpm_rate: Mapped[float] = mapped_column(Numeric(10, 2))
    total_payment: Mapped[float] = mapped_column(Numeric(12, 2))


class RiskPool(Base, TimestampMixin):
    """Risk pool / withhold tracking per plan per year."""

    __tablename__ = "risk_pools"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_name: Mapped[str] = mapped_column(String(200))
    pool_year: Mapped[int]
    withhold_percentage: Mapped[float] = mapped_column(Numeric(5, 2))
    total_withheld: Mapped[float] = mapped_column(Numeric(12, 2))
    quality_bonus_earned: Mapped[float | None] = mapped_column(Numeric(12, 2))
    surplus_share: Mapped[float | None] = mapped_column(Numeric(12, 2))
    deficit_share: Mapped[float | None] = mapped_column(Numeric(12, 2))
    settlement_date: Mapped[date | None]
    status: Mapped[str] = mapped_column(String(20), default="active")  # "active", "settled", "disputed"
