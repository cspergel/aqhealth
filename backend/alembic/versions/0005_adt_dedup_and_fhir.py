"""ADT webhook dedup safeguards + FHIR observation/encounter/procedure wiring.

Phase Integrations hardening — the complements to:

* ``backend/app/routers/adt.py``        — idempotent webhook ingest (200 +
  ``status: "duplicate"`` when ``raw_message_id`` already exists).
* ``backend/app/services/fhir_service.py`` — Observation/Encounter/Procedure
  now ingest as signal-tier ``Claim`` rows with ``signal_source =
  fhir_observation | fhir_encounter | fhir_procedure``.

What this migration does:

1. Re-asserts the ``uq_adt_events_raw_message_id`` partial unique index
   (``WHERE raw_message_id IS NOT NULL``). The same index ships in
   ``0004_perf_indexes``; declaring it again (``IF NOT EXISTS``) is a
   belt-and-braces guarantee that an environment which skipped 0004
   still gets dedup protection. Races between concurrent webhook
   deliveries can't now double-insert even if the service-level
   idempotency check misses.

2. Adds a narrow index on ``claims (signal_source, service_date)``.
   FHIR Observation/Encounter/Procedure ingests flood the ``claims``
   table with signal-tier rows; the care-gap detector and the Tuva
   sync worker both need a cheap way to read "all FHIR-sourced signals
   since T" without sequential-scanning the whole tenant's claims.

Each DDL is idempotent (``CREATE INDEX IF NOT EXISTS``) so it's safe
against tenants that were already migrated to 0004.

Revision ID: 0005_adt_dedup_and_fhir
Revises: 0004_perf_indexes
Create Date: 2026-04-17
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "0005_adt_dedup_and_fhir"
down_revision = "0004_perf_indexes"
branch_labels = None
depends_on = None


def _tenant_schemas(bind) -> list[str]:
    """Return every tenant schema known to the platform table."""
    try:
        rows = bind.execute(
            text(
                "SELECT schema_name FROM platform.tenants "
                "WHERE schema_name IS NOT NULL AND schema_name NOT IN "
                "('public', 'platform')"
            )
        ).fetchall()
    except Exception:
        return []
    return [r[0] for r in rows]


def _table_exists(bind, schema: str, table: str) -> bool:
    row = bind.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :s AND table_name = :t"
        ),
        {"s": schema, "t": table},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()

    for schema in _tenant_schemas(bind):
        quoted = f'"{schema}"'

        # 1. Dedup on ADT webhook raw_message_id. Partial: NULL values are
        #    permitted (manual entries, CSV batch rows without a source ID).
        if _table_exists(bind, schema, "adt_events"):
            op.execute(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_adt_events_raw_message_id
                ON {quoted}.adt_events (raw_message_id)
                WHERE raw_message_id IS NOT NULL
                """
            )

        # 2. FHIR signal-sourced claims lookup index — "fetch all rows
        #    from a given FHIR signal stream since T".
        if _table_exists(bind, schema, "claims"):
            op.execute(
                f"""
                CREATE INDEX IF NOT EXISTS ix_claims_signal_source_date
                ON {quoted}.claims (signal_source, service_date)
                WHERE signal_source IS NOT NULL
                """
            )


def downgrade() -> None:
    bind = op.get_bind()

    for schema in _tenant_schemas(bind):
        quoted = f'"{schema}"'
        # Do NOT drop uq_adt_events_raw_message_id — it was introduced in
        # 0004_perf_indexes and should stay with that migration's ownership.
        op.execute(
            f"DROP INDEX IF EXISTS {quoted}.ix_claims_signal_source_date"
        )
