"""Health endpoint tests.

/health/live should always 200 (process liveness, no I/O).
/health/ready probes DB + Redis — in the test harness those aren't
running, so 503 is the correct response. We assert on the shape, not
on "ok".
"""

import pytest


@pytest.mark.asyncio
async def test_liveness_always_ok(client):
    """/health/live is constant-time, no I/O, should always 200."""
    response = await client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "live"


@pytest.mark.asyncio
async def test_readiness_reports_dependencies(client):
    """/health/ready surfaces DB + Redis state regardless of whether
    they're reachable. In the test env the probes usually fail, and
    503 is the correct response — but the JSON shape must be stable."""
    response = await client.get("/health/ready")
    assert response.status_code in (200, 503)
    data = response.json()
    assert data["status"] in ("ready", "unready")
    assert "checks" in data
    assert "db" in data["checks"]
    assert "redis" in data["checks"]


@pytest.mark.asyncio
async def test_api_health_compat(client):
    """Backwards-compat /api/health returns the same shape as /ready."""
    response = await client.get("/api/health")
    assert response.status_code in (200, 503)
    data = response.json()
    assert "status" in data
    assert "checks" in data


@pytest.mark.asyncio
async def test_openapi_endpoint_accessible(client):
    response = await client.get("/api/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "paths" in data
    assert "info" in data
    assert data["info"]["title"] == "AQSoft Health Platform"
