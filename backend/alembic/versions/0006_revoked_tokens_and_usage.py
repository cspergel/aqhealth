"""platform.revoked_tokens (JWT revocation list).

Adds the server-side JWT revocation list that backs /api/auth/logout and
the forced-expiry flows. Every access token now carries a ``jti`` claim;
get_current_user rejects tokens whose ``jti`` is present in this table.

A matching cleanup job can periodically purge rows where ``expires_at`` is
in the past — by then the token would already be rejected by its own
``exp`` check, and we don't need to keep entries around forever.

Revision ID: 0006_revoked_tokens_and_usage
Revises: 0005_adt_dedup_and_fhir
Create Date: 2026-04-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "0006_revoked_tokens_and_usage"
down_revision = "0005_adt_dedup_and_fhir"
branch_labels = None
depends_on = None


def _table_exists(bind, table: str, schema: str | None = None) -> bool:
    insp = inspect(bind)
    try:
        return insp.has_table(table, schema=schema)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    # Platform-scoped — only created once, on the platform pass. Tenant
    # passes re-run the migration but we guard on existence so it's a no-op.
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")

    if not _table_exists(bind, "revoked_tokens", schema="platform"):
        op.create_table(
            "revoked_tokens",
            sa.Column("jti", sa.String(length=64), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            schema="platform",
        )
        op.create_index(
            "ix_revoked_tokens_expires_at",
            "revoked_tokens",
            ["expires_at"],
            schema="platform",
        )
        op.create_index(
            "ix_revoked_tokens_user_id",
            "revoked_tokens",
            ["user_id"],
            schema="platform",
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "revoked_tokens", schema="platform"):
        for ix in (
            "ix_revoked_tokens_expires_at",
            "ix_revoked_tokens_user_id",
        ):
            try:
                op.drop_index(ix, table_name="revoked_tokens", schema="platform")
            except Exception:
                pass
        op.drop_table("revoked_tokens", schema="platform")
