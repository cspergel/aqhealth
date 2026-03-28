from sqlalchemy import String
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
    status: Mapped[str] = mapped_column(String(20), default="onboarding")
    config: Mapped[dict | None] = mapped_column(JSONB, default=None)  # JSONB for tenant-specific settings
    org_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "mso" | "aco" | "ipa" | "health_system"
    primary_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
