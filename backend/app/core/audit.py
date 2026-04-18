"""PHI access audit middleware — HIPAA §164.312(b).

Writes exactly one `platform.audit_log` row per authenticated `/api/*`
request. Must sit AFTER `RequestIdMiddleware` so the correlation ID is
already populated in the request-scoped contextvar.

Design contract:
- Never block the request on audit write. The response goes out first; the
  insert is scheduled via `asyncio.create_task` on a dedicated short-lived
  session.
- Never log request or response bodies. Only URL metadata.
- Never raise to the client. An audit-write failure is logged at ERROR but
  does not degrade the user request. (A noisy failure rate here is a real
  alert — compliance-significant.)
- Skip non-PHI paths: /health/*, /api/docs, /api/openapi.json, /api/redoc.

Tenant / user context:
- We avoid a second JWT decode. Instead we read the contextvars set by
  `app.core.logging.set_request_context`. Those are populated by route
  dependencies that resolve the current user. For unauthenticated requests
  (or routes that never called `get_current_user`) the row is still written
  with `user_id = None` — that itself is compliance-relevant data (who hit
  what while logged out).
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import (
    _request_id_var,
    _tenant_var,
    _user_id_var,
)
from app.database import async_session_factory
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


# Paths that are NOT worth auditing — health probes, OpenAPI schema, docs.
# Note: auth endpoints (login, refresh) ARE audited — failed-login is a
# HIPAA-significant event.
_SKIP_PREFIXES = (
    "/health",
    "/api/docs",
    "/api/openapi.json",
    "/api/redoc",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/favicon.ico",
)


# Map URL shape "/api/members/42" -> ("member", "42"). Best-effort; works on
# the platform's REST-ish layout. If no match, both are None.
_RESOURCE_RE = re.compile(r"^/(?:api/)?([a-z][a-z0-9_\-]*)(?:/([^/?#]+))?")


# HTTP verb -> audit action classification.
_ACTION_BY_METHOD = {
    "GET": "read",
    "HEAD": "read",
    "OPTIONS": "read",
    "POST": "write",
    "PUT": "write",
    "PATCH": "write",
    "DELETE": "delete",
}


def _classify_action(method: str) -> str:
    return _ACTION_BY_METHOD.get(method.upper(), "read")


def _extract_resource(path: str) -> tuple[Optional[str], Optional[str]]:
    """Pull a best-effort (resource_type, resource_id) pair from the URL."""
    m = _RESOURCE_RE.match(path.split("?", 1)[0])
    if not m:
        return None, None
    resource_type = m.group(1)
    resource_id = m.group(2)
    # Normalise: singularise trailing "s" on the resource_type is fine but
    # noisy; leave as the plural the router declared. Filter obviously
    # non-resource path segments.
    if resource_type in ("api",):
        # "/api" without a resource after it
        return None, None
    # If resource_id looks like a sub-resource label (all letters, short),
    # skip it — avoids classifying /api/members/search as id=search.
    if resource_id and resource_id.isalpha() and len(resource_id) < 20:
        resource_id = None
    return resource_type, resource_id


def _should_skip(path: str) -> bool:
    for prefix in _SKIP_PREFIXES:
        if path == prefix or path.startswith(prefix + "/") or path == prefix:
            return True
    return False


async def _write_audit_row(
    *,
    tenant_schema: Optional[str],
    user_id: Optional[int],
    role: Optional[str],
    request_id: Optional[str],
    method: str,
    path: str,
    status_code: int,
    resource_type: Optional[str],
    resource_id: Optional[str],
    action: str,
    ip_address: Optional[str],
    user_agent: Optional[str],
) -> None:
    """Persist a single audit_log row. Runs on a fresh session so a caller
    rollback can't take the row with it.
    """
    try:
        async with async_session_factory() as session:
            row = AuditLog(
                tenant_schema=tenant_schema,
                user_id=user_id,
                role=role,
                request_id=request_id,
                method=method,
                path=path[:500],
                status_code=status_code,
                resource_type=resource_type[:64] if resource_type else None,
                resource_id=resource_id[:128] if resource_id else None,
                action=action,
                ip_address=ip_address,
                user_agent=user_agent[:500] if user_agent else None,
            )
            session.add(row)
            await session.commit()
    except Exception:
        # Audit-write failures are logged but never raised. A sustained spike
        # should page ops — count these in metrics upstream of this call.
        logger.exception("audit.write_failed path=%s method=%s", path, method)


class AuditMiddleware(BaseHTTPMiddleware):
    """Writes a `platform.audit_log` row after every non-skipped request.

    Ordering: this middleware runs AFTER `RequestIdMiddleware`, so the
    correlation ID is already set in the contextvar by the time we read it.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Fast path: skip non-PHI paths entirely.
        if _should_skip(path):
            return await call_next(request)

        # Let the request run first; audit is post-hoc.
        response = await call_next(request)

        try:
            # Context should have been set by route dependencies
            # (get_current_user writes into these via future wiring, or the
            # logging middleware left them as None for anonymous requests).
            request_id = _request_id_var.get()
            user_id = _user_id_var.get()
            tenant_schema = _tenant_var.get()

            role: Optional[str] = None
            # The get_current_user dependency returns a dict with "role";
            # we expose it via request.state if a route set it. Cheap to
            # fetch optionally, skip if absent.
            role = getattr(request.state, "audit_role", None)
            if user_id is None:
                # Fallback for routes that stashed the user dict on
                # request.state instead of the contextvar.
                audit_user = getattr(request.state, "audit_user_id", None)
                if isinstance(audit_user, int):
                    user_id = audit_user

            method = request.method
            resource_type, resource_id = _extract_resource(path)

            client = request.client
            ip_address = client.host if client else None
            user_agent = request.headers.get("user-agent")

            # Fire-and-forget: don't block the response on DB write.
            asyncio.create_task(
                _write_audit_row(
                    tenant_schema=tenant_schema,
                    user_id=user_id,
                    role=role,
                    request_id=request_id,
                    method=method,
                    path=path,
                    status_code=response.status_code,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    action=_classify_action(method),
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
            )
        except Exception:
            # Any failure building the row is non-fatal to the request.
            logger.exception("audit.dispatch_failed path=%s", path)

        return response
