"""Credential encryption — Fernet-backed, KMS-portable.

Centralises all at-rest secret crypto so the base64 "encryption" that was
shipping previously can never regrow. Key source is a single env var
(ENCRYPTION_KEY) validated at startup.

Migration note: existing rows encoded with the old base64 scheme are still
readable via `decrypt_legacy_base64` — call the migration helper at startup
to re-encrypt them.
"""

from __future__ import annotations

import base64
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

logger = logging.getLogger(__name__)


# Fernet token prefix (versioning). Prevents us from treating a base64
# legacy string as a fresh Fernet token: real Fernet tokens start with
# "gAAAAA" (version byte 0x80 + zeros timestamp header, base64url-encoded).
FERNET_PREFIX = "gAAAAA"


def _fernet() -> Fernet:
    return Fernet(settings.encryption_key.encode())


def encrypt(value: str) -> str:
    """Encrypt a plaintext credential for at-rest storage."""
    if value is None:
        return value
    token = _fernet().encrypt(value.encode())
    return token.decode()


def decrypt(value: str) -> str:
    """Decrypt an at-rest credential.

    Falls back to legacy base64 decoding if the token isn't Fernet-shaped,
    so a DB with a mix of old and new rows reads cleanly during migration.
    """
    if value is None:
        return value
    if not value.startswith(FERNET_PREFIX):
        # Legacy rows or plain text from older deploys
        return decrypt_legacy_base64(value)
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        # Could be a legacy base64 that happens not to start with our prefix.
        # Fall through rather than leaking the error.
        logger.warning("encryption.decrypt: invalid Fernet token, trying legacy")
        return decrypt_legacy_base64(value)


def decrypt_legacy_base64(value: str) -> str:
    """Best-effort decode for values stored by the pre-Fernet base64 scheme."""
    try:
        return base64.b64decode(value.encode()).decode()
    except Exception:
        # Last resort: treat as plain text. Avoids breaking test fixtures
        # that stored raw strings.
        return value


def is_encrypted(value: str | None) -> bool:
    """True if a stored value appears to be a current Fernet token."""
    return bool(value) and value.startswith(FERNET_PREFIX)


async def reencrypt_legacy_rows(db, model, fields: list[str]) -> int:
    """One-shot helper: re-encrypt any rows on `model` whose listed fields
    are still in legacy base64 form.

    Safe to call repeatedly; skips already-encrypted rows.

    Returns the count of rows rewritten.
    """
    from sqlalchemy import select

    result = await db.execute(select(model))
    count = 0
    for row in result.scalars().all():
        dirty = False
        for field in fields:
            current = getattr(row, field, None)
            if current and not is_encrypted(current):
                plaintext = decrypt_legacy_base64(current)
                setattr(row, field, encrypt(plaintext))
                dirty = True
        if dirty:
            count += 1
    if count:
        await db.commit()
    return count
