"""
Entity Resolution service.

Matches incoming member and provider records to existing entities
using a two-tier pipeline:

  1. Fast path  — deterministic exact matches (no API call)
  2. AI path    — Claude evaluates fuzzy candidates when deterministic fails

Also provides batch AI resolution and a learning feedback loop.
"""

import json
import logging
import re
from datetime import date
from typing import Any

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.llm_guard import guarded_llm_call

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Phonetic helpers (simple Soundex implementation)
# ---------------------------------------------------------------------------

def _soundex(name: str) -> str:
    """Compute the Soundex code for a name."""
    if not name:
        return ""
    name = re.sub(r"[^A-Za-z]", "", name.upper())
    if not name:
        return ""

    codes = {
        "B": "1", "F": "1", "P": "1", "V": "1",
        "C": "2", "G": "2", "J": "2", "K": "2", "Q": "2", "S": "2", "X": "2", "Z": "2",
        "D": "3", "T": "3",
        "L": "4",
        "M": "5", "N": "5",
        "R": "6",
    }

    result = name[0]
    prev_code = codes.get(name[0], "0")

    for ch in name[1:]:
        code = codes.get(ch, "0")
        if code != "0" and code != prev_code:
            result += code
        prev_code = code
        if len(result) == 4:
            break

    return result.ljust(4, "0")


# ---------------------------------------------------------------------------
# Facility name normalization
# ---------------------------------------------------------------------------

FACILITY_ABBREVIATIONS: dict[str, str] = {
    "st.": "saint",
    "st ": "saint ",
    "mt.": "mount",
    "mt ": "mount ",
    "mem.": "memorial",
    "mem ": "memorial ",
    "med ctr": "medical center",
    "med. ctr.": "medical center",
    "med center": "medical center",
    "hosp.": "hospital",
    "hosp ": "hospital ",
    "reg.": "regional",
    "reg ": "regional ",
    "ctr": "center",
    "ctr.": "center",
    "univ.": "university",
    "univ ": "university ",
}

FACILITY_STRIP_WORDS = [
    "hospital", "medical center", "health system", "health center",
    "healthcare", "clinic", "ambulatory", "surgery center",
    "community", "regional", "general",
]


async def normalize_facility(name: str) -> str:
    """Normalize a facility name to a canonical form.

    - Expand abbreviations
    - Lowercase and strip extra whitespace
    - Remove common suffixes like 'Hospital', 'Medical Center'
    """
    if not name:
        return ""

    result = name.lower().strip()

    # Expand abbreviations
    for abbrev, full in FACILITY_ABBREVIATIONS.items():
        result = result.replace(abbrev, full)

    # Strip common trailing words
    for word in FACILITY_STRIP_WORDS:
        result = re.sub(rf"\b{re.escape(word)}\b", "", result)

    # Clean up whitespace
    result = re.sub(r"\s+", " ", result).strip()
    # Remove trailing punctuation
    result = result.rstrip(" -,.")

    return result


# ---------------------------------------------------------------------------
# Claude AI client helper
# ---------------------------------------------------------------------------

def _get_ai_client():
    """Return an AsyncAnthropic client, or None if unavailable."""
    if not settings.anthropic_api_key:
        return None
    try:
        import anthropic
        return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    except ImportError:
        logger.warning("anthropic package not installed — AI matching disabled")
        return None


# ---------------------------------------------------------------------------
# AI-powered member matching
# ---------------------------------------------------------------------------

