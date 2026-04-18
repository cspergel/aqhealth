"""
Tuva baseline API — view Tuva's trusted numbers and any discrepancies
with AQSoft's calculations.

**All endpoints require authentication.** Tuva data includes per-member
PHI (names, risk scores, chart-derived HCCs), so every endpoint is
gated by `require_role(...)` and uses the caller's tenant-scoped session
via `get_tenant_db`. The legacy DEMO_MODE env-var bypass has been
removed — demos run against tenants with a real user account, not an
env flag that turns off auth.
"""

import logging
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.models.tuva_baseline import TuvaRafBaseline, TuvaPmpmBaseline

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tuva", tags=["tuva"])

# ---------------------------------------------------------------------------
# RBAC policy for Tuva endpoints.
#
# Tuva marts carry per-member PHI (RAF scores broken down by HCC, chart-
# derived conditions, pharmacy patterns). Only roles that already have PHI
# scope get access. `provider`, `outreach`, and `financial` do NOT — they
# have narrower scopes elsewhere.
# ---------------------------------------------------------------------------

_TUVA_ROLES = (
    UserRole.superadmin,
    UserRole.mso_admin,
    UserRole.analyst,
    UserRole.care_manager,
    UserRole.auditor,
)


def _tuva_user():
    """Shared auth dependency for Tuva read endpoints."""
    return require_role(*_TUVA_ROLES)


def _tuva_writer():
    """Shared auth dependency for Tuva trigger endpoints (pipeline runs).

    Writing is narrower: superadmin + mso_admin only. Analysts/auditors/
    care managers can read but not kick off rebuild jobs.
    """
    return require_role(UserRole.superadmin, UserRole.mso_admin)


# ---------------------------------------------------------------------------
# Per-tenant baseline table endpoints
# ---------------------------------------------------------------------------


