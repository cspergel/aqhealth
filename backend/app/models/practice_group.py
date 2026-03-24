from sqlalchemy import String, Integer, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PracticeGroup(Base, TimestampMixin):
    """Office or practice group — a collection of providers under one location/banner."""
    __tablename__ = "practice_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))  # e.g., "ISG Tampa Office", "FMG St. Pete"
    client_code: Mapped[str | None] = mapped_column(String(50), nullable=True)  # billing company client code
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Computed group metrics (updated by analytics)
    provider_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_panel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_capture_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    avg_recapture_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    avg_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    group_pmpm: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    gap_closure_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Configurable targets
    targets: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
