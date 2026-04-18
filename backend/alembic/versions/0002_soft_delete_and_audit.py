"""soft-delete columns on PHI tables + platform.audit_log table.

Phase 2 hardening:

1. Add `deleted_at` + `deleted_by` columns to every PHI-bearing tenant
   table (Member, Claim, HccSuspect, RafHistory, MemberGap, CareAlert,
   ADTEvent, Annotation, ActionItem). Soft-delete unlocks HIPAA §164.528
   disclosure accounting and lets us preserve evidence for audits.
2. Create `platform.audit_log` to back `app.core.audit`. HIPAA §164.312(b)
   audit control.

Execution model (see alembic/env.py):
- The PHI columns are tenant-scoped; they live in tenant schemas. Because
  env.py runs the same migration chain for each active tenant (with
  search_path set to that schema), the unqualified table names here are
  interpreted in the tenant's schema when it's that tenant's turn, and
  skipped on the platform pass (the platform pass runs the migration too,
  but those tables do not exist there, so we guard on existence).
- The platform.audit_log table has an explicit schema and is only created
  on the platform pass (guarded the same way).

Revision ID: 0002_soft_delete_and_audit
Revises: 0001_baseline
Create Date: 2026-04-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "0002_soft_delete_and_audit"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


# Tenant-scoped PHI tables that get soft-delete columns.
_PHI_TABLES = (
    "members",
    "claims",
    "hcc_suspects",
    "raf_history",
    "member_gaps",
    "care_alerts",
    "adt_events",
    "annotations",
    "action_items",
)


def _current_search_schema(bind) -> str:
    """Return the first schema in the current search_path — in env.py we
    SET search_path to the tenant schema before running migrations for
    that tenant, so this tells us which pass we're in.
    """
    try:
        row = bind.execute(sa.text("SHOW search_path")).scalar()
    except Exception:
        return ""
    # search_path looks like '"tenant_foo", public'; take the first entry.
    if not row:
        return ""
    first = row.split(",")[0].strip().strip('"')
    return first


def _table_exists(bind, table: str, schema: str | None = None) -> bool:
    insp = inspect(bind)
    try:
        return insp.has_table(table, schema=schema)
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()
    current_schema = _current_search_schema(bind)

    # --- Pass: platform ------------------------------------------------------
    # Platform pass runs against the default search_path. Create audit_log
    # only when we see the platform schema exists (it's always there by
    # 0001_baseline). Tenant passes will also see the platform schema via
    # fully-qualified name, but we only want to create audit_log once —
    # creating it with IF NOT EXISTS semantics via checkfirst handles the
    # re-entry case, but we still guard to minimise noise.
    if not _table_exists(bind, "audit_log", schema="platform"):
        op.create_table(
            "audit_log",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("tenant_schema", sa.String(length=63), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("role", sa.String(length=32), nullable=True),
            sa.Column("request_id", sa.String(length=64), nullable=True),
            sa.Column("method", sa.String(length=8), nullable=False),
            sa.Column("path", sa.String(length=500), nullable=False),
            sa.Column("status_code", sa.Integer(), nullable=False),
            sa.Column("resource_type", sa.String(length=64), nullable=True),
            sa.Column("resource_id", sa.String(length=128), nullable=True),
            sa.Column("action", sa.String(length=16), nullable=False),
            sa.Column("ip_address", sa.String(length=64), nullable=True),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            schema="platform",
        )
        op.create_index(
            "ix_audit_log_tenant_created",
            "audit_log",
            ["tenant_schema", "created_at"],
            schema="platform",
        )
        op.create_index(
            "ix_audit_log_user_created",
            "audit_log",
            ["user_id", "created_at"],
            schema="platform",
        )
        op.create_index(
            "ix_audit_log_path",
            "audit_log",
            ["path"],
            schema="platform",
        )
        op.create_index(
            "ix_audit_log_request_id",
            "audit_log",
            ["request_id"],
            schema="platform",
        )

    # --- Pass: tenant --------------------------------------------------------
    # Each tenant pass adds soft-delete columns to tenant-scoped tables.
    # On the platform pass `current_schema` will be something like "public"
    # (or the DB default), and the PHI tables won't exist there — so
    # existence-guard and skip.
    for table in _PHI_TABLES:
        if not _table_exists(bind, table, schema=current_schema or None):
            # Table not in this schema — either we're on the platform pass
            # (no tenant tables) or this tenant has been partially provisioned.
            continue
        # Skip if already added (re-running migration on a tenant that already
        # got the columns through a partial earlier run).
        insp = inspect(bind)
        cols = {c["name"] for c in insp.get_columns(table, schema=current_schema or None)}
        if "deleted_at" not in cols:
            op.add_column(
                table,
                sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
                schema=current_schema or None,
            )
            op.create_index(
                f"ix_{table}_deleted_at",
                table,
                ["deleted_at"],
                schema=current_schema or None,
            )
        if "deleted_by" not in cols:
            op.add_column(
                table,
                sa.Column("deleted_by", sa.Integer(), nullable=True),
                schema=current_schema or None,
            )


def downgrade() -> None:
    bind = op.get_bind()
    current_schema = _current_search_schema(bind)

    # Drop per-tenant columns first (reverse order is cosmetic for ADD COLUMN).
    for table in _PHI_TABLES:
        if not _table_exists(bind, table, schema=current_schema or None):
            continue
        insp = inspect(bind)
        cols = {c["name"] for c in insp.get_columns(table, schema=current_schema or None)}
        if "deleted_at" in cols:
            try:
                op.drop_index(
                    f"ix_{table}_deleted_at",
                    table_name=table,
                    schema=current_schema or None,
                )
            except Exception:
                pass
            op.drop_column(table, "deleted_at", schema=current_schema or None)
        if "deleted_by" in cols:
            op.drop_column(table, "deleted_by", schema=current_schema or None)

    # Drop platform.audit_log last.
    if _table_exists(bind, "audit_log", schema="platform"):
        for ix in (
            "ix_audit_log_tenant_created",
            "ix_audit_log_user_created",
            "ix_audit_log_path",
            "ix_audit_log_request_id",
        ):
            try:
                op.drop_index(ix, table_name="audit_log", schema="platform")
            except Exception:
                pass
        op.drop_table("audit_log", schema="platform")
