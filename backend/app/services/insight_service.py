"""
AI Insight Engine — the brain of the platform.

Builds a FULL CONTEXT GRAPH across ALL modules (HCC, expenditure, care gaps,
provider scorecards, population demographics) and uses Claude to discover
cross-module patterns that no single module would surface alone.

Every insight links back to specific records via `connections` and tracks
which modules contributed via `source_modules`.
"""

import json
import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, case, update, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constants import PMPM_BENCHMARKS
from app.services.llm_guard import guarded_llm_call
from app.models.claim import Claim, ClaimType
from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.insight import Insight, InsightCategory, InsightStatus
from app.models.member import Member, RiskTier
from app.models.provider import Provider

logger = logging.getLogger(__name__)

from app.constants import CMS_PMPM_BASE as CMS_MONTHLY_BASE


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _safe_int(v) -> int:
    return int(v) if v is not None else 0


# ---------------------------------------------------------------------------
# Context graph assembly — pulls from ALL modules simultaneously
# ---------------------------------------------------------------------------

async def build_context_graph(db: AsyncSession) -> dict:
    """
    Assemble a COMPLETE picture of the tenant's population by pulling
    from ALL modules simultaneously. This structured dict serves as the
    LLM's input for cross-module pattern detection.
    """
    today = date.today()
    current_year = today.year
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    # --- Population demographics ---
    pop_q = await db.execute(
        select(
            func.count(Member.id),
            func.avg(Member.current_raf),
            func.avg(Member.projected_raf),
        ).where(active_filter)
    )
    pop_row = pop_q.one()
    total_lives = _safe_int(pop_row[0])
    avg_raf = _safe_float(pop_row[1])
    avg_projected_raf = _safe_float(pop_row[2])

    # Risk tier distribution
    tier_q = await db.execute(
        select(Member.risk_tier, func.count(Member.id))
        .where(active_filter, Member.risk_tier.is_not(None))
        .group_by(Member.risk_tier)
    )
    risk_tiers = {
        str(row[0]): row[1]
        for row in tier_q.all()
    }

    # --- HCC suspects ---
    suspect_q = await db.execute(
        select(
            func.count(HccSuspect.id),
            func.coalesce(func.sum(HccSuspect.annual_value), 0),
        ).where(HccSuspect.status == SuspectStatus.open.value)
    )
    s_row = suspect_q.one()
    open_suspects = _safe_int(s_row[0])
    suspect_total_value = _safe_float(s_row[1])

    # Top suspect HCC categories
    top_hcc_q = await db.execute(
        select(
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            func.count(HccSuspect.id).label("cnt"),
            func.coalesce(func.sum(HccSuspect.annual_value), 0).label("val"),
        )
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.hcc_code, HccSuspect.hcc_label)
        .order_by(func.sum(HccSuspect.annual_value).desc())
        .limit(10)
    )
    top_suspects = [
        {"hcc_code": r.hcc_code, "hcc_label": r.hcc_label, "count": r.cnt, "total_value": _safe_float(r.val)}
        for r in top_hcc_q.all()
    ]

    # Highest-value members by suspect value
    top_member_q = await db.execute(
        select(
            HccSuspect.member_id,
            func.count(HccSuspect.id).label("suspect_count"),
            func.coalesce(func.sum(HccSuspect.annual_value), 0).label("total_value"),
        )
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.member_id)
        .order_by(func.sum(HccSuspect.annual_value).desc())
        .limit(15)
    )
    highest_value_members = [
        {"member_id": r.member_id, "suspect_count": r.suspect_count, "total_value": _safe_float(r.total_value)}
        for r in top_member_q.all()
    ]

    # Aging suspects (open 60+ days)
    aging_cutoff = today - timedelta(days=60)
    aging_q = await db.execute(
        select(func.count(HccSuspect.id)).where(
            HccSuspect.status == SuspectStatus.open.value,
            HccSuspect.identified_date <= aging_cutoff,
        )
    )
    aging_suspects = _safe_int(aging_q.scalar())

    # --- Expenditure ---
    member_count_for_pmpm = max(total_lives, 1)
    cat_q = await db.execute(
        select(
            Claim.service_category,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category.is_not(None))
        .group_by(Claim.service_category)
        .order_by(func.sum(Claim.paid_amount).desc())
    )
    benchmarks = PMPM_BENCHMARKS
    expenditure_categories = []
    total_spend = 0.0
    for r in cat_q.all():
        cat = r.service_category
        spend = _safe_float(r.total_spend)
        total_spend += spend
        pmpm = spend / (member_count_for_pmpm * 12)
        bm = benchmarks.get(cat, 50)
        variance = ((pmpm - bm) / bm * 100) if bm > 0 else 0
        expenditure_categories.append({
            "category": cat,
            "total_spend": round(spend, 2),
            "pmpm": round(pmpm, 2),
            "benchmark_pmpm": bm,
            "variance_pct": round(variance, 1),
        })

    # Top facility outliers by spend
    facility_q = await db.execute(
        select(
            Claim.facility_name,
            func.sum(Claim.paid_amount).label("total"),
            func.count(distinct(Claim.claim_id)).label("admits"),
        )
        .where(Claim.facility_name.is_not(None))
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(5)
    )
    facility_outliers = [
        {"facility": r.facility_name, "total_spend": _safe_float(r.total), "admits": _safe_int(r.admits)}
        for r in facility_q.all()
    ]

    # --- Care gaps ---
    gap_q = await db.execute(
        select(
            GapMeasure.code,
            GapMeasure.name,
            GapMeasure.stars_weight,
            func.count(MemberGap.id).label("total"),
            func.sum(case((MemberGap.status == GapStatus.open.value, 1), else_=0)).label("open_ct"),
            func.sum(case((MemberGap.status == GapStatus.closed.value, 1), else_=0)).label("closed_ct"),
        )
        .join(MemberGap, MemberGap.measure_id == GapMeasure.id)
        .where(MemberGap.measurement_year == current_year)
        .group_by(GapMeasure.code, GapMeasure.name, GapMeasure.stars_weight)
        .order_by(func.count(MemberGap.id).desc())
    )
    care_gap_summary = []
    for r in gap_q.all():
        total = _safe_int(r.total)
        closed = _safe_int(r.closed_ct)
        rate = (closed / total * 100) if total > 0 else 0
        care_gap_summary.append({
            "measure_code": r.code,
            "measure_name": r.name,
            "stars_weight": r.stars_weight,
            "total_eligible": total,
            "open_gaps": _safe_int(r.open_ct),
            "closed_gaps": closed,
            "closure_rate": round(rate, 1),
        })

    triple_weighted_at_risk = [
        g for g in care_gap_summary
        if g["stars_weight"] >= 3 and g["closure_rate"] < 80
    ]

    # --- Provider performance ---
    prov_q = await db.execute(
        select(
            Provider.id,
            Provider.first_name,
            Provider.last_name,
            Provider.specialty,
            Provider.panel_size,
            Provider.capture_rate,
            Provider.recapture_rate,
            Provider.panel_pmpm,
            Provider.gap_closure_rate,
        )
        .where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
        .order_by(Provider.capture_rate.desc().nulls_last())
    )
    all_providers = prov_q.all()
    provider_metrics = []
    for p in all_providers:
        provider_metrics.append({
            "provider_id": p.id,
            "name": f"{p.first_name or ''} {p.last_name or ''}".strip(),
            "specialty": p.specialty,
            "panel_size": _safe_int(p.panel_size),
            "capture_rate": _safe_float(p.capture_rate),
            "recapture_rate": _safe_float(p.recapture_rate),
            "panel_pmpm": _safe_float(p.panel_pmpm),
            "gap_closure_rate": _safe_float(p.gap_closure_rate),
        })

    top_performers = provider_metrics[:5]
    bottom_performers = provider_metrics[-5:] if len(provider_metrics) > 5 else []

    # --- Cross-module connections ---
    # Members with 3+ open suspects
    multi_suspect_q = await db.execute(
        select(HccSuspect.member_id, func.count(HccSuspect.id).label("cnt"))
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.member_id)
        .having(func.count(HccSuspect.id) >= 3)
    )
    multi_suspect_ids = {r.member_id: r.cnt for r in multi_suspect_q.all()}

    # Members with 2+ open care gaps
    multi_gap_q = await db.execute(
        select(MemberGap.member_id, func.count(MemberGap.id).label("cnt"))
        .where(MemberGap.status == GapStatus.open.value, MemberGap.measurement_year == current_year)
        .group_by(MemberGap.member_id)
        .having(func.count(MemberGap.id) >= 2)
    )
    multi_gap_ids = {r.member_id: r.cnt for r in multi_gap_q.all()}

    # High-cost members (top 5%)
    high_cost_q = await db.execute(
        select(Claim.member_id, func.sum(Claim.paid_amount).label("total"))
        .group_by(Claim.member_id)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(max(total_lives // 20, 5))
    )
    high_cost_ids = {r.member_id: _safe_float(r.total) for r in high_cost_q.all()}

    # Intersection: members flagged in 2+ categories
    cross_module_members = []
    all_flagged = set(multi_suspect_ids) | set(multi_gap_ids) | set(high_cost_ids)
    for mid in all_flagged:
        flags = []
        if mid in multi_suspect_ids:
            flags.append(f"{multi_suspect_ids[mid]} open suspects")
        if mid in multi_gap_ids:
            flags.append(f"{multi_gap_ids[mid]} open care gaps")
        if mid in high_cost_ids:
            flags.append(f"${high_cost_ids[mid]:,.0f} total claims")
        if len(flags) >= 2:
            cross_module_members.append({"member_id": mid, "flags": flags})

    cross_module_members.sort(key=lambda x: len(x["flags"]), reverse=True)

    return {
        "generated_date": today.isoformat(),
        "population": {
            "total_lives": total_lives,
            "avg_raf": round(avg_raf, 3),
            "avg_projected_raf": round(avg_projected_raf, 3),
            "risk_tier_distribution": risk_tiers,
        },
        "hcc_suspects": {
            "open_count": open_suspects,
            "total_annual_value": round(suspect_total_value, 2),
            "top_categories": top_suspects,
            "highest_value_members": highest_value_members[:10],
            "aging_suspects_60_plus_days": aging_suspects,
        },
        "expenditure": {
            "total_spend": round(total_spend, 2),
            "categories": expenditure_categories,
            "facility_outliers": facility_outliers,
        },
        "care_gaps": {
            "measures": care_gap_summary,
            "triple_weighted_at_risk": triple_weighted_at_risk,
        },
        "providers": {
            "total_providers": len(provider_metrics),
            "top_performers": top_performers,
            "bottom_performers": bottom_performers,
            "all_metrics": provider_metrics[:20],
        },
        "cross_module": {
            "members_with_multiple_alerts": cross_module_members[:20],
        },
    }


# ---------------------------------------------------------------------------
# Population insight generation
# ---------------------------------------------------------------------------

POPULATION_SYSTEM_PROMPT = """\
You are an expert healthcare analytics advisor for a Medicare Advantage MSO.
You have access to the COMPLETE population data across all modules: HCC suspects,
expenditure analytics, care gap tracking, and provider scorecards.

Your job is to find CROSS-MODULE patterns that no single module would surface alone.
Think of the data as an interconnected web — every data point connects.

Examples of the kind of cross-module intelligence you should surface:
- A provider with low HCC capture AND high inpatient spend (under-documenting complexity)
- Members with multiple open suspects AND open care gaps AND high cost (comprehensive visit candidates)
- A drug class driving high pharmacy spend AND members on those drugs having adherence gaps
- A facility with high SNF discharge rates AND those patients having lower HCC capture
- Triple-weighted Stars measures at risk AND the providers whose panels drive those gaps

Be specific. Name dollar amounts. Name member counts. Be actionable."""

POPULATION_USER_PROMPT = """\
Here is the FULL CONTEXT GRAPH for this tenant's population.
Analyze ALL of it together — not module by module.

{context_json}

Generate insights in exactly 5 categories:
1. **revenue** — HCC capture opportunities, RAF uplift, recapture gaps
2. **cost** — expenditure outliers, facility overuse, pharmacy savings
3. **quality** — care gap closure, Stars measure risks, quality improvement
4. **provider** — provider performance patterns, coaching opportunities
5. **cross_module** — patterns that ONLY emerge when looking across multiple modules

For each insight, return a JSON object with these fields:
- "category": one of "revenue", "cost", "quality", "provider", "cross_module"
- "title": concise headline (max 120 chars)
- "description": 2-3 sentence explanation with specific numbers
- "dollar_impact": estimated annual dollar impact (number, can be negative for savings)
- "recommended_action": specific next step someone should take
- "confidence": 0-100 confidence score
- "affected_members": list of member IDs most relevant (up to 10), or empty list
- "affected_providers": list of provider IDs most relevant (up to 5), or empty list
- "source_modules": list of modules that contributed data (from: "hcc_engine", "expenditure", "care_gaps", "provider_scorecard", "population")
- "connections": dict mapping record types to IDs, e.g. {{"hcc_suspects": [12, 34], "care_gaps": [78]}}
- "surface_on": list of UI locations to show this (from: "dashboard", "hcc", "expenditure", "expenditure.inpatient", "expenditure.pharmacy", "providers", "care_gaps")

Return a JSON array of 8-15 insights. Prioritize cross_module insights.
Return ONLY valid JSON — no markdown, no explanation outside the array."""


def _parse_llm_json(raw_text: str) -> list[dict] | None:
    """Parse LLM response text, stripping markdown fences if present."""
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
        logger.error("LLM response is not a JSON array")
        return None
    except json.JSONDecodeError:
        logger.error("Failed to parse LLM response as JSON: %s", text[:500])
        return None


async def generate_insights(db: AsyncSession, tenant_schema: str = "default") -> list[dict]:
    """
    Build full context graph, call Claude for cross-module pattern detection,
    persist Insight records, and clean up stale insights.

    Now runs the Autonomous Discovery Engine FIRST to find data-driven insights,
    then feeds them into the LLM alongside the context graph.

    Injects learning context (past prediction accuracy, blind spots, user
    preferences) so the LLM can adjust confidence and prioritize accordingly.
    """
    # --- Run Autonomous Discovery Engine first ---
    from app.services.discovery_service import run_full_discovery
    try:
        discoveries = await run_full_discovery(db, tenant_schema=tenant_schema)
        logger.info("Discovery engine returned %d findings", len(discoveries))
    except Exception as e:
        logger.error("Discovery engine failed, continuing with LLM-only: %s", e)
        discoveries = []

    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping LLM insight generation")
        # If no LLM available, persist discovery results directly
        if discoveries:
            return await _persist_insights(db, discoveries)
        return []

    context = await build_context_graph(db)

    if context["population"]["total_lives"] == 0:
        logger.info("No active members — skipping insight generation")
        return []

    # --- Self-learning injection ---
    from app.services.learning_service import get_learning_context_for_insights, get_user_preference_model
    learning_context = await get_learning_context_for_insights(db)
    user_prefs = await get_user_preference_model(db)

    learning_addendum = ""
    if learning_context.get("has_learning_data"):
        learning_addendum += "\n\nBased on past prediction accuracy:\n"
        for ptype, data in learning_context.get("accuracy_by_type", {}).items():
            learning_addendum += f"- {ptype}: {data['accuracy']}% accurate ({data['total']} predictions)\n"
        if learning_context.get("hcc_blind_spots"):
            learning_addendum += "\nKnown blind spots (lower accuracy — weight these predictions lower):\n"
            for code, data in learning_context["hcc_blind_spots"].items():
                learning_addendum += f"- HCC {code}: {data['accuracy']}% accuracy\n"
        if learning_context.get("hcc_strong_areas"):
            learning_addendum += "\nStrong areas (high accuracy — weight these higher):\n"
            for code, data in learning_context["hcc_strong_areas"].items():
                learning_addendum += f"- HCC {code}: {data['accuracy']}% accuracy\n"
        if learning_context.get("confidence_calibration"):
            learning_addendum += "\nConfidence calibration:\n"
            for bucket, data in learning_context["confidence_calibration"].items():
                learning_addendum += f"- {bucket} confidence predictions: {data['actual_accuracy']}% actual accuracy\n"

    if user_prefs.get("has_preference_data"):
        engagement = user_prefs.get("engagement_by_target", {})
        if engagement:
            top_engaged = sorted(engagement.items(), key=lambda x: x[1], reverse=True)[:3]
            learning_addendum += f"\nUser engagement: Users interact most with {', '.join(t[0] + ' (' + str(t[1]) + 'x)' for t in top_engaged)}. Prioritize these categories.\n"
        dismissals = user_prefs.get("dismissals_by_target", {})
        if dismissals:
            top_dismissed = sorted(dismissals.items(), key=lambda x: x[1], reverse=True)[:3]
            learning_addendum += f"Users frequently dismiss: {', '.join(t[0] for t in top_dismissed)}. De-prioritize or improve quality for these.\n"

    # --- Discovery injection ---
    discovery_addendum = ""
    if discoveries:
        discovery_addendum = "\n\n=== AUTONOMOUS DISCOVERY ENGINE RESULTS ===\n"
        discovery_addendum += "The following insights were discovered by systematic data scans.\n"
        discovery_addendum += "These ARE the primary insights — polish and connect them, add context from the graph above.\n\n"
        discovery_addendum += json.dumps(discoveries[:30], indent=2, default=str)

    enriched_prompt = POPULATION_USER_PROMPT.format(
        context_json=json.dumps(context, indent=2, default=str)
    ) + learning_addendum + discovery_addendum

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=POPULATION_SYSTEM_PROMPT,
            user_prompt=enriched_prompt,
            context_data=context,
            max_tokens=4096,
        )
        if not guard_result["response"]:
            logger.error("Guarded LLM call returned empty response")
            if discoveries:
                return await _persist_insights(db, discoveries)
            return []
        if guard_result["warnings"]:
            logger.warning("LLM output warnings: %s", guard_result["warnings"])
    except Exception as e:
        logger.error("Guarded LLM call failed: %s", e, exc_info=True)
        if discoveries:
            return await _persist_insights(db, discoveries)
        return []

    insights_data = _parse_llm_json(guard_result["response"])
    if not insights_data:
        # Fall back to discovery results if LLM parsing fails
        if discoveries:
            return await _persist_insights(db, discoveries)
        return []

    return await _persist_insights(db, insights_data)


async def _persist_insights(db: AsyncSession, insights_data: list[dict]) -> list[dict]:
    """Dismiss old active insights and persist new ones."""
    # Dismiss old active insights before creating new ones
    await db.execute(
        update(Insight)
        .where(Insight.status == InsightStatus.active.value)
        .values(status=InsightStatus.dismissed.value)
    )

    created = []
    category_map = {c.value: c.value for c in InsightCategory}

    for item in insights_data:
        cat_str = item.get("category", "cross_module")
        category = category_map.get(cat_str, InsightCategory.cross_module.value)

        # Build connections, including scan_type if present
        connections = item.get("connections") or {}
        if item.get("scan_type"):
            connections["scan_type"] = item["scan_type"]

        insight = Insight(
            category=category,
            title=str(item.get("title", "Untitled"))[:300],
            description=str(item.get("description", "")),
            dollar_impact=item.get("dollar_impact"),
            recommended_action=item.get("recommended_action"),
            confidence=item.get("confidence"),
            status=InsightStatus.active.value,
            affected_members=item.get("affected_members") or [],
            affected_providers=item.get("affected_providers") or [],
            surface_on=item.get("surface_on") or ["dashboard"],
            connections=connections,
            source_modules=item.get("source_modules") or [],
        )
        db.add(insight)
        created.append({
            "category": cat_str,
            "title": insight.title,
            "dollar_impact": insight.dollar_impact,
            "scan_type": item.get("scan_type"),
        })

    await db.commit()
    logger.info("Persisted %d population insights", len(created))
    return created


# ---------------------------------------------------------------------------
# Member-level insight generation
# ---------------------------------------------------------------------------

MEMBER_SYSTEM_PROMPT = """\
You are a clinical intelligence advisor for a Medicare Advantage MSO.
You are generating a patient brief for a provider who is about to see this member.
Synthesize ALL available data into actionable clinical and coding insights.
Connect the dots across suspect HCCs, open care gaps, medications, and claims patterns."""

MEMBER_USER_PROMPT = """\
Here is the COMPLETE patient context for this member:

{context_json}

Generate 3-6 patient-specific insights. Each insight should be a JSON object with:
- "title": concise headline
- "description": 2-3 sentences with specifics
- "category": one of "revenue", "cost", "quality", "cross_module"
- "recommended_action": what the provider should do at the next visit
- "dollar_impact": estimated dollar impact if acted on
- "confidence": 0-100
- "source_modules": list of modules contributing data

Prioritize insights that connect multiple data points (e.g., suspect HCC + open care gap + medication).
Return ONLY a JSON array."""


async def generate_member_insights(db: AsyncSession, member_id: int, tenant_schema: str = "default") -> list[dict]:
    """Build patient-level context and generate insights via LLM."""
    if not settings.anthropic_api_key:
        return []

    member = await db.get(Member, member_id)
    if not member:
        return []

    # Suspects
    suspects_q = await db.execute(
        select(HccSuspect).where(
            HccSuspect.member_id == member_id,
            HccSuspect.status == SuspectStatus.open.value,
        )
    )
    suspects = [
        {
            "hcc_code": s.hcc_code, "hcc_label": s.hcc_label,
            "raf_value": _safe_float(s.raf_value),
            "annual_value": _safe_float(s.annual_value),
            "evidence": s.evidence_summary,
            "suspect_type": s.suspect_type,
        }
        for s in suspects_q.scalars().all()
    ]

    # Care gaps
    gaps_q = await db.execute(
        select(MemberGap, GapMeasure)
        .join(GapMeasure, MemberGap.measure_id == GapMeasure.id)
        .where(MemberGap.member_id == member_id, MemberGap.status == GapStatus.open.value)
    )
    gaps = [
        {
            "measure_code": row[1].code, "measure_name": row[1].name,
            "stars_weight": row[1].stars_weight,
            "due_date": str(row[0].due_date) if row[0].due_date else None,
        }
        for row in gaps_q.all()
    ]

    # Claims summary by category
    claims_q = await db.execute(
        select(
            Claim.service_category,
            func.count(Claim.id).label("count"),
            func.sum(Claim.paid_amount).label("total"),
        )
        .where(Claim.member_id == member_id)
        .group_by(Claim.service_category)
    )
    claims_summary = [
        {"category": r.service_category, "claim_count": r.count, "total_paid": _safe_float(r.total)}
        for r in claims_q.all()
    ]

    # Medications
    meds_q = await db.execute(
        select(distinct(Claim.drug_name)).where(
            Claim.member_id == member_id,
            Claim.claim_type == ClaimType.pharmacy,
            Claim.drug_name.is_not(None),
        )
    )
    medications = [r[0] for r in meds_q.all()]

    # Provider
    provider_name = None
    if member.pcp_provider_id:
        prov = await db.get(Provider, member.pcp_provider_id)
        if prov:
            provider_name = f"{prov.first_name or ''} {prov.last_name or ''}".strip()

    context = {
        "member_id": member_id,
        "name": f"{member.first_name or ''} {member.last_name or ''}".strip(),
        "dob": str(member.date_of_birth) if member.date_of_birth else None,
        "gender": member.gender,
        "current_raf": _safe_float(member.current_raf),
        "projected_raf": _safe_float(member.projected_raf),
        "risk_tier": member.risk_tier if member.risk_tier else None,
        "pcp": provider_name,
        "suspects": suspects,
        "care_gaps": gaps,
        "claims_summary": claims_summary,
        "medications": medications,
    }

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=MEMBER_SYSTEM_PROMPT,
            user_prompt=MEMBER_USER_PROMPT.format(
                context_json=json.dumps(context, indent=2, default=str)
            ),
            context_data=context,
            max_tokens=2048,
        )
        if guard_result["warnings"]:
            logger.warning("Member insight LLM warnings: %s", guard_result["warnings"])
        return _parse_llm_json(guard_result["response"]) or []
    except Exception as e:
        logger.error("Guarded LLM call failed for member %d: %s", member_id, e)
        return []


