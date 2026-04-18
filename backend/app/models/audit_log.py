"""PHI access audit log — HIPAA §164.312(b).

Every authenticated `/api/*` request writes exactly one row here. The table
lives in the `platform` schema so it survives tenant-schema deletion and so
a super-admin view can see cross-tenant activity for compliance reporting.

Write path lives in `app.core.audit`. This module is model-only.

Design notes:
- No FK to `platform.users`: we keep audit rows even if a user row is hard
  deleted. `user_id` stays as a plain int.
- No FK to `platform.tenants`: same reason — tenants can be offboarded.
- Request/response bodies are NEVER stored here; only metadata.
- `resource_type` + `resource_id` are best-effort labels extracted from the
  URL path by the middleware (e.g. "member", "42"). Query filters and POSTed
  bodies are not decoded at audit-write time.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    """One row per authenticated API request against the platform.

    HIPAA §164.312(b) ("audit controls") requires the system to "record
    and examine activity in information systems that contain or use
    electronic protected health information." This table is that record.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_tenant_created", "tenant_schema", "created_at"),
        Index("ix_audit_log_user_created", "user_id", "created_at"),
        Index("ix_audit_log_path", "path"),
        Index("ix_audit_log_request_id", "request_id"),
        {"schema": "platform"},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Who / where
    tenant_schema: Mapped[str | None] = mapped_column(String(63), nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    role: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Correlation
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # What
    method: Mapped[str] = mapped_column(String(8), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)

    # Best-effort resource extraction from path (e.g. "member", "42")
    resource_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # "read" | "write" | "delete" (derived from HTTP verb)
    action: Mapped[str] = mapped_column(String(16), nullable=False)

    # Client identifying metadata (no body content)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
