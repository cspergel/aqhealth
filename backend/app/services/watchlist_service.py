"""
Watchlist service — personal monitoring lists with change detection.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.watchlist import WatchlistItem
from app.models.member import Member
from app.models.provider import Provider
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.care_gap import MemberGap, GapStatus

logger = logging.getLogger(__name__)


async def add_to_watchlist(
    db: AsyncSession,
    user_id: int,
    entity_type: str,
    entity_id: int,
    entity_name: str,
    reason: str | None = None,
    watch_for: dict | None = None,
) -> WatchlistItem:
    """Add an entity to the user's watchlist with an initial snapshot."""
    # Take initial snapshot
    snapshot = await _take_snapshot(db, entity_type, entity_id)

    item = WatchlistItem(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        reason=reason,
        watch_for=watch_for,
        last_snapshot=snapshot,
        last_checked=datetime.now(timezone.utc),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    logger.info(
        "User %d added %s/%d to watchlist", user_id, entity_type, entity_id
    )
    return item


async def remove_from_watchlist(
    db: AsyncSession,
    user_id: int,
    item_id: int,
) -> bool:
    """Remove an item from the user's watchlist."""
    item = await db.get(WatchlistItem, item_id)
    if not item or item.user_id != user_id:
        return False
    await db.delete(item)
    await db.commit()
    return True


async def get_watchlist(
    db: AsyncSession,
    user_id: int,
) -> list[WatchlistItem]:
    """Get all watched items for a user with current change status."""
    result = await db.execute(
        select(WatchlistItem)
        .where(WatchlistItem.user_id == user_id)
        .order_by(
            WatchlistItem.has_changes.desc(),
            WatchlistItem.created_at.desc(),
        )
    )
    return list(result.scalars().all())


async def check_for_changes(
    db: AsyncSession,
    user_id: int,
) -> list[dict]:
    """Compare current state to snapshots for all watched items."""
    items = await get_watchlist(db, user_id)
    results = []

    for item in items:
        current = await _take_snapshot(db, item.entity_type, item.entity_id)
        changes = _detect_changes(item.last_snapshot or {}, current, item.watch_for)

        if changes:
            item.changes_detected = changes
            item.has_changes = True
        else:
            item.changes_detected = None
            item.has_changes = False

        item.last_checked = datetime.now(timezone.utc)
        results.append({
            "item_id": item.id,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "entity_name": item.entity_name,
            "has_changes": item.has_changes,
            "changes": changes,
        })

    await db.commit()
    return results


async def acknowledge_changes(
    db: AsyncSession,
    item_id: int,
) -> WatchlistItem | None:
    """User saw the changes — update snapshot and reset."""
    item = await db.get(WatchlistItem, item_id)
    if not item:
        return None

    # Take a fresh snapshot to become the new baseline
    current = await _take_snapshot(db, item.entity_type, item.entity_id)
    item.last_snapshot = current
    item.changes_detected = None
    item.has_changes = False
    item.last_checked = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(item)
    return item


# ---------------------------------------------------------------------------
# Snapshot & change detection helpers
# ---------------------------------------------------------------------------

async def _take_snapshot(
    db: AsyncSession,
    entity_type: str,
    entity_id: int,
) -> dict:
    """Take a snapshot of key metrics for an entity."""
    if entity_type == "member":
        member = await db.get(Member, entity_id)
        if not member:
            return {}

        # Count open suspects
        suspect_q = await db.execute(
            select(func.count(HccSuspect.id)).where(
                HccSuspect.member_id == entity_id,
                HccSuspect.status == SuspectStatus.open.value,
            )
        )
        suspect_count = suspect_q.scalar() or 0

        # Count open gaps
        gap_q = await db.execute(
            select(func.count(MemberGap.id)).where(
                MemberGap.member_id == entity_id,
                MemberGap.status == GapStatus.open.value,
            )
        )
        gap_count = gap_q.scalar() or 0

        return {
            "raf": float(member.current_raf) if member.current_raf else 0,
            "projected_raf": float(member.projected_raf) if member.projected_raf else 0,
            "open_suspects": suspect_count,
            "open_gaps": gap_count,
            "risk_tier": member.risk_tier if member.risk_tier else None,
        }

    elif entity_type == "provider":
        provider = await db.get(Provider, entity_id)
        if not provider:
            return {}
        return {
            "capture_rate": float(provider.capture_rate) if provider.capture_rate else 0,
            "recapture_rate": float(provider.recapture_rate) if provider.recapture_rate else 0,
            "panel_size": provider.panel_size or 0,
            "gap_closure_rate": float(provider.gap_closure_rate) if provider.gap_closure_rate else 0,
        }

    return {}


def _detect_changes(
    old: dict,
    new: dict,
    watch_for: dict | None,
) -> dict | None:
    """Compare old and new snapshots and return detected changes."""
    changes = {}

    for key in new:
        old_val = old.get(key)
        new_val = new.get(key)
        if old_val != new_val and old_val is not None:
            changes[key] = {"old": old_val, "new": new_val}

    if not changes:
        return None

    # If watch_for is specified, only keep relevant changes
    if watch_for:
        filtered = {}
        key_mapping = {
            "raf_change": ["raf", "projected_raf"],
            "gap_closed": ["open_gaps"],
            "gap_opened": ["open_gaps"],
            "suspect_captured": ["open_suspects"],
            "capture_rate_change": ["capture_rate"],
        }
        watched_keys = set()
        for watch_key, data_keys in key_mapping.items():
            if watch_for.get(watch_key):
                watched_keys.update(data_keys)

        for key, change in changes.items():
            if key in watched_keys:
                filtered[key] = change

        return filtered if filtered else None

    return changes
