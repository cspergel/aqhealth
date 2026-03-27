"""
Financial P&L Modeling Service — profit & loss statements, plan/group breakdowns,
and revenue forecasting.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import calendar
import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.provider import Provider
from app.models.practice_group import PracticeGroup
from app.models.risk_accounting import CapitationPayment

logger = logging.getLogger(__name__)


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    return float(v)


def _safe_int(v) -> int:
    if v is None:
        return 0
    return int(v)


# ---------------------------------------------------------------------------
# P&L Statement
# ---------------------------------------------------------------------------

async def get_pnl(db: AsyncSession, period: str = "ytd") -> dict:
    """
    Return a full profit & loss statement for the MSO.

    Parameters
    ----------
    db : tenant-scoped async session
    period : "ytd" | "q1" | "q2" | "q3" | "q4" | "prior_year"

    Returns
    -------
    dict with revenue, expenses, bottom_line, comparison keys.
    """
    today = date.today()
    year = today.year

    # Determine date range based on period
    if period == "q1":
        start_date = date(year, 1, 1)
        end_date = date(year, 3, 31)
    elif period == "q2":
        start_date = date(year, 4, 1)
        end_date = date(year, 6, 30)
    elif period == "q3":
        start_date = date(year, 7, 1)
        end_date = date(year, 9, 30)
    elif period == "q4":
        start_date = date(year, 10, 1)
        end_date = date(year, 12, 31)
    elif period == "prior_year":
        start_date = date(year - 1, 1, 1)
        end_date = date(year - 1, 12, 31)
    else:  # ytd
        start_date = date(year, 1, 1)
        end_date = today

    # ---- Revenue from capitation_payments ----
    cap_q = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.total_payment), 0))
        .where(
            CapitationPayment.payment_month >= start_date,
            CapitationPayment.payment_month <= end_date,
        )
    )
    capitation_revenue = _safe_float(cap_q.scalar())

    # Adjustment revenue (retro adjustments on capitation)
    adj_q = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.adjustment_amount), 0))
        .where(
            CapitationPayment.payment_month >= start_date,
            CapitationPayment.payment_month <= end_date,
        )
    )
    raf_adjustment = _safe_float(adj_q.scalar())

    total_revenue = capitation_revenue + raf_adjustment

    revenue = {
        "capitation": round(capitation_revenue, 2),
        "raf_adjustment": round(raf_adjustment, 2),
        "total": round(total_revenue, 2),
    }

    # ---- Expenses from claims ----
    cat_q = await db.execute(
        select(
            Claim.service_category,
            func.coalesce(func.sum(Claim.paid_amount), 0).label("spend"),
        )
        .where(
            Claim.service_date >= start_date,
            Claim.service_date <= end_date,
            Claim.service_category.isnot(None),
        )
        .group_by(Claim.service_category)
    )
    cat_rows = cat_q.all()

    expenses: dict = {}
    total_expenses = 0.0
    for row in cat_rows:
        cat = row[0] or "other"
        spend = _safe_float(row[1])
        expenses[cat] = round(spend, 2)
        total_expenses += spend
    expenses["total"] = round(total_expenses, 2)

    # Fallback: if no data at all, return zeros rather than empty
    if total_revenue == 0 and total_expenses == 0:
        revenue = {"capitation": 0, "raf_adjustment": 0, "total": 0}
        expenses = {"total": 0}

    surplus = total_revenue - total_expenses
    mlr = (total_expenses / total_revenue) if total_revenue > 0 else None

    # Member count
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)
    member_q = await db.execute(select(func.count(Member.id)).where(active_filter))
    member_count = max(_safe_int(member_q.scalar()), 1)

    per_member_margin = surplus / max(member_count, 1)

    # ---- Comparison: prior year same period ----
    prior_start = date(start_date.year - 1, start_date.month, start_date.day)
    prior_end_max_day = calendar.monthrange(end_date.year - 1, end_date.month)[1]
    prior_end = date(end_date.year - 1, end_date.month, min(end_date.day, prior_end_max_day))

    prior_cap_q = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.total_payment), 0))
        .where(
            CapitationPayment.payment_month >= prior_start,
            CapitationPayment.payment_month <= prior_end,
        )
    )
    prior_revenue = _safe_float(prior_cap_q.scalar())

    prior_exp_q = await db.execute(
        select(func.coalesce(func.sum(Claim.paid_amount), 0))
        .where(
            Claim.service_date >= prior_start,
            Claim.service_date <= prior_end,
        )
    )
    prior_expenses = _safe_float(prior_exp_q.scalar())
    prior_surplus = prior_revenue - prior_expenses
    prior_mlr = (prior_expenses / prior_revenue) if prior_revenue > 0 else None

    comparison = {
        "prior_year": {
            "revenue": round(prior_revenue, 2),
            "expenses": round(prior_expenses, 2),
            "surplus": round(prior_surplus, 2),
            "mlr": round(prior_mlr, 4) if prior_mlr is not None else None,
        },
    }

    return {
        "period": period,
        "revenue": revenue,
        "expenses": expenses,
        "surplus": round(surplus, 2),
        "mlr": round(mlr, 4) if mlr is not None else None,
        "member_count": member_count,
        "per_member_margin": round(per_member_margin, 2),
        "comparison": comparison,
    }


# ---------------------------------------------------------------------------
# P&L by Health Plan
# ---------------------------------------------------------------------------

async def get_pnl_by_plan(db: AsyncSession) -> list[dict]:
    """Break P&L out by health plan contract."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Revenue per plan from capitation_payments
    rev_q = await db.execute(
        select(
            CapitationPayment.plan_name,
            func.coalesce(func.sum(CapitationPayment.total_payment), 0).label("revenue"),
            func.coalesce(func.sum(CapitationPayment.member_count), 0).label("members"),
        )
        .where(CapitationPayment.payment_month >= year_start)
        .group_by(CapitationPayment.plan_name)
    )
    rev_by_plan: dict[str, dict] = {}
    for row in rev_q.all():
        plan = row[0] or "Unknown"
        rev_by_plan[plan] = {
            "revenue": _safe_float(row[1]),
            "members": _safe_int(row[2]),
        }

    # Expenses per plan: claims -> member -> member.health_plan
    exp_q = await db.execute(
        select(
            Member.health_plan,
            func.coalesce(func.sum(Claim.paid_amount), 0).label("expenses"),
        )
        .join(Member, Claim.member_id == Member.id)
        .where(
            Claim.service_date >= year_start,
            Member.health_plan.isnot(None),
        )
        .group_by(Member.health_plan)
    )
    exp_by_plan: dict[str, float] = {}
    for row in exp_q.all():
        plan = row[0] or "Unknown"
        exp_by_plan[plan] = _safe_float(row[1])

    # Combine all plan names
    all_plans = set(rev_by_plan.keys()) | set(exp_by_plan.keys())
    results = []
    for plan in sorted(all_plans):
        rev_data = rev_by_plan.get(plan, {"revenue": 0, "members": 0})
        revenue = rev_data["revenue"]
        members = max(rev_data["members"], 1)
        exp = exp_by_plan.get(plan, 0)
        surplus = revenue - exp
        mlr = exp / max(revenue, 1)
        per_member = surplus / max(members, 1)
        results.append({
            "plan": plan,
            "members": rev_data["members"],
            "revenue": round(revenue, 2),
            "expenses": round(exp, 2),
            "surplus": round(surplus, 2),
            "mlr": round(mlr, 4),
            "per_member_margin": round(per_member, 2),
        })

    return results


