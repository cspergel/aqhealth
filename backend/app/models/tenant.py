from sqlalchemy import String, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.models.base import Base, TimestampMixin


class TenantStatus(str, enum.Enum):
    active = "active"
    onboarding = "onboarding"
    suspended = "suspended"


class Tenant(Base, TimestampMixin):
    """MSO client — lives in the platform schema."""
    __tablename__ = "tenants"
    __table_args__ = {"schema": "platform"}

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    schema_name: Mapped[str] = mapped_column(String(63), unique=True)  # PG schema name limit
    status: Mapped[TenantStatus] = mapped_column(
        SAEnum(TenantStatus), default=TenantStatus.onboarding
    )
    config: Mapped[dict | None] = mapped_column(JSONB, default=None)  # JSONB for tenant-specific settings
