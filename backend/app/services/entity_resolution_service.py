"""
Entity Resolution service.

Matches incoming member and provider records to existing entities
using exact, fuzzy, and phonetic matching strategies.
"""

import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
# Member matching
# ---------------------------------------------------------------------------

async def match_member(db: AsyncSession, incoming: dict) -> dict:
    """Try to match an incoming member record to existing members.

    Match strategies (in order):
    1. Exact match on member_id (health plan ID)
    2. Exact match on first_name + last_name + date_of_birth
    3. Fuzzy: last_name exact + first_name starts-with + DOB within 1 year
    4. Fuzzy: last_name sounds-like (Soundex) + DOB exact

    Returns: {matched: bool, member_id: int | None, confidence: int, strategy: str, candidates: list}
    """
    candidates: list[dict] = []

    member_id_val = incoming.get("member_id") or incoming.get("member_external_id")
    first_name = (incoming.get("first_name") or "").strip()
    last_name = (incoming.get("last_name") or "").strip()
    dob = incoming.get("date_of_birth")

    # Strategy 1: Exact match on member_id
    if member_id_val:
        try:
            result = await db.execute(
                text("SELECT id, first_name, last_name, date_of_birth FROM members WHERE member_external_id = :mid LIMIT 5"),
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
                    "candidates": [{"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 100}],
                }
            elif len(rows) > 1:
                for r in rows:
                    candidates.append({"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 95})
        except Exception as e:
            logger.warning("Strategy 1 (exact member_id) failed: %s", e)

    # Strategy 2: Exact match on first_name + last_name + DOB
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
                    "confidence": 95,
                    "strategy": "exact_name_dob",
                    "candidates": [{"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 95}],
                }
            for r in rows:
                candidates.append({"id": r.id, "first_name": r.first_name, "last_name": r.last_name, "dob": str(r.date_of_birth), "confidence": 95})
        except Exception as e:
            logger.warning("Strategy 2 (exact name+DOB) failed: %s", e)

    # Strategy 3: Fuzzy — last_name exact, first_name starts-with, DOB within 1 year
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

    if candidates:
        best = candidates[0]
        if best["confidence"] >= 80:
            return {
                "matched": True,
                "member_id": best["id"],
                "confidence": best["confidence"],
                "strategy": "fuzzy",
                "candidates": candidates[:5],
            }
        return {
            "matched": False,
            "member_id": None,
            "confidence": best["confidence"],
            "strategy": "ambiguous",
            "candidates": candidates[:5],
        }

    return {
        "matched": False,
        "member_id": None,
        "confidence": 0,
        "strategy": "no_match",
        "candidates": [],
    }


# ---------------------------------------------------------------------------
# Provider matching
# ---------------------------------------------------------------------------

async def match_provider(db: AsyncSession, incoming: dict) -> dict:
    """Match an incoming provider record by NPI or name+specialty.

    Returns: {matched: bool, provider_id: int | None, confidence: int}
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
                return {"matched": True, "provider_id": row.id, "confidence": 100}
        except Exception as e:
            logger.warning("Provider NPI match failed: %s", e)

    # Fallback: last_name + first_name + specialty
    if last_name and first_name:
        try:
            result = await db.execute(
                text("""
                    SELECT id FROM providers
                    WHERE LOWER(last_name) = LOWER(:ln) AND LOWER(first_name) = LOWER(:fn)
                    LIMIT 5
                """),
                {"ln": last_name, "fn": first_name},
            )
            rows = result.fetchall()
            if len(rows) == 1:
                return {"matched": True, "provider_id": rows[0].id, "confidence": 85}
            elif len(rows) > 1 and specialty:
                # Try to disambiguate by specialty
                for r in rows:
                    spec_result = await db.execute(
                        text("SELECT specialty FROM providers WHERE id = :pid"),
                        {"pid": r.id},
                    )
                    spec_row = spec_result.fetchone()
                    if spec_row and spec_row.specialty and spec_row.specialty.lower() == specialty.lower():
                        return {"matched": True, "provider_id": r.id, "confidence": 90}
                return {"matched": False, "provider_id": None, "confidence": 60}
        except Exception as e:
            logger.warning("Provider name match failed: %s", e)

    return {"matched": False, "provider_id": None, "confidence": 0}


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