_MEMBER_SYSTEM_PROMPT = """You are an entity resolution expert for healthcare data.

Given an incoming patient record and a list of potential matches from our database,
determine if any candidate is the same person as the incoming record.

Signals to consider (strongest to weakest):
- Exact or near-exact name match (accounting for common nicknames)
- Date of birth match or near-match (transposed digits, off-by-one year)
- Same health plan / insurance
- Same PCP (primary care physician)
- Same or similar address
- Overlapping diagnosis patterns or medications

Common name variations to recognise:
  Robert=Bob=Bobby=Rob, William=Bill=Billy=Will, Richard=Rick=Dick,
  James=Jim=Jimmy, John=Jack=Johnny, Charles=Charlie=Chuck,
  Margaret=Peggy=Marge=Maggie, Elizabeth=Liz=Beth=Betty=Lizzy,
  Patricia=Pat=Patty, Jennifer=Jenny=Jen, Katherine=Kate=Kathy=Katie,
  Michael=Mike, Joseph=Joe, Thomas=Tom=Tommy, Daniel=Dan=Danny,
  Anthony=Tony, Christopher=Chris, Edward=Ed=Eddie=Ted,
  Alexandra=Alex, Alejandro=Alex, Francisco=Frank

Data quality issues to handle:
- Transposed digits in DOB (e.g. 1985-03-12 vs 1985-12-03)
- Minor misspellings (Johanson vs Johansson, Smyth vs Smith)
- Format differences (dates, phone numbers, addresses)
- Missing or null fields (absence of data is not evidence of mismatch)

Return your assessment as a JSON object with these fields:
{
  "best_match_index": <0-based index of the best candidate, or null if no match>,
  "confidence": <integer 0-100>,
  "reasoning": "<brief explanation of your decision>",
  "signals": ["<list of key signals that informed your decision>"]
}

Return ONLY the JSON object, no other text."""


async def ai_match_member(
    db: AsyncSession,
    incoming: dict,
    candidates: list[dict],
    tenant_schema: str = "default",
) -> dict:
    """Use Claude to evaluate which candidate (if any) matches the incoming member.

    Returns: {
        best_match_index: int | None,
        confidence: int,
        reasoning: str,
        signals: list[str],
        matched: bool,
        member_id: int | None,
        strategy: str,
    }
    """
    client = _get_ai_client()
    if client is None:
        # Fallback: return the best deterministic candidate as-is
        return _deterministic_fallback(candidates, entity_key="member_id")

    # --- Enrich candidates with extra context from the database ---------------
    enriched_candidates = []
    for i, c in enumerate(candidates[:5]):
        enriched = {
            "index": i,
            "first_name": c.get("first_name", ""),
            "last_name": c.get("last_name", ""),
            "date_of_birth": c.get("dob") or c.get("date_of_birth", ""),
            "deterministic_confidence": c.get("confidence", 0),
        }
        # Try to pull extra context (plan, PCP, address, dx, meds)
        try:
            extra = await db.execute(
                text("""
                    SELECT m.gender, m.health_plan, m.zip_code,
                           p.first_name as pcp_first_name, p.last_name as pcp_last_name
                    FROM members m
                    LEFT JOIN providers p ON m.pcp_provider_id = p.id
                    WHERE m.id = :mid
                """),
                {"mid": c["id"]},
            )
            row = extra.fetchone()
            if row:
                pcp_name = None
                if getattr(row, "pcp_first_name", None) and getattr(row, "pcp_last_name", None):
                    pcp_name = f"Dr. {row.pcp_first_name} {row.pcp_last_name}"
                enriched.update({
                    "gender": getattr(row, "gender", None),
                    "plan": getattr(row, "health_plan", None),
                    "pcp": pcp_name,
                    "address": getattr(row, "zip_code", None) or "",
                })
        except Exception:
            pass  # extra context is best-effort

        # Recent diagnoses
        try:
            dx = await db.execute(
                text("""
                    SELECT DISTINCT unnest(diagnosis_codes) as dx_code
                    FROM claims
                    WHERE member_id = :mid AND diagnosis_codes IS NOT NULL
                    ORDER BY dx_code
                    LIMIT 10
                """),
                {"mid": c["id"]},
            )
            enriched["recent_diagnoses"] = [r.dx_code for r in dx.fetchall()]
        except Exception:
            enriched["recent_diagnoses"] = []

        enriched_candidates.append(enriched)

    # --- Build prompt ---------------------------------------------------------
    user_message = (
        "INCOMING RECORD:\n"
        f"{json.dumps(incoming, default=str, indent=2)}\n\n"
        "CANDIDATE MATCHES FROM DATABASE:\n"
        f"{json.dumps(enriched_candidates, default=str, indent=2)}"
    )

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=_MEMBER_SYSTEM_PROMPT,
            user_prompt=user_message,
            context_data={"incoming": incoming, "candidate_count": len(enriched_candidates)},
            max_tokens=1024,
        )
        if guard_result["warnings"]:
            logger.warning("Member matching LLM warnings: %s", guard_result["warnings"])
        raw = guard_result["response"].strip()
        if not raw:
            return _deterministic_fallback(candidates, entity_key="member_id")
        # Parse JSON — handle possible markdown fences
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"```\s*$", "", raw)
        ai_result = json.loads(raw)
    except Exception as e:
        logger.warning("AI member matching failed, falling back to deterministic: %s", e)
        return _deterministic_fallback(candidates, entity_key="member_id")

    # --- Interpret AI result --------------------------------------------------
    best_idx = ai_result.get("best_match_index")
    confidence = int(ai_result.get("confidence", 0))
    reasoning = ai_result.get("reasoning", "")
    signals = ai_result.get("signals", [])

    if best_idx is not None and 0 <= best_idx < len(candidates):
        best_candidate = candidates[best_idx]

        if confidence >= 85:
            strategy = "ai_auto_match"
            matched = True
        elif confidence >= 60:
            strategy = "ai_review_needed"
            matched = False  # needs human review
        else:
            strategy = "ai_low_confidence"
            matched = False
            best_candidate = None
    else:
        strategy = "ai_no_match"
        matched = False
        best_candidate = None

    return {
        "matched": matched,
        "member_id": best_candidate["id"] if best_candidate else None,
        "confidence": confidence,
        "strategy": strategy,
        "reasoning": reasoning,
        "signals": signals,
        "candidates": candidates[:5],
    }