# ---------------------------------------------------------------------------
# P&L by Provider Group
# ---------------------------------------------------------------------------

async def get_pnl_by_group(db: AsyncSession) -> list[dict]:
    """Break P&L out by provider group (practice group)."""
    today = date.today()
    year_start = date(today.year, 1, 1)

    # Expenses by group: Claim -> member -> pcp_provider -> practice_group
    exp_q = await db.execute(
        select(
            PracticeGroup.id,
            PracticeGroup.name,
            func.count(func.distinct(Provider.id)).label("providers"),
            func.count(func.distinct(Member.id)).label("members"),
            func.coalesce(func.sum(Claim.paid_amount), 0).label("expenses"),
        )
        .join(Member, Claim.member_id == Member.id)
        .join(Provider, Member.pcp_provider_id == Provider.id)
        .join(PracticeGroup, Provider.practice_group_id == PracticeGroup.id)
        .where(Claim.service_date >= year_start)
        .group_by(PracticeGroup.id, PracticeGroup.name)
    )
    group_data: dict[int, dict] = {}
    for row in exp_q.all():
        group_data[row[0]] = {
            "group": row[1],
            "providers": _safe_int(row[2]),
            "members": _safe_int(row[3]),
            "expenses": _safe_float(row[4]),
        }

    # Revenue by group: capitation * (group_members / total_members) as approximation
    # Or more directly: sum capitation per member attributed to this group
    total_cap_q = await db.execute(
        select(func.coalesce(func.sum(CapitationPayment.total_payment), 0))
        .where(CapitationPayment.payment_month >= year_start)
    )
    total_cap = _safe_float(total_cap_q.scalar())

    # Total members for proportional allocation
    total_member_q = await db.execute(
        select(func.count(Member.id)).where(
            (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)
        )
    )
    total_members = max(_safe_int(total_member_q.scalar()), 1)

    results = []
    for gid, data in group_data.items():
        members = max(data["members"], 1)
        # Allocate revenue proportionally by member count
        revenue = total_cap * (members / total_members)
        expenses = data["expenses"]
        surplus = revenue - expenses
        mlr = expenses / max(revenue, 1)
        per_member = surplus / max(members, 1)
        results.append({
            "group": data["group"],
            "providers": data["providers"],
            "members": data["members"],
            "revenue": round(revenue, 2),
            "expenses": round(expenses, 2),
            "surplus": round(surplus, 2),
            "mlr": round(mlr, 4),
            "per_member_margin": round(per_member, 2),
        })

    return results


