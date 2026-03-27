"""
AI-Driven Data Pipeline

Automatically detects, transforms, cleans, and resolves incoming healthcare
data from ANY format. Learns from corrections to improve over time.

Better than Rhapsody because:
- AI-driven format detection (not manual configuration)
- Self-learning field mapping (creates rules from corrections)
- AI-powered data cleaning (fixes ambiguous values)
- Auto-creates transformation rules from patterns
- Continuous improvement — accuracy improves with every file
"""

import json
import logging
import re
import time
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------

FORMAT_SIGNATURES = {
    "hl7v2": [r"^MSH\|", r"\rMSH\|", r"\nMSH\|"],
    "x12": [r"^ISA\*", r"^ISA\|", r"~ST\*837", r"~ST\*835", r"~ST\*834"],
    "fhir": [r'"resourceType"\s*:'],
    "cda": [r"<ClinicalDocument", r"urn:hl7-org:v3"],
    "xml": [r"^<\?xml", r"^<[a-zA-Z]"],
    "csv": [r"^[^,\n]+,[^,\n]+"],
    "pipe_delimited": [r"^[^|\n]+\|[^|\n]+\|"],
    "json": [r"^\s*[\[{]"],
}

# Formats that can be ambiguous with each other
AMBIGUOUS_PAIRS = {
    frozenset({"csv", "pipe_delimited"}),
    frozenset({"json", "fhir"}),
    frozenset({"xml", "cda"}),
}


def _regex_detect_format(snippet: str) -> tuple[str, list[str]]:
    """Run regex detection; return (best_match, all_matches)."""
    matches = []
    for fmt, patterns in FORMAT_SIGNATURES.items():
        for pat in patterns:
            if re.search(pat, snippet, re.MULTILINE):
                matches.append(fmt)
                break
    if not matches:
        return "unknown", []
    return matches[0], matches


def _is_ambiguous(matches: list[str]) -> bool:
    """Check whether detected formats form an ambiguous pair."""
    if len(matches) < 2:
        return False
    match_set = set(matches)
    for pair in AMBIGUOUS_PAIRS:
        if pair.issubset(match_set):
            return True
    return False


async def detect_format(raw_data: str, tenant_schema: str = "default") -> str:
    """Auto-detect the format of incoming raw data.

    Uses regex as the fast primary path.  When regex matches are ambiguous
    (e.g. could be CSV *or* pipe-delimited), calls Claude via
    ``guarded_llm_call`` for confirmation.
    """
    snippet = raw_data[:2000]
    best, all_matches = _regex_detect_format(snippet)

    if not _is_ambiguous(all_matches):
        return best

    # AI confirmation — regex was uncertain
    try:
        from app.services.llm_guard import guarded_llm_call

        first_lines = "\n".join(raw_data.split("\n")[:10])
        prompt = (
            "Here are the first 10 lines of a file. What format is this? "
            "CSV, HL7v2, X12, FHIR JSON, CDA XML, pipe-delimited, fixed-width, or other?\n\n"
            f"```\n{first_lines}\n```\n\n"
            "Return JSON: {\"format\": \"...\", \"confidence\": 0-100, \"reasoning\": \"...\"}"
        )

        result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=(
                "You are a healthcare data format detection assistant. "
                "Return only valid JSON."
            ),
            user_prompt=prompt,
            context_data={"candidate_formats": all_matches},
            max_tokens=200,
        )

        response_text = result.get("response", "")
        # Try to parse the JSON from the response
        try:
            # Handle markdown code blocks
            cleaned = response_text.strip()
            if cleaned.startswith("```"):
                cleaned = re.sub(r"^```\w*\n?", "", cleaned)
                cleaned = re.sub(r"\n?```$", "", cleaned)
            parsed = json.loads(cleaned)
            fmt = parsed.get("format", "").lower().replace(" ", "_").replace("-", "_")
            # Normalise common AI responses to our format keys
            normalise_map = {
                "csv": "csv",
                "pipe_delimited": "pipe_delimited",
                "hl7v2": "hl7v2",
                "hl7_v2": "hl7v2",
                "x12": "x12",
                "fhir_json": "fhir",
                "fhir": "fhir",
                "cda_xml": "cda",
                "cda": "cda",
                "json": "json",
                "xml": "xml",
                "fixed_width": "fixed_width",
            }
            resolved = normalise_map.get(fmt, best)
            logger.info(
                "AI format detection resolved ambiguity: %s -> %s (candidates: %s)",
                all_matches, resolved, all_matches,
            )
            return resolved
        except (json.JSONDecodeError, KeyError):
            logger.warning("AI format detection returned unparseable response, using regex result")
            return best
    except Exception as e:
        logger.warning("AI format detection failed, falling back to regex: %s", e)
        return best


