"""
Conversational AI Query router — "Ask the Data" endpoints.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.query_service import answer_question, suggest_questions

router = APIRouter(prefix="/api/query", tags=["query"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    page_context: str | None = None


class DataPoint(BaseModel):
    label: str
    value: str


class RelatedMember(BaseModel):
    id: str
    name: str
    reason: str


class AskResponse(BaseModel):
    answer: str
    data_points: list[DataPoint]
    related_members: list[RelatedMember]
    recommended_actions: list[str]
    follow_up_questions: list[str]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Answer a natural-language question about the population data."""
    result = await answer_question(
        db, body.question, body.page_context,
        tenant_schema=current_user["tenant_schema"],
    )
    return AskResponse(**result)


@router.get("/suggestions", response_model=list[str])
async def suggestions(
    context: str = Query("dashboard"),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return suggested questions for the given page context."""
    return suggest_questions(db, context)
