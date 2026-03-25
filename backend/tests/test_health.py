import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_returns_version(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_openapi_endpoint_accessible(client):
    response = await client.get("/api/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "paths" in data
    assert "info" in data
    assert data["info"]["title"] == "AQSoft Health Platform"