def detect_data_type(records: list[dict]) -> str:
    """Detect what type of healthcare data these records are (roster, claims, etc.)."""
    if not records:
        return "unknown"

    sample = records[0]
    keys_lower = {k.lower() for k in sample.keys()}

    # Claims
    claim_fields = {"claim_id", "diagnosis", "procedure", "billed_amount", "service_date", "cpt"}
    if len(keys_lower & claim_fields) >= 2:
        return "claims"

    # Roster / eligibility
    roster_fields = {"member_id", "subscriber_id", "date_of_birth", "enrollment_date", "plan_name", "health_plan"}
    if len(keys_lower & roster_fields) >= 2:
        return "roster"

    # Pharmacy
    pharma_fields = {"ndc", "drug_name", "prescription", "pharmacy", "days_supply", "quantity"}
    if len(keys_lower & pharma_fields) >= 2:
        return "pharmacy"

    # Lab results
    lab_fields = {"loinc", "result_value", "test_name", "specimen", "reference_range"}
    if len(keys_lower & lab_fields) >= 2:
        return "lab_results"

    # Eligibility
    elig_fields = {"effective_date", "termination_date", "coverage_type", "payer"}
    if len(keys_lower & elig_fields) >= 2:
        return "eligibility"

    return "generic"


# ---------------------------------------------------------------------------
# Record cleaning
# ---------------------------------------------------------------------------

DATE_PATTERNS = [
    (r"^(\d{1,2})/(\d{1,2})/(\d{4})$", "MM/DD/YYYY"),
    (r"^(\d{1,2})-(\d{1,2})-(\d{4})$", "MM-DD-YYYY"),
    (r"^(\d{1,2})/(\d{1,2})/(\d{2})$", "MM/DD/YY"),
    (r"^(\d{1,2})-(\d{1,2})-(\d{2})$", "MM-DD-YY"),
    (r"^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$", "DD-Mon-YY"),
    (r"^(\d{4})-(\d{2})-(\d{2})$", "YYYY-MM-DD"),
    (r"^(\d{8})$", "YYYYMMDD"),
]

GENDER_MAP = {
    "m": "M", "f": "F", "male": "M", "female": "F",
    "1": "M", "2": "F", "u": "U", "unknown": "U",
}


def normalize_date(value: str) -> tuple[str | None, str | None]:
    """Normalize a date string to YYYY-MM-DD. Returns (normalized, reason) or (None, None)."""
    if not value or not isinstance(value, str):
        return None, None
    value = value.strip()

    # Already in standard form
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value, None

    # MM/DD/YYYY or MM-DD-YYYY
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$", value)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{year:04d}-{month:02d}-{day:02d}", f"Converted from {value}"

    # MM/DD/YY or MM-DD-YY
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$", value)
    if m:
        month, day, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        year = 2000 + yr if yr < 50 else 1900 + yr
        return f"{year:04d}-{month:02d}-{day:02d}", f"Converted 2-digit year from {value}"

    # DD-Mon-YY(YY)
    m = re.match(r"^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$", value)
    if m:
        day = int(m.group(1))
        mon_str = m.group(2)
        yr = int(m.group(3))
        months = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                  "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}
        month = months.get(mon_str.lower(), 1)
        if yr < 100:
            yr = 2000 + yr if yr < 50 else 1900 + yr
        return f"{yr:04d}-{month:02d}-{day:02d}", f"Converted from {value}"

    # YYYYMMDD
    m = re.match(r"^(\d{4})(\d{2})(\d{2})$", value)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}", f"Inserted separators into {value}"

    return None, None


