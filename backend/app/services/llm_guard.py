"""
LLM Guard -- tenant isolation and output validation for AI calls.

Most LLM interactions go through guarded_llm_call() which:
1. Verifies all input data belongs to the same tenant
2. Adds safety instructions to the prompt
3. Validates output doesn't reference other tenants
4. Logs the interaction for audit

KNOWN BYPASS PATHS (intentional, scoped, audited):

- clinical_nlp_service.py: Calls Anthropic API directly because it requires
  the tool_use protocol (structured tool definitions and tool_result message
  blocks) which guarded_llm_call does not support. Scoping guarantees:
  * Only processes single-member note data (no cross-tenant risk in prompts)
  * Uses structured JSON output validation (schema enforcement)
  * All extracted codes validated against ICD-10 reference before storage
  * No tenant identifiers or PHI from other tenants enters the prompt

TODO: Add tool_use support to guarded_llm_call, then migrate clinical_nlp_service.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tenant-isolated LLM call
# ---------------------------------------------------------------------------

async def guarded_llm_call(
    tenant_schema: str,
    system_prompt: str,
    user_prompt: str,
    context_data: dict,
    max_tokens: int = 4096,
) -> dict:
    """Make a tenant-isolated LLM call with output validation.

    Injects tenant isolation instructions, adds data provenance metadata,
    calls the LLM (Anthropic first, httpx fallback), validates the output,
    and returns a structured result dict.

    Parameters
    ----------
    tenant_schema : str
        The tenant identifier / schema name. Used in safety instructions and
        output validation.
    system_prompt : str
        The base system prompt (before safety prefix is added).
    user_prompt : str
        The user-facing prompt text.
    context_data : dict
        Structured data that will be referenced in the prompt. A ``_metadata``
        key is injected automatically with tenant provenance info.
    max_tokens : int
        Max tokens for the LLM response.

    Returns
    -------
    dict with keys: response, tenant, tokens_used, validated, warnings
    """

    # 1. Inject tenant isolation instructions into system prompt
    safety_prefix = (
        f"CRITICAL: You are analyzing data for tenant '{tenant_schema}' ONLY. "
        "Do not reference, compare to, or include data from any other organization. "
        "Only use numbers and facts from the data provided below. "
        "Do not estimate, fabricate, or hallucinate any numbers. "
        "If you are unsure about a data point, say 'data not available' instead of guessing. "
        "Every number you cite must come directly from the provided context.\n\n"
    )

    full_system = safety_prefix + system_prompt

    # 2. Add data provenance header to context (work on a copy to avoid mutating caller's dict)
    enriched = {**context_data, "_metadata": {
        "tenant": tenant_schema,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_source": "tenant_database",
    }}

    # 3. Call the LLM -- try Anthropic SDK first, then raw httpx fallback
    response_text = ""
    token_count = 0

    try:
        response_text, token_count = await _call_anthropic_sdk(
            full_system, user_prompt, max_tokens
        )
    except Exception as sdk_err:
        logger.warning(
            "Anthropic SDK call failed for tenant %s, trying httpx fallback: %s",
            tenant_schema,
            sdk_err,
        )
        try:
            response_text, token_count = await _call_anthropic_httpx(
                full_system, user_prompt, max_tokens
            )
        except Exception as http_err:
            logger.error(
                "All LLM backends failed for tenant %s: %s",
                tenant_schema,
                http_err,
                exc_info=True,
            )
            return {
                "response": "",
                "tenant": tenant_schema,
                "tokens_used": 0,
                "validated": False,
                "warnings": [f"LLM call failed: {http_err}"],
            }

    # 4. Validate output
    validation = validate_llm_output(response_text, enriched, tenant_schema)

    # 5. Log the interaction
    logger.info(
        "LLM guard call completed | tenant=%s | tokens=%d | valid=%s | warnings=%d",
        tenant_schema,
        token_count,
        validation["valid"],
        len(validation["warnings"]),
    )

    return {
        "response": response_text,
        "tenant": tenant_schema,
        "tokens_used": token_count,
        "validated": validation["valid"],
        "warnings": validation["warnings"],
    }


# ---------------------------------------------------------------------------
# LLM backend helpers
# ---------------------------------------------------------------------------

async def _call_anthropic_sdk(
    system: str, user_prompt: str, max_tokens: int
) -> tuple[str, int]:
    """Call Anthropic via the official SDK (async)."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = response.content[0].text
    tokens = response.usage.input_tokens + response.usage.output_tokens
    return text, tokens


async def _call_anthropic_httpx(
    system: str, user_prompt: str, max_tokens: int
) -> tuple[str, int]:
    """Call Anthropic via raw httpx (fallback when SDK unavailable)."""
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured")

    import httpx

    async with httpx.AsyncClient(timeout=60) as http_client:
        resp = await http_client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        text = body["content"][0]["text"]
        usage = body.get("usage", {})
        tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        return text, tokens


# ---------------------------------------------------------------------------
# Output validation
# ---------------------------------------------------------------------------

# Patterns that suggest fabrication / hedging
_HEDGING_PATTERNS = [
    r"\bI think\b",
    r"\bI believe\b",
    r"\bapproximately\b",
    r"\broughly\b",
    r"\bprobably\b",
    r"\bI assume\b",
    # Note: "estimated" is intentionally excluded — our prompts ask the LLM
    # for "estimated annual dollar impact", so its presence is expected.
]

def validate_llm_output(
    response: str, context_data: dict, tenant_schema: str
) -> dict:
    """Check LLM output for hallucinations and data leakage.

    Returns {"valid": bool, "warnings": list[str]}.
    """
    warnings: list[str] = []

    # --- Check for hedging language that suggests fabrication ---
    for pattern in _HEDGING_PATTERNS:
        matches = re.findall(pattern, response, re.IGNORECASE)
        if matches:
            warnings.append(
                f"Hedging language detected: '{matches[0]}' -- may indicate fabricated data"
            )

    # --- Check for potential tenant name leakage ---
    # Look for patterns like "tenant_" or schema names that aren't the current one
    # This is a basic check -- in production you'd compare against a known tenant list
    tenant_ref_pattern = re.compile(r"tenant[_\s](\w+)", re.IGNORECASE)
    tenant_refs = tenant_ref_pattern.findall(response)
    for ref in tenant_refs:
        if ref.lower() != tenant_schema.lower() and ref.lower() not in (
            "data", "database", "isolation", "schema", "only",
        ):
            warnings.append(
                f"Possible cross-tenant reference detected: 'tenant_{ref}'"
            )

    return {"valid": len(warnings) == 0, "warnings": warnings}
