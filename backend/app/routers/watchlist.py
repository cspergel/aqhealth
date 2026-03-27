"""
Watchlist API endpoints.

Personal monitoring lists with change detection alerts.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import watchlist_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class WatchlistAdd(BaseModel):
    entity_type: str = Field(..., description="member, provider, group, facility")
    entity_id: int
    entity_name: str
    reason: str | None = None
    watch_for: dict | None = None


class WatchlistItemOut(BaseModel):
    id: int
    user_id: int
    entity_type: str
    entity_id: int
    entity_name: str
    reason: str | None = None
    watch_for: dict | None = None
    last_snapshot: dict | None = None
    changes_detected: dict | None = None
    last_checked: str | None = None
    has_changes: bool
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[WatchlistItemOut])
async def get_watchlist(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Get the current user's watchlist with change indicators."""
    items = await watchlist_service.get_watchlist(db, current_user["user_id"])
    return [_item_to_dict(i) for i in items]


@router.post("", response_model=WatchlistItemOut, status_code=201)
async def add_to_watchlist(
    body: WatchlistAdd,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Add an entity to the user's watchlist."""
    item = await watchlist_service.add_to_watchlist(
        db=db,
        user_id=current_user["user_id"],
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        entity_name=body.entity_name,
        reason=body.reason,
        watch_for=body.watch_for,
    )
    return _item_to_dict(item)


@router.delete("/{item_id}", status_code=204)
async def remove_from_watchlist(
    item_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> None:
    """Remove an item from the user's watchlist."""
    success = await watchlist_service.remove_from_watchlist(
        db, current_user["user_id"], item_id
    )
    if not success:
        raise HTTPException(status_code=404, detail="Item not found")


@router.post("/check", response_model=list[dict])
async def check_for_changes(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Run change detection across all watched items."""
    return await watchlist_service.check_for_changes(db, current_user["user_id"])


@router.patch("/{item_id}/acknowledge", response_model=WatchlistItemOut)
async def acknowledge_changes(
    item_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Acknowledge changes on a watchlist item — resets the indicator."""
    item = await watchlist_service.acknowledge_changes(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Item not found")
    return _item_to_dict(item)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _item_to_dict(i) -> dict:
    return {
        "id": i.id,
        "user_id": i.user_id,
        "entity_type": i.entity_type,
        "entity_id": i.entity_id,
        "entity_name": i.entity_name,
        "reason": i.reason,
        "watch_for": i.watch_for,
        "last_snapshot": i.last_snapshot,
        "changes_detected": i.changes_detected,
        "last_checked": i.last_checked.isoformat() if i.last_checked else None,
        "has_changes": i.has_changes,
        "created_at": i.created_at.isoformat() if i.created_at else "",
    }
