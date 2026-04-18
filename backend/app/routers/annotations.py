"""
Annotations / Notes API endpoints.

CRUD for care coordination notes attached to any entity (member, provider,
group, facility, suspect, alert, insight).
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import annotation_service

logger = logging.getLogger(__name__)

# Annotations span every entity; broadly readable by business/clinical roles.
router = APIRouter(
    prefix="/api/annotations",
    tags=["annotations"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.provider,
        UserRole.auditor,
        UserRole.outreach,
        UserRole.financial,
    ))],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AnnotationCreate(BaseModel):
    entity_type: str = Field(..., description="member, provider, group, etc.")
    entity_id: int
    content: str
    note_type: str = "general"
    follow_up_date: date | None = None


class AnnotationUpdate(BaseModel):
    content: str | None = None
    is_pinned: bool | None = None
    follow_up_completed: bool | None = None


class AnnotationOut(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    content: str
    note_type: str
    author_id: int
    author_name: str
    requires_follow_up: bool
    follow_up_date: date | None = None
    follow_up_completed: bool
    is_pinned: bool
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[AnnotationOut])
async def list_annotations(
    entity_type: str = Query(..., description="Entity type"),
    entity_id: int = Query(..., description="Entity ID"),
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Get all notes for an entity, pinned first then by date desc."""
    annotations = await annotation_service.get_annotations(
        db, entity_type, entity_id
    )
    return [_annotation_to_dict(a) for a in annotations]


@router.post("", response_model=AnnotationOut, status_code=201)
async def create_annotation(
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new note attached to an entity."""
    annotation = await annotation_service.add_annotation(
        db=db,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        content=body.content,
        note_type=body.note_type,
        author_id=current_user["user_id"],
        author_name=current_user.get("name", f"User {current_user['user_id']}"),
        follow_up_date=body.follow_up_date,
    )
    return _annotation_to_dict(annotation)


@router.patch("/{annotation_id}", response_model=AnnotationOut)
async def update_annotation(
    annotation_id: int,
    body: AnnotationUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update a note (edit, pin, mark follow-up complete). Only the author can edit content."""
    # Check ownership for content edits
    if body.content is not None:
        from app.models.annotation import Annotation
        existing = await db.get(Annotation, annotation_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Annotation not found")
        if existing.author_id != current_user["user_id"]:
            raise HTTPException(status_code=403, detail="Only the author can edit annotation content")

    annotation = await annotation_service.update_annotation(
        db=db,
        annotation_id=annotation_id,
        content=body.content,
        is_pinned=body.is_pinned,
        follow_up_completed=body.follow_up_completed,
    )
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return _annotation_to_dict(annotation)


@router.delete("/{annotation_id}", status_code=204)
async def delete_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> None:
    """Delete a note — only the author can delete."""
    success = await annotation_service.delete_annotation(
        db, annotation_id, current_user["user_id"]
    )
    if not success:
        raise HTTPException(
            status_code=403,
            detail="Not found or you are not the author",
        )


@router.get("/follow-ups", response_model=list[AnnotationOut])
async def follow_ups_due(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Get all due/overdue follow-ups for the current user."""
    annotations = await annotation_service.get_follow_ups_due(
        db, current_user["user_id"]
    )
    return [_annotation_to_dict(a) for a in annotations]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _annotation_to_dict(a) -> dict:
    return {
        "id": a.id,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "content": a.content,
        "note_type": a.note_type,
        "author_id": a.author_id,
        "author_name": a.author_name,
        "requires_follow_up": a.requires_follow_up,
        "follow_up_date": str(a.follow_up_date) if a.follow_up_date else None,
        "follow_up_completed": a.follow_up_completed,
        "is_pinned": a.is_pinned,
        "created_at": a.created_at.isoformat() if a.created_at else "",
        "updated_at": a.updated_at.isoformat() if a.updated_at else "",
    }
