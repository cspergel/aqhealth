"""Observability hooks — Sentry (optional).

If ``SENTRY_DSN`` is set in the environment AND the ``sentry-sdk`` package
is installed, this module initialises Sentry with FastAPI + SQLAlchemy +
Starlette integrations on import. Otherwise it's a silent no-op.

This keeps Sentry a soft dependency: operators who want error tracking
add the DSN and install the SDK; everyone else pays nothing.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def init_sentry() -> bool:
    """Return True if Sentry was successfully initialised."""
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.fastapi import FastApiIntegration
    except ImportError:
        logger.warning(
            "SENTRY_DSN is set but sentry-sdk is not installed; skipping. "
            "Add sentry-sdk[fastapi] to pyproject.toml to enable."
        )
        return False

    # Environment + release wiring — keep it simple, defer to env vars.
    environment = os.getenv("APP_ENV", "development")
    release = os.getenv("APP_RELEASE", "")

    try:
        integrations = [StarletteIntegration(), FastApiIntegration()]
        # SQLAlchemy integration is helpful but older sentry-sdk versions
        # don't ship it — tolerate absence.
        try:
            from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
            integrations.append(SqlalchemyIntegration())
        except ImportError:
            pass

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release or None,
            integrations=integrations,
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
            profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
            send_default_pii=False,  # never ship PHI/PII to Sentry
            attach_stacktrace=True,
        )
    except Exception:
        logger.exception("Sentry init failed")
        return False

    logger.info("sentry.init: enabled in env=%s", environment)
    return True
