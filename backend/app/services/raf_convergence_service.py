"""
RAF Convergence Alerting Service

Tracks whether projected RAF scores converge toward confirmed RAF over time.
When AQSoft projects a higher RAF (due to suspects), those suspects should
eventually get captured — the confirmed RAF should rise to meet the projection.

If it doesn't converge within a threshold period, the suspect is likely stale
and needs clinical review.

Key alerts:
- Members where projected RAF > confirmed RAF by >0.1 for 90+ days with no movement
- Individual suspects open for 90+ days without capture or dismissal
- Population-level convergence health metrics
"""

from datetime import date, timedelta

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.hcc import HccSuspect, RafHistory


async def check_raf_convergence(
    db: AsyncSession,
    gap_threshold: float = 0.1,
    days_threshold: int = 90,
) -> list[dict]:
    """Scan all members and return alerts for stale RAF gaps.

    A member is flagged when:
    1. projected_raf - current_raf > gap_threshold
    2. The gap has not narrowed over the past ``days_threshold`` days
       (based on RafHistory snapshots)

    Returns a list of alert dicts sorted by gap descending.
    """
    cutoff_date = date.today() - timedelta(days=days_threshold)

    # --- Members with a meaningful projected-vs-confirmed gap ---
    members_result = await db.execute(
        select(
            Member.id,
            Member.member_id,
            Member.first_name,
            Member.last_name,
            Member.current_raf,
            Member.projected_raf,
        ).where(
            and_(
                Member.projected_raf.isnot(None),
                Member.current_raf.isnot(None),
                (Member.projected_raf - Member.current_raf) > gap_threshold,
            )
        )
    )
    gapped_members = members_result.all()

    # --- Count open suspects per member ---
    suspect_counts_result = await db.execute(
        select(
            HccSuspect.member_id,
            func.count(HccSuspect.id).label("stale_count"),
        )
        .where(
            and_(
                HccSuspect.status == "open",
                HccSuspect.identified_date <= cutoff_date,
            )
        )
        .group_by(HccSuspect.member_id)
    )
    stale_suspect_map: dict[int, int] = {
        row.member_id: row.stale_count for row in suspect_counts_result.all()
    }

    alerts: list[dict] = []

    for m in gapped_members:
        confirmed = float(m.current_raf) if m.current_raf else 0.0
        projected = float(m.projected_raf) if m.projected_raf else 0.0
        gap = round(projected - confirmed, 3)

        # Check RafHistory for movement over the threshold window.
        # Get the earliest snapshot within the window to see if confirmed RAF moved.
        earliest_snapshot = await db.execute(
            select(RafHistory.total_raf, RafHistory.calculation_date)
            .where(
                and_(
                    RafHistory.member_id == m.id,
                    RafHistory.calculation_date >= cutoff_date,
                )
            )
            .order_by(RafHistory.calculation_date.asc())
            .limit(1)
        )
        earliest = earliest_snapshot.first()

        if earliest:
            old_raf = float(earliest.total_raf)
            movement = round(confirmed - old_raf, 3)
            days_tracked = (date.today() - earliest.calculation_date).days
        else:
            # No history in the window — treat as stagnant since we can't
            # prove movement occurred.
            movement = 0.0
            days_tracked = days_threshold

        # Only alert if there's been negligible upward movement
        # (less than 20% of the gap closed)
        gap_closed_pct = (movement / gap * 100) if gap > 0 else 100
        if gap_closed_pct < 20:
            stale_count = stale_suspect_map.get(m.id, 0)

            # Determine recommended action
            if stale_count > 3:
                action = "Schedule comprehensive chart review — multiple stale suspects"
            elif stale_count > 0:
                action = "Review stale suspects at next PCP visit"
            else:
                action = "Investigate RAF gap — projected codes may need recalculation"

            alerts.append({
                "member_id": m.member_id,
                "member_name": f"{m.first_name} {m.last_name}",
                "stale_suspect_count": stale_count,
                "days_stagnant": days_tracked,
                "projected_raf": round(projected, 3),
                "confirmed_raf": round(confirmed, 3),
                "gap": gap,
                "movement_in_window": movement,
                "gap_closed_pct": round(gap_closed_pct, 1),
                "recommended_action": action,
            })

    # Sort by gap descending — biggest dollar impact first
    alerts.sort(key=lambda a: -a["gap"])
    return alerts


