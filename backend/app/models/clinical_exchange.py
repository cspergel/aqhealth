"""
Clinical Data Exchange model — tracks payer data requests and evidence packages.

When a payer needs documentation to support an HCC code or quality measure,
requests are logged here and evidence packages are generated automatically.
"""

from datetime import date

from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DataExchangeRequest(Base, TimestampMixin):
    """A payer data request for clinical evidence."""

    __tablename__ = "data_exchange_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_type: Mapped[str] = mapped_column(String(50))  # "hcc_evidence", "quality_evidence", "radv_audit", "chart_request"
    requestor: Mapped[str | None] = mapped_column(String(200))  # payer name
    member_id: Mapped[int | None]
    hcc_code: Mapped[int | None]
    measure_code: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # "pending", "auto_responded", "manual_review", "completed", "rejected"
    request_date: Mapped[date]
    response_date: Mapped[date | None]
    response_package: Mapped[dict | None] = mapped_column(JSONB)
    auto_generated: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[str | None] = mapped_column(Text)
