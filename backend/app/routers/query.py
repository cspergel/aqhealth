"""
Conversational AI Query router — "Ask the Data" endpoints.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services.query_service import answer_question, log_query_feedback, suggest_questions

# Conversational AI query — intelligence section. Open to all business roles.
router = APIRouter(
    prefix="/api/query",
    tags=["query"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.provider,
        UserRole.care_manager,
        UserRole.outreach,
        UserRole.auditor,
        UserRole.financial,
    ))],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    page_context: str | None = None


class QueryFeedbackRequest(BaseModel):
    question: str
    answer: str
    feedback: str  # "positive" or "negative"
    corrected_answer: str | None = None


class QueryFeedbackResponse(BaseModel):
    status: str
    message: str


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


@router.post("/feedback", response_model=QueryFeedbackResponse)
async def submit_feedback(
    body: QueryFeedbackRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Submit feedback on an AI query answer to improve future responses.

    Accepts ``"positive"`` or ``"negative"`` feedback.  When negative,
    an optional ``corrected_answer`` teaches the system the right answer.
    """
    if body.feedback not in ("positive", "negative"):
        return QueryFeedbackResponse(
            status="error",
            message="feedback must be 'positive' or 'negative'",
        )

    await log_query_feedback(
        db=db,
        question=body.question,
        ai_answer=body.answer,
        user_feedback=body.feedback,
        corrected_answer=body.corrected_answer,
        tenant_schema=current_user["tenant_schema"],
    )
    await db.commit()

    return QueryFeedbackResponse(
        status="ok",
        message="Feedback recorded. The system will learn from this correction."
        if body.feedback == "negative" and body.corrected_answer
        else "Feedback recorded. Thank you!",
    )
