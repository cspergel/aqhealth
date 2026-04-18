"""Security response headers — HSTS, CSP, X-Frame-Options, etc.

These are set on every response via a Starlette middleware so individual
handlers don't need to remember them.

Tunable via ``app.config``:
- ``CSP_POLICY`` — override the default CSP. Leave blank to disable CSP.
- ``HSTS_MAX_AGE`` — max-age seconds for Strict-Transport-Security.

Defaults are conservative for a FastAPI app with an API-only backend (no
frontend served from here). The frontend lives on a separate origin (see
compose + CORS config); its own build pipeline sets stricter CSP as needed.
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# Default CSP — denies everything the API doesn't serve. No scripts, no
# frames, no images. Docs endpoints (/api/docs, /api/openapi.json) are
# covered because Swagger UI pulls scripts from jsdelivr — we allow it
# explicitly.
_DEFAULT_CSP = (
    "default-src 'none'; "
    "script-src 'self' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "img-src 'self' data: https://fastapi.tiangolo.com; "
    "font-src 'self' https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach HSTS/CSP/X-Frame/etc. to every response.

    Parameters are pulled from `app.config.settings` at request time so
    tests can flip them without restarting the app.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Lazy import so the module doesn't bind to settings at import time
        from app.config import settings

        # Strict-Transport-Security: only meaningful over HTTPS, but harmless
        # over HTTP (browsers ignore it on non-HTTPS origins).
        hsts_age = getattr(settings, "hsts_max_age", 63072000)  # 2 years
        response.headers.setdefault(
            "Strict-Transport-Security",
            f"max-age={hsts_age}; includeSubDomains; preload",
        )

        # Content-Security-Policy — block mixed content + inline scripts.
        csp = getattr(settings, "csp_policy", None) or _DEFAULT_CSP
        if csp:
            response.headers.setdefault("Content-Security-Policy", csp)

        # MIME sniffing + clickjacking + referrer leakage
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")

        # Permissions-Policy: deny every powerful feature by default. Routes
        # that need one can set their own.
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )

        # Cross-Origin-Opener-Policy: protects from window-object leakage
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")

        return response
