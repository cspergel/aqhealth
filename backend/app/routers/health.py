"""Health endpoints for orchestration + load balancers.

Two separate probes:
  GET /health/live   — process is up. Constant-time, no I/O. Used by
                        container liveness probes.
  GET /health/ready  — service can actually serve traffic: DB + Redis
                        reachable. Used by load balancer / readiness probes.

The previous `/api/health` returned 200 even if the DB was gone — a false
"green" that masked real outages.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    """Process liveness. Always 200 if the interpreter is responsive."""
    return {"status": "live"}


@router.get("/health/ready")
async def ready(response: Response) -> dict[str, Any]:
    """Readiness: DB and Redis must both respond."""
    checks: dict[str, Any] = {"db": "unknown", "redis": "unknown"}
    ok = True

    # --- DB probe ---
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {e.__class__.__name__}"
        ok = False
        logger.exception("health.ready: DB probe failed")

    # --- Redis probe (optional — skip gracefully if redis not installed) ---
    try:
        from redis import asyncio as aioredis  # type: ignore
        from app.config import settings

        redis = aioredis.from_url(settings.redis_url, socket_timeout=1)
        try:
            pong = await redis.ping()
            checks["redis"] = "ok" if pong else "no-pong"
            if not pong:
                ok = False
        finally:
            await redis.aclose()
    except ImportError:
        checks["redis"] = "skipped (redis-py not installed)"
    except Exception as e:
        checks["redis"] = f"error: {e.__class__.__name__}"
        ok = False
        logger.exception("health.ready: Redis probe failed")

    if not ok:
        response.status_code = 503
    return {"status": "ready" if ok else "unready", "checks": checks}


# Backwards-compat: some external monitors still hit /api/health. Keep
# the endpoint alive but make it honest about DB state.
@router.get("/api/health")
async def health_compat(response: Response) -> dict[str, Any]:
    return await ready(response)