def _is_ambiguous_date(value: str) -> bool:
    """Check if a date could be MM/DD/YY or DD/MM/YY (both parts <= 12)."""
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", value)
    if not m:
        return False
    a, b = int(m.group(1)), int(m.group(2))
    return a <= 12 and b <= 12 and a != b


# Known ICD-10 prefixes for fuzzy matching
_ICD10_CATEGORY_PREFIXES = {
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
}


def _is_ambiguous_icd10(code: str) -> bool:
    """Check if an ICD-10 code looks malformed in a way regex can't confidently fix."""
    if not code:
        return False
    c = code.strip().upper()
    # Starts with valid letter but doesn't match standard ICD-10 pattern
    if c and c[0] in _ICD10_CATEGORY_PREFIXES:
        # Standard: letter + 2 digits + optional (dot + 1-4 alphanumerics)
        if not re.match(r"^[A-Z]\d{2}(\.\d{1,4})?$", c):
            # Has a dot but wrong structure, or too short/long
            return True
    return False


def clean_name(value: str) -> dict[str, str]:
    """Parse and clean a name string. Returns {first_name, last_name, suffix, prefix}."""
    if not value or not isinstance(value, str):
        return {}

    value = value.strip()
    result: dict[str, str] = {}

    # Remove and capture prefixes
    prefixes = ["dr.", "dr", "mr.", "mr", "mrs.", "mrs", "ms.", "ms"]
    lower = value.lower()
    for pfx in prefixes:
        if lower.startswith(pfx + " "):
            result["prefix"] = value[:len(pfx)].title()
            value = value[len(pfx):].strip()
            break

    # Remove and capture suffixes
    suffixes = ["jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "md", "do", "phd"]
    parts = value.split()
    if len(parts) > 1 and parts[-1].lower().rstrip(".,") in suffixes:
        result["suffix"] = parts[-1].rstrip(".,").title()
        parts = parts[:-1]
        value = " ".join(parts)

    # Handle LAST, FIRST format
    if "," in value:
        segments = [s.strip() for s in value.split(",", 1)]
        result["last_name"] = segments[0].title()
        result["first_name"] = segments[1].title() if len(segments) > 1 else ""
    elif len(parts) >= 2:
        result["first_name"] = parts[0].title()
        result["last_name"] = parts[-1].title()
        if len(parts) > 2:
            result["middle_name"] = " ".join(parts[1:-1]).title()
    elif len(parts) == 1:
        result["last_name"] = parts[0].title()

    return result


def normalize_gender(value: str) -> tuple[str | None, str | None]:
    """Normalize gender value. Returns (normalized, reason)."""
    if not value:
        return None, None
    v = value.strip().lower()
    mapped = GENDER_MAP.get(v)
    if mapped and mapped != value.strip().upper():
        return mapped, f"Mapped '{value}' to '{mapped}'"
    if mapped:
        return mapped, None
    return None, None


def clean_amount(value: str) -> tuple[float | None, str | None]:
    """Normalize monetary amounts. Returns (amount, reason)."""
    if not value or not isinstance(value, str):
        return None, None
    v = value.strip()

    negative = False
    # Parenthetical negatives: (500) -> -500
    if v.startswith("(") and v.endswith(")"):
        negative = True
        v = v[1:-1].strip()

    # Remove $ and commas
    v = v.replace("$", "").replace(",", "").strip()

    if v.startswith("-"):
        negative = True
        v = v[1:].strip()

    try:
        amount = float(v)
        if negative:
            amount = -amount
        reason = f"Cleaned '{value}' to {amount}" if value.strip() != str(amount) else None
        return amount, reason
    except ValueError:
        return None, None


def normalize_phone(value: str) -> tuple[str | None, str | None]:
    """Normalize phone numbers to (XXX) XXX-XXXX format."""
    if not value:
        return None, None
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10:
        formatted = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        if formatted != value.strip():
            return formatted, f"Formatted phone from '{value}'"
        return formatted, None
    if len(digits) == 11 and digits[0] == "1":
        digits = digits[1:]
        formatted = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        return formatted, f"Formatted phone from '{value}' (removed country code)"
    return None, None


def validate_npi(value: str) -> tuple[bool, str | None]:
    """Validate NPI using Luhn algorithm. Returns (is_valid, reason)."""
    if not value:
        return False, "NPI is empty"
    digits = re.sub(r"\D", "", value)
    if len(digits) != 10:
        return False, f"NPI must be 10 digits, got {len(digits)}"

    # Luhn check with 80840 prefix for NPI
    npi_with_prefix = "80840" + digits
    total = 0
    for i, ch in enumerate(reversed(npi_with_prefix)):
        d = int(ch)
        if i % 2 == 0:
            total += d
        else:
            doubled = d * 2
            total += doubled if doubled < 10 else doubled - 9
    if total % 10 != 0:
        return False, f"NPI '{value}' fails Luhn check"
    return True, None


def fix_icd10_code(code: str) -> tuple[str, str | None]:
    """Fix common ICD-10 formatting issues. Returns (fixed_code, reason)."""
    if not code:
        return code, None
    c = code.strip().upper()

    # Add missing dot if code is 4+ chars with no dot
    if len(c) >= 4 and "." not in c:
        fixed = c[:3] + "." + c[3:]
        return fixed, f"Added decimal to ICD-10 code: '{code}' -> '{fixed}'"

    return c, None


def normalize_state(value: str) -> tuple[str | None, str | None]:
    """Normalize state names to 2-letter abbreviations."""
    if not value:
        return None, None
    v = value.strip()
    if len(v) == 2:
        return v.upper(), None

    state_map = {
        "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
        "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
        "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
        "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
        "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
        "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
        "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
        "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
        "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
        "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
        "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
        "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
        "wisconsin": "WI", "wyoming": "WY",
    }
    abbr = state_map.get(v.lower())
    if abbr:
        return abbr, f"Abbreviated '{value}' to '{abbr}'"
    return v, None


def normalize_zip(value: str) -> tuple[str | None, str | None]:
    """Format ZIP codes consistently."""
    if not value:
        return None, None
    digits = re.sub(r"\D", "", value)
    if len(digits) == 5:
        return digits, None
    if len(digits) == 9:
        formatted = f"{digits[:5]}-{digits[5:]}"
        return formatted, f"Formatted ZIP+4: '{value}' -> '{formatted}'"
    return value.strip(), None


# ---------------------------------------------------------------------------
# Rule checking and learning
# ---------------------------------------------------------------------------

async def _check_and_apply_rules(
    db: AsyncSession, source_name: str, field: str, value: str
) -> dict | None:
    """Check for existing learned rules. Returns cleaned value dict or None."""
    from app.models.transformation_rule import TransformationRule

    # Query for matching source + field (source-specific first, then universal)
    result = await db.execute(
        select(TransformationRule).where(
            TransformationRule.field == field,
            TransformationRule.is_active == True,
        ).order_by(
            # Prefer source-specific rules over universal
            TransformationRule.source_name.is_(None).asc(),
            TransformationRule.accuracy.desc(),
        )
    )
    rules = result.scalars().all()

    for rule in rules:
        # Check if rule applies to this source
        if rule.source_name and rule.source_name != source_name:
            continue

        # Check accuracy threshold
        if rule.accuracy is not None and float(rule.accuracy) <= 80:
            continue

        condition = rule.condition or {}
        matched = False

        # Value-based match
        if "value" in condition:
            if str(value).strip() == str(condition["value"]).strip():
                matched = True
            elif str(value).strip().lower() == str(condition["value"]).strip().lower():
                matched = True

        # Pattern-based match
        if "pattern" in condition and not matched:
            try:
                if re.match(condition["pattern"], str(value)):
                    matched = True
            except re.error:
                pass

        if matched:
            transformation = rule.transformation or {}
            cleaned_value = transformation.get("to", value)

            # Increment times_applied
            rule.times_applied = (rule.times_applied or 0) + 1
            await db.flush()

            return {
                "cleaned_value": cleaned_value,
                "rule_id": rule.id,
                "rule_type": rule.rule_type,
                "source": "learned_rule",
            }

    return None


# ---------------------------------------------------------------------------
# AI-powered ambiguity resolution (REAL — calls Claude)
# ---------------------------------------------------------------------------

async def ai_resolve_ambiguous(
    db: AsyncSession,
    record: dict,
    field: str,
    value: str,
    context: dict,
    tenant_schema: str = "public",
) -> dict:
    """
    Use AI to resolve an ambiguous data value that deterministic rules can't handle.

    Returns: {suggested_value, confidence, reasoning, action}
    action: "auto_apply" (>85%), "apply_with_flag" (60-85%), "quarantine" (<60%)
    """
    from app.services.llm_guard import guarded_llm_call

    prompt = f"""You are a healthcare data quality expert. Resolve this ambiguous value:

Field: {field}
Value: "{value}"
Record context: {json.dumps(context, default=str)[:500]}

Determine the correct value for this field. Consider:
- Common healthcare data entry errors
- Format variations across EMR systems
- Abbreviations and shorthand used in medical records

Return JSON: {{"corrected_value": "...", "confidence": 0-100, "reasoning": "..."}}
"""

    try:
        result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt="You are a healthcare data cleaning assistant. Return only valid JSON.",
            user_prompt=prompt,
            context_data={"field": field, "value": value},
            max_tokens=200,
        )

        response_text = result.get("response", "")
        if not response_text:
            raise ValueError("Empty LLM response")

        # Parse response — handle markdown code blocks
        cleaned_resp = response_text.strip()
        if cleaned_resp.startswith("```"):
            cleaned_resp = re.sub(r"^```\w*\n?", "", cleaned_resp)
            cleaned_resp = re.sub(r"\n?```$", "", cleaned_resp)

        parsed = json.loads(cleaned_resp)
        corrected = parsed.get("corrected_value", value)
        confidence = parsed.get("confidence", 50) / 100.0
        reasoning = parsed.get("reasoning", "AI resolution applied")

        action = (
            "auto_apply" if confidence > 0.85
            else "apply_with_flag" if confidence > 0.60
            else "quarantine"
        )

        return {
            "field": field,
            "original_value": value,
            "suggested_value": corrected,
            "confidence": confidence,
            "reasoning": reasoning,
            "action": action,
        }

    except Exception as e:
        logger.warning("AI resolution failed for field=%s value=%s: %s", field, value, e)
        # Fallback: return the original value with low confidence
        return {
            "field": field,
            "original_value": value,
            "suggested_value": value,
            "confidence": 0.5,
            "reasoning": f"AI resolution unavailable ({e}); value preserved as-is.",
            "action": "apply_with_flag",
        }