# ---------------------------------------------------------------------------
# Revenue Forecast
# ---------------------------------------------------------------------------

async def get_revenue_forecast(db: AsyncSession, months: int = 12) -> dict:
    """
    Project revenue, expenses, and margin for the next N months.

    Uses actual trailing data to calculate base rates and growth trends.
    Falls back to reasonable defaults if insufficient data.
    """
    today = date.today()

    # Get last 6 months of capitation revenue for trend calculation
    six_months_ago = today - timedelta(days=180)
    rev_trend_q = await db.execute(
        select(
            extract("year", CapitationPayment.payment_month).label("yr"),
            extract("month", CapitationPayment.payment_month).label("mo"),
            func.sum(CapitationPayment.total_payment).label("revenue"),
        )
        .where(CapitationPayment.payment_month >= six_months_ago)
        .group_by(
            extract("year", CapitationPayment.payment_month),
            extract("month", CapitationPayment.payment_month),
        )
        .order_by(
            extract("year", CapitationPayment.payment_month),
            extract("month", CapitationPayment.payment_month),
        )
    )
    rev_months = rev_trend_q.all()

    # Get last 6 months of claims expense for trend calculation
    exp_trend_q = await db.execute(
        select(
            extract("year", Claim.service_date).label("yr"),
            extract("month", Claim.service_date).label("mo"),
            func.sum(Claim.paid_amount).label("expense"),
        )
        .where(Claim.service_date >= six_months_ago)
        .group_by(
            extract("year", Claim.service_date),
            extract("month", Claim.service_date),
        )
        .order_by(
            extract("year", Claim.service_date),
            extract("month", Claim.service_date),
        )
    )
    exp_months = exp_trend_q.all()

    # Calculate base monthly revenue and expense
    rev_values = [_safe_float(r[2]) for r in rev_months]
    exp_values = [_safe_float(r[2]) for r in exp_months]

    if rev_values:
        base_monthly_revenue = sum(rev_values) / max(len(rev_values), 1)
    else:
        base_monthly_revenue = 0.0

    if exp_values:
        base_monthly_expense = sum(exp_values) / max(len(exp_values), 1)
    else:
        base_monthly_expense = 0.0

    # Calculate growth rates from trend data
    rev_growth_rate = 0.0
    if len(rev_values) >= 3:
        first_half = sum(rev_values[:len(rev_values)//2]) / max(len(rev_values)//2, 1)
        second_half = sum(rev_values[len(rev_values)//2:]) / max(len(rev_values) - len(rev_values)//2, 1)
        if first_half > 0:
            rev_growth_rate = (second_half - first_half) / first_half / max(len(rev_values)//2, 1)

    exp_growth_rate = 0.0
    if len(exp_values) >= 3:
        first_half = sum(exp_values[:len(exp_values)//2]) / max(len(exp_values)//2, 1)
        second_half = sum(exp_values[len(exp_values)//2:]) / max(len(exp_values) - len(exp_values)//2, 1)
        if first_half > 0:
            exp_growth_rate = (second_half - first_half) / first_half / max(len(exp_values)//2, 1)

    # Fallback: if no data at all, return empty projection
    if base_monthly_revenue == 0 and base_monthly_expense == 0:
        return {
            "months": months,
            "projections": [],
            "summary": {
                "total_projected_revenue": 0,
                "total_projected_expense": 0,
                "total_projected_margin": 0,
                "avg_monthly_margin": 0,
            },
        }

    # Seasonal adjustment factors (Jan=index 0)
    seasonal = [1.08, 1.02, 0.97, 0.95, 0.93, 0.91, 0.90, 0.92, 0.96, 1.01, 1.05, 1.10]

    monthly_data = []
    for i in range(months):
        month_idx = (today.month + i) % 12
        rev_factor = 1 + (rev_growth_rate * (i + 1))
        exp_factor = 1 + (exp_growth_rate * (i + 1))

        revenue = round(base_monthly_revenue * rev_factor, 0)
        expense = round(base_monthly_expense * exp_factor * seasonal[month_idx], 0)
        margin = revenue - expense

        # Confidence bands widen over time
        confidence_pct = 0.03 + (i * 0.008)
        monthly_data.append({
            "month_offset": i + 1,
            "label": f"Month {i + 1}",
            "revenue": revenue,
            "expense": expense,
            "margin": margin,
            "revenue_low": round(revenue * (1 - confidence_pct), 0),
            "revenue_high": round(revenue * (1 + confidence_pct), 0),
            "expense_low": round(expense * (1 - confidence_pct), 0),
            "expense_high": round(expense * (1 + confidence_pct), 0),
        })

    data_len = max(len(monthly_data), 1)
    return {
        "months": months,
        "projections": monthly_data,
        "summary": {
            "total_projected_revenue": sum(m["revenue"] for m in monthly_data),
            "total_projected_expense": sum(m["expense"] for m in monthly_data),
            "total_projected_margin": sum(m["margin"] for m in monthly_data),
            "avg_monthly_margin": round(
                sum(m["margin"] for m in monthly_data) / data_len, 0
            ),
        },
    }