# ---------------------------------------------------------------------------
# AI-powered provider matching
# ---------------------------------------------------------------------------

_PROVIDER_SYSTEM_PROMPT = """You are an entity resolution expert for healthcare provider data.

Given an incoming provider record and a list of potential matches from our database,
determine if any candidate is the same provider as the incoming record.

Signals to consider (strongest to weakest):
- NPI match (National Provider Identifier — unique to each provider)
- Exact or near-exact name match
- Same specialty
- Same practice name or TIN (Tax Identification Number)
- Same or similar address

Data quality issues to handle:
- Credential suffixes (MD, DO, PhD, NP, PA) may be inconsistent
- Practice names change over acquisitions
- Providers may have multiple office locations
- Minor misspellings

Return your assessment as a JSON object with these fields:
{
  "best_match_index": <0-based index of the best candidate, or null if no match>,
  "confidence": <integer 0-100>,
  "reasoning": "<brief explanation of your decision>",
  "signals": ["<list of key signals that informed your decision>"]
}

Return ONLY the JSON object, no other text."""


async def ai_match_provider(
    db: AsyncSession,
    incoming: dict,
    candidates: list[dict],
    tenant_schema: str = "default",
) -> dict:
    """Use Claude to evaluate which candidate (if any) matches the incoming provider.

    Returns the same shape as ai_match_member but with provider_id.
    """
    client = _get_ai_client()
    if client is None:
        return _deterministic_fallback(candidates, entity_key="provider_id")

    # Enrich candidates
    enriched_candidates = []
    for i, c in enumerate(candidates[:5]):
        enriched = {
            "index": i,
            "first_name": c.get("first_name", ""),
            "last_name": c.get("last_name", ""),
            "npi": c.get("npi", ""),
            "deterministic_confidence": c.get("confidence", 0),
        }
        try:
            extra = await db.execute(
                text("""
                    SELECT specialty, practice_name, tin,
                           address_line1, city, state, zip_code
                    FROM providers WHERE id = :pid
                """),
                {"pid": c["id"]},
            )
            row = extra.fetchone()
            if row:
                enriched.update({
                    "specialty": getattr(row, "specialty", None),
                    "practice_name": getattr(row, "practice_name", None),
                    "tin": getattr(row, "tin", None),
                    "address": ", ".join(filter(None, [
                        getattr(row, "address_line1", None),
                        getattr(row, "city", None),
                        getattr(row, "state", None),
                        getattr(row, "zip_code", None),
                    ])),
                })
        except Exception:
            pass

        enriched_candidates.append(enriched)

    user_message = (
        "INCOMING RECORD:\n"
        f"{json.dumps(incoming, default=str, indent=2)}\n\n"
        "CANDIDATE MATCHES FROM DATABASE:\n"
        f"{json.dumps(enriched_candidates, default=str, indent=2)}"
    )

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=_PROVIDER_SYSTEM_PROMPT,
            user_prompt=user_message,
            context_data={"incoming": incoming, "candidate_count": len(enriched_candidates)},
            max_tokens=1024,
        )
        if guard_result["warnings"]:
            logger.warning("Provider matching LLM warnings: %s", guard_result["warnings"])
        raw = guard_result["response"].strip()
        if not raw:
            return _deterministic_fallback(candidates, entity_key="provider_id")
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"```\s*$", "", raw)
        ai_result = json.loads(raw)
    except Exception as e:
        logger.warning("AI provider matching failed, falling back to deterministic: %s", e)
        return _deterministic_fallback(candidates, entity_key="provider_id")

    best_idx = ai_result.get("best_match_index")
    confidence = int(ai_result.get("confidence", 0))
    reasoning = ai_result.get("reasoning", "")
    signals = ai_result.get("signals", [])

    if best_idx is not None and 0 <= best_idx < len(candidates):
        best_candidate = candidates[best_idx]
        if confidence >= 85:
            strategy = "ai_auto_match"
            matched = True
        elif confidence >= 60:
            strategy = "ai_review_needed"
            matched = False
        else:
            strategy = "ai_low_confidence"
            matched = False
            best_candidate = None
    else:
        strategy = "ai_no_match"
        matched = False
        best_candidate = None

    return {
        "matched": matched,
        "provider_id": best_candidate["id"] if best_candidate else None,
        "confidence": confidence,
        "strategy": strategy,
        "reasoning": reasoning,
        "signals": signals,
        "candidates": candidates[:5],
    }


