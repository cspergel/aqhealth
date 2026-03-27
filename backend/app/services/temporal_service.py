"""
Temporal Playback / Time Machine Service.

Reconstructs population snapshots at any point in time, compares periods,
generates metric timelines, and produces chronological change logs.
"""

import calendar
import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect, RafHistory, SuspectStatus
from app.models.care_gap import MemberGap, GapStatus, GapMeasure

logger = logging.getLogger(__name__)

CMS_MONTHLY_BASE = 1100.0


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _safe_int(v) -> int:
    return int(v) if v is not None else 0


def _pct_change(old: float, new: float) -> float:
    """Calculate percentage change, handling zero denominator."""
    if old == 0:
        return 0.0 if new == 0 else 100.0
    return round(((new - old) / abs(old)) * 100, 2)


# ---------------------------------------------------------------------------
# Population Snapshot
# ---------------------------------------------------------------------------

async def get_population_snapshot(db: AsyncSession, as_of_date: str) -> dict:
    """
    Reconstruct population metrics as of a specific date.

    Returns a dict with: date, total_members, avg_raf, total_suspects,
    total_spend, gap_closure_rate, pmpm.
    """
    cutoff = date.fromisoformat(as_of_date)

    # Members active as of that date
    member_q = select(func.count(Member.id)).where(
        and_(
            or_(Member.coverage_start <= cutoff, Member.coverage_start.is_(None)),
            or_(Member.coverage_end >= cutoff, Member.coverage_end.is_(None)),
        )
    )
    member_count = _safe_int((await db.execute(member_q)).scalar())

    # Average RAF from raf_history — find the most recent calculation_date <= cutoff per member
    # Use a subquery to get the latest raf_history entry per active member before the cutoff
    latest_raf_sub = (
        select(
            RafHistory.member_id,
            func.max(RafHistory.calculation_date).label("max_date"),
        )
        .where(RafHistory.calculation_date <= cutoff)
        .group_by(RafHistory.member_id)
        .subquery()
    )
    avg_raf_q = select(func.avg(RafHistory.total_raf)).join(
        latest_raf_sub,
        and_(
            RafHistory.member_id == latest_raf_sub.c.member_id,
            RafHistory.calculation_date == latest_raf_sub.c.max_date,
        ),
    )
    avg_raf_val = (await db.execute(avg_raf_q)).scalar()
    # Fallback to current_raf if no raf_history rows exist yet
    if avg_raf_val is None:
        fallback_q = select(func.avg(Member.current_raf)).where(
            and_(
                or_(Member.coverage_start <= cutoff, Member.coverage_start.is_(None)),
                or_(Member.coverage_end >= cutoff, Member.coverage_end.is_(None)),
            )
        )
        avg_raf_val = (await db.execute(fallback_q)).scalar()
    avg_raf = round(_safe_float(avg_raf_val), 3)

    # Suspects identified before that date
    suspect_q = select(func.count(HccSuspect.id)).where(
        HccSuspect.created_at <= cutoff,
    )
    total_suspects = _safe_int((await db.execute(suspect_q)).scalar())

    # Claims spend through that date
    spend_q = select(func.sum(Claim.paid_amount)).where(
        Claim.service_date <= cutoff,
    )
    total_spend = round(_safe_float((await db.execute(spend_q)).scalar()), 2)

    # Care gaps: open/closed as of that date
    total_gaps_q = select(func.count(MemberGap.id)).where(
        MemberGap.created_at <= cutoff,
    )
    total_gaps = _safe_int((await db.execute(total_gaps_q)).scalar())

    closed_gaps_q = select(func.count(MemberGap.id)).where(
        and_(
            MemberGap.created_at <= cutoff,
            MemberGap.status == GapStatus.closed,
        )
    )
    closed_gaps = _safe_int((await db.execute(closed_gaps_q)).scalar())

    gap_closure_rate = round((closed_gaps / total_gaps * 100) if total_gaps > 0 else 0.0, 1)
    pmpm = round(total_spend / member_count, 2) if member_count > 0 else 0.0

    return {
        "date": as_of_date,
        "total_members": member_count,
        "avg_raf": avg_raf,
        "total_suspects": total_suspects,
        "total_spend": total_spend,
        "gap_closure_rate": gap_closure_rate,
        "pmpm": pmpm,
    }


# ---------------------------------------------------------------------------
# Period Comparison
# ---------------------------------------------------------------------------

