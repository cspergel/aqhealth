import contextlib

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, get_tenant_session
from app.services.auth_service import decode_token
from app.models.user import User, UserRole

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Extract and validate the current user from JWT token."""
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id = int(payload["sub"])

        # Re-verify user is still active AND re-derive tenant from current DB state.
        # This ensures that if a user is moved off a tenant, their existing JWT
        # no longer grants access to the old tenant.
        result = await session.execute(
            text("""
                SELECT u.is_active, u.role, u.tenant_id, t.schema_name, t.status
                FROM platform.users u
                LEFT JOIN platform.tenants t ON u.tenant_id = t.id
                WHERE u.id = :uid
            """),
            {"uid": user_id}
        )
        user_row = result.fetchone()
        if not user_row or not user_row.is_active:
            raise HTTPException(status_code=401, detail="Account disabled or not found")

        # Validate tenant is still active
        tenant_schema = user_row.schema_name
        if tenant_schema and user_row.status != "active":
            raise HTTPException(status_code=403, detail="Tenant is suspended or inactive")

        return {
            "user_id": user_id,
            "tenant_schema": tenant_schema,  # From current DB, not stale JWT
            "role": user_row.role,  # From current DB, not stale JWT
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_tenant_db(
    current_user: dict = Depends(get_current_user),
) -> AsyncSession:
    """Get a database session scoped to the current user's tenant.

    Delegates to `get_tenant_session`, which is itself an async generator
    that manages the session lifecycle (including cleanup on exit).
    """
    tenant_schema = current_user.get("tenant_schema")
    if not tenant_schema:
        raise HTTPException(status_code=403, detail="No tenant assigned")
    async with contextlib.asynccontextmanager(get_tenant_session)(tenant_schema) as session:
        yield session


def require_role(*roles: UserRole):
    """Dependency that checks the user has one of the required roles."""
    async def checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in [r.value for r in roles]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return checker
