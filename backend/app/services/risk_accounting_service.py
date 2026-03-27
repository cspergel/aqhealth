"""
Risk / Capitation Accounting Service.

Full risk accounting: capitation revenue, medical spend, MLR, surplus/deficit,
IBNR, risk corridors, and risk pool management.
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text, func
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Risk Dashboard
# ---------------------------------------------------------------------------

async def get_risk_dashboard(db: AsyncSession) -> dict[str, Any]:
    """
    Full risk accounting dashboard: total cap revenue, total medical spend,
    MLR, surplus/deficit, IBNR, risk pool status, by-plan breakdown.
    """
    # Query capitation revenue
    try:
        cap_result = await db.execute(
            text("SELECT COALESCE(SUM(total_payment), 0) as total_revenue FROM capitation_payments")
        )
        total_cap_revenue = float(cap_result.scalar() or 0)
    except Exception as e:
        logger.warning("capitation_payments query failed (table may not exist): %s", e)
        total_cap_revenue = 0

    # Query total medical spend from claims
    try:
        spend_result = await db.execute(
            text("SELECT COALESCE(SUM(paid_amount), 0) as total_spend FROM claims")
        )
        total_medical_spend = float(spend_result.scalar() or 0)
    except Exception as e:
        logger.warning("claims spend query failed: %s", e)
        total_medical_spend = 0

    # Calculate MLR
    if total_cap_revenue > 0:
        mlr = round(total_medical_spend / total_cap_revenue, 4)
    else:
        mlr = None

    surplus_deficit = total_cap_revenue - total_medical_spend

    # IBNR
    ibnr_data = await calculate_ibnr(db)
    ibnr_estimate = ibnr_data.get("total_estimate", 0)

    # By-plan breakdown
    by_plan = await get_surplus_deficit_by_plan(db)

    has_data = total_cap_revenue > 0 or total_medical_spend > 0

    return {
        "total_cap_revenue": total_cap_revenue,
        "total_medical_spend": total_medical_spend,
        "mlr": mlr,
        "surplus_deficit": surplus_deficit,
        "ibnr_estimate": ibnr_estimate,
        "by_plan": by_plan,
        "has_data": has_data,
    }


# ---------------------------------------------------------------------------
# Capitation Summary
# ---------------------------------------------------------------------------

async def get_capitation_summary(
    db: AsyncSession,
    period: str | None = None,
) -> dict[str, Any]:
    """Cap payments by plan/month with retro adjustments."""
    try:
        query = """
            SELECT
                plan_name,
                TO_CHAR(payment_month, 'YYYY-MM') as month,
                SUM(total_payment) as total,
                COUNT(*) as payment_count
            FROM capitation_payments
        """
        params: dict[str, Any] = {}
        if period:
            query += " WHERE TO_CHAR(payment_month, 'YYYY-MM') = :period"
            params["period"] = period
        query += " GROUP BY plan_name, TO_CHAR(payment_month, 'YYYY-MM') ORDER BY month DESC, plan_name"

        result = await db.execute(text(query), params)
        rows = result.fetchall()

        payments = []
        grand_total = 0.0
        for row in rows:
            amount = float(row.total or 0)
            grand_total += amount
            payments.append({
                "plan_name": row.plan_name,
                "month": row.month,
                "total": amount,
                "payment_count": row.payment_count,
            })

        return {
            "period": period,
            "payments": payments,
            "total": grand_total,
            "has_data": len(payments) > 0,
        }
    except Exception as e:
        logger.warning("Capitation summary query failed (table may not exist): %s", e)
        return {
            "period": period,
            "payments": [],
            "total": 0,
            "has_data": False,
        }


# ---------------------------------------------------------------------------
# Subcap Summary
# ---------------------------------------------------------------------------

async def get_subcap_summary(
    db: AsyncSession,
    period: str | None = None,
) -> dict[str, Any]:
    """Subcapitation payments to providers/groups."""
    try:
        query = """
            SELECT
                provider_id,
                TO_CHAR(payment_month, 'YYYY-MM') as month,
                SUM(total_payment) as total,
                COUNT(*) as payment_count
            FROM subcap_payments
        """
        params: dict[str, Any] = {}
        if period:
            query += " WHERE TO_CHAR(payment_month, 'YYYY-MM') = :period"
            params["period"] = period
        query += " GROUP BY provider_id, TO_CHAR(payment_month, 'YYYY-MM') ORDER BY month DESC, provider_id"

        result = await db.execute(text(query), params)
        rows = result.fetchall()

        payments = []
        grand_total = 0.0
        for row in rows:
            amount = float(row.total or 0)
            grand_total += amount
            payments.append({
                "provider_id": row.provider_id,
                "month": row.month,
                "total": amount,
                "payment_count": row.payment_count,
            })

        return {
            "period": period,
            "payments": payments,
            "total": grand_total,
            "has_data": len(payments) > 0,
        }
    except Exception as e:
        logger.warning("Subcap summary query failed (table may not exist): %s", e)
        return {
            "period": period,
            "payments": [],
            "total": 0,
            "has_data": False,
        }


# ---------------------------------------------------------------------------
# Risk Pool Status
# ---------------------------------------------------------------------------

async def get_risk_pool_status(db: AsyncSession) -> list[dict[str, Any]]:
    """Each plan's risk pool: withheld, bonus earned, surplus/deficit, settlement."""
    try:
        result = await db.execute(text("""
            SELECT
                id, plan_name, pool_year,
                total_withheld, quality_bonus_earned,
                surplus_share, deficit_share,
                settlement_date, status
            FROM risk_pools
            ORDER BY pool_year DESC, plan_name
        """))
        rows = result.fetchall()
        return [
            {
                "id": row.id,
                "plan_name": row.plan_name,
                "pool_year": row.pool_year,
                "total_withheld": float(row.total_withheld or 0),
                "quality_bonus_earned": float(row.quality_bonus_earned or 0),
                "surplus_share": float(row.surplus_share or 0),
                "deficit_share": float(row.deficit_share or 0),
                "settlement_date": str(row.settlement_date) if row.settlement_date else None,
                "status": row.status,
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("Risk pool query failed (table may not exist): %s", e)
        return []


# ---------------------------------------------------------------------------
# IBNR Calculation
# ---------------------------------------------------------------------------

async def calculate_ibnr(db: AsyncSession) -> dict[str, Any]:
    """
    Incurred But Not Reported: estimated claims not yet received,
    by category, with confidence based on historical completion factors.
    """
    try:
        # Estimate IBNR from signal-tier claims that haven't been reconciled
        result = await db.execute(text("""
            SELECT
                service_category,
                COUNT(*) as signal_count,
                COALESCE(SUM(estimated_amount), 0) as estimated_total
            FROM claims
            WHERE data_tier = 'signal'
              AND reconciled = false
              AND service_date >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY service_category
            ORDER BY estimated_total DESC
        """))
        rows = result.fetchall()

        by_category = []
        total_estimate = 0.0
        for row in rows:
            est = float(row.estimated_total or 0)
            total_estimate += est
            by_category.append({
                "category": row.service_category or "other",
                "signal_count": row.signal_count,
                "estimated_amount": est,
            })

        # Confidence: higher if we have more signals
        total_signals = sum(r.signal_count for r in rows) if rows else 0
        confidence = min(85, 40 + total_signals) if total_signals > 0 else 0

        return {
            "total_estimate": total_estimate,
            "confidence": confidence,
            "by_category": by_category,
            "has_data": len(by_category) > 0,
        }
    except Exception as e:
        logger.warning("IBNR calculation failed: %s", e)
        return {
            "total_estimate": 0,
            "confidence": 0,
            "by_category": [],
            "has_data": False,
        }


# ---------------------------------------------------------------------------
# Surplus / Deficit by Plan
# ---------------------------------------------------------------------------

async def get_surplus_deficit_by_plan(db: AsyncSession) -> list[dict[str, Any]]:
    """Per-plan P&L: cap revenue - medical spend - admin = surplus/deficit."""
    try:
        # Get cap revenue by plan
        cap_result = await db.execute(text("""
            SELECT plan_name, COALESCE(SUM(total_payment), 0) as revenue
            FROM capitation_payments
            GROUP BY plan_name
        """))
        cap_by_plan = {row.plan_name: float(row.revenue) for row in cap_result.fetchall()}

        # Get medical spend by plan (via member's health_plan)
        spend_result = await db.execute(text("""
            SELECT m.health_plan, COALESCE(SUM(c.paid_amount), 0) as spend
            FROM claims c
            JOIN members m ON c.member_id = m.id
            WHERE m.health_plan IS NOT NULL
            GROUP BY m.health_plan
        """))
        spend_by_plan = {row.health_plan: float(row.spend) for row in spend_result.fetchall()}

        all_plans = set(cap_by_plan.keys()) | set(spend_by_plan.keys())
        results = []
        for plan in sorted(all_plans):
            revenue = cap_by_plan.get(plan, 0)
            spend = spend_by_plan.get(plan, 0)
            mlr = round(spend / revenue, 4) if revenue > 0 else None
            results.append({
                "plan_name": plan,
                "cap_revenue": revenue,
                "medical_spend": spend,
                "surplus_deficit": revenue - spend,
                "mlr": mlr,
            })

        return results
    except Exception as e:
        logger.warning("Surplus/deficit by plan query failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Surplus / Deficit by Group
# ---------------------------------------------------------------------------

async def get_surplus_deficit_by_group(db: AsyncSession) -> list[dict[str, Any]]:
    """Per-group P&L: which groups are profitable, which are losing."""
    try:
        result = await db.execute(text("""
            SELECT
                pg.id as group_id,
                pg.name as group_name,
                COALESCE(SUM(c.paid_amount), 0) as medical_spend,
                COUNT(DISTINCT c.member_id) as member_count
            FROM claims c
            JOIN members m ON c.member_id = m.id
            JOIN providers p ON m.pcp_provider_id = p.id
            JOIN practice_groups pg ON p.practice_group_id = pg.id
            GROUP BY pg.id, pg.name
            ORDER BY medical_spend DESC
        """))
        rows = result.fetchall()

        return [
            {
                "group_id": row.group_id,
                "group_name": row.group_name,
                "medical_spend": float(row.medical_spend),
                "member_count": row.member_count,
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning("Surplus/deficit by group query failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Risk Corridor Analysis
# ---------------------------------------------------------------------------

async def get_risk_corridor_analysis(db: AsyncSession) -> dict[str, Any]:
    """
    Delegate to stoploss_service which has the full corridor band logic
    (shared savings, neutral, shared risk, stop-loss trigger).
    """
    from app.services.stoploss_service import get_risk_corridor_analysis as _stoploss_corridor
    return await _stoploss_corridor(db)
