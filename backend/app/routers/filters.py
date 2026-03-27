"""
Universal Filter API endpoints — provides field definitions, filter CRUD,
and filter application across all page contexts.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.filter_service import (
    get_available_fields,
    save_filter,
    get_saved_filters,
    delete_filter,
    apply_filter,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/filters", tags=["filters"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class FilterFieldOut(BaseModel):
    field: str
    label: str
    type: str
    operators: list[str]
    options: list[str] | None = None


class SaveFilterIn(BaseModel):
    name: str
    description: str | None = None
    page_context: str
    conditions: dict
    is_shared: bool = False


class SavedFilterOut(BaseModel):
    id: int
    name: str
    description: str | None
    page_context: str
    conditions: dict
    created_by: int
    is_shared: bool
    is_system: bool
    use_count: int
    last_used: str | None


class ApplyFilterIn(BaseModel):
    page_context: str
    conditions: dict


class ApplyFilterOut(BaseModel):
    applied: bool
    conditions: dict
    context: str


# ---------------------------------------------------------------------------
# GET /api/filters/fields?context=members
# ---------------------------------------------------------------------------

@router.get("/fields", response_model=list[FilterFieldOut])
async def filter_fields(
    context: str = Query(..., description="Page context: members, suspects, etc."),
    current_user: dict = Depends(get_current_user),
):
    """Return available filterable fields for a page context."""
    fields = get_available_fields(context)
    if not fields:
        raise HTTPException(status_code=400, detail=f"Unknown page context: {context}")
    return fields


# ---------------------------------------------------------------------------
# GET /api/filters?context=members — saved filters for a page
# ---------------------------------------------------------------------------

@router.get("", response_model=list[SavedFilterOut])
async def list_saved_filters(
    context: str = Query(..., description="Page context"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return saved filters for a page (user's own + shared + system)."""
    user_id = current_user["user_id"]
    return await get_saved_filters(db, context, user_id)


# ---------------------------------------------------------------------------
# POST /api/filters — save a new filter
# ---------------------------------------------------------------------------

@router.post("", response_model=SavedFilterOut)
async def create_filter(
    body: SaveFilterIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Save a new custom filter."""
    user_id = current_user["user_id"]
    data = body.model_dump()
    data["created_by"] = user_id
    sf = await save_filter(db, data)
    return {
        "id": sf.id,
        "name": sf.name,
        "description": sf.description,
        "page_context": sf.page_context,
        "conditions": sf.conditions,
        "created_by": sf.created_by,
        "is_shared": sf.is_shared,
        "is_system": sf.is_system,
        "use_count": sf.use_count,
        "last_used": sf.last_used.isoformat() if sf.last_used else None,
    }


# ---------------------------------------------------------------------------
# DELETE /api/filters/{id}
# ---------------------------------------------------------------------------

@router.delete("/{filter_id}")
async def remove_filter(
    filter_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Delete a user-created filter (system filters are protected)."""
    user_id = current_user["user_id"]
    deleted = await delete_filter(db, filter_id, user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Filter not found or cannot be deleted")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# POST /api/filters/apply — preview filter match count
# ---------------------------------------------------------------------------

@router.post("/apply", response_model=ApplyFilterOut)
async def apply_filter_preview(
    body: ApplyFilterIn,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Apply filter conditions and return match info."""
    return await apply_filter(db, body.page_context, body.conditions)
