from datetime import date
from sqlalchemy import String, Date, Integer, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class RiskTier(str, enum.Enum):
    low = "low"
    rising = "rising"
    high = "high"
    complex = "complex"


class Member(Base, TimestampMixin):
    """Attributed member within an MSO's population."""
    __tablename__ = "members"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # Health plan member ID
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    date_of_birth: Mapped[date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(String(1))  # M/F
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Insurance / plan info
    health_plan: Mapped[str | None] = mapped_column(String(200), nullable=True)
    plan_product: Mapped[str | None] = mapped_column(String(100), nullable=True)  # MA, MAPD, etc.
    coverage_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    coverage_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Attribution
    pcp_provider_id: Mapped[int | None] = mapped_column(ForeignKey("providers.id"), nullable=True)

    # Demographics for RAF calculation
    medicaid_status: Mapped[bool] = mapped_column(default=False)
    disability_status: Mapped[bool] = mapped_column(default=False)  # Originally disabled
    institutional: Mapped[bool] = mapped_column(default=False)

    # Computed fields (updated by HCC engine)
    current_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    projected_raf: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    risk_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Flexible extra data
    extra: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
