"""
Payer API Integration endpoints.

Manages OAuth connections to health plan APIs (Humana, etc.) and triggers
FHIR data synchronization into the platform.

All endpoints require mso_admin or superadmin role.

Security note: the OAuth `state` parameter is now a single-use
cryptographically-random nonce (see `secrets.token_urlsafe(32)`), mapped to
the initiating tenant in `platform.oauth_state` with a 10-minute TTL. The
earlier `state = tenant_schema` form was CSRF-weak because the value was
predictable per tenant.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import payer_api_service
from app.services.payer_adapters import get_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payer", tags=["payer-api"])

_OAUTH_STATE_TTL_MINUTES = 10


async def _issue_oauth_state(
    db: AsyncSession, tenant_schema: str, payer_name: str
) -> str:
    """Mint a single-use OAuth nonce, persist it with a short TTL, return it.

    Uses the platform-level `oauth_state` table (created in migration
    0003_uniques_and_hash). Expired rows are cleaned up lazily on each
    issue/consume.
    """
    nonce = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OAUTH_STATE_TTL_MINUTES)
    await db.execute(
        text(
            "DELETE FROM platform.oauth_state WHERE expires_at < NOW()"
        )
    )
    await db.execute(
        text(
            """
            INSERT INTO platform.oauth_state (state, tenant_schema, payer_name, expires_at)
            VALUES (:state, :tenant, :payer, :expires)
            """
        ),
        {
            "state": nonce,
            "tenant": tenant_schema,
            "payer": payer_name,
            "expires": expires_at,
        },
    )
    await db.commit()
    return nonce


async def _consume_oauth_state(
    db: AsyncSession, state: str, expected_tenant: str, expected_payer: str
) -> None:
    """Validate and atomically delete an OAuth state nonce.

    Raises HTTPException on mismatch, expiry, or missing row so the caller
    can short-circuit the callback. Single-use: a nonce cannot be replayed.
    """
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")
    result = await db.execute(
        text(
            """
            DELETE FROM platform.oauth_state
            WHERE state = :state
            RETURNING tenant_schema, payer_name, expires_at
            """
        ),
        {"state": state},
    )
    row = result.fetchone()
    await db.commit()
    if not row:
        raise HTTPException(status_code=400, detail="OAuth state invalid or expired")
    if row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OAuth state expired")
    if row.tenant_schema != expected_tenant:
        raise HTTPException(
            status_code=400,
            detail="OAuth state mismatch — callback tenant does not match initiator",
        )
    if row.payer_name != expected_payer:
        raise HTTPException(
            status_code=400,
            detail="OAuth state mismatch — callback payer does not match initiator",
        )


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class PayerConnectRequest(BaseModel):
    """Initiate an OAuth connection to a payer API."""
    payer_name: str = Field(..., description="Payer adapter name, e.g. 'humana'")
    client_id: str = Field(..., description="OAuth client ID")
    client_secret: str = Field(..., description="OAuth client secret")
    redirect_uri: str = Field(..., description="OAuth redirect URI (must match app registration)")
    environment: str = Field("sandbox", description="'sandbox' or 'production'")
    practice_code: str | None = Field(None, description="Practice code (required for eCW)")


class PayerCallbackRequest(BaseModel):
    """OAuth callback — exchange authorization code for tokens."""
    payer_name: str
    code: str = Field(..., description="Authorization code from payer redirect")
    redirect_uri: str
    client_id: str
    client_secret: str
    environment: str = "sandbox"
    state: str = Field(..., description="OAuth state parameter (CSRF protection, must match tenant)")
    code_verifier: str | None = Field(None, description="PKCE code_verifier (required for eCW)")
    practice_code: str | None = Field(None, description="Practice code (required for eCW)")


class PayerSyncRequest(BaseModel):
    """Trigger a data sync from a connected payer."""
    payer_name: str
    data_types: list[str] | None = Field(
        None,
        description="Resource types to sync. Defaults to all: patients, coverage, claims, conditions, providers, medications",
    )


class PayerDisconnectRequest(BaseModel):
    """Remove a payer connection."""
    payer_name: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/connect")
async def connect_payer(
    body: PayerConnectRequest,
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Initiate OAuth flow — returns the authorization URL for browser redirect.

    The frontend should redirect the user to the returned ``auth_url`` to
    complete the OAuth consent flow. After the user authorizes, the payer
    will redirect back to ``redirect_uri`` with an authorization ``code``.
    """
    try:
        adapter = get_adapter(body.payer_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Mint a single-use OAuth nonce. Writes to platform.oauth_state so the
    # callback can verify the round-trip came from this connect_payer call
    # and nobody else.
    nonce = await _issue_oauth_state(db, current_user["tenant_schema"], body.payer_name)

    creds = {
        "client_id": body.client_id,
        "client_secret": body.client_secret,
        "redirect_uri": body.redirect_uri,
        "environment": body.environment,
        "state": nonce,
    }
    # Pass adapter-specific fields (practice_code for eCW, etc.)
    if body.practice_code:
        creds["practice_code"] = body.practice_code

    auth_url = adapter.get_authorization_url(creds)

    # After get_authorization_url, PKCE adapters (eCW) store the code_verifier
    # on the adapter instance. We need to persist it so the callback can use it.
    code_verifier = getattr(adapter, "_code_verifier", None)

    # Store pending auth state (including PKCE verifier) in tenant config
    if code_verifier:
        from app.services.payer_api_service import _encrypt_value, _upsert_payer_connection, _get_payer_connection
        pending_auth = {
            "code_verifier": _encrypt_value(code_verifier),
            "environment": body.environment,
            "status": "pending_callback",
        }
        if body.practice_code:
            pending_auth["practice_code"] = body.practice_code
        await _upsert_payer_connection(db, current_user["tenant_schema"], body.payer_name, pending_auth)

    response = {
        "auth_url": auth_url,
        "payer": body.payer_name,
        "environment": body.environment,
        "message": "Redirect user to auth_url to complete OAuth flow",
    }
    # Return code_verifier to the frontend so it can send it back in the callback
    if code_verifier:
        response["code_verifier"] = code_verifier

    return response


@router.post("/callback")
async def payer_callback(
    body: PayerCallbackRequest,
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """OAuth callback — exchange authorization code for tokens and store connection.

    Called after the payer redirects back with an authorization code.
    """
    tenant_schema = current_user["tenant_schema"]

    # Consume the single-use OAuth nonce. Raises 400 if the state is
    # missing, expired, already used, or points at a different
    # tenant/payer. Must happen before any network I/O so a bogus
    # callback can't waste an API roundtrip.
    await _consume_oauth_state(
        db, body.state, expected_tenant=tenant_schema, expected_payer=body.payer_name
    )

    # Retrieve stored PKCE code_verifier from tenant config if not provided
    code_verifier = body.code_verifier
    practice_code = body.practice_code
    if not code_verifier or not practice_code:
        from app.services.payer_api_service import _get_payer_connection, _decrypt_value
        stored = await _get_payer_connection(db, tenant_schema, body.payer_name)
        if stored:
            if not code_verifier and stored.get("code_verifier"):
                code_verifier = _decrypt_value(stored["code_verifier"])
            if not practice_code and stored.get("practice_code"):
                practice_code = stored["practice_code"]

    credentials: dict[str, Any] = {
        "client_id": body.client_id,
        "client_secret": body.client_secret,
        "code": body.code,
        "redirect_uri": body.redirect_uri,
        "environment": body.environment,
    }
    # Pass PKCE code_verifier for adapters that need it (eCW)
    if code_verifier:
        credentials["code_verifier"] = code_verifier
    # Pass adapter-specific fields
    if practice_code:
        credentials["practice_code"] = practice_code

    try:
        result = await payer_api_service.connect_payer(
            db=db,
            payer_name=body.payer_name,
            credentials=credentials,
            tenant_schema=tenant_schema,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Payer callback failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Payer authentication failed: {e}")


@router.post("/sync", status_code=202)
async def sync_payer_data(
    body: PayerSyncRequest,
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Enqueue a payer-API sync job and return immediately.

    A real Humana pull can be 30+ minutes; running inline in the HTTP
    handler will timeout on any reverse proxy. We enqueue via arq and
    respond with 202 Accepted + a job_id. Poll `/api/payer/status` to see
    when `last_sync` updates.
    """
    tenant_schema = current_user["tenant_schema"]

    # Verify the connection exists before queuing — returning a 4xx here
    # is friendlier than letting the worker choke on a missing record.
    connection = await payer_api_service._get_payer_connection(
        db, tenant_schema, body.payer_name
    )
    if not connection:
        raise HTTPException(
            status_code=404,
            detail=f"No active connection for payer '{body.payer_name}'",
        )

    try:
        from arq.connections import create_pool, RedisSettings
        from urllib.parse import urlparse

        parsed = urlparse(settings.redis_url)
        redis = await create_pool(RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or "0"),
            password=parsed.password,
        ))
        job = await redis.enqueue_job(
            "sync_payer_data_job",
            tenant_schema,
            body.payer_name,
            body.data_types,
            _queue_name="default",
        )
        await redis.close()
        job_id = getattr(job, "job_id", None) if job else None
        return {
            "status": "accepted",
            "job_id": job_id,
            "payer": body.payer_name,
            "tenant": tenant_schema,
            "message": "Payer sync job enqueued. Watch /api/payer/status for completion.",
        }
    except Exception as e:
        logger.exception("Payer sync enqueue failed")
        raise HTTPException(
            status_code=503,
            detail=f"Processing queue unavailable — retry in a few minutes ({type(e).__name__})",
        )


@router.get("/status")
async def get_payer_status(
    payer_name: str = Query(..., description="Payer adapter name"),
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Check connection status, last sync time, and token validity for a payer."""
    tenant_schema = current_user["tenant_schema"]
    return await payer_api_service.get_payer_status(db, payer_name, tenant_schema)


@router.delete("/disconnect")
async def disconnect_payer(
    body: PayerDisconnectRequest,
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Remove a payer connection and delete stored credentials."""
    tenant_schema = current_user["tenant_schema"]
    return await payer_api_service.disconnect_payer(db, body.payer_name, tenant_schema)


@router.get("/available")
async def list_available_payers(
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """List all available payer integrations with their connection status."""
    tenant_schema = current_user["tenant_schema"]
    return await payer_api_service.get_available_payers(db, tenant_schema)
