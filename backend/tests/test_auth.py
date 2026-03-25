import pytest
from app.services.auth_service import hash_password, verify_password, create_access_token, create_refresh_token, decode_token


def test_password_hashing():
    hashed = hash_password("test123")
    assert verify_password("test123", hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip():
    token = create_access_token(user_id=1, tenant_schema="sunstate", role="mso_admin")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["tenant"] == "sunstate"
    assert payload["role"] == "mso_admin"
    assert payload["type"] == "access"


def test_access_token_contains_correct_fields():
    token = create_access_token(user_id=42, tenant_schema="acme_health", role="analyst")
    payload = decode_token(token)
    assert "sub" in payload
    assert "tenant" in payload
    assert "role" in payload
    assert "exp" in payload
    assert "type" in payload
    assert payload["sub"] == "42"
    assert payload["tenant"] == "acme_health"
    assert payload["role"] == "analyst"
    assert payload["type"] == "access"


def test_refresh_token_has_refresh_type():
    token = create_refresh_token(user_id=7)
    payload = decode_token(token)
    assert payload["type"] == "refresh"
    assert payload["sub"] == "7"
    # Refresh tokens should NOT contain tenant or role
    assert "tenant" not in payload
    assert "role" not in payload


def test_create_access_token_with_no_tenant():
    """Superadmin case: tenant_schema is None."""
    token = create_access_token(user_id=1, tenant_schema=None, role="superadmin")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["tenant"] is None
    assert payload["role"] == "superadmin"
    assert payload["type"] == "access"


def test_password_hash_is_different_each_time():
    """bcrypt uses a random salt, so hashing the same password twice produces different hashes."""
    hash1 = hash_password("same_password")
    hash2 = hash_password("same_password")
    assert hash1 != hash2
    # But both should still verify correctly
    assert verify_password("same_password", hash1)
    assert verify_password("same_password", hash2)