# ---------------------------------------------------------------------------
# AI batch resolution
# ---------------------------------------------------------------------------

_BATCH_SYSTEM_PROMPT = """You are an entity resolution expert for healthcare data.

You are given a list of unresolved matching tasks. Each task contains an incoming
record and up to 5 candidate matches from our database.

For EACH task, determine whether any candidate is a match for the incoming record.
Apply the same logic as single-record matching: consider name variations, DOB
transpositions, insurance plan, PCP, address, and diagnosis overlap.

Return a JSON array (one element per task) with this structure:
[
  {
    "task_index": 0,
    "best_match_index": <0-based index into that task's candidates, or null>,
    "confidence": <integer 0-100>,
    "reasoning": "<brief explanation>",
    "signals": ["<key signals>"]
  },
  ...
]

Return ONLY the JSON array, no other text."""


async def ai_resolve_batch(
    db: AsyncSession,
    unresolved: list[dict],
    tenant_schema: str = "default",
) -> list[dict]:
    """Process multiple unresolved matches in a single LLM call for efficiency.

    Each element of *unresolved* should have:
      - "incoming": dict  (the incoming record)
      - "candidates": list[dict]  (candidate matches)

    Returns a list of resolution recommendations, one per input.
    """
    client = _get_ai_client()
    if client is None:
        return [
            _deterministic_fallback(item.get("candidates", []), entity_key="member_id")
            for item in unresolved
        ]

    # Build the batch payload
    tasks_for_prompt: list[dict] = []
    for idx, item in enumerate(unresolved):
        tasks_for_prompt.append({
            "task_index": idx,
            "incoming": item.get("incoming", {}),
            "candidates": item.get("candidates", [])[:5],
        })

    user_message = (
        f"Resolve the following {len(tasks_for_prompt)} matching tasks:\n\n"
        f"{json.dumps(tasks_for_prompt, default=str, indent=2)}"
    )

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=_BATCH_SYSTEM_PROMPT,
            user_prompt=user_message,
            context_data={"batch_size": len(tasks_for_prompt)},
            max_tokens=4096,
        )
        if guard_result["warnings"]:
            logger.warning("Batch resolution LLM warnings: %s", guard_result["warnings"])
        raw = guard_result["response"].strip()
        if not raw:
            return [
                _deterministic_fallback(item.get("candidates", []), entity_key="member_id")
                for item in unresolved
            ]
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"```\s*$", "", raw)
        ai_results = json.loads(raw)
    except Exception as e:
        logger.warning("AI batch resolution failed: %s", e)
        return [
            _deterministic_fallback(item.get("candidates", []), entity_key="member_id")
            for item in unresolved
        ]

    # Normalise into a list aligned with the input
    results: list[dict] = []
    ai_by_idx = {r["task_index"]: r for r in ai_results} if isinstance(ai_results, list) else {}

    for idx, item in enumerate(unresolved):
        ai_r = ai_by_idx.get(idx)
        candidates = item.get("candidates", [])

        if ai_r is None:
            results.append(_deterministic_fallback(candidates, entity_key="member_id"))
            continue

        best_idx = ai_r.get("best_match_index")
        confidence = int(ai_r.get("confidence", 0))
        reasoning = ai_r.get("reasoning", "")
        signals = ai_r.get("signals", [])

        if best_idx is not None and 0 <= best_idx < len(candidates):
            best = candidates[best_idx]
            if confidence >= 85:
                strategy = "ai_auto_match"
                matched = True
            elif confidence >= 60:
                strategy = "ai_review_needed"
                matched = False
            else:
                strategy = "ai_low_confidence"
                matched = False
                best = None
        else:
            strategy = "ai_no_match"
            matched = False
            best = None

        results.append({
            "matched": matched,
            "member_id": best["id"] if best else None,
            "confidence": confidence,
            "strategy": strategy,
            "reasoning": reasoning,
            "signals": signals,
            "candidates": candidates[:5],
        })

    return results


