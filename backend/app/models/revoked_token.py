"""RevokedToken model — JWT revocation list for logout + forced-expiry flows.

A JWT is stateless by design, so to revoke one before its natural expiry we
need a server-side list of revoked ``jti`` (JWT ID) values. Every access token
issued by :func:`auth_service.create_access_token` now carries a random ``jti``;
the :func:`dependencies.get_current_user` path consults this table on every
request. Entries expire naturally — a cleanup job can safely delete any row
whose ``expires_at`` is in the past.
"""

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RevokedToken(Base):
    """A JWT identifier that has been explicitly revoked (logout, force-expire).

    The primary key is the ``jti`` — we only ever insert (never update) so this
    doubles as the dedup key. ``expires_at`` mirrors the token's exp claim so a
    periodic vacuum job can clean up rows that are no longer useful.
    """

    __tablename__ = "revoked_tokens"
    __table_args__ = (
        # Cleanup index — `DELETE FROM revoked_tokens WHERE expires_at < now()`
        # should be cheap.
        Index("ix_revoked_tokens_expires_at", "expires_at"),
        {"schema": "platform"},
    )

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