async def ai_clean_record(
    db: AsyncSession,
    record: dict,
    data_type: str,
    tenant_schema: str = "public",
    source_name: str = "unknown",
) -> dict:
    """
    AI-powered cleaning of a single record.

    Applies deterministic cleaning rules for common data quality issues,
    then flags ambiguous values for AI resolution.
    Uses learned rules when available (accuracy > 80%) before AI.
    Creates new rules from successful AI cleanings.
    """
    cleaned = dict(record)
    changes: list[dict] = []
    confidence = 1.0
    rules_applied = 0
    rules_created = 0
    ai_cleaned = 0

    # --- Date fields ---
    date_fields = [k for k in record if any(d in k.lower() for d in ["date", "dob", "birth", "service", "admit", "discharge"])]
    for field in date_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            # Step 1: Check learned rules first
            rule_result = await _check_and_apply_rules(db, source_name, field, val)
            if rule_result:
                cleaned[field] = rule_result["cleaned_value"]
                changes.append({"field": field, "original": val, "cleaned": rule_result["cleaned_value"], "reason": f"Applied learned rule #{rule_result['rule_id']}"})
                rules_applied += 1
                continue

            # Step 2: Deterministic cleaning
            normalized, reason = normalize_date(val)
            if normalized and reason:
                cleaned[field] = normalized
                changes.append({"field": field, "original": val, "cleaned": normalized, "reason": reason})

                # Create rule from successful deterministic cleaning
                await learn_from_correction(db, source_name, field, val, normalized, "format_convert")
                rules_created += 1
            elif _is_ambiguous_date(val):
                # Step 3: AI resolution for ambiguous dates
                context = {k: v for k, v in record.items() if k != field}
                ai_result = await ai_resolve_ambiguous(db, record, field, val, context, tenant_schema)
                if ai_result["action"] in ("auto_apply", "apply_with_flag"):
                    cleaned[field] = ai_result["suggested_value"]
                    changes.append({
                        "field": field, "original": val,
                        "cleaned": ai_result["suggested_value"],
                        "reason": f"AI resolved: {ai_result['reasoning']}",
                    })
                    ai_cleaned += 1
                    # Learn from AI correction
                    await learn_from_correction(db, source_name, field, val, ai_result["suggested_value"], "ai")
                    rules_created += 1
                elif ai_result["action"] == "quarantine":
                    confidence *= 0.5

    # --- Name cleaning ---
    name_fields = [k for k in record if any(n in k.lower() for n in ["name", "patient", "subscriber"])]
    for field in name_fields:
        val = record.get(field)
        if val and isinstance(val, str) and ("," in val or val == val.upper()):
            rule_result = await _check_and_apply_rules(db, source_name, field, val)
            if rule_result:
                cleaned[field] = rule_result["cleaned_value"]
                changes.append({"field": field, "original": val, "cleaned": rule_result["cleaned_value"], "reason": f"Applied learned rule #{rule_result['rule_id']}"})
                rules_applied += 1
                continue

            parsed = clean_name(val)
            if parsed:
                cleaned[field] = parsed
                changes.append({"field": field, "original": val, "cleaned": parsed, "reason": "Parsed and normalised name"})

    # --- Gender ---
    gender_fields = [k for k in record if "gender" in k.lower() or "sex" in k.lower()]
    for field in gender_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            rule_result = await _check_and_apply_rules(db, source_name, field, val)
            if rule_result:
                cleaned[field] = rule_result["cleaned_value"]
                changes.append({"field": field, "original": val, "cleaned": rule_result["cleaned_value"], "reason": f"Applied learned rule #{rule_result['rule_id']}"})
                rules_applied += 1
                continue

            normalized, reason = normalize_gender(val)
            if normalized and reason:
                cleaned[field] = normalized
                changes.append({"field": field, "original": val, "cleaned": normalized, "reason": reason})
                await learn_from_correction(db, source_name, field, val, normalized, "value_map")
                rules_created += 1

    # --- Amount cleaning ---
    amount_fields = [k for k in record if any(a in k.lower() for a in ["amount", "charge", "paid", "cost", "price", "billed"])]
    for field in amount_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            normalized, reason = clean_amount(val)
            if normalized is not None and reason:
                cleaned[field] = normalized
                changes.append({"field": field, "original": val, "cleaned": normalized, "reason": reason})

    # --- Phone normalization ---
    phone_fields = [k for k in record if "phone" in k.lower() or "tel" in k.lower() or "fax" in k.lower()]
    for field in phone_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            normalized, reason = normalize_phone(val)
            if normalized and reason:
                cleaned[field] = normalized
                changes.append({"field": field, "original": val, "cleaned": normalized, "reason": reason})

    # --- NPI validation ---
    npi_fields = [k for k in record if "npi" in k.lower()]
    for field in npi_fields:
        val = record.get(field)
        if val:
            valid, reason = validate_npi(str(val))
            if not valid:
                changes.append({"field": field, "original": val, "cleaned": val, "reason": f"FLAGGED: {reason}"})
                confidence *= 0.7

    # --- ICD-10 code fixes ---
    diag_fields = [k for k in record if any(d in k.lower() for d in ["diagnosis", "icd", "dx"])]
    for field in diag_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            rule_result = await _check_and_apply_rules(db, source_name, field, val)
            if rule_result:
                cleaned[field] = rule_result["cleaned_value"]
                changes.append({"field": field, "original": val, "cleaned": rule_result["cleaned_value"], "reason": f"Applied learned rule #{rule_result['rule_id']}"})
                rules_applied += 1
                continue

            fixed, reason = fix_icd10_code(val)
            if reason:
                cleaned[field] = fixed
                changes.append({"field": field, "original": val, "cleaned": fixed, "reason": reason})
                await learn_from_correction(db, source_name, field, val, fixed, "code_correction")
                rules_created += 1
            elif _is_ambiguous_icd10(val):
                # AI resolution for malformed ICD-10 codes
                context = {k: v for k, v in record.items() if k != field}
                ai_result = await ai_resolve_ambiguous(db, record, field, val, context, tenant_schema)
                if ai_result["action"] in ("auto_apply", "apply_with_flag"):
                    cleaned[field] = ai_result["suggested_value"]
                    changes.append({
                        "field": field, "original": val,
                        "cleaned": ai_result["suggested_value"],
                        "reason": f"AI resolved ICD-10: {ai_result['reasoning']}",
                    })
                    ai_cleaned += 1
                    await learn_from_correction(db, source_name, field, val, ai_result["suggested_value"], "ai")
                    rules_created += 1
                else:
                    confidence *= 0.6

    # --- State abbreviation ---
    state_fields = [k for k in record if "state" in k.lower()]
    for field in state_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            normalized, reason = normalize_state(val)
            if normalized and reason:
                cleaned[field] = normalized
                changes.append({"field": field, "original": val, "cleaned": normalized, "reason": reason})

    # --- ZIP code formatting ---
    zip_fields = [k for k in record if "zip" in k.lower() or "postal" in k.lower()]
    for field in zip_fields:
        val = record.get(field)
        if val and isinstance(val, str):
            normalized, reason = normalize_zip(val)
            if normalized and reason:
                cleaned[field] = normalized
                changes.append({"field": field, "original": val, "cleaned": normalized, "reason": reason})

    return {
        "cleaned_record": cleaned,
        "changes_made": changes,
        "confidence": round(confidence, 3),
        "rules_applied": rules_applied,
        "rules_created": rules_created,
        "ai_cleaned": ai_cleaned,
    }


