"""
Conversational AI Query Service.

Takes natural-language questions and returns AI-powered answers
with data points, related members, recommended actions, and follow-up questions.

Includes a self-learning feedback loop: user corrections are stored and
injected into future prompts so the AI improves over time.
"""

import json
import logging
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.learning import QueryFeedback
from app.services.llm_guard import guarded_llm_call

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Suggested questions per page context
# ---------------------------------------------------------------------------

SUGGESTED_QUESTIONS: dict[str, list[str]] = {
    "dashboard": [
        "What are the biggest revenue opportunities this quarter?",
        "Which providers need the most improvement in capture rate?",
        "What's driving our MLR above target?",
        "How does our recapture rate compare to benchmarks?",
        "Which care gaps have the highest financial impact?",
    ],
    "expenditure": [
        "Which facility has the highest readmission rate?",
        "What's driving pharmacy cost increases?",
        "Which patients could be redirected from ER to urgent care?",
        "How does our inpatient PMPM compare to benchmark?",
        "What are the top 5 high-cost claimants this year?",
    ],
    "suspects": [
        "Which suspect HCCs have the highest RAF value?",
        "How many diabetic patients have unconfirmed complications?",
        "Which providers have the most suspect HCC opportunities?",
        "What's the total revenue at risk from unconfirmed suspects?",
        "Show me patients with 3+ suspect conditions",
    ],
    "providers": [
        "Which providers have improved capture rate the most?",
        "Who are the bottom performers in gap closure?",
        "How does Dr. Patel compare to network averages?",
        "What's the correlation between panel size and capture rate?",
        "Which providers would benefit most from coding education?",
    ],
    "groups": [
        "Which group has the best cost performance?",
        "How do group PMPM trends compare year-over-year?",
        "Which group has the most room for RAF improvement?",
    ],
    "care-gaps": [
        "Which care gaps have the lowest closure rate?",
        "How many diabetic patients are missing eye exams?",
        "What's the financial impact of open care gaps?",
        "Which measures improved the most this quarter?",
    ],
    "intelligence": [
        "What coding patterns differentiate top performers?",
        "Which playbook interventions have the best ROI?",
        "What are the most common coding errors?",
    ],
}


# ---------------------------------------------------------------------------
# Stop-words excluded from keyword extraction
# ---------------------------------------------------------------------------

_STOP_WORDS = frozenset(
    "a an the is are was were be been am do does did has have had "
    "will would shall should can could may might must of in on at to for "
    "with by from and or not but if then else so because about between "
    "through after before during without what which who whom how where "
    "when why all each every some any no my our your their its this that "
    "these those i me we you he she it they him her us them".split()
)