# ---------------------------------------------------------------------------
# Provider-level insight generation
# ---------------------------------------------------------------------------

PROVIDER_SYSTEM_PROMPT = """\
You are an AI performance coach for physicians in a Medicare Advantage network.
You provide specific, data-driven coaching suggestions by comparing the provider's
metrics to anonymized high performers. Be constructive and specific — not vague."""

PROVIDER_USER_PROMPT = """\
Here is the provider's performance data and panel context:

{context_json}

Generate 3-5 coaching insights. Each insight should be a JSON object with:
- "title": concise headline
- "description": 2-3 sentences comparing to benchmarks with specific numbers
- "category": "provider"
- "recommended_action": specific actionable step
- "dollar_impact": estimated annual dollar impact if acted on
- "confidence": 0-100
- "source_modules": list of modules contributing data

Focus on the biggest improvement opportunities. Compare to the network top quartile.
Return ONLY a JSON array."""


async def generate_provider_insights(db: AsyncSession, provider_id: int, tenant_schema: str = "default") -> list[dict]:
    """Build provider-level context and generate coaching insights via LLM."""
    if not settings.anthropic_api_key:
        return []

    provider = await db.get(Provider, provider_id)
    if not provider:
        return []

    # Top suspects in this provider's panel
    panel_suspects_q = await db.execute(
        select(
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            func.count(HccSuspect.id).label("cnt"),
            func.sum(HccSuspect.annual_value).label("val"),
        )
        .join(Member, HccSuspect.member_id == Member.id)
        .where(Member.pcp_provider_id == provider_id, HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.hcc_code, HccSuspect.hcc_label)
        .order_by(func.sum(HccSuspect.annual_value).desc())
        .limit(10)
    )
    top_suspects = [
        {"hcc_code": r.hcc_code, "hcc_label": r.hcc_label, "count": r.cnt, "total_value": _safe_float(r.val)}
        for r in panel_suspects_q.all()
    ]

    # Gap closure by measure
    from app.services.care_gap_service import get_provider_gaps
    gap_data = await get_provider_gaps(db, provider_id)

    # Network benchmarks (anonymized)
    bench_q = await db.execute(
        select(
            func.avg(Provider.capture_rate),
            func.avg(Provider.recapture_rate),
            func.avg(Provider.panel_pmpm),
            func.avg(Provider.gap_closure_rate),
        ).where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
    )
    bench = bench_q.one()

    # Top/bottom quartile values
    all_prov_q = await db.execute(
        select(Provider.capture_rate, Provider.panel_pmpm, Provider.gap_closure_rate)
        .where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
    )
    all_p = all_prov_q.all()
    capture_vals = sorted([_safe_float(p[0]) for p in all_p if p[0] is not None])
    pmpm_vals = sorted([_safe_float(p[1]) for p in all_p if p[1] is not None])
    gap_vals = sorted([_safe_float(p[2]) for p in all_p if p[2] is not None])

    def _q75(vals):
        return vals[int(len(vals) * 0.75)] if vals else 0

    def _q25(vals):
        return vals[int(len(vals) * 0.25)] if vals else 0

    context = {
        "provider_id": provider_id,
        "name": f"{provider.first_name or ''} {provider.last_name or ''}".strip(),
        "specialty": provider.specialty,
        "panel_size": _safe_int(provider.panel_size),
        "capture_rate": _safe_float(provider.capture_rate),
        "recapture_rate": _safe_float(provider.recapture_rate),
        "panel_pmpm": _safe_float(provider.panel_pmpm),
        "gap_closure_rate": _safe_float(provider.gap_closure_rate),
        "top_panel_suspects": top_suspects,
        "gap_performance": gap_data.get("measures", []),
        "network_benchmarks": {
            "avg_capture_rate": _safe_float(bench[0]),
            "avg_recapture_rate": _safe_float(bench[1]),
            "avg_panel_pmpm": _safe_float(bench[2]),
            "avg_gap_closure_rate": _safe_float(bench[3]),
            "top_quartile_capture": _q75(capture_vals),
            "top_quartile_gap_closure": _q75(gap_vals),
            "bottom_quartile_pmpm": _q25(pmpm_vals),
        },
    }

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=PROVIDER_SYSTEM_PROMPT,
            user_prompt=PROVIDER_USER_PROMPT.format(
                context_json=json.dumps(context, indent=2, default=str)
            ),
            context_data=context,
            max_tokens=2048,
        )
        if guard_result["warnings"]:
            logger.warning("Provider insight LLM warnings: %s", guard_result["warnings"])
        return _parse_llm_json(guard_result["response"]) or []
    except Exception as e:
        logger.error("Guarded LLM call failed for provider %d: %s", provider_id, e)
        return []