@router.get("/raf-baselines")
async def list_raf_baselines(
    discrepancies_only: bool = False,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """List Tuva RAF baselines with optional discrepancy filter."""
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
async def raf_baseline_summary(
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """Summary stats on Tuva vs AQSoft RAF agreement."""
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
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """List Tuva PMPM baselines."""
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


# ---------------------------------------------------------------------------
# Pipeline trigger
# ---------------------------------------------------------------------------


@router.post("/run")
async def trigger_tuva_pipeline(
    current_user: dict = Depends(_tuva_writer()),
):
    """Enqueue the Tuva pipeline for the caller's tenant.

    Pipeline steps (tuva_pipeline_job): export PG→DuckDB → dbt seed/run →
    sync outputs back to PG. Returns immediately with a job_id; poll
    `/api/tuva/raf-baselines` to see fresh results.
    """
    tenant_schema = current_user["tenant_schema"]
    try:
        from arq.connections import create_pool, RedisSettings
        from urllib.parse import urlparse

        parsed = urlparse(settings.redis_url)
        redis = await create_pool(RedisSettings(
            host=parsed.hostname or "localhost",
            port=parsed.port or 6379,
            database=int(parsed.path.lstrip("/") or "0"),
            password=parsed.password,
        ))
        job = await redis.enqueue_job(
            "tuva_pipeline_job",
            tenant_schema,
            _queue_name="tuva",
        )
        await redis.close()
        job_id = getattr(job, "job_id", None) if job else None
        return {
            "status": "queued",
            "job_id": job_id,
            "tenant": tenant_schema,
            "message": "Tuva pipeline job enqueued. Check /api/tuva/raf-baselines for results.",
        }
    except Exception as e:
        logger.exception("tuva.run: could not enqueue pipeline job")
        raise HTTPException(
            status_code=503,
            detail=f"Processing queue unavailable — retry in a few minutes ({type(e).__name__})",
        )


# ---------------------------------------------------------------------------
# Live comparison — joins DuckDB Tuva scores with PG member records
# ---------------------------------------------------------------------------


@router.get("/comparison")
async def get_live_comparison(
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """Live 3-tier comparison: Tuva confirmed vs AQSoft confirmed vs AQSoft projected."""
    from app.services.tuva_data_service import get_risk_scores
    from app.models.member import Member

    tenant_schema = current_user["tenant_schema"]

    # Get Tuva scores from DuckDB (tenant-scoped)
    try:
        tuva_scores = get_risk_scores(tenant_schema=tenant_schema)
    except Exception as e:
        logger.exception("tuva.comparison: risk-scores query failed")
        raise HTTPException(
            status_code=502,
            detail=f"Tuva data unavailable: {type(e).__name__}",
        )
    tuva_by_member = {str(s["person_id"]): s for s in tuva_scores}

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


# ---------------------------------------------------------------------------
# DuckDB pass-through endpoints (Tuva marts). These use plain `def` to let
# FastAPI run the blocking DuckDB I/O on a threadpool instead of the event
# loop. Each surfaces the real exception as 502 rather than returning [] —
# a broken Tuva pipeline should fail loudly.
# ---------------------------------------------------------------------------


@router.get("/risk-scores")
def get_tuva_risk_scores(
    current_user: dict = Depends(_tuva_user()),
):
    """Read Tuva risk scores directly from DuckDB (bypass PostgreSQL sync)."""
    from app.services.tuva_data_service import get_risk_scores
    try:
        scores = get_risk_scores(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.risk_scores: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": scores, "count": len(scores)}


@router.get("/risk-factors")
def get_tuva_risk_factors(
    current_user: dict = Depends(_tuva_user()),
):
    """Read Tuva per-member HCC risk factors directly from DuckDB."""
    from app.services.tuva_data_service import get_risk_factors
    try:
        factors = get_risk_factors(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.risk_factors: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": factors, "count": len(factors)}


@router.get("/summary")
def get_tuva_full_summary(
    current_user: dict = Depends(_tuva_user()),
):
    """Full Tuva analytics summary — suitable for AI context or dashboards."""
    from app.services.tuva_data_service import get_tuva_summary
    try:
        summary = get_tuva_summary(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.summary: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    if not summary:
        return {"status": "no_data", "message": "Tuva pipeline has not been run yet."}
    return summary


@router.get("/pmpm")
def get_tuva_pmpm(
    current_user: dict = Depends(_tuva_user()),
):
    """Raw Tuva PMPM rows (wide-format — one row per year_month with
    per-service-category paid/allowed columns)."""
    from app.services.tuva_data_service import get_pmpm_summary
    try:
        rows = get_pmpm_summary(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.pmpm: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": rows, "count": len(rows)}


@router.get("/quality-measures")
def get_tuva_quality_measures(
    current_user: dict = Depends(_tuva_user()),
):
    """Tuva quality-measure summary (summary_long form)."""
    from app.services.tuva_data_service import get_quality_measures
    try:
        rows = get_quality_measures(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.quality_measures: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": rows, "count": len(rows)}


@router.get("/chronic-conditions")
def get_tuva_chronic_conditions(
    current_user: dict = Depends(_tuva_user()),
):
    """Tuva chronic-condition long format (per-member per-condition)."""
    from app.services.tuva_data_service import get_chronic_conditions
    try:
        rows = get_chronic_conditions(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.chronic_conditions: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": rows, "count": len(rows)}


@router.get("/suspects")
def get_tuva_suspects_endpoint(
    current_user: dict = Depends(_tuva_user()),
):
    """Tuva HCC suspects (hcc_suspecting.list)."""
    from app.services.tuva_data_service import get_tuva_suspects
    try:
        rows = get_tuva_suspects(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.suspects: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": rows, "count": len(rows)}


@router.get("/recapture-opportunities")
def get_tuva_recapture(
    current_user: dict = Depends(_tuva_user()),
):
    """Tuva HCC-recapture opportunities (hcc_recapture.hcc_status)."""
    from app.services.tuva_data_service import get_tuva_recapture_opportunities
    try:
        rows = get_tuva_recapture_opportunities(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.recapture: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": rows, "count": len(rows)}


# ---------------------------------------------------------------------------
# Per-member drill-down
# ---------------------------------------------------------------------------


@router.get("/member/{member_id}")
async def get_member_detail(
    member_id: str,
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """Granular HCC comparison for a single member — shows exactly which HCCs
    each engine found, where they agree, and where the opportunities are."""
    from app.services.tuva_data_service import get_risk_scores, get_risk_factors
    from app.models.member import Member
    from app.models.hcc import HccSuspect
    from app.models.claim import Claim
    from app.services.hcc_engine import lookup_hcc_for_icd10, build_code_ladder

    tenant_schema = current_user["tenant_schema"]

    # --- Tuva data ---
    try:
        tuva_scores = get_risk_scores(tenant_schema=tenant_schema)
        tuva_factors = get_risk_factors(tenant_schema=tenant_schema)
    except Exception as e:
        logger.exception("tuva.member_detail: Tuva query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")

    tuva_score = next((s for s in tuva_scores if str(s["person_id"]) == member_id), None)
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
    member_result = await session.execute(
        select(Member).where(Member.member_id == member_id)
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail=f"Member {member_id} not found")

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
                "code_ladder": ladder[:8],
            })

    tuva_hcc_descriptions = {h["description"] for h in tuva_disease_hccs}
    aqsoft_hcc_codes = {h["hcc_code"] for h in aqsoft_confirmed_hccs}

    raw_opportunities = [s for s in aqsoft_suspects if s["status"] == "open" and s["suspect_type"] != "watch_item"]
    watch_items = [s for s in aqsoft_suspects if s["status"] == "open" and s["suspect_type"] == "watch_item"]

    def _tier_opportunity(opp: dict) -> dict:
        raf = opp.get("raf_value", 0)
        conf = opp.get("confidence", 0)
        suspect_type = opp.get("suspect_type", "")

        if suspect_type in ("recapture", "historical"):
            tier = "high_value"
            tier_label = "Easy Capture"
            tier_reason = "Previously coded — likely still present, just needs recapture at next visit"
        elif suspect_type == "med_dx_gap" and conf >= 60:
            tier = "high_value"
            tier_label = "Easy Capture"
            tier_reason = "Patient is on medication for this condition — add diagnosis at next visit"
        elif suspect_type == "specificity" and conf >= 70:
            tier = "high_value"
            tier_label = "Easy Capture"
            tier_reason = "Code already documented — just needs specificity upgrade"
        elif suspect_type == "near_miss" and conf >= 65:
            tier = "likely"
            tier_label = "Likely Capture"
            tier_reason = "Supporting evidence found in claims — review clinical data to confirm"
        elif conf >= 50:
            tier = "likely"
            tier_label = "Likely Capture"
            tier_reason = "Moderate evidence — clinical review recommended"
        else:
            tier = "investigate"
            tier_label = "Needs Investigation"
            tier_reason = "Some evidence exists but clinical confirmation needed"

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
    tier_order = {"high_value": 0, "likely": 1, "investigate": 2}
    opportunities.sort(key=lambda x: (tier_order.get(x["tier"], 9), -x["raf_value"]))

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


# ---------------------------------------------------------------------------
# Read-only demo dataset endpoints.
#
# These target the shared 1,000-patient Tuva demo DuckDB (`data/tuva_demo.duckdb`)
# — NOT a tenant's real data. They still require authentication (only
# superadmin can see the canned dataset) so the endpoints can't be used
# as a DEMO_MODE backdoor to bypass auth.
# ---------------------------------------------------------------------------


@router.get("/demo/risk-scores")
def get_demo_risk_scores(
    current_user: dict = Depends(require_role(UserRole.superadmin)),
):
    """Risk scores from the 1,000-patient Tuva demo dataset (superadmin only)."""
    from app.services.tuva_data_service import get_risk_scores
    try:
        scores = get_risk_scores(use_demo=True)
    except Exception as e:
        logger.exception("tuva.demo_risk_scores: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {"items": scores, "count": len(scores), "source": "tuva_demo_1000_patients"}


@router.get("/demo/suspects")
def get_demo_suspects(
    current_user: dict = Depends(require_role(UserRole.superadmin)),
):
    """HCC suspects from the 1,000-patient Tuva demo dataset (superadmin only)."""
    from app.services.tuva_data_service import get_tuva_suspects
    try:
        suspects = get_tuva_suspects(use_demo=True)
    except Exception as e:
        logger.exception("tuva.demo_suspects: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    reasons: dict[str, int] = {}
    for s in suspects:
        r = s.get("reason", "unknown")
        reasons[r] = reasons.get(r, 0) + 1
    return {
        "total_suspects": len(suspects),
        "by_reason": reasons,
        "items": suspects[:100],
        "source": "tuva_demo_1000_patients",
    }


@router.get("/demo/summary")
def get_demo_summary(
    current_user: dict = Depends(require_role(UserRole.superadmin)),
):
    """Full summary from the 1,000-patient Tuva demo dataset (superadmin only)."""
    from app.services.tuva_data_service import get_tuva_summary
    try:
        summary = get_tuva_summary(use_demo=True)
    except Exception as e:
        logger.exception("tuva.demo_summary: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    if not summary:
        return {"status": "no_data", "message": "Tuva demo database not found. Run: cd tuva_demo_data && dbt build --profiles-dir ."}
    summary["source"] = "tuva_demo_1000_patients"
    return summary


# ---------------------------------------------------------------------------
# Population-level endpoints
# ---------------------------------------------------------------------------


@router.get("/population-opportunities")
async def get_population_opportunities(
    tier: str | None = None,
    limit: int = 200,
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """Population-level capture opportunities — all members, all suspects, ranked."""
    from app.models.member import Member
    from app.models.hcc import HccSuspect
    from app.models.provider import Provider

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

    prov_ids = {r.pcp_provider_id for r in rows if r.pcp_provider_id}
    provider_map: dict[int, str] = {}
    if prov_ids:
        prov_result = await session.execute(
            select(Provider.id, Provider.first_name, Provider.last_name)
            .where(Provider.id.in_(prov_ids))
        )
        for p in prov_result.all():
            provider_map[p.id] = f"{p.first_name} {p.last_name}"

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


# ---------------------------------------------------------------------------
# Clinical note NLP endpoints
# ---------------------------------------------------------------------------


@router.post("/process-note")
async def process_clinical_note_endpoint(
    note_text: str = "",
    note_type: str = "progress_note",
    member_id: str | None = None,
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """Process a clinical note through the full NLP pipeline."""
    from app.services.clinical_nlp_service import process_clinical_note
    from app.services.clinical_gap_detector import detect_clinical_gaps

    if not note_text or len(note_text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Note text is too short (minimum 20 characters)")

    result = await process_clinical_note(
        note_text=note_text,
        note_type=note_type,
        member_id=member_id,
    )

    gaps = []
    if member_id:
        try:
            from app.models.member import Member
            member_result = await session.execute(
                select(Member).where(Member.member_id == member_id)
            )
            member = member_result.scalar_one_or_none()
            if member:
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
    current_user: dict = Depends(_tuva_user()),
):
    """Convert NLP extraction results into a FHIR R4 transaction Bundle."""
    from app.services.fhir_export_service import export_nlp_results_as_fhir

    bundle = export_nlp_results_as_fhir(nlp_result, member_fhir_id)
    return bundle


@router.get("/convergence")
async def get_convergence(
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """Population-level RAF convergence summary."""
    from app.services.raf_convergence_service import (
        get_convergence_summary,
        check_raf_convergence,
    )

    summary = await get_convergence_summary(session)
    alerts = await check_raf_convergence(session)

    return {
        **summary,
        "stale_member_alerts": len(alerts),
        "top_alerts": alerts[:20],
    }


@router.get("/stale-suspects")
async def list_stale_suspects(
    days: int = Query(default=90, ge=1, le=365),
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(_tuva_user()),
    session: AsyncSession = Depends(get_tenant_db),
):
    """List suspects that have been open too long without capture or dismissal."""
    from app.services.raf_convergence_service import get_stale_suspects

    suspects = await get_stale_suspects(session, days_threshold=days)

    total_raf_at_risk = sum(s["raf_value"] for s in suspects)
    total_annual_at_risk = sum(s["annual_value"] for s in suspects)

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
def get_tuva_status(
    current_user: dict = Depends(_tuva_user()),
):
    """Check if Tuva data is available and what's loaded."""
    from app.services.tuva_data_service import get_risk_scores
    try:
        scores = get_risk_scores(tenant_schema=current_user["tenant_schema"])
    except Exception as e:
        logger.exception("tuva.status: query failed")
        raise HTTPException(status_code=502, detail=f"Tuva data unavailable: {type(e).__name__}")
    return {
        "available": len(scores) > 0,
        "members_scored": len(scores),
        "pipeline_ready": True,
    }
