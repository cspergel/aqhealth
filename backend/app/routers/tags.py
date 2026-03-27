"""Tag management endpoints — CRUD for tags and entity-tag associations."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.models.tag import Tag, EntityTag

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tags", tags=["tags"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TagCreate(BaseModel):
    name: str
    color: str | None = None
    category: str | None = None


class TagOut(BaseModel):
    id: int
    name: str
    color: str | None = None
    category: str | None = None


class ApplyTagIn(BaseModel):
    tag_id: int
    entity_type: str
    entity_id: int


class EntityTagOut(BaseModel):
    id: int
    tag_id: int
    tag_name: str
    entity_type: str
    entity_id: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[TagOut])
async def list_tags(
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """List all tags."""
    result = await db.execute(select(Tag).order_by(Tag.name))
    tags = result.scalars().all()
    return [TagOut(id=t.id, name=t.name, color=t.color, category=t.category) for t in tags]


@router.post("", response_model=TagOut, status_code=201)
async def create_tag(
    body: TagCreate,
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    """Create a new tag."""
    tag = Tag(
        name=body.name,
        color=body.color,
        category=body.category,
        created_by=user.get("user_id"),
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagOut(id=tag.id, name=tag.name, color=tag.color, category=tag.category)


@router.post("/apply", response_model=EntityTagOut, status_code=201)
async def apply_tag(
    body: ApplyTagIn,
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    """Apply a tag to an entity."""
    # Verify tag exists
    tag_result = await db.execute(select(Tag).where(Tag.id == body.tag_id))
    tag = tag_result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    entity_tag = EntityTag(
        tag_id=body.tag_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        applied_by=user.get("user_id"),
    )
    db.add(entity_tag)
    await db.commit()
    await db.refresh(entity_tag)
    return EntityTagOut(
        id=entity_tag.id,
        tag_id=entity_tag.tag_id,
        tag_name=tag.name,
        entity_type=entity_tag.entity_type,
        entity_id=entity_tag.entity_id,
    )


@router.get("/entity", response_model=list[EntityTagOut])
async def get_entity_tags(
    type: str = Query(..., description="Entity type, e.g. member, provider"),
    id: int = Query(..., description="Entity ID"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Get all tags for a specific entity."""
    result = await db.execute(
        select(EntityTag, Tag)
        .join(Tag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == type, EntityTag.entity_id == id)
    )
    rows = result.all()
    return [
        EntityTagOut(
            id=et.id,
            tag_id=et.tag_id,
            tag_name=tag.name,
            entity_type=et.entity_type,
            entity_id=et.entity_id,
        )
        for et, tag in rows
    ]


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    _user: dict = Depends(get_current_user),
):
    """Delete a tag and all its entity associations."""
    tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = tag_result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Remove all entity associations first
    await db.execute(delete(EntityTag).where(EntityTag.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
