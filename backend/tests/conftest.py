"""
Shared test fixtures for the AQSoft Health Platform backend.

Provides:
- event_loop: session-scoped event loop for async tests
- test_engine: session-scoped async SQLAlchemy engine (skips if Postgres unavailable)
- db_session: per-test database session with rollback
- client: async HTTP test client for API endpoint tests (no DB required)

Import strategy: heavy imports (app.main, sqlalchemy engine) are deferred
into the fixtures that need them, so unit tests that only import individual
services are not blocked by missing infrastructure dependencies.
"""

from __future__ import annotations

import asyncio

import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def test_engine():
    """Create test database engine. Falls back gracefully if Postgres isn't available."""
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        from app.config import settings

        test_db_url = settings.database_url.replace("/aqsoft_health", "/aqsoft_health_test")
        engine = create_async_engine(test_db_url, echo=False)
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        yield engine
        await engine.dispose()
    except Exception:
        pytest.skip("PostgreSQL not available -- skipping integration tests")


@pytest.fixture(scope="session")
async def _create_tables(test_engine):
    """Create all tables once per session, drop them after."""
    from app.models.base import Base

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session(test_engine, _create_tables):
    """Provide a clean database session for each test.

    Uses a nested transaction (SAVEPOINT) so each test's changes
    are rolled back without affecting other tests.
    """
    from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession

    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest.fixture
async def client():
    """Async test client for API endpoint tests. Does NOT require a database.

    Disposes the SQLAlchemy engine after the test to prevent connection
    leaks from demo session endpoints that don't use context managers.
    """
    try:
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

        # Clean up any leaked database connections from demo endpoints
        try:
            from app.database import engine
            await engine.dispose()
        except Exception:
            pass
    except Exception as exc:
        pytest.skip(f"Could not create test client: {exc}")
