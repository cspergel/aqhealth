"""baseline: establish current schema as the Alembic starting point.

Historically the service ran ``Base.metadata.create_all()`` at startup and
had no migration history. This baseline captures "what's there today" so
every subsequent change lives in a proper revision file.

Strategy: the upgrade step delegates to ``Base.metadata.create_all`` with
``checkfirst=True``. This is idempotent — on an existing DB it no-ops, on
a fresh DB it creates the baseline. After this revision, real schema
changes use standard ``op.add_column`` / ``op.create_index`` / etc.

Operators on existing databases should run::

    alembic stamp 0001_baseline

once to mark the DB as at baseline without re-running create_all.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-04-18
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def _ensure_platform() -> None:
    """Create the platform schema + enum types that ``init_db`` has been
    creating at startup. Idempotent."""
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE platform.tenantstatus AS ENUM ('active','onboarding','suspended');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE platform.userrole AS ENUM (
                'superadmin','mso_admin','analyst','provider',
                'auditor','care_manager','outreach','financial'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )


def upgrade() -> None:
    _ensure_platform()

    # Pull in every model so Base.metadata is complete, then delegate to
    # SQLAlchemy's create_all with checkfirst=True. This represents the
    # schema that shipped with the pre-migration codebase.
    import app.models  # noqa: F401 — ensures every model is registered
    from app.models.base import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    # Deliberately no-op. Rolling back the baseline would drop every table,
    # which is never what an operator wants. Use a fresh database instead.
    pass