async def get_stale_suspects(
    db: AsyncSession,
    days_threshold: int = 90,
) -> list[dict]:
    """Find individual suspects that have been open too long.

    Returns suspects open for >= ``days_threshold`` days with member context.
    """
    cutoff_date = date.today() - timedelta(days=days_threshold)

    result = await db.execute(
        select(
            HccSuspect.id,
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            HccSuspect.icd10_code,
            HccSuspect.raf_value,
            HccSuspect.annual_value,
            HccSuspect.suspect_type,
            HccSuspect.confidence,
            HccSuspect.identified_date,
            HccSuspect.evidence_summary,
            Member.member_id,
            Member.first_name,
            Member.last_name,
            Member.current_raf,
            Member.projected_raf,
        )
        .join(Member, HccSuspect.member_id == Member.id)
        .where(
            and_(
                HccSuspect.status == "open",
                HccSuspect.identified_date <= cutoff_date,
            )
        )
        .order_by(HccSuspect.raf_value.desc())
    )
    rows = result.all()

    suspects: list[dict] = []
    for r in rows:
        days_open = (date.today() - r.identified_date).days
        raf = float(r.raf_value) if r.raf_value else 0.0

        # Recommend action based on suspect type and age
        if days_open > 180:
            action = "Consider dismissing — 6+ months without capture likely means condition resolved or miscoded"
        elif r.suspect_type in ("recapture", "historical"):
            action = "Prioritize at next visit — previously documented condition should be easy to recapture"
        elif r.suspect_type == "med_dx_gap":
            action = "Check if medication is still active — if so, add diagnosis at next visit"
        elif r.suspect_type == "specificity":
            action = "Review chart for specificity details — code upgrade likely straightforward"
        else:
            action = "Schedule clinical review to confirm or dismiss"

        suspects.append({
            "suspect_id": r.id,
            "member_id": r.member_id,
            "member_name": f"{r.first_name} {r.last_name}",
            "hcc_code": r.hcc_code,
            "hcc_label": r.hcc_label,
            "icd10_code": r.icd10_code,
            "raf_value": round(raf, 3),
            "annual_value": float(r.annual_value) if r.annual_value else 0.0,
            "suspect_type": r.suspect_type,
            "confidence": r.confidence,
            "identified_date": r.identified_date.isoformat(),
            "days_open": days_open,
            "current_raf": float(r.current_raf) if r.current_raf else 0.0,
            "projected_raf": float(r.projected_raf) if r.projected_raf else 0.0,
            "evidence": r.evidence_summary,
            "recommended_action": action,
        })

    return suspects


