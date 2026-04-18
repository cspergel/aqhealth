"""performance indexes for FKs and high-traffic query patterns

Adds indexes called out in the DB-ops readiness audit
(`reviews/readiness-db-ops.md`):

- Foreign-key columns that were missing per-column indexes — Postgres
  doesn't auto-create indexes on FKs, and 47 of ~61 FKs in the model
  layer had no index, producing sequential scans on every join and
  cascade.
- Composite indexes matching the actual query shapes used by the
  services (member journey, provider scorecards, dashboard roll-ups,
  dedup checks).
- One unique index (`uq_adt_events_raw_message_id`) enforcing dedup
  of incoming HL7 messages at the DB layer.
- One platform-scope index (`ix_users_tenant_id`) for login tenant
  resolution.

Each DDL is idempotent (``CREATE INDEX IF NOT EXISTS`` / partial
``WHERE`` clauses where appropriate) so it's safe to re-run and safe
against tenants that already ran the schema via ``create_all()``.

Tenant-scoped indexes are emitted once per schema discovered in
``platform.tenants``. Platform-scope indexes are emitted once against
the ``platform`` schema (mirroring the 0003 pattern).

Revision ID: 0004_perf_indexes
Revises: 0003_uniques_and_hash
Create Date: 2026-04-17
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "0004_perf_indexes"
down_revision = "0003_uniques_and_hash"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Tenant-scoped index definitions
#
# Each entry is (index_name, table, columns_sql, extra_sql).
# extra_sql lets us attach a WHERE clause (partial index) when needed.
# ---------------------------------------------------------------------------

# (index_name, table, columns_clause, extra_clause, unique)
_TENANT_INDEXES: list[tuple[str, str, str, str, bool]] = [
    # --- claims ----------------------------------------------------------
    # B-tree indexes scan both directions — plain ASC form matches the ORM
    # Index() definitions while still serving ORDER BY service_date DESC.
    ("ix_claims_member_svcdate",      "claims", "(member_id, service_date)", "", False),
    ("ix_claims_category_svcdate",    "claims", "(service_category, service_date)", "", False),
    ("ix_claims_group_svcdate",       "claims", "(practice_group_id, service_date)", "", False),
    ("ix_claims_rendering_provider",  "claims", "(rendering_provider_id)", "", False),

    # --- members ---------------------------------------------------------
    # B-tree — Postgres can scan this index forwards or backwards, so ORDER
    # BY current_raf DESC still uses it. We keep ASC to match the ORM's
    # name-based Index definition and keep autogen diffs clean.
    ("ix_members_current_raf",        "members", "(current_raf)", "", False),
    ("ix_members_pcp_provider_id",    "members", "(pcp_provider_id)", "", False),

    # --- hcc_suspects ----------------------------------------------------
    ("ix_hcc_suspects_dedup",
        "hcc_suspects",
        "(member_id, payment_year, hcc_code, suspect_type, status)", "", False),
    ("ix_hcc_suspects_member_status_year",
        "hcc_suspects",
        "(member_id, status, payment_year)", "", False),

    # --- member_gaps -----------------------------------------------------
    ("ix_member_gaps_member_status",
        "member_gaps", "(member_id, status)", "", False),
    ("ix_member_gaps_member_year",
        "member_gaps", "(member_id, measurement_year, status)", "", False),
    ("ix_member_gaps_responsible_provider",
        "member_gaps", "(responsible_provider_id)", "", False),

    # --- adt_events ------------------------------------------------------
    ("ix_adt_events_member_ts",
        "adt_events", "(member_id, event_timestamp)", "", False),
    ("ix_adt_events_source_id",
        "adt_events", "(source_id)", "", False),
    ("ix_adt_events_actual_claim_id",
        "adt_events", "(actual_claim_id)", "", False),
    # Unique on raw_message_id where present — dedup incoming HL7 / webhook
    # messages. Partial so multiple NULL raw_message_id rows remain OK for
    # synthetic / manually-entered events.
    ("uq_adt_events_raw_message_id",
        "adt_events", "(raw_message_id)", "WHERE raw_message_id IS NOT NULL", True),

    # --- care_alerts -----------------------------------------------------
    ("ix_care_alerts_member_created",
        "care_alerts", "(member_id, created_at)", "", False),
    ("ix_care_alerts_status_priority",
        "care_alerts", "(status, priority)", "", False),
    ("ix_care_alerts_adt_event_id",
        "care_alerts", "(adt_event_id)", "", False),

    # --- previously-unindexed FKs on auxiliary tables --------------------
    ("ix_action_items_member_id",     "action_items",      "(member_id)", "", False),
    ("ix_action_items_provider_id",   "action_items",      "(provider_id)", "", False),
    ("ix_alert_rule_triggers_rule_id", "alert_rule_triggers", "(rule_id)", "", False),
    ("ix_interventions_practice_group_id",
        "interventions", "(practice_group_id)", "", False),
    ("ix_care_plans_member_id",        "care_plans", "(member_id)", "", False),
    ("ix_care_plan_goals_care_plan_id",
        "care_plan_goals", "(care_plan_id)", "", False),
    ("ix_care_plan_interventions_goal_id",
        "care_plan_interventions", "(goal_id)", "", False),
    ("ix_case_assignments_member_id",
        "case_assignments", "(member_id)", "", False),
    ("ix_case_notes_assignment_id",
        "case_notes", "(assignment_id)", "", False),
    ("ix_data_exchange_requests_member_id",
        "data_exchange_requests", "(member_id)", "", False),
    ("ix_staff_members_practice_group_id",
        "staff_members", "(practice_group_id)", "", False),
    ("ix_expense_categories_parent_category_id",
        "expense_categories", "(parent_category_id)", "", False),
    ("ix_expense_entries_category_id",
        "expense_entries", "(category_id)", "", False),
    ("ix_expense_entries_practice_group_id",
        "expense_entries", "(practice_group_id)", "", False),
    ("ix_practice_groups_parent_id",
        "practice_groups", "(parent_id)", "", False),
    ("ix_generated_reports_template_id",
        "generated_reports", "(template_id)", "", False),
    ("ix_skill_executions_skill_id",
        "skill_executions", "(skill_id)", "", False),
    ("ix_subcap_payments_provider_id",
        "subcap_payments", "(provider_id)", "", False),
    ("ix_subcap_payments_practice_group_id",
        "subcap_payments", "(practice_group_id)", "", False),
    ("ix_entity_tags_tag_id",
        "entity_tags", "(tag_id)", "", False),
    ("ix_prior_authorizations_member_id",
        "prior_authorizations", "(member_id)", "", False),
]


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


def _table_exists(bind, schema: str, table: str) -> bool:
    """Return True if schema.table exists. Tolerates missing catalog schemas."""
    row = bind.execute(
        text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = :schema AND table_name = :table LIMIT 1"
        ),
        {"schema": schema, "table": table},
    ).fetchone()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()

    # -----------------------------------------------------------------
    # Platform-scope indexes
    # -----------------------------------------------------------------
    # users.tenant_id — used on every login to resolve the tenant
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_users_tenant_id
        ON platform.users (tenant_id)
        """
    )

    # -----------------------------------------------------------------
    # Per-tenant indexes
    # -----------------------------------------------------------------
    for schema in _tenant_schemas(bind):
        quoted = f'"{schema}"'

        for idx_name, table, columns_sql, extra_sql, unique in _TENANT_INDEXES:
            # Tolerate tenants that haven't been migrated to a given table
            # yet (e.g. a fresh tenant still on 0001 baseline). Skip silently
            # rather than fail the whole upgrade.
            if not _table_exists(bind, schema, table):
                continue

            unique_sql = "UNIQUE " if unique else ""
            op.execute(
                f"""
                CREATE {unique_sql}INDEX IF NOT EXISTS {idx_name}
                ON {quoted}.{table} {columns_sql}
                {extra_sql}
                """
            )


def downgrade() -> None:
    bind = op.get_bind()

    # Per-tenant indexes
    for schema in _tenant_schemas(bind):
        quoted = f'"{schema}"'
        for idx_name, _table, _cols, _extra, _unique in _TENANT_INDEXES:
            op.execute(f'DROP INDEX IF EXISTS {quoted}.{idx_name}')

    # Platform
    op.execute("DROP INDEX IF EXISTS platform.ix_users_tenant_id")
