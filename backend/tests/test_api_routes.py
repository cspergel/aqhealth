"""API route tests using the async HTTP client fixture.

Tests that the mounted routes respond correctly, return expected shapes,
and enforce auth where required. Does NOT require a database — uses the
test client fixture from conftest.py.
"""

import pytest


# ---------------------------------------------------------------------------
# Health / OpenAPI (no auth required)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_openapi_schema(client):
    """OpenAPI schema is accessible and valid JSON."""
    resp = await client.get("/api/openapi.json")
    assert resp.status_code == 200
    data = resp.json()
    assert "paths" in data
    assert "info" in data


# ---------------------------------------------------------------------------
# Tuva endpoints (no auth required for demo)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tuva_status(client):
    """Tuva status endpoint responds without auth."""
    resp = await client.get("/api/tuva/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "available" in data
    assert "members_scored" in data
    assert "pipeline_ready" in data


@pytest.mark.asyncio
async def test_tuva_risk_scores(client):
    """Tuva risk scores endpoint returns expected shape."""
    resp = await client.get("/api/tuva/risk-scores")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "count" in data
    assert isinstance(data["items"], list)


@pytest.mark.asyncio
async def test_tuva_summary(client):
    """Tuva summary endpoint responds."""
    resp = await client.get("/api/tuva/summary")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_tuva_demo_suspects(client):
    """Tuva demo suspects endpoint responds."""
    resp = await client.get("/api/tuva/demo/suspects")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_suspects" in data or "status" in data


# ---------------------------------------------------------------------------
# Auth-required endpoints should reject unauthenticated requests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dashboard_requires_auth(client):
    """Dashboard endpoint should require authentication."""
    resp = await client.get("/api/dashboard")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_members_requires_auth(client):
    """Members endpoint should require authentication."""
    resp = await client.get("/api/members")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_hcc_suspects_requires_auth(client):
    """HCC suspects endpoint should require authentication."""
    resp = await client.get("/api/hcc/suspects")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_ingestion_requires_auth(client):
    """Ingestion jobs endpoint should require authentication."""
    resp = await client.get("/api/ingestion/jobs")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_care_gaps_requires_auth(client):
    """Care gaps endpoint should require authentication."""
    resp = await client.get("/api/care-gaps")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_providers_requires_auth(client):
    """Providers endpoint should require authentication."""
    resp = await client.get("/api/providers")
    assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# Admin endpoints should reject non-admin users
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tenants_requires_auth(client):
    """Tenant creation requires superadmin."""
    resp = await client.post("/api/tenants", json={"name": "test", "schema_name": "test_schema"})
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_data_protection_rollback_requires_auth(client):
    """Rollback requires admin role."""
    resp = await client.post("/api/data-protection/rollback/1", json={"reason": "test"})
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_adt_webhook_requires_secret(client):
    """ADT webhook requires webhook secret header."""
    resp = await client.post("/api/adt/webhook", json={"event_type": "admit"})
    # Should fail without X-Webhook-Secret header
    assert resp.status_code in (403, 422, 503)


# ---------------------------------------------------------------------------
# Process note endpoint (no auth for demo)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_process_note_rejects_short_text(client):
    """Process note should reject text shorter than 20 chars."""
    resp = await client.post("/api/tuva/process-note", params={"note_text": "short"})
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
