"""
Data Interface models.

Tracks configured data interfaces — connections to external healthcare systems
that push or pull data in various standard formats (HL7v2, X12, CDA, FHIR, etc.).
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DataInterface(Base, TimestampMixin):
    """Configured data interface — a connection to an external system."""
    __tablename__ = "data_interfaces"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))  # "Humana 837 Feed", "Memorial Hospital ADT"
    interface_type: Mapped[str] = mapped_column(String(30))
    # "rest_api", "fhir", "hl7v2", "x12_837", "x12_835", "x12_834", "cda", "sftp", "webhook", "database"
    direction: Mapped[str] = mapped_column(String(10))  # "inbound", "outbound", "bidirectional"

    # Connection config (encrypted in production)
    config: Mapped[dict] = mapped_column(JSONB)
    # REST: {url, api_key, headers}
    # SFTP: {host, port, username, key_path, directory, schedule}
    # HL7v2: {host, port, protocol: "mllp"|"tcp"|"sftp"}
    # Database: {connection_string, query, schedule}
    # Webhook: {secret, expected_headers}

    is_active: Mapped[bool] = mapped_column(default=True)
    schedule: Mapped[str | None] = mapped_column(String(50), nullable=True)  # cron expression or "realtime"

    # Stats
    last_received: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)


class InterfaceLog(Base, TimestampMixin):
    """Activity log entry for a data interface."""
    __tablename__ = "interface_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    interface_id: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(50))  # "receive", "parse", "error", "test", "normalize"
    message: Mapped[str] = mapped_column(Text)
    records_count: Mapped[int] = mapped_column(Integer, default=0)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