async def compare_periods(db: AsyncSession, period_a: str, period_b: str) -> dict:
    """
    Get snapshots for two periods and calculate deltas for every metric.

    Returns: {period_a: snapshot, period_b: snapshot, deltas: {...}, notable_changes: [...]}
    """
    snap_a = await get_population_snapshot(db, period_a)
    snap_b = await get_population_snapshot(db, period_b)

    metrics = ["total_members", "avg_raf", "pmpm", "total_suspects", "gap_closure_rate", "total_spend"]
    deltas: dict = {}
    for m in metrics:
        old_val = snap_a[m]
        new_val = snap_b[m]
        deltas[m] = {
            "old": old_val,
            "new": new_val,
            "change": round(new_val - old_val, 3),
            "pct_change": _pct_change(old_val, new_val),
        }

    # Build notable changes narrative
    notable: list[str] = []
    mem_delta = deltas["total_members"]["change"]
    if mem_delta > 0:
        notable.append(f"{mem_delta} new members attributed")
    elif mem_delta < 0:
        notable.append(f"{abs(mem_delta)} members lost from attribution")

    suspect_delta = deltas["total_suspects"]["change"]
    if suspect_delta < 0:
        notable.append(f"{abs(suspect_delta)} HCC suspects captured")
    elif suspect_delta > 0:
        notable.append(f"{suspect_delta} new suspects identified")

    gap_delta = deltas["gap_closure_rate"]["change"]
    if gap_delta > 0:
        notable.append(f"Gap closure improved by {gap_delta:.1f}pp")

    pmpm_delta = deltas["pmpm"]["change"]
    if pmpm_delta < 0:
        notable.append(f"PMPM decreased by ${abs(pmpm_delta):,.0f}")
    elif pmpm_delta > 0:
        notable.append(f"PMPM increased by ${pmpm_delta:,.0f}")

    return {
        "period_a": snap_a,
        "period_b": snap_b,
        "deltas": deltas,
        "notable_changes": notable,
    }


# ---------------------------------------------------------------------------
# Metric Timeline
# ---------------------------------------------------------------------------

SUPPORTED_METRICS = {
    "total_members", "avg_raf", "total_pmpm", "suspect_count",
    "gap_closure_rate", "capture_rate",
}


async def get_metric_timeline(db: AsyncSession, metric: str, months: int = 12) -> list:
    """
    Monthly values for a specific metric over the requested number of months.

    Returns: [{month: "2025-04", value: ...}, ...]
    """
    if metric not in SUPPORTED_METRICS:
        return []

    today = date.today()
    results: list[dict] = []

    for i in range(months - 1, -1, -1):
        # Calculate the first day of each month going back
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        _, last_day = calendar.monthrange(y, m)
        month_end = date(y, m, last_day)
        month_label = f"{y}-{m:02d}"

        snapshot = await get_population_snapshot(db, month_end.isoformat())

        value: float = 0.0
        if metric == "total_members":
            value = snapshot["total_members"]
        elif metric == "avg_raf":
            value = snapshot["avg_raf"]
        elif metric == "total_pmpm":
            value = snapshot["pmpm"]
        elif metric == "suspect_count":
            value = snapshot["total_suspects"]
        elif metric == "gap_closure_rate":
            value = snapshot["gap_closure_rate"]
        elif metric == "capture_rate":
            # Approximate capture rate from suspects
            value = snapshot["gap_closure_rate"] * 0.5  # simplified proxy

        results.append({"month": month_label, "value": round(value, 3)})

    return results


# ---------------------------------------------------------------------------
# Change Log
# ---------------------------------------------------------------------------

async def get_change_log(db: AsyncSession, start_date: str, end_date: str) -> list:
    """
    Significant events that happened between two dates.

    Returns: [{date, event_type, description, impact}, ...]
    """
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    events: list[dict] = []

    # New member attributions in range
    new_members_q = select(func.count(Member.id)).where(
        and_(Member.coverage_start >= start, Member.coverage_start <= end)
    )
    new_members = _safe_int((await db.execute(new_members_q)).scalar())
    if new_members > 0:
        events.append({
            "date": end.isoformat(),
            "event_type": "attribution",
            "description": f"{new_members} new members attributed during period",
            "impact": f"+{new_members} members",
        })

    # Lost members
    lost_q = select(func.count(Member.id)).where(
        and_(Member.coverage_end >= start, Member.coverage_end <= end)
    )
    lost = _safe_int((await db.execute(lost_q)).scalar())
    if lost > 0:
        events.append({
            "date": end.isoformat(),
            "event_type": "attribution",
            "description": f"{lost} members lost from attribution during period",
            "impact": f"-{lost} members",
        })

    # HCC captures
    captures_q = select(func.count(HccSuspect.id)).where(
        and_(
            HccSuspect.status == SuspectStatus.captured,
            HccSuspect.updated_at >= start,
            HccSuspect.updated_at <= end,
        )
    )
    captures = _safe_int((await db.execute(captures_q)).scalar())
    if captures > 0:
        events.append({
            "date": end.isoformat(),
            "event_type": "capture",
            "description": f"{captures} HCC suspects captured during period",
            "impact": f"Revenue uplift",
        })

    # Large claims
    large_claims_q = select(func.count(Claim.id)).where(
        and_(
            Claim.service_date >= start,
            Claim.service_date <= end,
            Claim.paid_amount >= 25000,
        )
    )
    large_claims = _safe_int((await db.execute(large_claims_q)).scalar())
    if large_claims > 0:
        events.append({
            "date": end.isoformat(),
            "event_type": "claim",
            "description": f"{large_claims} high-cost claims ($25K+) during period",
            "impact": "Cost impact",
        })

    # Gap closures
    gap_closures_q = select(func.count(MemberGap.id)).where(
        and_(
            MemberGap.status == GapStatus.closed,
            MemberGap.updated_at >= start,
            MemberGap.updated_at <= end,
        )
    )
    gap_closures = _safe_int((await db.execute(gap_closures_q)).scalar())
    if gap_closures > 0:
        events.append({
            "date": end.isoformat(),
            "event_type": "gap",
            "description": f"{gap_closures} care gaps closed during period",
            "impact": f"Quality improvement",
        })

    return sorted(events, key=lambda e: e["date"], reverse=True)