async def get_convergence_summary(db: AsyncSession) -> dict:
    """Population-level convergence metrics.

    Returns aggregate stats on how well projections are being realized.
    """
    # Total members with both scores
    scored_result = await db.execute(
        select(func.count(Member.id)).where(
            and_(
                Member.current_raf.isnot(None),
                Member.projected_raf.isnot(None),
            )
        )
    )
    total_scored = scored_result.scalar() or 0

    # Members where projected > confirmed (have open opportunity)
    gap_result = await db.execute(
        select(
            func.count(Member.id).label("count"),
            func.avg(Member.projected_raf - Member.current_raf).label("avg_gap"),
            func.sum(Member.projected_raf - Member.current_raf).label("total_gap"),
            func.max(Member.projected_raf - Member.current_raf).label("max_gap"),
        ).where(
            and_(
                Member.current_raf.isnot(None),
                Member.projected_raf.isnot(None),
                Member.projected_raf > Member.current_raf,
            )
        )
    )
    gap_row = gap_result.first()

    members_with_gap = gap_row.count if gap_row else 0
    avg_gap = float(gap_row.avg_gap) if gap_row and gap_row.avg_gap else 0.0
    total_gap = float(gap_row.total_gap) if gap_row and gap_row.total_gap else 0.0
    max_gap = float(gap_row.max_gap) if gap_row and gap_row.max_gap else 0.0

    # Members where confirmed >= projected (fully captured)
    converged_result = await db.execute(
        select(func.count(Member.id)).where(
            and_(
                Member.current_raf.isnot(None),
                Member.projected_raf.isnot(None),
                Member.current_raf >= Member.projected_raf,
            )
        )
    )
    fully_converged = converged_result.scalar() or 0

    # Open suspects by age bucket
    cutoff_30 = date.today() - timedelta(days=30)
    cutoff_60 = date.today() - timedelta(days=60)
    cutoff_90 = date.today() - timedelta(days=90)
    cutoff_180 = date.today() - timedelta(days=180)

    age_buckets_result = await db.execute(
        select(
            func.count(HccSuspect.id).filter(
                HccSuspect.identified_date > cutoff_30
            ).label("under_30d"),
            func.count(HccSuspect.id).filter(
                and_(
                    HccSuspect.identified_date <= cutoff_30,
                    HccSuspect.identified_date > cutoff_60,
                )
            ).label("30_60d"),
            func.count(HccSuspect.id).filter(
                and_(
                    HccSuspect.identified_date <= cutoff_60,
                    HccSuspect.identified_date > cutoff_90,
                )
            ).label("60_90d"),
            func.count(HccSuspect.id).filter(
                and_(
                    HccSuspect.identified_date <= cutoff_90,
                    HccSuspect.identified_date > cutoff_180,
                )
            ).label("90_180d"),
            func.count(HccSuspect.id).filter(
                HccSuspect.identified_date <= cutoff_180
            ).label("over_180d"),
        ).where(HccSuspect.status == "open")
    )
    age_row = age_buckets_result.first()

    # Stale RAF at risk
    stale_raf_result = await db.execute(
        select(
            func.sum(HccSuspect.raf_value).label("total_raf"),
            func.sum(HccSuspect.annual_value).label("total_annual"),
            func.count(HccSuspect.id).label("count"),
        ).where(
            and_(
                HccSuspect.status == "open",
                HccSuspect.identified_date <= cutoff_90,
            )
        )
    )
    stale_row = stale_raf_result.first()
    stale_raf = float(stale_row.total_raf) if stale_row and stale_row.total_raf else 0.0
    stale_annual = float(stale_row.total_annual) if stale_row and stale_row.total_annual else 0.0
    stale_count = stale_row.count if stale_row else 0

    # Capture rate: suspects captured vs total identified (all time)
    capture_result = await db.execute(
        select(
            func.count(HccSuspect.id).label("total"),
            func.count(HccSuspect.id).filter(
                HccSuspect.status == "captured"
            ).label("captured"),
            func.count(HccSuspect.id).filter(
                HccSuspect.status == "dismissed"
            ).label("dismissed"),
        )
    )
    capture_row = capture_result.first()
    total_suspects = capture_row.total if capture_row else 0
    captured = capture_row.captured if capture_row else 0
    dismissed = capture_row.dismissed if capture_row else 0
    capture_rate = round(captured / total_suspects * 100, 1) if total_suspects > 0 else 0.0
    resolution_rate = round((captured + dismissed) / total_suspects * 100, 1) if total_suspects > 0 else 0.0

    convergence_rate = round(fully_converged / total_scored * 100, 1) if total_scored > 0 else 0.0

    return {
        "population": {
            "total_scored_members": total_scored,
            "members_with_gap": members_with_gap,
            "fully_converged": fully_converged,
            "convergence_rate_pct": convergence_rate,
        },
        "gap_metrics": {
            "avg_gap": round(avg_gap, 3),
            "total_gap_raf": round(total_gap, 3),
            "max_gap": round(max_gap, 3),
        },
        "stale_suspects": {
            "count_over_90d": stale_count,
            "raf_at_risk": round(stale_raf, 3),
            "annual_value_at_risk": round(stale_annual, 2),
        },
        "suspect_aging": {
            "under_30d": age_row.under_30d if age_row else 0,
            "30_60d": getattr(age_row, "30_60d", 0) if age_row else 0,
            "60_90d": getattr(age_row, "60_90d", 0) if age_row else 0,
            "90_180d": getattr(age_row, "90_180d", 0) if age_row else 0,
            "over_180d": getattr(age_row, "over_180d", 0) if age_row else 0,
        },
        "capture_performance": {
            "total_suspects_all_time": total_suspects,
            "captured": captured,
            "dismissed": dismissed,
            "capture_rate_pct": capture_rate,
            "resolution_rate_pct": resolution_rate,
        },
    }
