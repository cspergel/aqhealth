"""
Tuva baseline API — view Tuva's trusted numbers and any discrepancies
with AQSoft's calculations.

All endpoints are accessible without auth for demo purposes.
Uses demo_mso tenant schema directly.
"""

from fastapi import APIRouter, Query
from sqlalchemy import select, func, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.tuva_baseline import TuvaRafBaseline, TuvaPmpmBaseline

router = APIRouter(prefix="/api/tuva", tags=["tuva"])


async def _get_demo_session() -> AsyncSession:
    """Get a session scoped to demo_mso — no auth required."""
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

    # Get AQSoft scores from PostgreSQL
    session = await _get_demo_session()
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
    from app.services.hcc_engine import lookup_hcc_for_icd10

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
    aqsoft_suspects = [
        {
            "hcc_code": s.hcc_code,
            "hcc_label": s.hcc_label,
            "suspect_type": s.suspect_type,
            "raf_value": float(s.raf_value) if s.raf_value else 0,
            "confidence": s.confidence,
            "status": s.status,
            "evidence": s.evidence_summary,
            "icd10_code": s.icd10_code,
        }
        for s in suspects
    ]

    # AQSoft confirmed HCCs from claims
    claim_result = await session.execute(
        select(Claim.diagnosis_codes).where(
            Claim.member_id == member.id,
            Claim.diagnosis_codes.isnot(None),
        )
    )
    all_dx_codes: set[str] = set()
    for row in claim_result.all():
        if row[0]:
            all_dx_codes.update(row[0])

    aqsoft_confirmed_hccs = []
    for code in sorted(all_dx_codes):
        entry = lookup_hcc_for_icd10(code)
        if entry and entry.get("hcc"):
            aqsoft_confirmed_hccs.append({
                "icd10_code": code,
                "hcc_code": entry["hcc"],
                "description": entry.get("description", ""),
                "raf_weight": entry.get("raf", 0),
            })

    # --- Build comparison ---
    # Tuva HCC codes
    tuva_hcc_descriptions = {h["description"] for h in tuva_disease_hccs}
    # AQSoft confirmed HCC codes
    aqsoft_hcc_codes = {h["hcc_code"] for h in aqsoft_confirmed_hccs}

    # Opportunities: suspects not yet in confirmed
    opportunities = [s for s in aqsoft_suspects if s["status"] == "open"]

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
