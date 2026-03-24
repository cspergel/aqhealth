import pytest
from app.services.auth_service import hash_password, verify_password, create_access_token, decode_token


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
