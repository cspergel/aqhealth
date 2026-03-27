"""
Stop-Loss & Risk Corridor Tracking Service.

Monitors high-cost members against stop-loss thresholds and tracks
aggregate risk corridor position for shared-risk arrangements.
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.risk_accounting import CapitationPayment

logger = logging.getLogger(__name__)

# Default stop-loss threshold (configurable)
DEFAULT_STOPLOSS_THRESHOLD = 100_000


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    return float(v)


def _safe_int(v) -> int:
    if v is None:
        return 0
    return int(v)


# ---------------------------------------------------------------------------
# Stop-Loss Dashboard
# ---------------------------------------------------------------------------

async def get_stoploss_dashboard(
    db: AsyncSession, threshold: float = DEFAULT_STOPLOSS_THRESHOLD
) -> dict[str, Any]:
    """
    Members approaching/exceeding stop-loss thresholds, total exposure,
    and current risk corridor position.
    """
    today = date.today()
    twelve_months_ago = today - timedelta(days=365)

    # Aggregate 12-month spend per member
    member_spend_q = await db.execute(
        select(
            Claim.member_id,
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend"),
        )
        .where(Claim.service_date >= twelve_months_ago)
        .group_by(Claim.member_id)
    )
    member_spends = member_spend_q.all()

    approaching_threshold = threshold * 0.80  # 80% of threshold
    members_approaching = 0
    members_exceeding = 0
    total_exposure = 0.0

    for row in member_spends:
        spend = _safe_float(row[1])
        if spend >= threshold:
            members_exceeding += 1
            total_exposure += spend - threshold
        elif spend >= approaching_threshold:
            members_approaching += 1

    # Risk corridor position: actual spend vs capitation target
    total_spend_q = await db.execute(
        select(func.coalesce(func.sum(Claim.paid_amount), 0))
        .where(Claim.service_date >= twelve_months_ago)
    )
    actual_spend = _safe_float(total_spend_q.scalar())

    cap_q = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.total_payment), 0))
        .where(CapitationPayment.payment_month >= twelve_months_ago)
    )
    target_spend = _safe_float(cap_q.scalar())

    ratio = actual_spend / max(target_spend, 1)

    return {
        "threshold": threshold,
        "members_approaching": members_approaching,
        "members_exceeding": members_exceeding,
        "total_exposure": round(total_exposure, 2),
        "risk_corridor_position": round(ratio, 4),
        "actual_spend": round(actual_spend, 2),
        "target_spend": round(target_spend, 2),
    }


# ---------------------------------------------------------------------------
# High-Cost Members
# ---------------------------------------------------------------------------

async def get_high_cost_members(
    db: AsyncSession, limit: int = 25
) -> list[dict[str, Any]]:
    """
    Members ranked by 12-month spend with stop-loss threshold comparison.
    """
    today = date.today()
    twelve_months_ago = today - timedelta(days=365)

    q = await db.execute(
        select(
            Claim.member_id,
            Member.first_name,
            Member.last_name,
            Member.health_plan,
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .join(Member, Claim.member_id == Member.id)
        .where(Claim.service_date >= twelve_months_ago)
        .group_by(Claim.member_id, Member.first_name, Member.last_name, Member.health_plan)
        .order_by(func.sum(Claim.paid_amount).desc().nulls_last())
        .limit(limit)
    )
    rows = q.all()

    results = []
    for row in rows:
        spend = _safe_float(row[4])
        results.append({
            "member_id": row[0],
            "first_name": row[1],
            "last_name": row[2],
            "health_plan": row[3],
            "total_spend": round(spend, 2),
            "claim_count": _safe_int(row[5]),
            "pct_of_threshold": round(spend / DEFAULT_STOPLOSS_THRESHOLD * 100, 1),
            "exceeds_threshold": spend >= DEFAULT_STOPLOSS_THRESHOLD,
        })

    return results


# ---------------------------------------------------------------------------
# Risk Corridor Analysis
# ---------------------------------------------------------------------------

async def get_risk_corridor_analysis(db: AsyncSession) -> dict[str, Any]:
    """
    Where are we in the risk corridor? What is the shared risk exposure?

    Compares actual medical spend to target (from capitation payments).
    Typical corridors:
      - 97-103% of target: No sharing
      - 103-108%: 50/50 shared risk (MSO pays 50% of overage)
      - >108%: Plan pays 100% (stop-loss kicks in)
      - 92-97%: 50/50 shared savings
      - <92%: MSO keeps 100% of savings
    """
    today = date.today()
    twelve_months_ago = today - timedelta(days=365)

    # Actual medical spend
    spend_q = await db.execute(
        select(func.coalesce(func.sum(Claim.paid_amount), 0))
        .where(Claim.service_date >= twelve_months_ago)
    )
    actual_spend = _safe_float(spend_q.scalar())

    # Target from capitation
    cap_q = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.total_payment), 0))
        .where(CapitationPayment.payment_month >= twelve_months_ago)
    )
    target_spend = _safe_float(cap_q.scalar())

    ratio = actual_spend / max(target_spend, 1) if target_spend > 0 else 0.0

    # Determine corridor band and shared risk
    if ratio == 0:
        corridor_band = "no_data"
        shared_risk_exposure = 0.0
    elif ratio < 0.92:
        corridor_band = "deep_surplus"
        shared_risk_exposure = -(target_spend * 0.92 - actual_spend)  # MSO keeps all savings below 92%
    elif ratio < 0.97:
        corridor_band = "shared_savings"
        savings = target_spend - actual_spend
        shared_risk_exposure = -(savings * 0.50)  # 50/50 shared savings
    elif ratio <= 1.03:
        corridor_band = "neutral"
        shared_risk_exposure = 0.0
    elif ratio <= 1.08:
        corridor_band = "shared_risk"
        overage = actual_spend - target_spend
        shared_risk_exposure = overage * 0.50  # 50/50 shared risk
    else:
        corridor_band = "stoploss_trigger"
        # MSO responsible for 50% up to 108%, plan covers rest
        overage_to_108 = target_spend * 0.08
        shared_risk_exposure = overage_to_108 * 0.50

    return {
        "target_spend": round(target_spend, 2),
        "actual_spend": round(actual_spend, 2),
        "ratio": round(ratio, 4),
        "corridor_band": corridor_band,
        "shared_risk_exposure": round(shared_risk_exposure, 2),
        "surplus_or_deficit": round(target_spend - actual_spend, 2),
    }
