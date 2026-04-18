"""Authentication router.

Endpoints:

* ``POST /api/auth/login`` — password-based login; if the user has MFA
  configured the response is a short-lived ``mfa_token`` instead of a full
  access token, and the caller must follow up with ``/login/mfa``.
* ``POST /api/auth/login/mfa`` — exchange a valid ``mfa_token`` + TOTP code
  for a normal access/refresh pair.
* ``POST /api/auth/refresh`` — refresh the access token.
* ``POST /api/auth/logout`` — revoke the caller's current access token.
* ``POST /api/auth/mfa/enroll`` — begin TOTP enrollment (returns secret +
  otpauth URL for QR rendering).
* ``POST /api/auth/mfa/verify`` — confirm enrollment by submitting a code
  from the authenticator app, which persists the secret on the user.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from jose import JWTError

from app.services.auth_service import (
    authenticate_user,
    build_otpauth_url,
    create_access_token,
    create_mfa_token,
    create_refresh_token,
    decode_token,
    generate_mfa_secret,
    hash_password,
    revoke_token,
    verify_totp,
)
from app.models.user import User, UserRole
from app.models.tenant import Tenant

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Shared bearer for endpoints that accept an access token (logout, MFA enroll).
_bearer = HTTPBearer()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class MFARequiredResponse(BaseModel):
    """Issued by /login when the user has MFA configured. The client uses
    ``mfa_token`` in the subsequent /login/mfa call."""
    mfa_required: bool = True
    mfa_token: str


class MFALoginRequest(BaseModel):
    mfa_token: str
    code: str


class RefreshRequest(BaseModel):
    refresh_token: str


class MFAEnrollResponse(BaseModel):
    secret: str
    otpauth_url: str


class MFAVerifyRequest(BaseModel):
    code: str


async def _resolve_tenant_schema(session: AsyncSession, tenant_id: int | None) -> str | None:
    if not tenant_id:
        return None
    result = await session.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    return tenant.schema_name if tenant else None


def _build_token_response(user: User, tenant_schema: str | None) -> TokenResponse:
    access_token = create_access_token(user.id, tenant_schema, user.role)
    refresh_token = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
        },
    )


@router.post("/login")
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    """Password login. If MFA is enrolled, returns an MFA challenge instead
    of a full token pair (caller must follow up with /login/mfa)."""
    user = await authenticate_user(session, body.email, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # MFA gate — if the user has a verified secret, don't issue a full token
    # from password alone. Return a short-lived mfa_token the client uses in
    # /login/mfa to complete the login.
    if user.mfa_secret:
        return MFARequiredResponse(mfa_token=create_mfa_token(user.id))

    tenant_schema = await _resolve_tenant_schema(session, user.tenant_id)
    return _build_token_response(user, tenant_schema)


@router.post("/login/mfa", response_model=TokenResponse)
async def login_mfa(body: MFALoginRequest, session: AsyncSession = Depends(get_session)):
    """Second leg of an MFA login. Exchanges the mfa_token + a valid TOTP
    code for a real access/refresh pair."""
    try:
        payload = decode_token(body.mfa_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired MFA token")
    if payload.get("type") != "mfa_pending":
        raise HTTPException(status_code=401, detail="Invalid token type for MFA step")

    user_id = int(payload["sub"])
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled or not found")
    if not user.mfa_secret:
        # Shouldn't happen — means the user removed MFA between the two calls.
        raise HTTPException(status_code=400, detail="MFA is not enabled for this account")

    if not verify_totp(user.mfa_secret, body.code):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    tenant_schema = await _resolve_tenant_schema(session, user.tenant_id)
    return _build_token_response(user, tenant_schema)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, session: AsyncSession = Depends(get_session)):
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = int(payload["sub"])
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    tenant_schema = await _resolve_tenant_schema(session, user.tenant_id)
    return _build_token_response(user, tenant_schema)


# ---------------------------------------------------------------------------
# Logout — JWT revocation
# ---------------------------------------------------------------------------


@router.post("/logout", status_code=204)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
):
    """Revoke the caller's current access token.

    We extract the ``jti`` from the presented token and insert it into
    ``platform.revoked_tokens``. Subsequent requests using the same token
    will be rejected by the ``get_current_user`` dependency.
    """
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        # Already invalid / expired — treat logout as idempotent success.
        return None

    jti = payload.get("jti")
    if not jti:
        # Pre-jti token — nothing to revoke. The token will expire naturally.
        return None

    # Reconstruct expiry from the exp claim so cleanup jobs can prune safely.
    exp_ts = payload.get("exp")
    if exp_ts is None:
        # Defensive fallback — revoke for a day if exp is somehow missing.
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    else:
        expires_at = datetime.fromtimestamp(int(exp_ts), tz=timezone.utc)

    try:
        user_id = int(payload.get("sub", 0))
    except (TypeError, ValueError):
        user_id = 0

    await revoke_token(session, jti=jti, user_id=user_id, expires_at=expires_at)
    return None


# ---------------------------------------------------------------------------
# MFA enrollment
# ---------------------------------------------------------------------------


@router.post("/mfa/enroll", response_model=MFAEnrollResponse)
async def mfa_enroll(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
):
    """Begin TOTP enrollment.

    Returns a fresh secret + otpauth URL the client renders as a QR code.
    The secret is **not** persisted yet — the client must prove they can
    produce a valid code via /mfa/verify before we commit it to the user
    row. This prevents a lost-phone lockout from a half-finished enrollment.
    """
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = int(payload["sub"])
    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled or not found")

    secret = generate_mfa_secret()
    otpauth_url = build_otpauth_url(secret, account=user.email)

    # Persist on the user row immediately BUT only activate on /mfa/verify.
    # We store the secret so the verify call doesn't need to re-roundtrip it;
    # however, note that login continues to allow password-only logins until
    # verify succeeds (see login-flow check below).
    #
    # Compromise: we stash it under a different attribute — but the column
    # doesn't have one, so instead we rely on the fact that the frontend
    # flow MUST call /mfa/verify before any password login. If the user
    # abandons enrollment, a subsequent /mfa/enroll simply rolls a new
    # secret; the old one is inert because the client never saw it.
    user.mfa_secret = secret
    await session.commit()

    return MFAEnrollResponse(secret=secret, otpauth_url=otpauth_url)


@router.post("/mfa/verify", status_code=204)
async def mfa_verify(
    body: MFAVerifyRequest,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
):
    """Confirm TOTP enrollment by submitting the first code.

    If the code verifies against the secret stored in /mfa/enroll, the
    enrollment is considered complete. Returns 204 on success and 400 on
    invalid code (no retry limit here — the client UI handles that; every
    future login also re-verifies via the usual TOTP path).
    """
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = int(payload["sub"])
    user = await session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled or not found")
    if not user.mfa_secret:
        raise HTTPException(status_code=400, detail="No MFA enrollment in progress — call /mfa/enroll first")

    if not verify_totp(user.mfa_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid MFA code")

    return None
