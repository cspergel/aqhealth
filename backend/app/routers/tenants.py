"""
Tenant Management API endpoints.

Superadmin-only endpoints for creating, listing, and managing tenants.
Also includes tenant-scoped user management.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, create_tenant_schema, validate_schema_name
from app.dependencies import get_current_user, require_role
from app.models.tenant import Tenant, TenantStatus
from app.models.user import User, UserRole
from app.services.auth_service import hash_password

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    schema_name: str = Field(..., min_length=2, max_length=63)


class TenantOut(BaseModel):
    id: int
    name: str
    schema_name: str
    status: str
    created_at: str | None = None

    class Config:
        from_attributes = True


class TenantUpdateRequest(BaseModel):
    name: Optional[str] = None
    status: Optional[TenantStatus] = None
    config: Optional[dict] = None


class TenantUserCreateRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=8)
    full_name: str
    role: UserRole = UserRole.analyst


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Tenant CRUD (superadmin only)
# ---------------------------------------------------------------------------

@router.post("", status_code=status.HTTP_201_CREATED, response_model=TenantOut)
async def create_tenant(
    body: TenantCreateRequest,
    current_user: dict = Depends(require_role(UserRole.superadmin)),
    session: AsyncSession = Depends(get_session),
):
    """Create a new tenant, provision its schema, and run table creation."""
    # Validate schema name format
    try:
        validate_schema_name(body.schema_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check for duplicate schema_name
    existing = await session.execute(
        select(Tenant).where(Tenant.schema_name == body.schema_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Schema name already exists")

    # Create tenant record
    tenant = Tenant(
        name=body.name,
        schema_name=body.schema_name,
        status=TenantStatus.onboarding,
    )
    session.add(tenant)
    await session.flush()

    # Provision the database schema
    try:
        await create_tenant_schema(body.schema_name)
    except Exception as e:
        logger.error("Failed to provision schema %s: %s", body.schema_name, e)
        raise HTTPException(status_code=500, detail="Failed to provision tenant schema")

    await session.commit()
    await session.refresh(tenant)

    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        schema_name=tenant.schema_name,
        status=tenant.status.value,
        created_at=str(tenant.created_at) if tenant.created_at else None,
    )


@router.get("", response_model=list[TenantOut])
async def list_tenants(
    current_user: dict = Depends(require_role(UserRole.superadmin)),
    session: AsyncSession = Depends(get_session),
):
    """List all tenants (superadmin only)."""
    result = await session.execute(select(Tenant).order_by(Tenant.id))
    tenants = result.scalars().all()
    return [
        TenantOut(
            id=t.id,
            name=t.name,
            schema_name=t.schema_name,
            status=t.status.value,
            created_at=str(t.created_at) if t.created_at else None,
        )
        for t in tenants
    ]


@router.get("/{tenant_id}", response_model=TenantOut)
async def get_tenant(
    tenant_id: int,
    current_user: dict = Depends(require_role(UserRole.superadmin)),
    session: AsyncSession = Depends(get_session),
):
    """Get tenant detail (superadmin only)."""
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        schema_name=tenant.schema_name,
        status=tenant.status.value,
        created_at=str(tenant.created_at) if tenant.created_at else None,
    )


@router.patch("/{tenant_id}", response_model=TenantOut)
async def update_tenant(
    tenant_id: int,
    body: TenantUpdateRequest,
    current_user: dict = Depends(require_role(UserRole.superadmin)),
    session: AsyncSession = Depends(get_session),
):
    """Update tenant config or status (superadmin only)."""
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if body.name is not None:
        tenant.name = body.name
    if body.status is not None:
        tenant.status = body.status
    if body.config is not None:
        tenant.config = body.config

    await session.commit()
    await session.refresh(tenant)

    return TenantOut(
        id=tenant.id,
        name=tenant.name,
        schema_name=tenant.schema_name,
        status=tenant.status.value,
        created_at=str(tenant.created_at) if tenant.created_at else None,
    )


# ---------------------------------------------------------------------------
# Tenant user management
# ---------------------------------------------------------------------------

@router.post("/{tenant_id}/users", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def create_tenant_user(
    tenant_id: int,
    body: TenantUserCreateRequest,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a user in this tenant (superadmin or mso_admin of that tenant)."""
    # Authorization: superadmin can create users in any tenant;
    # mso_admin can only create users in their own tenant.
    if current_user["role"] == UserRole.superadmin.value:
        pass  # allowed
    elif current_user["role"] == UserRole.mso_admin.value:
        # mso_admin must belong to this tenant
        user_record = await session.get(User, current_user["user_id"])
        if not user_record or user_record.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage users in another tenant")
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Verify tenant exists
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Check for duplicate email
    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        tenant_id=tenant_id,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        is_active=user.is_active,
    )


@router.get("/{tenant_id}/users", response_model=list[UserOut])
async def list_tenant_users(
    tenant_id: int,
    current_user: dict = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List users for a tenant."""
    # Authorization: superadmin or mso_admin of that tenant
    if current_user["role"] == UserRole.superadmin.value:
        pass
    elif current_user["role"] == UserRole.mso_admin.value:
        user_record = await session.get(User, current_user["user_id"])
        if not user_record or user_record.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Cannot view users in another tenant")
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Verify tenant exists
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    result = await session.execute(
        select(User).where(User.tenant_id == tenant_id).order_by(User.id)
    )
    users = result.scalars().all()

    return [
        UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role.value,
            is_active=u.is_active,
        )
        for u in users
    ]
