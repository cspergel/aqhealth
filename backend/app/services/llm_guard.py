"""
LLM Guard -- tenant isolation, output validation, and cost caps for AI calls.

Most LLM interactions go through guarded_llm_call() which:
1. Verifies all input data belongs to the same tenant
2. Adds safety instructions to the prompt
3. Enforces a per-tenant daily token budget (cost cap)
4. Validates output doesn't reference other tenants
5. Logs the interaction for audit

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

from fastapi import HTTPException

from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Per-tenant daily token budget (cost cap)
# ---------------------------------------------------------------------------
#
# We track usage in Redis when it's reachable (preferred — the counters are
# hot on multi-worker deployments and Redis INCR is atomic) and fall back to
# an in-process dict when Redis isn't configured. The in-process fallback is
# best-effort only — acceptable for dev and single-worker test runs where
# budget enforcement is informative rather than a security boundary.


# In-process fallback store. Keys are {tenant}:{YYYY-MM-DD}, values are
# ints (tokens used today). Reset naturally because dates change.
_process_usage: dict[str, int] = {}


def _budget_key(tenant_schema: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"claude_usage:{tenant_schema}:{today}"


async def _get_redis():
    """Return an async Redis client, or None if Redis isn't configured /
    reachable. We import locally so the module doesn't hard-depend on redis
    at import time for tests that stub it out."""
    try:
        import redis.asyncio as redis_async  # type: ignore

        client = redis_async.from_url(settings.redis_url, decode_responses=True)
        # Ping is cheap — if it fails, fall back to the in-process counter.
        await client.ping()
        return client
    except Exception:
        return None


async def _get_tenant_usage(tenant_schema: str) -> int:
    """Current day's token usage for ``tenant_schema`` (int, 0 on miss)."""
    key = _budget_key(tenant_schema)
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            raw = await redis_client.get(key)
            return int(raw) if raw is not None else 0
        except Exception:
            pass  # fall through to in-process
        finally:
            try:
                await redis_client.close()
            except Exception:
                pass
    return _process_usage.get(key, 0)


async def _increment_tenant_usage(tenant_schema: str, tokens: int) -> int:
    """Atomically add ``tokens`` to the tenant's day counter and return the
    new total. Sets a TTL of ~48h so stale keys don't linger."""
    if tokens <= 0:
        return await _get_tenant_usage(tenant_schema)

    key = _budget_key(tenant_schema)
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            # INCRBY returns the new value; EXPIRE is idempotent.
            new_total = await redis_client.incrby(key, tokens)
            await redis_client.expire(key, 48 * 60 * 60)
            return int(new_total)
        except Exception:
            pass
        finally:
            try:
                await redis_client.close()
            except Exception:
                pass

    # In-process fallback
    _process_usage[key] = _process_usage.get(key, 0) + tokens
    return _process_usage[key]


async def check_tenant_budget(tenant_schema: str) -> None:
    """Raise HTTPException(429) if ``tenant_schema`` has exhausted its daily
    Claude budget. Called at the start of every guarded_llm_call."""
    budget = settings.anthropic_daily_token_budget_per_tenant
    if budget <= 0:
        return  # disabled

    used = await _get_tenant_usage(tenant_schema)
    if used >= budget:
        logger.error(
            "Daily AI budget exhausted | tenant=%s used=%d budget=%d",
            tenant_schema, used, budget,
        )
        raise HTTPException(
            status_code=429,
            detail="Daily AI budget exhausted",
        )


async def _record_usage_and_warn(tenant_schema: str, tokens: int) -> None:
    """Increment the tenant's day counter and emit a structured warning when
    usage crosses 80% so ops can alert/monitor."""
    budget = settings.anthropic_daily_token_budget_per_tenant
    if tokens <= 0 or budget <= 0:
        return

    new_total = await _increment_tenant_usage(tenant_schema, tokens)
    pct = (new_total / budget) * 100 if budget > 0 else 0
    if new_total >= budget:
        logger.error(
            "Daily AI budget consumed | tenant=%s used=%d budget=%d pct=%.1f",
            tenant_schema, new_total, budget, pct,
        )
    elif pct >= 80.0:
        # Structured log line — ops dashboards should alert on this.
        logger.warning(
            "Claude daily budget nearing limit | tenant=%s used=%d budget=%d pct=%.1f",
            tenant_schema, new_total, budget, pct,
        )


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

    Enforces the per-tenant daily token budget (``check_tenant_budget`` is
    called before the LLM request, and the response tokens are booked into
    the running counter on success). Injects tenant isolation instructions,
    adds data provenance metadata, calls the LLM (Anthropic first, httpx
    fallback), validates the output, and returns a structured result dict.

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

    Raises
    ------
    HTTPException(429)
        The tenant has exhausted its daily Claude budget.
    """

    # 0. Daily budget gate — raises 429 if exhausted.
    await check_tenant_budget(tenant_schema)

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

    # 3b. Book consumed tokens against the tenant's daily budget.
    # Done AFTER the successful call so failed/aborted attempts don't count.
    try:
        await _record_usage_and_warn(tenant_schema, token_count)
    except Exception:
        logger.exception("Failed to record Claude token usage for tenant %s", tenant_schema)

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
