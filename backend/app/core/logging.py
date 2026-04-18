"""Structured JSON logging + request-scoped correlation IDs.

- `configure_logging()` is called once at startup.
- `RequestIdMiddleware` assigns a correlation ID to every request and
  stashes it in a contextvar so any log call in the request scope carries it.
- `redact()` pulls known sensitive keys out of dict payloads before logging.

Why stdlib + contextvar instead of loguru/structlog: one fewer dep to review,
and FastAPI already uses stdlib logging. This is enough for Sentry / ELK /
CloudWatch ingestion.
"""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings


# Context for the current request — populated by RequestIdMiddleware
_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)
_user_id_var: ContextVar[int | None] = ContextVar("user_id", default=None)
_tenant_var: ContextVar[str | None] = ContextVar("tenant", default=None)


def get_request_id() -> str | None:
    return _request_id_var.get()


def set_request_context(
    request_id: str | None = None,
    user_id: int | None = None,
    tenant: str | None = None,
) -> None:
    """Populate per-request context. Safe to call repeatedly during a request
    (e.g., once the JWT is decoded and user_id/tenant are known)."""
    if request_id is not None:
        _request_id_var.set(request_id)
    if user_id is not None:
        _user_id_var.set(user_id)
    if tenant is not None:
        _tenant_var.set(tenant)


# ----------------------------- redaction ----------------------------------

# Keys (case-insensitive) whose values must never land in a log line.
_REDACTED_KEYS = {
    "password",
    "hashed_password",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "api_key",
    "client_secret",
    "secret",
    "ssn",
    "encryption_key",
}

# Simple PII regexes — inline redaction in free-text log messages.
_SSN_RE = re.compile(r"\b\d{3}-?\d{2}-?\d{4}\b")
_PHONE_RE = re.compile(r"\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")


def redact(obj: Any) -> Any:
    """Return a copy of `obj` with sensitive values replaced by "[REDACTED]"."""
    if isinstance(obj, dict):
        return {
            k: ("[REDACTED]" if k.lower() in _REDACTED_KEYS else redact(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [redact(x) for x in obj]
    if isinstance(obj, str):
        # Light-touch PII scrub on free-text values that may be attrs/messages.
        s = _SSN_RE.sub("[SSN]", obj)
        s = _PHONE_RE.sub("[PHONE]", s)
        return s
    return obj


# ----------------------------- formatter ----------------------------------

class JsonFormatter(logging.Formatter):
    """One-line JSON log records with request-scoped context attached."""

    def format(self, record: logging.LogRecord) -> str:
        # Base structured record
        out: dict[str, Any] = {
            "ts": self.formatTime(record, datefmt="%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Per-request context
        rid = _request_id_var.get()
        if rid:
            out["request_id"] = rid
        uid = _user_id_var.get()
        if uid is not None:
            out["user_id"] = uid
        tenant = _tenant_var.get()
        if tenant:
            out["tenant"] = tenant
        # Exception info if present
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        # Any extra fields passed via logger.info("...", extra={"k": v})
        for key, value in record.__dict__.items():
            if key in (
                "name", "msg", "args", "levelname", "levelno", "pathname",
                "filename", "module", "exc_info", "exc_text", "stack_info",
                "lineno", "funcName", "created", "msecs", "relativeCreated",
                "thread", "threadName", "processName", "process", "message",
                "asctime",
            ):
                continue
            out[key] = value
        return json.dumps(redact(out), default=str)


def configure_logging() -> None:
    """Configure root logging. Called from main.py lifespan on startup."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)

    # Clear any previously attached handlers (test harnesses / uvicorn dev mode)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler()
    if settings.log_json:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s %(levelname)-5s %(name)s [rid=%(request_id)s] %(message)s"
            )
        )
    root.addHandler(handler)

    # Silence noisy libraries a notch below root
    for noisy in ("sqlalchemy.engine", "httpx", "uvicorn.access"):
        logging.getLogger(noisy).setLevel(max(level, logging.WARNING))


# ----------------------------- middleware ---------------------------------

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign a correlation ID per request, log request/response summary,
    and make the ID available via response header `X-Request-ID`.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Honour an inbound correlation header if present (frontend tracing).
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        _request_id_var.set(rid)
        _user_id_var.set(None)
        _tenant_var.set(None)

        start = time.perf_counter()
        logger = logging.getLogger("request")
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                "request.failed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "elapsed_ms": elapsed_ms,
                },
            )
            raise

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        level = logging.WARNING if response.status_code >= 500 else logging.INFO
        logger.log(
            level,
            "request.completed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "elapsed_ms": elapsed_ms,
            },
        )
        response.headers["X-Request-ID"] = rid
        return response
