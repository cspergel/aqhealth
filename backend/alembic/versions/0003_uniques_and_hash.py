"""uniques, content_hash, oauth_state, last_sync_at

Adds schema objects used by the Tranche-C readiness fixes:

1. Partial unique index `claims_claim_member_uk` on
   ``claims (claim_id, member_id) WHERE claim_id IS NOT NULL`` —
   prevents the SELECT-then-INSERT race in `_upsert_claims`. Many signal-
   tier rows have no payer claim_id, so the index is partial.
2. Unique constraint ``uq_raf_history_snapshot`` on
   ``raf_history (member_id, payment_year, calculation_date)``.
3. ``upload_jobs.content_hash`` (CHAR(64), indexed) for re-upload
   idempotency (Phase 3.2).
4. ``platform.oauth_state`` table — single-use OAuth state nonces with a
   10-minute TTL. Used by routers/payer_api.py instead of the predictable
   ``state=tenant_schema`` form (Phase 2.4).

Each DDL is idempotent (CREATE IF NOT EXISTS / ALTER ... IF NOT EXISTS)
so tenants that already ran the schema via `create_all()` aren't broken.
Tenant-scoped tables (claims, raf_history, upload_jobs) have table
objects per tenant schema; we iterate every tenant schema we know
about.

Revision ID: 0003_uniques_and_hash
Revises: 0002_soft_delete_and_audit
Create Date: 2026-04-18
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "0003_uniques_and_hash"
down_revision = "0002_soft_delete_and_audit"
branch_labels = None
depends_on = None


def _tenant_schemas(bind) -> list[str]:
    """Return every tenant schema known to the platform table."""
    rows = bind.execute(
        text(
            "SELECT schema_name FROM platform.tenants "
            "WHERE schema_name IS NOT NULL AND schema_name NOT IN "
            "('public', 'platform')"
        )
    ).fetchall()
    return [r[0] for r in rows]


def upgrade() -> None:
    bind = op.get_bind()

    # -----------------------------------------------------------------
    # 1. platform.oauth_state table (OAuth nonce storage — single-use)
    # -----------------------------------------------------------------
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS platform.oauth_state (
            state         VARCHAR(128) PRIMARY KEY,
            tenant_schema VARCHAR(63)  NOT NULL,
            payer_name    VARCHAR(64)  NOT NULL,
            expires_at    TIMESTAMPTZ  NOT NULL,
            created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_oauth_state_expires_at
        ON platform.oauth_state (expires_at)
        """
    )

    # -----------------------------------------------------------------
    # 2. Per-tenant DDL: claims unique index, raf_history unique,
    #    upload_jobs.content_hash
    # -----------------------------------------------------------------
    for schema in _tenant_schemas(bind):
        quoted = f'"{schema}"'

        # Partial unique index on claims(claim_id, member_id) WHERE claim_id IS NOT NULL
        op.execute(
            f"""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_identity
            ON {quoted}.claims (claim_id, member_id)
            WHERE claim_id IS NOT NULL
            """
        )

        # Unique snapshot for raf_history — partial index respecting
        # soft-delete. A soft-deleted row must NOT block a fresh snapshot
        # with the same (member, year, date), because soft-delete is how
        # we preserve audit history.
        op.execute(
            f"""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_raf_history_snapshot
            ON {quoted}.raf_history (member_id, payment_year, calculation_date)
            WHERE deleted_at IS NULL
            """
        )

        # upload_jobs.content_hash (+ index)
        op.execute(
            f"""
            ALTER TABLE {quoted}.upload_jobs
            ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)
            """
        )
        op.execute(
            f"""
            CREATE INDEX IF NOT EXISTS ix_upload_jobs_content_hash
            ON {quoted}.upload_jobs (content_hash)
            """
        )


def downgrade() -> None:
    bind = op.get_bind()

    for schema in _tenant_schemas(bind):
        quoted = f'"{schema}"'
        op.execute(f'DROP INDEX IF EXISTS {quoted}.uq_claim_identity')
        op.execute(f'DROP INDEX IF EXISTS {quoted}.uq_raf_history_snapshot')
        op.execute(f'DROP INDEX IF EXISTS {quoted}.ix_upload_jobs_content_hash')
        op.execute(
            f"""
            ALTER TABLE {quoted}.upload_jobs
            DROP COLUMN IF EXISTS content_hash
            """
        )

    op.execute("DROP TABLE IF EXISTS platform.oauth_state")
