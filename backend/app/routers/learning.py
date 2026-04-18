"""
Learning System API — prediction accuracy, learning reports,
user interaction tracking, and preference analytics.
All endpoints are tenant-scoped via JWT auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import learning_service

logger = logging.getLogger(__name__)

# Learning system — intelligence section.
router = APIRouter(
    prefix="/api/learning",
    tags=["learning"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.auditor,
    ))],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TrackInteractionRequest(BaseModel):
    interaction_type: str = Field(..., description="view, bookmark, dismiss, act_on, ask_question, export, capture")
    target_type: str = Field(..., description="insight, suspect, playbook, chase_list, query")
    target_id: int | None = None
    page_context: str | None = None
    metadata: dict | None = None


class TrackInteractionResponse(BaseModel):
    id: int
    interaction_type: str
    target_type: str
    success: bool = True


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/accuracy")
async def prediction_accuracy(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Evaluate predictions and return accuracy dashboard data."""
    return await learning_service.evaluate_predictions(db)


@router.get("/report")
async def learning_report(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """AI-generated learning report with accuracy trends and lessons."""
    return await learning_service.generate_learning_report(db, tenant_schema=current_user["tenant_schema"])


@router.get("/interactions")
async def interaction_analytics(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """User interaction analytics and preference model."""
    return await learning_service.get_user_preference_model(db)


@router.post("/track", response_model=TrackInteractionResponse)
async def track_interaction(
    body: TrackInteractionRequest,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Record a user interaction for the learning system."""
    interaction = await learning_service.track_user_interaction(
        db=db,
        user_id=current_user["user_id"],
        interaction_type=body.interaction_type,
        target_type=body.target_type,
        target_id=body.target_id,
        page_context=body.page_context,
        metadata=body.metadata,
    )
    return {
        "id": interaction.id,
        "interaction_type": interaction.interaction_type,
        "target_type": interaction.target_type,
        "success": True,
    }