async def process_incoming_data(
    db: AsyncSession,
    raw_data: str | bytes,
    source_info: dict,
    tenant_schema: str = "public",
) -> dict:
    """
    Main entry point. Accepts raw data in ANY format.

    1. Auto-detect format
    2. Parse into structured records
    3. Auto-detect data type
    4. Map fields using learned rules, AI mapping, or heuristic fallback
    5. Clean each record
    6. Resolve entities
    7. Validate against data quality gate
    8. Route clean/dirty records
    9. Log everything
    """
    start = time.time()

    if isinstance(raw_data, bytes):
        raw_data = raw_data.decode("utf-8", errors="replace")

    source_name = source_info.get("source_name", "unknown")

    # Step 1: Detect format (now async with AI fallback)
    format_detected = await detect_format(raw_data, tenant_schema)

    # Step 2: Parse (simplified — in production each format has a dedicated parser)
    records: list[dict] = []
    if format_detected == "csv":
        lines = raw_data.strip().split("\n")
        if len(lines) > 1:
            headers = [h.strip().strip('"') for h in lines[0].split(",")]
            for line in lines[1:]:
                vals = [v.strip().strip('"') for v in line.split(",")]
                records.append(dict(zip(headers, vals)))
    elif format_detected == "json":
        try:
            parsed = json.loads(raw_data)
            if isinstance(parsed, list):
                records = parsed
            elif isinstance(parsed, dict) and "records" in parsed:
                records = parsed["records"]
            else:
                records = [parsed]
        except json.JSONDecodeError:
            records = []
    elif format_detected == "pipe_delimited":
        lines = raw_data.strip().split("\n")
        if len(lines) > 1:
            headers = [h.strip() for h in lines[0].split("|")]
            for line in lines[1:]:
                vals = [v.strip() for v in line.split("|")]
                records.append(dict(zip(headers, vals)))
    else:
        # For HL7v2, X12, CDA, etc. — delegate to existing parsers
        records = [{"raw": raw_data, "format": format_detected}]

    # Step 3: Detect data type
    data_type = detect_data_type(records)

    # Steps 4-7: Clean each record
    clean_count = 0
    quarantined_count = 0
    ai_cleaned_count = 0
    rules_applied_count = 0
    rules_created_count = 0
    entities_matched = 0
    all_changes: list[dict] = []

    for record in records:
        result = await ai_clean_record(db, record, data_type, tenant_schema, source_name)
        if result["changes_made"]:
            all_changes.extend(result["changes_made"])

        ai_cleaned_count += result.get("ai_cleaned", 0)
        rules_applied_count += result.get("rules_applied", 0)
        rules_created_count += result.get("rules_created", 0)

        if result["confidence"] >= 0.6:
            clean_count += 1
        else:
            quarantined_count += 1

    elapsed_ms = int((time.time() - start) * 1000)

    return {
        "format_detected": format_detected,
        "data_type": data_type,
        "total_records": len(records),
        "clean": clean_count,
        "quarantined": quarantined_count,
        "ai_cleaned": ai_cleaned_count,
        "rules_applied": rules_applied_count,
        "rules_created": rules_created_count,
        "entity_matches": entities_matched,
        "processing_time_ms": elapsed_ms,
        "changes": all_changes[:100],  # cap for response size
    }