def _extract_keywords(text: str) -> set[str]:
    """Return a set of meaningful lowercase tokens from *text*."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {t for t in tokens if t not in _STOP_WORDS and len(t) > 1}


# ---------------------------------------------------------------------------
# Self-learning: log feedback & retrieve past learnings
# ---------------------------------------------------------------------------


async def log_query_feedback(
    db: AsyncSession,
    question: str,
    ai_answer: str,
    user_feedback: str,
    corrected_answer: str | None = None,
    tenant_schema: str = "default",
) -> QueryFeedback:
    """Persist user feedback on an AI-generated query answer.

    Args:
        db: Async database session.
        question: The original natural-language question.
        ai_answer: The AI-generated answer that was shown to the user.
        user_feedback: ``"positive"`` or ``"negative"``.
        corrected_answer: Optional user-supplied correct answer or SQL.
        tenant_schema: Tenant identifier for multi-tenant isolation.

    Returns:
        The persisted ``QueryFeedback`` row.
    """
    keywords = " ".join(sorted(_extract_keywords(question)))

    record = QueryFeedback(
        tenant_schema=tenant_schema,
        question=question,
        ai_answer=ai_answer,
        feedback=user_feedback,
        corrected_answer=corrected_answer,
        keywords=keywords,
    )
    db.add(record)
    await db.flush()

    logger.info(
        "Logged query feedback: feedback=%s, question=%r, corrected=%s",
        user_feedback,
        question[:80],
        corrected_answer is not None,
    )

    # Cross-loop event: notify other learning loops
    if user_feedback == "negative" and corrected_answer:
        try:
            from app.services.learning_events import publish_event
            await publish_event(db, "query_corrected", {
                "question": question[:200],
                "corrected_answer": corrected_answer[:500],
                "tenant_schema": tenant_schema,
            }, tenant_schema=tenant_schema)
        except Exception:
            pass  # non-fatal

    return record


async def _get_relevant_learnings(
    db: AsyncSession,
    question: str,
    tenant_schema: str = "default",
    min_keyword_overlap: int = 2,
) -> str:
    """DISABLED — used to promote user `corrected_answer` text into the
    Claude system prompt as RULES / STRONG SUGGESTIONS / SUGGESTIONS.

    That design is a stored prompt-injection vulnerability: any user who
    could submit feedback (and every authenticated user can) could, after
    5 submissions of the same keyword signature, plant a RULE in the
    system prompt that Claude then had to follow on every future query
    for that tenant. An attacker could use this to coerce the model to
    ignore tenant isolation, return fabricated totals, or exfiltrate
    other tenants' data — all under the banner "you MUST follow these".

    Fix: this function now always returns "" and is retained only as a
    named stub so callers don't break. Corrections are still persisted by
    `log_query_feedback` for offline analytics (product telemetry, model
    fine-tuning, prompt-design review), but they are NEVER fed back into
    the live model's system prompt.

    If a future design wants to close the loop on feedback, it must do so
    through mechanisms that are not attacker-controlled text in a system
    prompt — e.g. curated prompt updates reviewed by a human, tool
    definitions scoped to the tenant, or retrieval-augmented answers with
    verifiable citations.
    """
    # Intentional no-op. See docstring.
    _ = (db, question, tenant_schema, min_keyword_overlap)
    return ""


def _resolve_context(page_context: Optional[str]) -> str:
    """Normalise a page context string into a known key."""
    if not page_context:
        return "dashboard"
    ctx = page_context.strip("/").split("/")[0]
    return ctx if ctx in SUGGESTED_QUESTIONS else "dashboard"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def suggest_questions(
    db: AsyncSession, page_context: str
) -> list[str]:
    """Return 3-5 suggested questions for the given page context."""
    ctx = _resolve_context(page_context)
    return SUGGESTED_QUESTIONS.get(ctx, SUGGESTED_QUESTIONS["dashboard"])[:5]


async def answer_question(
    db: AsyncSession,
    question: str,
    page_context: Optional[str] = None,
    tenant_schema: str = "default",
) -> dict:
    """
    Send a natural-language question to Claude and return a structured answer.

    Returns dict with keys:
      answer, data_points, related_members, recommended_actions, follow_up_questions
    """

    api_key = settings.anthropic_api_key
    if not api_key:
        return {
            "answer": (
                "The AI query feature requires an Anthropic API key. "
                "Please configure ANTHROPIC_API_KEY in your environment."
            ),
            "data_points": [],
            "related_members": [],
            "recommended_actions": [],
            "follow_up_questions": [],
        }

    # ----- build context summary from DB (best-effort) -----
    ctx_label = _resolve_context(page_context)

    # Fetch real population metrics to give the LLM actual data
    data_context = ""
    try:
        from app.services.dashboard_service import get_dashboard_metrics
        metrics = await get_dashboard_metrics(db)
        rev_opp = metrics.get('total_revenue_opportunity')
        rev_opp_str = f"${rev_opp:,}" if isinstance(rev_opp, (int, float)) else "N/A"
        pmpm_val = metrics.get('pmpm')
        pmpm_str = f"${pmpm_val}" if isinstance(pmpm_val, (int, float)) else "N/A"
        data_context = (
            "\n\nCurrent Population Data:\n"
            f"- Total Members: {metrics.get('total_members', 'N/A')}\n"
            f"- Average RAF Score: {metrics.get('avg_raf', 'N/A')}\n"
            f"- Total Revenue Opportunity: {rev_opp_str}\n"
            f"- Open HCC Suspects: {metrics.get('open_suspects', 'N/A')}\n"
            f"- Capture Rate: {metrics.get('capture_rate', 'N/A')}%\n"
            f"- Care Gap Closure Rate: {metrics.get('gap_closure_rate', 'N/A')}%\n"
            f"- Total PMPM: {pmpm_str}\n"
            f"- High-Risk Members: {metrics.get('high_risk_count', 'N/A')}\n"
        )
    except Exception as e:
        logger.warning("Could not fetch dashboard metrics for query context: %s", e)
        data_context = "\n\n(Population data unavailable — answer based on general knowledge.)\n"

    # ----- inject learnings from past feedback -----
    learnings_block = ""
    try:
        learnings_block = await _get_relevant_learnings(db, question, tenant_schema)
    except Exception as e:
        logger.warning("Could not fetch learnings for query context: %s", e)

    context_block = (
        f"The user is currently viewing the '{ctx_label}' page. "
        "Answer with data relevant to that context when possible."
        f"{data_context}"
        f"{learnings_block}"
    )

    system_prompt = (
        "You are an analytics assistant for a managed care MSO (Management Services Organisation). "
        "You have access to the following population data. Answer the user's question with specific "
        "data points, member counts, dollar values, and actionable recommendations. "
        "Always cite specific numbers from the data.\n\n"
        "Respond ONLY with a JSON object (no markdown fences) having these keys:\n"
        '  "answer": string (markdown-formatted narrative),\n'
        '  "data_points": list of {label: string, value: string},\n'
        '  "related_members": list of {id: string, name: string, reason: string},\n'
        '  "recommended_actions": list of strings,\n'
        '  "follow_up_questions": list of strings (3 max)\n'
    )

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=system_prompt,
            user_prompt=f"{context_block}\n\nQuestion: {question}",
            context_data={"page_context": ctx_label, "question": question},
            max_tokens=1024,
        )

        if not guard_result["response"]:
            return {
                "answer": "Sorry, I wasn't able to process that question.",
                "data_points": [],
                "related_members": [],
                "recommended_actions": [],
                "follow_up_questions": [],
            }

        if guard_result["warnings"]:
            logger.warning("Query LLM output warnings: %s", guard_result["warnings"])

        text = guard_result["response"].strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3].strip()
        # Parse JSON from response
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            # LLM returned plain text instead of JSON — use it as the answer
            logger.warning("Query LLM returned non-JSON response, using as plain text")
            return {
                "answer": text,
                "data_points": [],
                "related_members": [],
                "recommended_actions": [],
                "follow_up_questions": [],
            }
        return {
            "answer": parsed.get("answer", text),
            "data_points": parsed.get("data_points", []),
            "related_members": parsed.get("related_members", []),
            "recommended_actions": parsed.get("recommended_actions", []),
            "follow_up_questions": parsed.get("follow_up_questions", []),
        }

    except Exception as exc:
        logger.exception("AI query failed: %s", exc)
        return {
            "answer": "Sorry, I wasn't able to process that question. Please try rephrasing.",
            "data_points": [],
            "related_members": [],
            "recommended_actions": [],
            "follow_up_questions": [],
        }
