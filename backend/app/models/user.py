from sqlalchemy import String, Integer, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.models.base import Base, TimestampMixin


class UserRole(str, enum.Enum):
    superadmin = "superadmin"      # AQSoft platform team
    mso_admin = "mso_admin"        # Full tenant access
    analyst = "analyst"            # Read-only dashboards + exports
    provider = "provider"          # Own scorecard + panel only
    auditor = "auditor"            # Time-limited read-only
    care_manager = "care_manager"  # Care management workflows
    outreach = "outreach"          # Member outreach campaigns
    financial = "financial"        # Financial reporting + reconciliation


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = {"schema": "platform"}

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform.tenants.id"), nullable=True, index=True
    )  # NULL for superadmin — index supports login tenant resolution
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    mfa_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Office scoping — NULL means sees all offices in tenant
    # Not a DB FK (cross-schema: users in platform, practice_groups in tenant)
    # Application must validate existence when setting
    practice_group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
