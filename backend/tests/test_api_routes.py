"""API route tests using the async HTTP client fixture.

Tests that the mounted routes respond correctly, return expected shapes,
and enforce auth where required. Does NOT require a database — uses the
test client fixture from conftest.py.

Note: the Tuva router used to serve anonymous traffic under DEMO_MODE=true.
That bypass was removed (see `reviews/readiness-security.md`). Tests that
used to assert anonymous 200s now assert that the router requires auth.
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
# Tuva endpoints — now require auth (DEMO_MODE anon bypass removed)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tuva_status_requires_auth(client):
    """Tuva status must reject anonymous callers."""
    resp = await client.get("/api/tuva/status")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_risk_scores_requires_auth(client):
    resp = await client.get("/api/tuva/risk-scores")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_summary_requires_auth(client):
    resp = await client.get("/api/tuva/summary")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_demo_suspects_requires_auth(client):
    resp = await client.get("/api/tuva/demo/suspects")
    assert resp.status_code in (401, 403)


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
async def test_adt_webhook_rejects_missing_signature(client):
    """ADT webhook requires an HMAC signature. Missing = 401/403.

    The webhook endpoint is one of a handful of anonymous (non-JWT) routes;
    it authenticates via HMAC signature instead.
    """
    resp = await client.post("/api/adt/webhook", json={"event_type": "admit"})
    assert resp.status_code in (400, 401, 403, 422)


# ---------------------------------------------------------------------------
# Post-RBAC-sweep: every Tuva route requires auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_process_note_requires_auth(client):
    """Clinical note processing moved behind auth + PHI scrubber."""
    resp = await client.post("/api/tuva/process-note", params={"note_text": "short"})
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_comparison_requires_auth(client):
    resp = await client.get("/api/tuva/comparison")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_population_opportunities_requires_auth(client):
    resp = await client.get("/api/tuva/population-opportunities")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_convergence_requires_auth(client):
    resp = await client.get("/api/tuva/convergence")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_tuva_stale_suspects_requires_auth(client):
    resp = await client.get("/api/tuva/stale-suspects")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Export endpoints require auth
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_providers_export_requires_auth(client):
    """Provider export requires authentication."""
    resp = await client.get("/api/providers/export")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_expenditure_export_requires_auth(client):
    """Expenditure export requires authentication."""
    resp = await client.get("/api/expenditure/export")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_care_gaps_export_requires_auth(client):
    """Care gaps export requires authentication."""
    resp = await client.get("/api/care-gaps/export")
    assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# Onboarding / dashboard summary endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dashboard_summary_requires_auth(client):
    """Dashboard summary requires auth."""
    resp = await client.get("/api/dashboard/summary")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_data_quality_summary_requires_auth(client):
    """Data quality summary requires auth."""
    resp = await client.get("/api/data-quality/summary")
    assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# Interface and ADT admin endpoints require admin role
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_interface_requires_auth(client):
    """Interface creation requires admin role."""
    resp = await client.post("/api/interfaces", json={"name": "test"})
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_create_adt_source_requires_auth(client):
    """ADT source creation requires admin role."""
    resp = await client.post("/api/adt/sources", json={"name": "test"})
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_data_protection_contract_requires_auth(client):
    """Data protection contract creation requires admin role."""
    resp = await client.post("/api/data-protection/contracts", json={"name": "test"})
    assert resp.status_code in (401, 403, 422)


# ---------------------------------------------------------------------------
# Payer API endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_payer_status_requires_auth(client):
    """Payer status requires auth."""
    resp = await client.get("/api/payer/status")
    assert resp.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_payer_available_requires_auth(client):
    """Available payers requires auth."""
    resp = await client.get("/api/payer/available")
    assert resp.status_code in (401, 403, 422)