# ---------------------------------------------------------------------------
# Learning feedback loop
# ---------------------------------------------------------------------------

async def record_match_feedback(
    db: AsyncSession,
    match_id: int,
    was_correct: bool,
) -> dict:
    """Record human feedback on an AI-generated entity match.

    This creates a PredictionOutcome row with prediction_type='entity_match'
    so the learning system can track accuracy over time.
    """
    try:
        from app.models.learning import PredictionOutcome

        outcome_str = "confirmed" if was_correct else "rejected"
        po = PredictionOutcome(
            prediction_type="entity_match",
            prediction_id=match_id,
            predicted_value=f"entity_match_{match_id}",
            confidence=None,
            outcome=outcome_str,
            was_correct=was_correct,
            context={"source": "entity_resolution", "match_id": match_id},
        )
        db.add(po)
        await db.commit()

        logger.info(
            "Recorded entity match feedback: match_id=%s was_correct=%s",
            match_id,
            was_correct,
        )
        return {"success": True, "match_id": match_id, "outcome": outcome_str}
    except Exception as e:
        logger.error("Failed to record match feedback: %s", e)
        await db.rollback()
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Deterministic fallback helper
# ---------------------------------------------------------------------------

def _deterministic_fallback(
    candidates: list[dict],
    entity_key: str = "member_id",
) -> dict:
    """When AI is unavailable, return the best deterministic candidate."""
    if not candidates:
        return {
            "matched": False,
            entity_key: None,
            "confidence": 0,
            "strategy": "no_match",
            "reasoning": "No candidates found",
            "signals": [],
            "candidates": [],
        }

    best = candidates[0]
    conf = best.get("confidence", 0)
    matched = conf >= 80
    return {
        "matched": matched,
        entity_key: best["id"] if matched else None,
        "confidence": conf,
        "strategy": "deterministic_fuzzy" if matched else "ambiguous",
        "reasoning": "AI unavailable — used deterministic scoring",
        "signals": [],
        "candidates": candidates[:5],
    }


# ---------------------------------------------------------------------------
# Member matching — two-tier pipeline
# ---------------------------------------------------------------------------

