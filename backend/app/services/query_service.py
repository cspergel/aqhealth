"""
Conversational AI Query Service.

Takes natural-language questions and returns AI-powered answers
with data points, related members, recommended actions, and follow-up questions.
"""

import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
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

    context_block = (
        f"The user is currently viewing the '{ctx_label}' page. "
        "Answer with data relevant to that context when possible."
        f"{data_context}"
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
