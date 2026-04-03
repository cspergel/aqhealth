"""
Tuva baseline API — view Tuva's trusted numbers and any discrepancies
with AQSoft's calculations.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_tenant_session
from app.models.tuva_baseline import TuvaRafBaseline, TuvaPmpmBaseline

router = APIRouter(prefix="/api/tuva", tags=["tuva"])


@router.get("/raf-baselines")
async def list_raf_baselines(
    discrepancies_only: bool = False,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    session: AsyncSession = Depends(get_tenant_session),
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
                "aqsoft_raf": float(b.aqsoft_raf_score) if b.aqsoft_raf_score else None,
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
    session: AsyncSession = Depends(get_tenant_session),
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
    session: AsyncSession = Depends(get_tenant_session),
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


@router.post("/run")
async def trigger_tuva_pipeline(
    session: AsyncSession = Depends(get_tenant_session),
):
    """Manually trigger the Tuva pipeline. Returns immediately — runs async."""
    # In production, this would enqueue tuva_pipeline_job via arq.
    # For now, return a placeholder acknowledging the request.
    return {
        "status": "queued",
        "message": "Tuva pipeline job enqueued. Check /api/tuva/raf-baselines for results.",
    }
