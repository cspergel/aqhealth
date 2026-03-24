"""
LLM Triage Router — Ultra-fast note snippet classification.

Receives progress note preview text from the PCC dashboard
and classifies each for HCC/clinical relevance using Haiku.

Single LLM call, ~200-500ms, costs fraction of a cent.
Returns per-snippet classifications for the highlighter.

Endpoint: POST /api/llm-triage
"""

import json
from fastapi import APIRouter
from pydantic import BaseModel
from app.services.llm_service import call_llm_with_fallback

router = APIRouter(prefix="/api")


class TriageRequest(BaseModel):
    note_snippets: list[str]  # Preview texts from PCC progress notes table
    dashboard_context: str = ""  # Optional: dx list, meds visible on dashboard


TRIAGE_SYSTEM_PROMPT = """You are a clinical coding triage assistant. You receive short preview snippets from a SNF (Skilled Nursing Facility) patient's progress notes table.

For each snippet, determine if it likely contains information relevant to:
- HCC diagnosis capture (conditions that map to CMS-HCC risk adjustment codes)
- Screening scores (BIMS, PHQ-9, CAM, Braden, fall risk, pain scales)
- Clinical findings that suggest undocumented conditions (lab values, symptoms, functional status)
- Care gaps (missing screenings, overdue assessments)

Return ONLY a JSON array (no markdown, no commentary) with one object per snippet:

[
  {
    "relevant": true,
    "reason": "short 3-5 word reason",
    "category": "cognitive|mood|skin|nutrition|safety|respiratory|cardiac|renal|endocrine|infection|functional|other",
    "hcc_hint": "HCC category name or null",
    "priority": 1
  }
]

Priority: 1 = critical (screening scores, HCC-relevant conditions), 2 = high (clinical findings), 3 = medium (supportive info).

Set relevant=false for routine notes with no coding/HCC significance (e.g. social service check-ins, activity notes, routine vitals without abnormalities).

Be aggressive about flagging relevant items — it's better to highlight something the coder can dismiss than to miss an HCC opportunity. Look for:
- Any mention of cognitive changes, confusion, orientation
- Depression, anxiety, mood symptoms
- Wound care, skin breakdown, pressure areas
- Weight loss, poor appetite, nutritional concerns
- Shortness of breath, oxygen use, respiratory symptoms
- Heart failure symptoms, edema
- Renal function mentions (GFR, creatinine, dialysis)
- Diabetes management, blood sugar issues
- Infections (pneumonia, UTI, cellulitis)
- Falls, functional decline, therapy progress
- Pain management, chronic pain
- Antibiotic use (implies active infection diagnosis)
"""


@router.post("/llm-triage")
async def llm_triage(req: TriageRequest):
    """Classify note snippets for clinical significance using fast LLM pass."""
    if not req.note_snippets:
        return {"classifications": []}

    # Build the user message with numbered snippets
    parts = []
    if req.dashboard_context:
        parts.append(f"Dashboard context (active diagnoses, meds):\n{req.dashboard_context[:1500]}\n---")

    parts.append("Classify each note snippet below:\n")
    for i, snippet in enumerate(req.note_snippets[:30]):  # Cap at 30 snippets
        parts.append(f"[{i}] {snippet[:250]}")

    user_message = "\n".join(parts)

    # Call fast model (Haiku for speed — ~200ms)
    raw_response, usage = call_llm_with_fallback(
        system_prompt=TRIAGE_SYSTEM_PROMPT,
        user_message=user_message,
        model_override="claude-haiku-4-5-20251001",  # Fastest available
    )

    # Parse response
    classifications = _parse_triage_response(raw_response, len(req.note_snippets))

    return {
        "classifications": classifications,
        "usage": usage,
        "snippet_count": len(req.note_snippets),
        "relevant_count": sum(1 for c in classifications if c.get("relevant")),
    }


def _parse_triage_response(raw_text: str, expected_count: int) -> list:
    """Parse LLM JSON array response with fallback handling."""
    try:
        cleaned = raw_text.strip()
        # Remove markdown fences if present
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        # Find JSON array
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start >= 0 and end > start:
            result = json.loads(cleaned[start : end + 1])
            if isinstance(result, list):
                # Pad with not-relevant if LLM returned fewer than expected
                while len(result) < expected_count:
                    result.append({"relevant": False, "reason": "", "category": "", "hcc_hint": None, "priority": 99})
                return result[:expected_count]
    except (json.JSONDecodeError, ValueError) as e:
        print(f"[LLM Triage] Parse error: {e}")

    # Fallback: return all as unknown
    return [{"relevant": False, "reason": "parse_error", "category": "", "hcc_hint": None, "priority": 99}] * expected_count