async def match_member(db: AsyncSession, incoming: dict) -> dict:
    """Match an incoming member record to existing members.

    Pipeline:
      Fast path (deterministic, no API call):
        1. Exact match on member_id → confidence 100, done
        2. Exact match on first_name + last_name + DOB → confidence 98, done

      AI path (when deterministic fails):
        3. Gather fuzzy candidates (prefix + Soundex)
        4. Send to Claude for intelligent evaluation
        5. Return AI assessment with confidence and reasoning

    Returns: {
        matched: bool,
        member_id: int | None,
        confidence: int,
        strategy: str,
        reasoning: str | None,
        signals: list[str] | None,
        candidates: list,
    }
    """
    candidates: list[dict] = []

    member_id_val = incoming.get("member_id") or incoming.get("member_external_id")
    first_name = (incoming.get("first_name") or "").strip()
    last_name = (incoming.get("last_name") or "").strip()
    dob = incoming.get("date_of_birth")

    # ---- Fast path 1: Exact match on member_id ----------------------------
    if member_id_val:
        try:
            result = await db.execute(
                text("SELECT id, first_name, last_name, date_of_birth FROM members WHERE member_id = :mid LIMIT 5"),
                {"mid": str(member_id_val)},
            )
            rows = result.fetchall()
            if len(rows) == 1:
                r = rows[0]
                return {
                    "matched": True,
                    "member_id": r.id,
                    "confidence": 100,
                    "strategy": "exact_member_id",
                    "reasoning": "Exact member_id match",
                    "signals": ["member_id"],
                    "candidates": [{"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 100}],
                }
            elif len(rows) > 1:
                for r in rows:
                    candidates.append({"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 95})
        except Exception as e:
            logger.warning("Strategy 1 (exact member_id) failed: %s", e)

    # ---- Fast path 2: Exact name + DOB ------------------------------------
    if first_name and last_name and dob:
        try:
            result = await db.execute(
                text("""
                    SELECT id, first_name, last_name, date_of_birth
                    FROM members
                    WHERE LOWER(first_name) = LOWER(:fn) AND LOWER(last_name) = LOWER(:ln) AND date_of_birth = :dob
                    LIMIT 5
                """),
                {"fn": first_name, "ln": last_name, "dob": dob},
            )
            rows = result.fetchall()
            if len(rows) == 1:
                r = rows[0]
                return {
                    "matched": True,
                    "member_id": r.id,
                    "confidence": 98,
                    "strategy": "exact_name_dob",
                    "reasoning": "Exact first_name + last_name + DOB match",
                    "signals": ["first_name", "last_name", "date_of_birth"],
                    "candidates": [{"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 98}],
                }
            for r in rows:
                if not any(c["id"] == r.id for c in candidates):
                    candidates.append({"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 95})
        except Exception as e:
            logger.warning("Strategy 2 (exact name+DOB) failed: %s", e)

    # ---- Gather fuzzy candidates for AI evaluation -------------------------

    # Strategy 3: last_name exact, first_name starts-with, DOB within 1 year
    if first_name and last_name and dob:
        try:
            prefix = first_name[:2].lower() if len(first_name) >= 2 else first_name[0].lower()
            result = await db.execute(
                text("""
                    SELECT id, first_name, last_name, date_of_birth
                    FROM members
                    WHERE LOWER(last_name) = LOWER(:ln)
                      AND LOWER(first_name) LIKE :fn_prefix
                      AND date_of_birth BETWEEN (:dob::date - INTERVAL '1 year') AND (:dob::date + INTERVAL '1 year')
                    LIMIT 10
                """),
                {"ln": last_name, "fn_prefix": f"{prefix}%", "dob": dob},
            )
            for r in result.fetchall():
                if not any(c["id"] == r.id for c in candidates):
                    candidates.append({"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 75})
        except Exception as e:
            logger.warning("Strategy 3 (fuzzy name+DOB) failed: %s", e)

    # Strategy 4: Soundex on last_name + exact DOB
    if last_name and dob:
        soundex_code = _soundex(last_name)
        try:
            result = await db.execute(
                text("""
                    SELECT id, first_name, last_name, date_of_birth
                    FROM members
                    WHERE date_of_birth = :dob
                    LIMIT 50
                """),
                {"dob": dob},
            )
            for r in result.fetchall():
                if _soundex(r.last_name) == soundex_code:
                    if not any(c["id"] == r.id for c in candidates):
                        candidates.append({"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 65})
        except Exception as e:
            logger.warning("Strategy 4 (Soundex+DOB) failed: %s", e)

    # Sort candidates by confidence descending
    candidates.sort(key=lambda c: c["confidence"], reverse=True)

    # ---- AI path: send candidates to Claude --------------------------------
    if candidates:
        ai_result = await ai_match_member(db, incoming, candidates[:5])
        return ai_result

    # No candidates at all
    return {
        "matched": False,
        "member_id": None,
        "confidence": 0,
        "strategy": "no_match",
        "reasoning": "No candidates found via any strategy",
        "signals": [],
        "candidates": [],
    }


# ---------------------------------------------------------------------------
# Provider matching
# ---------------------------------------------------------------------------

async def match_provider(db: AsyncSession, incoming: dict) -> dict:
    """Match an incoming provider record by NPI or name+specialty.

    Returns: {matched: bool, provider_id: int | None, confidence: int, ...}
    """
    npi = incoming.get("npi")
    first_name = (incoming.get("first_name") or "").strip()
    last_name = (incoming.get("last_name") or "").strip()
    specialty = (incoming.get("specialty") or "").strip()

    # Primary: exact NPI match
    if npi:
        try:
            result = await db.execute(
                text("SELECT id FROM providers WHERE npi = :npi LIMIT 1"),
                {"npi": str(npi)},
            )
            row = result.fetchone()
            if row:
                return {
                    "matched": True,
                    "provider_id": row.id,
                    "confidence": 100,
                    "strategy": "exact_npi",
                    "reasoning": "Exact NPI match",
                    "signals": ["npi"],
                    "candidates": [],
                }
        except Exception as e:
            logger.warning("Provider NPI match failed: %s", e)

    # Gather candidates for AI evaluation
    candidates: list[dict] = []

    if last_name and first_name:
        try:
            result = await db.execute(
                text("""
                    SELECT id, first_name, last_name, npi, specialty
                    FROM providers
                    WHERE LOWER(last_name) = LOWER(:ln) AND LOWER(first_name) = LOWER(:fn)
                    LIMIT 5
                """),
                {"ln": last_name, "fn": first_name},
            )
            for r in result.fetchall():
                candidates.append({
                    "id": r.id,
                    "first_name": r.first_name,
                    "last_name": r.last_name,
                    "npi": getattr(r, "npi", None),
                    "specialty": getattr(r, "specialty", None),
                    "confidence": 85,
                })
        except Exception as e:
            logger.warning("Provider name match failed: %s", e)

    # Also try Soundex on last_name for fuzzy candidates
    if last_name:
        soundex_code = _soundex(last_name)
        first_letter = last_name[0].upper() if last_name else ""
        try:
            result = await db.execute(
                text("""
                    SELECT id, first_name, last_name, npi, specialty
                    FROM providers
                    WHERE UPPER(LEFT(last_name, 1)) = :first_letter
                    LIMIT 500
                """),
                {"first_letter": first_letter},
            )
            for r in result.fetchall():
                if _soundex(r.last_name) == soundex_code:
                    if not any(c["id"] == r.id for c in candidates):
                        candidates.append({
                            "id": r.id,
                            "first_name": r.first_name,
                            "last_name": r.last_name,
                            "npi": getattr(r, "npi", None),
                            "specialty": getattr(r, "specialty", None),
                            "confidence": 65,
                        })
        except Exception as e:
            logger.warning("Provider Soundex match failed: %s", e)

    candidates.sort(key=lambda c: c["confidence"], reverse=True)

    if candidates:
        return await ai_match_provider(db, incoming, candidates[:5])

    return {
        "matched": False,
        "provider_id": None,
        "confidence": 0,
        "strategy": "no_match",
        "reasoning": "No provider candidates found",
        "signals": [],
        "candidates": [],
    }


# ---------------------------------------------------------------------------
# Unresolved matches & resolution
# ---------------------------------------------------------------------------

async def get_unresolved_matches(db: AsyncSession) -> list:
    """Return quarantined records where matching was ambiguous (for human review)."""
    try:
        result = await db.execute(text("""
            SELECT id, source_type, raw_data, errors, warnings, row_number, upload_job_id
            FROM quarantined_records
            WHERE status = 'pending'
            ORDER BY created_at DESC
            LIMIT 100
        """))
        rows = result.fetchall()
        return [
            {
                "id": r.id,
                "source_type": r.source_type,
                "raw_data": r.raw_data,
                "errors": r.errors,
                "warnings": r.warnings,
                "row_number": r.row_number,
                "upload_job_id": r.upload_job_id,
            }
            for r in rows
        ]
    except Exception as e:
        logger.warning("Failed to get unresolved matches: %s", e)
        return []


async def resolve_match(db: AsyncSession, quarantine_id: int, resolved_entity_id: int, reviewed_by: int | None = None) -> dict:
    """Human confirms a match: update the quarantined record with the correct entity ID."""
    try:
        await db.execute(
            text("""
                UPDATE quarantined_records
                SET status = 'fixed',
                    fixed_data = jsonb_set(COALESCE(fixed_data, '{}'::jsonb), '{resolved_entity_id}', :entity_id::text::jsonb),
                    reviewed_by = :reviewed_by,
                    updated_at = NOW()
                WHERE id = :qid
            """),
            {"qid": quarantine_id, "entity_id": str(resolved_entity_id), "reviewed_by": reviewed_by},
        )
        await db.commit()
        return {"success": True, "quarantine_id": quarantine_id, "resolved_entity_id": resolved_entity_id}
    except Exception as e:
        logger.error("Failed to resolve match: %s", e)
        await db.rollback()
        return {"success": False, "error": str(e)}