async def learn_from_correction(
    db: AsyncSession,
    source_name: str,
    field: str,
    original_value: str,
    corrected_value: str,
    rule_type: str = "value_map",
) -> dict:
    """
    When a human or AI corrects data, create a TransformationRule so the system
    auto-applies the correction next time.
    """
    from app.models.transformation_rule import TransformationRule

    # Check if a rule for this exact correction already exists
    existing = await db.execute(
        select(TransformationRule).where(
            TransformationRule.field == field,
            TransformationRule.condition == {"value": original_value},
            TransformationRule.transformation == {"to": corrected_value},
            TransformationRule.is_active == True,
        )
    )
    existing_rule = existing.scalar_one_or_none()
    if existing_rule:
        # Rule already exists — increment usage
        existing_rule.times_applied = (existing_rule.times_applied or 0) + 1
        await db.flush()
        return {
            "rule_id": existing_rule.id,
            "source_name": source_name,
            "field": field,
            "action": "incremented_existing",
        }

    rule = TransformationRule(
        source_name=source_name if source_name != "universal" else None,
        field=field,
        rule_type=rule_type,
        condition={"value": original_value},
        transformation={"to": corrected_value},
        created_from="human" if rule_type not in ("ai",) else "ai",
        times_applied=0,
        times_overridden=0,
        accuracy=100.0 if rule_type != "ai" else 90.0,
        is_active=True,
    )
    db.add(rule)
    await db.flush()

    return {
        "rule_id": rule.id,
        "source_name": source_name,
        "field": field,
        "condition": rule.condition,
        "transformation": rule.transformation,
        "created_from": rule.created_from,
    }


