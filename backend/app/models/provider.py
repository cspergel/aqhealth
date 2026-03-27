from sqlalchemy import String, Integer, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Provider(Base, TimestampMixin):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    npi: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    practice_group_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("practice_groups.id"), nullable=True, index=True
    )
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    specialty: Mapped[str | None] = mapped_column(String(100), nullable=True)
    practice_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tin: Mapped[str | None] = mapped_column(String(15), nullable=True)

    # Computed scorecard metrics (updated by analytics engine)
    panel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capture_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    recapture_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    avg_panel_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    panel_pmpm: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    gap_closure_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Configurable target overrides (JSONB)
    targets: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
