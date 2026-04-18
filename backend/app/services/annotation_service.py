"""
Annotation / Notes service — CRUD for care coordination notes.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Annotation

logger = logging.getLogger(__name__)


async def add_annotation(
    db: AsyncSession,
    entity_type: str,
    entity_id: int,
    content: str,
    note_type: str,
    author_id: int,
    author_name: str,
    follow_up_date: date | None = None,
) -> Annotation:
    """Create a new annotation/note attached to an entity."""
    annotation = Annotation(
        entity_type=entity_type,
        entity_id=entity_id,
        content=content,
        note_type=note_type,
        author_id=author_id,
        author_name=author_name,
        requires_follow_up=follow_up_date is not None,
        follow_up_date=follow_up_date,
    )
    db.add(annotation)
    await db.commit()
    await db.refresh(annotation)
    logger.info(
        "Created annotation %d for %s/%d by user %d",
        annotation.id, entity_type, entity_id, author_id,
    )
    return annotation


async def get_annotations(
    db: AsyncSession,
    entity_type: str,
    entity_id: int,
) -> list[Annotation]:
    """Get all notes for an entity, pinned first then by date desc."""
    result = await db.execute(
        select(Annotation)
        .where(
            and_(
                Annotation.entity_type == entity_type,
                Annotation.entity_id == entity_id,
            )
        )
        .order_by(
            Annotation.is_pinned.desc(),
            Annotation.created_at.desc(),
        )
    )
    return list(result.scalars().all())


async def update_annotation(
    db: AsyncSession,
    annotation_id: int,
    content: str | None = None,
    is_pinned: bool | None = None,
    follow_up_completed: bool | None = None,
) -> Annotation | None:
    """Update an annotation's content, pin status, or follow-up status."""
    annotation = await db.get(Annotation, annotation_id)
    if not annotation:
        return None

    if content is not None:
        annotation.content = content
    if is_pinned is not None:
        annotation.is_pinned = is_pinned
    if follow_up_completed is not None:
        annotation.follow_up_completed = follow_up_completed

    await db.commit()
    await db.refresh(annotation)
    return annotation


async def delete_annotation(
    db: AsyncSession,
    annotation_id: int,
    user_id: int,
) -> bool:
    """Soft-delete an annotation — only the author can delete.

    We mark `deleted_at` / `deleted_by` instead of removing the row so that
    HIPAA §164.528 disclosure accounting and internal audit queries can
    still reconstruct who saw what and when. Read-paths must filter on
    `deleted_at IS NULL` to hide the row from the user.
    """
    annotation = await db.get(Annotation, annotation_id)
    if not annotation:
        return False
    if annotation.author_id != user_id:
        return False
    if annotation.deleted_at is not None:
        # Already soft-deleted; treat as idempotent success.
        return True

    annotation.deleted_at = datetime.now(timezone.utc)
    annotation.deleted_by = user_id
    await db.commit()
    return True


async def get_follow_ups_due(
    db: AsyncSession,
    user_id: int,
) -> list[Annotation]:
    """Get all notes with follow-up dates approaching or past due for a user."""
    cutoff = date.today() + timedelta(days=7)
    result = await db.execute(
        select(Annotation)
        .where(
            and_(
                Annotation.author_id == user_id,
                Annotation.requires_follow_up == True,  # noqa: E712
                Annotation.follow_up_completed == False,  # noqa: E712
                Annotation.follow_up_date <= cutoff,
            )
        )
        .order_by(Annotation.follow_up_date.asc())
    )
    return list(result.scalars().all())
