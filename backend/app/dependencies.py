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

        # Re-verify user is still active (lightweight query)
        result = await session.execute(
            text("SELECT is_active, role FROM platform.users WHERE id = :uid"),
            {"uid": user_id}
        )
        user_row = result.fetchone()
        if not user_row or not user_row.is_active:
            raise HTTPException(status_code=401, detail="Account disabled or not found")

        return {
            "user_id": user_id,
            "tenant_schema": payload.get("tenant"),
            "role": user_row.role,  # Use CURRENT role from DB, not JWT
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
