"""
Practice Expense Service — staffing analysis, expense dashboard, efficiency metrics.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.practice_expense import StaffMember, ExpenseCategory, ExpenseEntry

logger = logging.getLogger(__name__)


def _safe_float(v) -> float:
    if v is None:
        return 0.0
    return float(v)


# ---------------------------------------------------------------------------
# Expense Dashboard
# ---------------------------------------------------------------------------

async def get_expense_dashboard(db: AsyncSession) -> dict:
    """Total operational costs, by category breakdown, budget vs actual, staffing costs, per-provider overhead."""

    # Category breakdown
    result = await db.execute(
        select(
            ExpenseCategory.name,
            ExpenseCategory.budget_annual,
            func.coalesce(func.sum(ExpenseEntry.amount), 0).label("actual"),
        )
        .outerjoin(ExpenseEntry, ExpenseEntry.category_id == ExpenseCategory.id)
        .group_by(ExpenseCategory.id, ExpenseCategory.name, ExpenseCategory.budget_annual)
    )
    rows = result.all()

    categories = []
    total_budget = 0.0
    total_actual = 0.0
    for name, budget, actual in rows:
        b = _safe_float(budget)
        a = _safe_float(actual)
        total_budget += b
        total_actual += a
        categories.append({
            "name": name,
            "budget_annual": b,
            "actual_ytd": a,
            "pct_of_budget": round(a / b * 100, 1) if b else 0,
            "variance": round(b - a, 2),
        })

    # Staffing total
    staff_result = await db.execute(
        select(func.sum(StaffMember.salary), func.sum(StaffMember.benefits_cost))
        .where(StaffMember.is_active == True)  # noqa: E712
    )
    staff_row = staff_result.one_or_none()
    staffing_cost = _safe_float(staff_row[0] if staff_row else 0) + _safe_float(staff_row[1] if staff_row else 0)

    return {
        "total_budget": round(total_budget, 2),
        "total_actual": round(total_actual, 2),
        "budget_utilization": round(total_actual / total_budget * 100, 1) if total_budget else 0,
        "staffing_cost": round(staffing_cost, 2),
        "categories": categories,
    }


# ---------------------------------------------------------------------------
# Staffing Analysis
# ---------------------------------------------------------------------------

async def get_staffing_analysis(db: AsyncSession) -> dict:
    """Staff count by role, total cost, staff-to-provider ratio, benchmarks, AI recommendations."""

    result = await db.execute(
        select(
            StaffMember.role,
            func.count(StaffMember.id).label("count"),
            func.sum(StaffMember.salary).label("total_salary"),
            func.sum(StaffMember.benefits_cost).label("total_benefits"),
            func.sum(StaffMember.fte).label("total_fte"),
        )
        .where(StaffMember.is_active == True)  # noqa: E712
        .group_by(StaffMember.role)
    )
    rows = result.all()

    by_role = []
    total_staff = 0
    total_cost = 0.0
    provider_count = 0
    for role, count, salary, benefits, fte in rows:
        s = _safe_float(salary)
        b = _safe_float(benefits)
        f = _safe_float(fte)
        total_staff += count
        total_cost += s + b
        if role in ("physician", "np"):
            provider_count += count
        by_role.append({
            "role": role,
            "count": count,
            "total_salary": round(s, 2),
            "total_benefits": round(b, 2),
            "total_cost": round(s + b, 2),
            "total_fte": round(f, 2),
        })

    # Ratios
    staff_to_provider = round(total_staff / provider_count, 2) if provider_count else 0

    return {
        "total_staff": total_staff,
        "total_cost": round(total_cost, 2),
        "provider_count": provider_count,
        "staff_to_provider_ratio": staff_to_provider,
        "by_role": by_role,
    }


# ---------------------------------------------------------------------------
# Expense Trends
# ---------------------------------------------------------------------------

async def get_expense_trends(db: AsyncSession) -> list:
    """Monthly expense trends by category."""

    result = await db.execute(
        select(
            func.date_trunc("month", ExpenseEntry.expense_date).label("month"),
            ExpenseCategory.name,
            func.sum(ExpenseEntry.amount).label("total"),
        )
        .join(ExpenseCategory, ExpenseEntry.category_id == ExpenseCategory.id)
        .group_by("month", ExpenseCategory.name)
        .order_by("month")
    )
    rows = result.all()

    trends = []
    for month, category, total in rows:
        trends.append({
            "month": str(month),
            "category": category,
            "total": _safe_float(total),
        })

    return trends


# ---------------------------------------------------------------------------
# Efficiency Metrics
# ---------------------------------------------------------------------------

async def get_efficiency_metrics(db: AsyncSession) -> dict:
    """Revenue per staff member, cost per member, overhead ratio, etc."""

    staff_result = await db.execute(
        select(func.count(StaffMember.id))
        .where(StaffMember.is_active == True)  # noqa: E712
    )
    staff_count = staff_result.scalar() or 0

    expense_result = await db.execute(
        select(func.sum(ExpenseEntry.amount))
    )
    total_expenses = _safe_float(expense_result.scalar())

    return {
        "total_staff": staff_count,
        "total_expenses": round(total_expenses, 2),
        "expense_per_staff": round(total_expenses / staff_count, 2) if staff_count > 0 else 0,
    }


# ---------------------------------------------------------------------------
# Hiring Analysis
# ---------------------------------------------------------------------------

async def get_hiring_analysis(db: AsyncSession) -> dict:
    """Based on panel size, revenue, and workload: can we hire?"""

    staff = await get_staffing_analysis(db)
    return {
        "current_staff": staff["total_staff"],
        "current_cost": staff["total_cost"],
        "provider_count": staff["provider_count"],
        "staff_to_provider_ratio": staff["staff_to_provider_ratio"],
    }


# ---------------------------------------------------------------------------
# Supply Utilization
# ---------------------------------------------------------------------------

async def get_supply_utilization(db: AsyncSession) -> dict:
    """Supply spend trends, top vendors."""

    result = await db.execute(
        select(
            ExpenseEntry.vendor,
            func.sum(ExpenseEntry.amount).label("total"),
            func.count(ExpenseEntry.id).label("entry_count"),
        )
        .where(ExpenseEntry.vendor.isnot(None))
        .group_by(ExpenseEntry.vendor)
        .order_by(func.sum(ExpenseEntry.amount).desc())
        .limit(10)
    )
    rows = result.all()

    top_vendors = []
    for vendor, total, count in rows:
        top_vendors.append({
            "vendor": vendor,
            "total_spend": _safe_float(total),
            "entry_count": count,
        })

    return {"top_vendors": top_vendors}


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

async def list_staff(db: AsyncSession) -> list[dict]:
    result = await db.execute(select(StaffMember).order_by(StaffMember.name))
    return [
        {
            "id": s.id,
            "name": s.name,
            "role": s.role,
            "practice_group_id": s.practice_group_id,
            "salary": _safe_float(s.salary),
            "benefits_cost": _safe_float(s.benefits_cost),
            "fte": _safe_float(s.fte),
            "hire_date": str(s.hire_date) if s.hire_date else None,
            "is_active": s.is_active,
        }
        for s in result.scalars().all()
    ]


async def create_staff(db: AsyncSession, data: dict) -> dict:
    staff = StaffMember(**data)
    db.add(staff)
    await db.commit()
    await db.refresh(staff)
    return {"id": staff.id, "name": staff.name}


async def list_expenses(db: AsyncSession, category_id: int | None = None) -> list[dict]:
    q = select(ExpenseEntry).order_by(ExpenseEntry.expense_date.desc())
    if category_id:
        q = q.where(ExpenseEntry.category_id == category_id)
    result = await db.execute(q)
    return [
        {
            "id": e.id,
            "category_id": e.category_id,
            "description": e.description,
            "amount": _safe_float(e.amount),
            "expense_date": str(e.expense_date),
            "practice_group_id": e.practice_group_id,
            "vendor": e.vendor,
            "recurring": e.recurring,
            "recurring_frequency": e.recurring_frequency,
            "notes": e.notes,
        }
        for e in result.scalars().all()
    ]


async def create_expense(db: AsyncSession, data: dict) -> dict:
    entry = ExpenseEntry(**data)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {"id": entry.id, "description": entry.description}