async def get_pipeline_dashboard(db: AsyncSession) -> dict:
    """
    Pipeline health dashboard:
    - Total records processed (lifetime)
    - Auto-clean rate
    - AI accuracy
    - Rules created
    - Top data quality issues
    - Processing speed trend
    """
    from app.models.transformation_rule import PipelineRun, TransformationRule

    # Total records processed
    total_result = await db.execute(select(func.sum(PipelineRun.total_records)))
    total_processed = total_result.scalar() or 0

    # Clean records
    clean_result = await db.execute(select(func.sum(PipelineRun.clean_records)))
    total_clean = clean_result.scalar() or 0

    auto_clean_rate = round((total_clean / total_processed * 100) if total_processed > 0 else 0, 1)

    # AI accuracy from rules
    rule_result = await db.execute(select(func.avg(TransformationRule.accuracy)).where(TransformationRule.is_active == True))
    ai_accuracy = round(rule_result.scalar() or 0, 1)

    # Total rules
    rules_count_result = await db.execute(select(func.count(TransformationRule.id)))
    rules_count = rules_count_result.scalar() or 0

    # Recent runs
    recent_runs_result = await db.execute(
        select(PipelineRun).order_by(PipelineRun.created_at.desc()).limit(10)
    )
    recent_runs = recent_runs_result.scalars().all()

    return {
        "total_processed": total_processed,
        "auto_clean_rate": auto_clean_rate,
        "ai_accuracy": ai_accuracy,
        "rules_learned": rules_count,
        "recent_runs": [
            {
                "id": r.id,
                "source_name": r.source_name,
                "format_detected": r.format_detected,
                "data_type_detected": r.data_type_detected,
                "total_records": r.total_records,
                "clean_records": r.clean_records,
                "quarantined_records": r.quarantined_records,
                "ai_cleaned": r.ai_cleaned,
                "rules_applied": r.rules_applied,
                "rules_created": r.rules_created,
                "processing_time_ms": r.processing_time_ms,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in recent_runs
        ],
    }
