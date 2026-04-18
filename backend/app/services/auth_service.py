"""Authentication service.

Password hashing, JWT issuance/decoding, TOTP/MFA, and the JWT revocation
helper live here. The access-token flow now puts a random ``jti`` (JWT ID)
into every token so logout / forced-expiry can blacklist a single token
without rotating the global signing key.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.revoked_token import RevokedToken
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Validate bcrypt works at import time — warn instead of crashing on import.
# A hard crash here prevents test collection and app startup diagnostics.
try:
    _test_hash = pwd_context.hash("startup_check")
    assert pwd_context.verify("startup_check", _test_hash)
except Exception as _e:
    import warnings
    warnings.warn(
        f"Password hashing is broken: {_e}. "
        "This usually means bcrypt >= 4.1 is installed which is incompatible with passlib. "
        "Fix: pip install 'bcrypt<4.1'. Auth endpoints will fail until resolved.",
        RuntimeWarning,
        stacklevel=1,
    )


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: int, tenant_schema: str | None, role: str) -> str:
    """Issue an access token.

    The ``jti`` (JWT ID) claim is a random 128-bit token and lets
    :func:`is_token_revoked` blacklist this specific token without
    invalidating every user session.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "tenant": tenant_schema,
        "role": role,
        "exp": expire,
        "type": "access",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_mfa_token(user_id: int) -> str:
    """Short-lived token that proves a valid password login and unlocks the
    MFA step. Valid only for 5 minutes and NOT usable as an access token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=5)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "mfa_pending",
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user and verify_password(password, user.hashed_password):
        return user
    return None


# ---------------------------------------------------------------------------
# JWT revocation
# ---------------------------------------------------------------------------

async def is_token_revoked(jti: str, db: AsyncSession) -> bool:
    """Return True iff the given ``jti`` has been revoked via /logout etc.

    A missing ``jti`` returns ``False`` — pre-jti tokens issued by an older
    build remain usable until their natural expiry. Every new token carries
    a ``jti`` so this only affects the transition window.
    """
    if not jti:
        return False
    result = await db.execute(
        select(RevokedToken.jti).where(RevokedToken.jti == jti)
    )
    return result.scalar_one_or_none() is not None


async def revoke_token(
    db: AsyncSession,
    jti: str,
    user_id: int,
    expires_at: datetime,
) -> None:
    """Insert a ``jti`` into the revocation list.

    Idempotent — a token already in the list is left as-is. ``expires_at``
    mirrors the token's exp claim so cleanup jobs can prune safely.
    """
    if not jti:
        return
    existing = await db.execute(
        select(RevokedToken.jti).where(RevokedToken.jti == jti)
    )
    if existing.scalar_one_or_none() is not None:
        return
    db.add(RevokedToken(
        jti=jti,
        user_id=user_id,
        revoked_at=datetime.now(timezone.utc),
        expires_at=expires_at,
    ))
    await db.commit()


# ---------------------------------------------------------------------------
# TOTP / MFA (RFC 6238)
# ---------------------------------------------------------------------------
#
# We implement TOTP in-stdlib rather than pull in pyotp — it's well-specified
# and ~20 lines, and avoids adding a dependency just for this. The
# implementation follows RFC 6238 with the default Google Authenticator
# parameters: SHA-1, 6 digits, 30-second time-step.

_TOTP_DIGITS = 6
_TOTP_STEP = 30
_TOTP_WINDOW = 1  # Accept current step +/- 1 step for clock skew


def generate_mfa_secret() -> str:
    """Return a fresh Base32-encoded TOTP secret suitable for Google
    Authenticator / Authy / 1Password."""
    # 20 random bytes -> 32-character base32 string (standard TOTP length).
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _hotp(secret_bytes: bytes, counter: int) -> str:
    """HMAC-based One-Time Password (RFC 4226) — the building block for TOTP."""
    msg = struct.pack(">Q", counter)
    digest = hmac.new(secret_bytes, msg, hashlib.sha1).digest()
    # Dynamic truncation per RFC 4226 §5.3
    offset = digest[-1] & 0x0F
    code = (
        ((digest[offset] & 0x7F) << 24)
        | ((digest[offset + 1] & 0xFF) << 16)
        | ((digest[offset + 2] & 0xFF) << 8)
        | (digest[offset + 3] & 0xFF)
    )
    code %= 10 ** _TOTP_DIGITS
    return str(code).zfill(_TOTP_DIGITS)


def verify_totp(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code against a Base32 secret.

    Accepts a +/- 1 time-step window to tolerate clock skew between the
    client's authenticator and the server. Uses ``hmac.compare_digest`` to
    avoid leaking the match position via timing.
    """
    if not secret or not code:
        return False
    # Tolerate separators / whitespace some authenticators render ("123 456").
    normalized = code.replace(" ", "").replace("-", "").strip()
    if len(normalized) != _TOTP_DIGITS or not normalized.isdigit():
        return False

    # Pad the Base32 secret back to a multiple of 8 chars before decoding —
    # generate_mfa_secret() strips the padding for compactness.
    padded = secret + "=" * (-len(secret) % 8)
    try:
        secret_bytes = base64.b32decode(padded, casefold=True)
    except Exception:
        return False

    current_step = int(time.time() // _TOTP_STEP)
    for drift in range(-_TOTP_WINDOW, _TOTP_WINDOW + 1):
        candidate = _hotp(secret_bytes, current_step + drift)
        if hmac.compare_digest(candidate, normalized):
            return True
    return False


def build_otpauth_url(secret: str, account: str, issuer: str = "AQSoft Health") -> str:
    """Build the standard ``otpauth://`` URL that authenticator apps consume
    from a QR code. ``account`` should be the user's email / login name."""
    from urllib.parse import quote
    label = f"{issuer}:{account}"
    params = (
        f"secret={secret}"
        f"&issuer={quote(issuer)}"
        f"&algorithm=SHA1"
        f"&digits={_TOTP_DIGITS}"
        f"&period={_TOTP_STEP}"
    )
    return f"otpauth://totp/{quote(label)}?{params}"
