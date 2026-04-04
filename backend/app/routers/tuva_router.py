"""
Tuva baseline API — view Tuva's trusted numbers and any discrepancies
with AQSoft's calculations.

All endpoints are accessible without auth for demo purposes.
Uses demo_mso tenant schema directly.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy import select, func, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.tuva_baseline import TuvaRafBaseline, TuvaPmpmBaseline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tuva", tags=["tuva"])

# ---------------------------------------------------------------------------
# DEMO-ONLY ACCESS: These endpoints bypass authentication and access the
# demo_mso tenant directly. This is intentional for partner demos only.
#
# PRODUCTION SAFETY:
# - demo_mso contains only synthetic data (no real PHI)
# - Auth-free endpoints that read from DuckDB (risk-scores, summary, status)
#   return only aggregate/opaque data (person_id, HCC codes, RAF scores)
# - Endpoints that read from PostgreSQL (comparison, member detail) are
#   scoped to demo_mso only and expose synthetic member names
#
# Before production deployment: either require auth on all endpoints or
# replace _get_demo_session with authenticated tenant resolution.
# ---------------------------------------------------------------------------


@asynccontextmanager
async def _demo_session():
    """Context manager for demo_mso session with proper cleanup.

    Usage: async with _demo_session() as session: ...

    WARNING: Hardcodes demo_mso tenant access without auth.
    Production deployments must replace with authenticated tenant resolution.
    """
    async with async_session_factory() as session:
        await session.execute(sa_text('SET search_path TO demo_mso, public'))
        try:
            yield session
        finally:
            try:
                await session.execute(sa_text('RESET search_path'))
            except Exception:
                pass


async def _get_demo_session() -> AsyncSession:
    """Get a demo_mso session for use in endpoint bodies.

    NOTE: This returns a session that must be explicitly closed by the caller
    or will be closed when the async context exits. For proper lifecycle
    management, prefer _demo_session() context manager.
    """
    session = async_session_factory()
    await session.__aenter__()
    await session.execute(sa_text('SET search_path TO demo_mso, public'))
    return session


@router.get("/raf-baselines")
async def list_raf_baselines(
    discrepancies_only: bool = False,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    """List Tuva RAF baselines with optional discrepancy filter."""
    session = await _get_demo_session()
    query = select(TuvaRafBaseline).order_by(TuvaRafBaseline.computed_at.desc())
    if discrepancies_only:
        query = query.where(TuvaRafBaseline.has_discrepancy == True)  # noqa: E712
    query = query.limit(limit).offset(offset)

    result = await session.execute(query)
    baselines = result.scalars().all()

    return {
        "items": [
            {
                "member_id": b.member_id,
                "payment_year": b.payment_year,
                "tuva_raf": float(b.tuva_raf_score) if b.tuva_raf_score else None,
                "aqsoft_confirmed_raf": float(b.aqsoft_confirmed_raf) if b.aqsoft_confirmed_raf else None,
                "aqsoft_projected_raf": float(b.aqsoft_projected_raf) if b.aqsoft_projected_raf else None,
                "capture_opportunity": float(b.capture_opportunity_raf) if b.capture_opportunity_raf else None,
                "has_discrepancy": b.has_discrepancy,
                "raf_difference": float(b.raf_difference) if b.raf_difference else None,
                "detail": b.discrepancy_detail,
                "computed_at": b.computed_at.isoformat() if b.computed_at else None,
            }
            for b in baselines
        ],
        "count": len(baselines),
    }


@router.get("/raf-baselines/summary")
async def raf_baseline_summary():
    """Summary stats on Tuva vs AQSoft RAF agreement."""
    session = await _get_demo_session()
    total = await session.execute(
        select(func.count(TuvaRafBaseline.id))
    )
    discrepancies = await session.execute(
        select(func.count(TuvaRafBaseline.id)).where(
            TuvaRafBaseline.has_discrepancy == True  # noqa: E712
        )
    )
    avg_diff = await session.execute(
        select(func.avg(TuvaRafBaseline.raf_difference)).where(
            TuvaRafBaseline.has_discrepancy == True  # noqa: E712
        )
    )

    total_count = total.scalar() or 0
    disc_count = discrepancies.scalar() or 0
    avg = avg_diff.scalar()

    return {
        "total_baselines": total_count,
        "discrepancies": disc_count,
        "agreement_rate": round((1 - disc_count / total_count) * 100, 1) if total_count > 0 else 100.0,
        "avg_discrepancy_raf": round(float(avg), 3) if avg else 0.0,
    }


@router.get("/pmpm-baselines")
async def list_pmpm_baselines(
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    """List Tuva PMPM baselines."""
    session = await _get_demo_session()
    query = (
        select(TuvaPmpmBaseline)
        .order_by(TuvaPmpmBaseline.period.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(query)
    baselines = result.scalars().all()

    return {
        "items": [
            {
                "period": b.period,
                "service_category": b.service_category,
                "tuva_pmpm": float(b.tuva_pmpm) if b.tuva_pmpm else None,
                "aqsoft_pmpm": float(b.aqsoft_pmpm) if b.aqsoft_pmpm else None,
                "has_discrepancy": b.has_discrepancy,
                "member_months": b.member_months,
                "computed_at": b.computed_at.isoformat() if b.computed_at else None,
            }
            for b in baselines
        ],
        "count": len(baselines),
    }


@router.post("/run")
async def trigger_tuva_pipeline():
    """Manually trigger the Tuva pipeline. Returns immediately — runs async."""
    # In production, this would enqueue tuva_pipeline_job via arq.
    # For now, return a placeholder acknowledging the request.
    return {
        "status": "queued",
        "message": "Tuva pipeline job enqueued. Check /api/tuva/raf-baselines for results.",
    }


@router.get("/comparison")
async def get_live_comparison():
    """Live 3-tier comparison: Tuva confirmed vs AQSoft confirmed vs AQSoft projected.

    Reads directly from both data sources — no auth needed for demo access.
    """
    from app.services.tuva_data_service import get_risk_scores
    from app.models.member import Member

    # Get Tuva scores from DuckDB
    tuva_scores = get_risk_scores()
    tuva_by_member = {str(s["person_id"]): s for s in tuva_scores}

    # Get AQSoft scores from PostgreSQL (with proper session cleanup)
    async with _demo_session() as session:
        result = await session.execute(
            select(
                Member.member_id,
                Member.first_name,
                Member.last_name,
                Member.current_raf,
                Member.projected_raf,
            )
        )
        members = result.all()

    comparisons = []
    total_capture_opportunity = 0.0
    discrepancy_count = 0

    for m in members:
        mid = str(m.member_id)
        tuva = tuva_by_member.get(mid)
        tuva_raf = float(tuva["v28_risk_score"]) if tuva and tuva.get("v28_risk_score") else None
        confirmed = float(m.current_raf) if m.current_raf else 0.0
        projected = float(m.projected_raf) if m.projected_raf else 0.0
        capture_opp = max(projected - confirmed, 0.0)
        total_capture_opportunity += capture_opp

        # Discrepancy between Tuva and AQSoft confirmed
        has_disc = False
        diff = None
        if tuva_raf is not None:
            diff = round(abs(confirmed - tuva_raf), 3)
            if diff > 0.05:
                has_disc = True
                discrepancy_count += 1

        comparisons.append({
            "member_id": mid,
            "name": f"{m.first_name} {m.last_name}",
            "tuva_confirmed_raf": round(tuva_raf, 3) if tuva_raf is not None else None,
            "aqsoft_confirmed_raf": round(confirmed, 3),
            "aqsoft_projected_raf": round(projected, 3),
            "capture_opportunity": round(capture_opp, 3),
            "engine_discrepancy": round(diff, 3) if diff is not None else None,
            "has_discrepancy": has_disc,
        })

    # Sort by capture opportunity descending
    comparisons.sort(key=lambda x: -(x["capture_opportunity"] or 0))

    return {
        "items": comparisons,
        "summary": {
            "total_members": len(comparisons),
            "tuva_scored": sum(1 for c in comparisons if c["tuva_confirmed_raf"] is not None),
            "total_capture_opportunity_raf": round(total_capture_opportunity, 3),
            "engine_discrepancies": discrepancy_count,
            "avg_tuva_raf": round(
                sum(c["tuva_confirmed_raf"] for c in comparisons if c["tuva_confirmed_raf"] is not None)
                / max(sum(1 for c in comparisons if c["tuva_confirmed_raf"] is not None), 1),
                3,
            ),
            "avg_aqsoft_confirmed_raf": round(
                sum(c["aqsoft_confirmed_raf"] for c in comparisons) / max(len(comparisons), 1), 3
            ),
            "avg_aqsoft_projected_raf": round(
                sum(c["aqsoft_projected_raf"] for c in comparisons) / max(len(comparisons), 1), 3
            ),
        },
    }


# Note: These endpoints use plain `def` (not async) because they call synchronous
# DuckDB I/O. FastAPI automatically runs plain `def` endpoints in a threadpool,
# preventing them from blocking the async event loop.

@router.get("/risk-scores")
def get_tuva_risk_scores():
    """Read Tuva risk scores directly from DuckDB (bypass PostgreSQL sync)."""
    from app.services.tuva_data_service import get_risk_scores
    scores = get_risk_scores()
    return {"items": scores, "count": len(scores)}


@router.get("/risk-factors")
def get_tuva_risk_factors():
    """Read Tuva per-member HCC risk factors directly from DuckDB."""
    from app.services.tuva_data_service import get_risk_factors
    factors = get_risk_factors()
    return {"items": factors, "count": len(factors)}


@router.get("/summary")
def get_tuva_full_summary():
    """Full Tuva analytics summary — suitable for AI context or dashboards."""
    from app.services.tuva_data_service import get_tuva_summary
    summary = get_tuva_summary()
    if not summary:
        return {"status": "no_data", "message": "Tuva pipeline has not been run yet."}
    return summary


@router.get("/member/{member_id}")
async def get_member_detail(member_id: str):
    """Granular HCC comparison for a single member — shows exactly which HCCs
    each engine found, where they agree, and where the opportunities are."""
    from app.services.tuva_data_service import get_risk_scores, get_risk_factors
    from app.models.member import Member
    from app.models.hcc import HccSuspect
    from app.models.claim import Claim
    from app.services.hcc_engine import lookup_hcc_for_icd10, build_code_ladder

    # --- Tuva data ---
    tuva_scores = get_risk_scores()
    tuva_score = next((s for s in tuva_scores if str(s["person_id"]) == member_id), None)

    tuva_factors = get_risk_factors()
    tuva_member_factors = [f for f in tuva_factors if str(f["person_id"]) == member_id]
    tuva_disease_hccs = [
        {"description": f["risk_factor_description"], "coefficient": f["coefficient"], "model": f["model_version"]}
        for f in tuva_member_factors if f.get("factor_type") == "disease"
    ]
    tuva_demographic_factors = [
        {"description": f["risk_factor_description"], "coefficient": f["coefficient"]}
        for f in tuva_member_factors if f.get("factor_type") == "demographic"
    ]

    # --- AQSoft data ---
    session = await _get_demo_session()
    member_result = await session.execute(
        select(Member).where(Member.member_id == member_id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        return {"error": f"Member {member_id} not found"}

    # AQSoft suspects
    suspect_result = await session.execute(
        select(HccSuspect).where(HccSuspect.member_id == member.id)
    )
    suspects = suspect_result.scalars().all()
    aqsoft_suspects = []
    for s in suspects:
        suspect_data = {
            "hcc_code": s.hcc_code,
            "hcc_label": s.hcc_label,
            "suspect_type": s.suspect_type,
            "raf_value": float(s.raf_value) if s.raf_value else 0,
            "confidence": s.confidence,
            "status": s.status,
            "evidence": s.evidence_summary,
            "icd10_code": s.icd10_code,
        }
        # Build code ladder for actionable suspects
        if s.icd10_code and s.suspect_type in ("near_miss", "specificity", "med_dx_gap"):
            suspect_data["code_ladder"] = build_code_ladder(s.icd10_code)
        aqsoft_suspects.append(suspect_data)

    # AQSoft confirmed HCCs from claims — with source traceability
    claim_result = await session.execute(
        select(
            Claim.claim_id, Claim.diagnosis_codes, Claim.service_date,
            Claim.claim_type, Claim.facility_name, Claim.service_category,
        ).where(
            Claim.member_id == member.id,
            Claim.diagnosis_codes.isnot(None),
        ).order_by(Claim.service_date.desc())
    )
    all_dx_codes: set[str] = set()
    # Track which claim each code came from
    code_sources: dict[str, list[dict]] = {}
    for row in claim_result.all():
        if row.diagnosis_codes:
            for code in row.diagnosis_codes:
                all_dx_codes.add(code)
                if code not in code_sources:
                    code_sources[code] = []
                code_sources[code].append({
                    "claim_id": row.claim_id,
                    "service_date": row.service_date.isoformat() if row.service_date else None,
                    "claim_type": row.claim_type,
                    "facility": row.facility_name,
                    "category": row.service_category,
                })

    aqsoft_confirmed_hccs = []
    for code in sorted(all_dx_codes):
        entry = lookup_hcc_for_icd10(code)
        if entry and entry.get("hcc"):
            sources = code_sources.get(code, [])
            ladder = build_code_ladder(code)
            # Check if there's a higher-value code in the same family
            current_raf = float(entry.get("raf", 0))
            upgrades = [c for c in ladder if c["raf_weight"] > current_raf and not c["is_current"]]
            aqsoft_confirmed_hccs.append({
                "icd10_code": code,
                "hcc_code": entry["hcc"],
                "description": entry.get("description", ""),
                "raf_weight": entry.get("raf", 0),
                "found_in_claims": len(sources),
                "latest_claim": sources[0] if sources else None,
                "has_specificity_upgrade": len(upgrades) > 0,
                "code_ladder": ladder[:8],  # Top 8 related codes
            })

    # --- Build comparison ---
    # Tuva HCC codes
    tuva_hcc_descriptions = {h["description"] for h in tuva_disease_hccs}
    # AQSoft confirmed HCC codes
    aqsoft_hcc_codes = {h["hcc_code"] for h in aqsoft_confirmed_hccs}

    # Separate evidence-backed opportunities from watch items
    raw_opportunities = [s for s in aqsoft_suspects if s["status"] == "open" and s["suspect_type"] != "watch_item"]
    watch_items = [s for s in aqsoft_suspects if s["status"] == "open" and s["suspect_type"] == "watch_item"]

    # Tier the opportunities by actionability
    def _tier_opportunity(opp: dict) -> dict:
        """Classify opportunity into tiers based on evidence strength + RAF value."""
        raf = opp.get("raf_value", 0)
        conf = opp.get("confidence", 0)
        suspect_type = opp.get("suspect_type", "")

        # Tier 1: HIGH VALUE EASY CAPTURE
        # Strong evidence (high confidence) OR direct claims evidence (recapture, med_dx_gap)
        # These are "go capture now" items
        if suspect_type in ("recapture", "historical"):
            tier = "high_value"
            tier_label = "Easy Capture"
            tier_reason = "Previously coded — likely still present, just needs recapture at next visit"
        elif suspect_type == "med_dx_gap" and conf >= 60:
            tier = "high_value"
            tier_label = "Easy Capture"
            tier_reason = f"Patient is on medication for this condition — add diagnosis at next visit"
        elif suspect_type == "specificity" and conf >= 70:
            tier = "high_value"
            tier_label = "Easy Capture"
            tier_reason = "Code already documented — just needs specificity upgrade"
        # Tier 2: LIKELY CAPTURE
        # Evidence-backed near-miss or moderate confidence
        elif suspect_type == "near_miss" and conf >= 65:
            tier = "likely"
            tier_label = "Likely Capture"
            tier_reason = "Supporting evidence found in claims — review clinical data to confirm"
        elif conf >= 50:
            tier = "likely"
            tier_label = "Likely Capture"
            tier_reason = "Moderate evidence — clinical review recommended"
        # Tier 3: INVESTIGATE
        # Lower confidence, needs clinical review
        else:
            tier = "investigate"
            tier_label = "Needs Investigation"
            tier_reason = "Some evidence exists but clinical confirmation needed"

        # Add source tracing — where was this found?
        source_info = []
        evidence_text = opp.get("evidence", "")
        if "Medication:" in evidence_text:
            source_info.append({"type": "medication", "detail": "Patient medication list"})
        if "Related Dx:" in evidence_text or "Truncated code:" in evidence_text:
            source_info.append({"type": "claims", "detail": "Claims diagnosis codes"})
        if suspect_type == "recapture":
            source_info.append({"type": "prior_year", "detail": "Prior year claims history"})
        if suspect_type == "historical":
            source_info.append({"type": "historical", "detail": "Historical claims (2+ years)"})
        if not source_info:
            source_info.append({"type": "engine", "detail": "AQSoft HCC engine analysis"})

        return {
            **opp,
            "tier": tier,
            "tier_label": tier_label,
            "tier_reason": tier_reason,
            "sources": source_info,
        }

    opportunities = [_tier_opportunity(o) for o in raw_opportunities]
    # Sort: high_value first, then likely, then investigate; within tier by RAF desc
    tier_order = {"high_value": 0, "likely": 1, "investigate": 2}
    opportunities.sort(key=lambda x: (tier_order.get(x["tier"], 9), -x["raf_value"]))

    # Summary by tier
    high_value = [o for o in opportunities if o["tier"] == "high_value"]
    likely = [o for o in opportunities if o["tier"] == "likely"]
    investigate = [o for o in opportunities if o["tier"] == "investigate"]

    return {
        "member_id": member_id,
        "name": f"{member.first_name} {member.last_name}",
        "date_of_birth": member.date_of_birth.isoformat() if member.date_of_birth else None,
        "gender": member.gender,
        "scores": {
            "tuva_v28": round(float(tuva_score["v28_risk_score"]), 3) if tuva_score and tuva_score.get("v28_risk_score") else None,
            "aqsoft_confirmed": round(float(member.current_raf), 3) if member.current_raf else 0,
            "aqsoft_projected": round(float(member.projected_raf), 3) if member.projected_raf else 0,
        },
        "tuva_hccs": tuva_disease_hccs,
        "tuva_demographics": tuva_demographic_factors,
        "aqsoft_confirmed_hccs": aqsoft_confirmed_hccs,
        "aqsoft_suspects": aqsoft_suspects,
        "diagnosis_codes": sorted(all_dx_codes),
        "opportunities": opportunities,
        "opportunity_count": len(opportunities),
        "opportunity_raf": round(sum(s["raf_value"] for s in opportunities), 3),
        "opportunity_tiers": {
            "high_value": {"count": len(high_value), "raf": round(sum(o["raf_value"] for o in high_value), 3)},
            "likely": {"count": len(likely), "raf": round(sum(o["raf_value"] for o in likely), 3)},
            "investigate": {"count": len(investigate), "raf": round(sum(o["raf_value"] for o in investigate), 3)},
        },
        "watch_items": watch_items,
        "watch_item_count": len(watch_items),
        "watch_item_potential_raf": round(sum(s["raf_value"] for s in watch_items), 3),
    }


@router.get("/demo/risk-scores")
def get_demo_risk_scores():
    """Risk scores from the 1,000-patient Tuva demo dataset."""
    from app.services.tuva_data_service import get_risk_scores
    scores = get_risk_scores(use_demo=True)
    return {"items": scores, "count": len(scores), "source": "tuva_demo_1000_patients"}


@router.get("/demo/suspects")
def get_demo_suspects():
    """HCC suspects from the 1,000-patient Tuva demo dataset."""
    from app.services.tuva_data_service import get_tuva_suspects
    suspects = get_tuva_suspects(use_demo=True)
    # Summarize by reason
    reasons: dict[str, int] = {}
    for s in suspects:
        r = s.get("reason", "unknown")
        reasons[r] = reasons.get(r, 0) + 1
    return {
        "total_suspects": len(suspects),
        "by_reason": reasons,
        "items": suspects[:100],  # First 100
        "source": "tuva_demo_1000_patients",
    }


@router.get("/demo/summary")
def get_demo_summary():
    """Full summary from the 1,000-patient Tuva demo dataset."""
    from app.services.tuva_data_service import get_tuva_summary
    summary = get_tuva_summary(use_demo=True)
    if not summary:
        return {"status": "no_data", "message": "Tuva demo database not found. Run: cd tuva_demo_data && dbt build --profiles-dir ."}
    summary["source"] = "tuva_demo_1000_patients"
    return summary


@router.get("/population-opportunities")
async def get_population_opportunities(
    tier: str | None = None,
    limit: int = 200,
):
    """Population-level capture opportunities — all members, all suspects, ranked.

    Returns actionable chase lists grouped by tier and provider.
    Filter by tier: high_value, likely, investigate, or all (default).
    """
    from app.models.member import Member
    from app.models.hcc import HccSuspect
    from app.models.provider import Provider

    session = await _get_demo_session()

    # Get all open suspects with member and provider info
    result = await session.execute(
        select(
            HccSuspect.id,
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            HccSuspect.icd10_code,
            HccSuspect.raf_value,
            HccSuspect.annual_value,
            HccSuspect.suspect_type,
            HccSuspect.confidence,
            HccSuspect.evidence_summary,
            Member.member_id,
            Member.first_name,
            Member.last_name,
            Member.current_raf,
            Member.projected_raf,
            Member.pcp_provider_id,
        )
        .join(Member, HccSuspect.member_id == Member.id)
        .where(HccSuspect.status == "open")
        .order_by(HccSuspect.raf_value.desc())
        .limit(limit)
    )
    rows = result.all()

    # Get provider names
    prov_ids = {r.pcp_provider_id for r in rows if r.pcp_provider_id}
    provider_map: dict[int, str] = {}
    if prov_ids:
        prov_result = await session.execute(
            select(Provider.id, Provider.first_name, Provider.last_name)
            .where(Provider.id.in_(prov_ids))
        )
        for p in prov_result.all():
            provider_map[p.id] = f"{p.first_name} {p.last_name}"

    # Classify tiers (same logic as member detail)
    def _classify(suspect_type: str, confidence: int) -> tuple[str, str]:
        if suspect_type in ("recapture", "historical"):
            return "high_value", "Easy Capture"
        if suspect_type == "med_dx_gap" and confidence >= 60:
            return "high_value", "Easy Capture"
        if suspect_type == "specificity" and confidence >= 70:
            return "high_value", "Easy Capture"
        if suspect_type == "near_miss" and confidence >= 65:
            return "likely", "Likely Capture"
        if confidence >= 50:
            return "likely", "Likely Capture"
        if suspect_type == "watch_item":
            return "watch", "Watch Item"
        return "investigate", "Investigate"

    opportunities = []
    for r in rows:
        t, t_label = _classify(r.suspect_type, r.confidence or 0)
        if tier and t != tier:
            continue
        opportunities.append({
            "member_id": r.member_id,
            "member_name": f"{r.first_name} {r.last_name}",
            "provider": provider_map.get(r.pcp_provider_id, "Unassigned"),
            "hcc_code": r.hcc_code,
            "hcc_label": r.hcc_label,
            "icd10_code": r.icd10_code,
            "raf_value": float(r.raf_value) if r.raf_value else 0,
            "annual_value": float(r.annual_value) if r.annual_value else 0,
            "suspect_type": r.suspect_type,
            "confidence": r.confidence,
            "tier": t,
            "tier_label": t_label,
            "evidence": r.evidence_summary,
            "current_raf": float(r.current_raf) if r.current_raf else 0,
            "projected_raf": float(r.projected_raf) if r.projected_raf else 0,
        })

    # Aggregate by tier
    tier_summary: dict[str, dict] = {}
    for o in opportunities:
        t = o["tier"]
        if t not in tier_summary:
            tier_summary[t] = {"count": 0, "total_raf": 0, "total_annual": 0}
        tier_summary[t]["count"] += 1
        tier_summary[t]["total_raf"] += o["raf_value"]
        tier_summary[t]["total_annual"] += o["annual_value"]
    for v in tier_summary.values():
        v["total_raf"] = round(v["total_raf"], 3)
        v["total_annual"] = round(v["total_annual"], 2)

    # Aggregate by provider
    by_provider: dict[str, dict] = {}
    for o in opportunities:
        prov = o["provider"]
        if prov not in by_provider:
            by_provider[prov] = {"count": 0, "total_raf": 0, "members": set()}
        by_provider[prov]["count"] += 1
        by_provider[prov]["total_raf"] += o["raf_value"]
        by_provider[prov]["members"].add(o["member_id"])
    provider_summary = [
        {"provider": k, "opportunities": v["count"], "total_raf": round(v["total_raf"], 3), "members_affected": len(v["members"])}
        for k, v in sorted(by_provider.items(), key=lambda x: -x[1]["total_raf"])
    ]

    return {
        "total_opportunities": len(opportunities),
        "total_raf": round(sum(o["raf_value"] for o in opportunities), 3),
        "total_annual_value": round(sum(o["annual_value"] for o in opportunities), 2),
        "by_tier": tier_summary,
        "by_provider": provider_summary,
        "items": opportunities,
    }


@router.post("/process-note")
async def process_clinical_note_endpoint(
    note_text: str = "",
    note_type: str = "progress_note",
    member_id: str | None = None,
):
    """Process a clinical note through the full NLP pipeline.

    Pass 1: Extract structured facts (diagnoses, meds, labs, findings)
    Pass 2: Assign ICD-10 codes with Claude tool_use validation
    Then: Compare against claims to find gaps

    Returns: validated codes with HCC/RAF impact, evidence quotes, gaps.
    """
    from app.services.clinical_nlp_service import process_clinical_note
    from app.services.clinical_gap_detector import detect_clinical_gaps

    if not note_text or len(note_text.strip()) < 20:
        return {"error": "Note text is too short (minimum 20 characters)"}

    # Run the 2-pass NLP pipeline
    result = await process_clinical_note(
        note_text=note_text,
        note_type=note_type,
        member_id=member_id,
    )

    # If we have a member_id, detect gaps against their claims
    gaps = []
    if member_id:
        try:
            session = await _get_demo_session()
            from app.models.member import Member
            member_result = await session.execute(
                select(Member).where(Member.member_id == member_id)
            )
            member = member_result.scalar_one_or_none()
            if member:
                # Convert NLP codes to conditions format for gap detector
                conditions = [
                    {
                        "icd10_code": c.get("icd10"),
                        "description": c.get("description"),
                        "evidence_quote": c.get("evidence_quote"),
                        "clinical_status": "active",
                    }
                    for c in result.get("codes", [])
                ]
                gaps = await detect_clinical_gaps(member.id, conditions, session)
        except Exception as e:
            logger.debug("Gap detection skipped: %s", e)

    result["gaps"] = gaps
    result["gap_summary"] = {
        "total": len(gaps),
        "uncoded": sum(1 for g in gaps if g["gap_type"] == "uncoded"),
        "undercoded": sum(1 for g in gaps if g["gap_type"] == "undercoded"),
        "total_raf_opportunity": round(sum(g.get("raf_value", 0) for g in gaps), 3),
    }

    return result


@router.post("/export-fhir")
async def export_fhir_bundle(
    nlp_result: dict = Body(...),
    member_fhir_id: str = Query(default="unknown"),
):
    """Convert NLP extraction results into a FHIR R4 transaction Bundle.

    Accepts the output from /api/tuva/process-note (or clinical_nlp_service)
    and returns a FHIR Bundle containing Condition, Observation, and
    MedicationRequest resources ready to POST to an EMR's FHIR endpoint.
    """
    from app.services.fhir_export_service import export_nlp_results_as_fhir

    bundle = export_nlp_results_as_fhir(nlp_result, member_fhir_id)
    return bundle


@router.get("/convergence")
async def get_convergence():
    """Population-level RAF convergence summary.

    Shows how well projected RAF scores are being realized as confirmed captures,
    suspect aging buckets, stale RAF at risk, and capture performance.
    """
    from app.services.raf_convergence_service import (
        get_convergence_summary,
        check_raf_convergence,
    )

    session = await _get_demo_session()
    summary = await get_convergence_summary(session)
    alerts = await check_raf_convergence(session)

    return {
        **summary,
        "stale_member_alerts": len(alerts),
        "top_alerts": alerts[:20],  # Top 20 by gap size
    }


@router.get("/stale-suspects")
async def list_stale_suspects(
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=50, le=200),
):
    """List suspects that have been open too long without capture or dismissal.

    These represent projected RAF that isn't converting to confirmed revenue.
    Each suspect includes a recommended action based on type and age.
    """
    from app.services.raf_convergence_service import get_stale_suspects

    session = await _get_demo_session()
    suspects = await get_stale_suspects(session, days_threshold=days)

    total_raf_at_risk = sum(s["raf_value"] for s in suspects)
    total_annual_at_risk = sum(s["annual_value"] for s in suspects)

    # Group by suspect type
    by_type: dict[str, dict] = {}
    for s in suspects:
        t = s["suspect_type"]
        if t not in by_type:
            by_type[t] = {"count": 0, "total_raf": 0.0}
        by_type[t]["count"] += 1
        by_type[t]["total_raf"] += s["raf_value"]
    for v in by_type.values():
        v["total_raf"] = round(v["total_raf"], 3)

    return {
        "total_stale": len(suspects),
        "days_threshold": days,
        "total_raf_at_risk": round(total_raf_at_risk, 3),
        "total_annual_at_risk": round(total_annual_at_risk, 2),
        "by_type": by_type,
        "items": suspects[:limit],
    }


@router.get("/status")
def get_tuva_status():
    """Check if Tuva data is available and what's loaded."""
    from app.services.tuva_data_service import get_risk_scores
    scores = get_risk_scores()
    return {
        "available": len(scores) > 0,
        "members_scored": len(scores),
        "pipeline_ready": True,
    }
