"""
Payer API Integration endpoints.

Manages OAuth connections to health plan APIs (Humana, etc.) and triggers
FHIR data synchronization into the platform.

All endpoints require mso_admin or superadmin role.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import payer_api_service
from app.services.payer_adapters import get_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payer", tags=["payer-api"])


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

    creds = {
        "client_id": body.client_id,
        "client_secret": body.client_secret,
        "redirect_uri": body.redirect_uri,
        "environment": body.environment,
        "state": current_user["tenant_schema"],
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

    # Validate OAuth state to prevent CSRF — state should match the tenant schema
    # that was set during connect_payer()
    if not body.state or body.state != tenant_schema:
        raise HTTPException(
            status_code=400,
            detail="OAuth state mismatch — callback tenant does not match connection tenant",
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


@router.post("/sync")
async def sync_payer_data(
    body: PayerSyncRequest,
    current_user: dict = Depends(require_role(UserRole.mso_admin, UserRole.superadmin)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Trigger data synchronization from a connected payer API.

    Pulls FHIR resources, parses them, and upserts into the tenant database.
    Returns counts of synced resources.
    """
    tenant_schema = current_user["tenant_schema"]

    try:
        result = await payer_api_service.sync_payer_data(
            db=db,
            payer_name=body.payer_name,
            tenant_schema=tenant_schema,
            data_types=body.data_types,
        )
        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Payer sync failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Payer sync failed: {e}")


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
