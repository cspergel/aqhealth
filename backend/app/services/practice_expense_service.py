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
        .where(StaffMember.is_active.is_(True))
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
        .where(StaffMember.is_active.is_(True))
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
    # Estimate member count from providers (avg panel ~500 per provider for managed care)
    estimated_members = provider_count * 500
    staff_to_member_ratio = round(total_staff / (estimated_members / 1000), 2) if estimated_members else 0

    # Benchmarks
    benchmarks = {
        "staff_to_provider_ratio": {
            "current": staff_to_provider,
            "benchmark": 2.5,
            "status": "below" if staff_to_provider <= 2.5 else "above",
            "label": "Staff-to-Provider Ratio",
        },
        "staff_per_1k_members": {
            "current": staff_to_member_ratio,
            "benchmark": 3.5,
            "status": "below" if staff_to_member_ratio <= 3.5 else "above",
            "label": "Staff per 1K Members",
        },
        "staffing_cost_per_provider": {
            "current": round(total_cost / provider_count, 0) if provider_count else 0,
            "benchmark": 180000,
            "status": "below" if provider_count and (total_cost / provider_count) <= 180000 else "above",
            "label": "Staffing Cost per Provider",
        },
    }

    # AI Recommendations based on ratios
    ai_recommendations: list[dict[str, str]] = []
    if staff_to_provider > 3.0:
        ai_recommendations.append({
            "type": "warning",
            "message": f"Staff-to-provider ratio ({staff_to_provider}:1) is above the 2.5:1 benchmark. Consider whether all support roles are necessary or if workflow automation could reduce headcount needs.",
        })
    if staff_to_provider < 2.0:
        ai_recommendations.append({
            "type": "info",
            "message": f"Staff-to-provider ratio ({staff_to_provider}:1) is lean. Monitor staff burnout and patient wait times closely.",
        })
    if total_cost > 0 and provider_count > 0:
        cost_per_prov = total_cost / provider_count
        if cost_per_prov < 150000:
            ai_recommendations.append({
                "type": "success",
                "message": f"Staffing cost per provider (${cost_per_prov:,.0f}) is well below the $180K benchmark. Strong cost discipline.",
            })
    if not ai_recommendations:
        ai_recommendations.append({
            "type": "success",
            "message": "Staffing levels and costs are within industry benchmarks. No immediate action needed.",
        })

    return {
        "total_staff": total_staff,
        "total_cost": round(total_cost, 2),
        "provider_count": provider_count,
        "staff_to_provider_ratio": staff_to_provider,
        "staff_to_member_ratio": staff_to_member_ratio,
        "by_role": by_role,
        "benchmarks": benchmarks,
        "ai_recommendations": ai_recommendations,
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
        .where(StaffMember.is_active.is_(True))
    )
    staff_count = staff_result.scalar() or 0

    expense_result = await db.execute(
        select(func.sum(ExpenseEntry.amount))
    )
    total_expenses = _safe_float(expense_result.scalar())

    # Staffing cost (salary + benefits)
    staffing_result = await db.execute(
        select(
            func.sum(StaffMember.salary),
            func.sum(StaffMember.benefits_cost),
            func.count(StaffMember.id),
        )
        .where(StaffMember.is_active.is_(True))
    )
    staff_row = staffing_result.one_or_none()
    total_salary = _safe_float(staff_row[0] if staff_row else 0)
    total_benefits = _safe_float(staff_row[1] if staff_row else 0)
    staffing_cost = total_salary + total_benefits

    # Provider count for panel/revenue estimates
    provider_result = await db.execute(
        select(func.count(StaffMember.id))
        .where(StaffMember.is_active.is_(True))
        .where(StaffMember.role.in_(["physician", "np"]))
    )
    provider_count = provider_result.scalar() or 0

    # Estimate revenue and member count from providers (managed care assumptions)
    # ~500 members per provider, ~$1,200 PMPY revenue
    estimated_members = provider_count * 500
    estimated_annual_revenue = estimated_members * 1200  # $1,200 PMPY

    overhead = max(total_expenses - staffing_cost, 0)
    expense_per_staff = round(total_expenses / staff_count, 2) if staff_count > 0 else 0
    revenue_per_staff = round(estimated_annual_revenue / staff_count, 2) if staff_count > 0 else 0
    cost_per_member = round(total_expenses / estimated_members, 2) if estimated_members > 0 else 0
    overhead_ratio = round(overhead / total_expenses * 100, 1) if total_expenses > 0 else 0
    staffing_pct = round(staffing_cost / estimated_annual_revenue * 100, 1) if estimated_annual_revenue > 0 else 0

    # Supply-category expenses / estimated visits (providers * 20 visits/day * 250 days)
    estimated_visits = provider_count * 20 * 250
    supply_result = await db.execute(
        select(func.sum(ExpenseEntry.amount))
        .join(ExpenseCategory, ExpenseEntry.category_id == ExpenseCategory.id)
        .where(ExpenseCategory.name == "Supplies")
    )
    supply_cost = _safe_float(supply_result.scalar())
    supply_cost_per_visit = round(supply_cost / estimated_visits, 2) if estimated_visits > 0 else 0

    # Benchmarks
    benchmarks = {
        "revenue_per_staff": {
            "current": revenue_per_staff,
            "benchmark": 150000,
            "status": "above" if revenue_per_staff >= 150000 else "below",
            "label": "Revenue per Staff Member",
        },
        "cost_per_member": {
            "current": cost_per_member,
            "benchmark": 45.0,
            "status": "below" if cost_per_member <= 45 else "above",
            "label": "Cost per Member (Monthly)",
        },
        "overhead_ratio": {
            "current": overhead_ratio,
            "benchmark": 12.0,
            "status": "below" if overhead_ratio <= 12 else "above",
            "label": "Overhead Ratio (%)",
        },
        "staffing_pct_of_revenue": {
            "current": staffing_pct,
            "benchmark": 30.0,
            "status": "below" if staffing_pct <= 30 else "above",
            "label": "Staffing % of Revenue",
        },
        "supply_cost_per_visit": {
            "current": supply_cost_per_visit,
            "benchmark": 5.5,
            "status": "below" if supply_cost_per_visit <= 5.5 else "above",
            "label": "Supply Cost per Visit",
        },
    }

    return {
        "total_staff": staff_count,
        "total_expenses": round(total_expenses, 2),
        "expense_per_staff": expense_per_staff,
        "revenue_per_staff": revenue_per_staff,
        "cost_per_member": cost_per_member,
        "overhead_ratio": overhead_ratio,
        "supply_cost_per_visit": supply_cost_per_visit,
        "staffing_pct_of_revenue": staffing_pct,
        "benchmarks": benchmarks,
    }


# ---------------------------------------------------------------------------
# Hiring Analysis
# ---------------------------------------------------------------------------

async def get_hiring_analysis(db: AsyncSession) -> dict:
    """Based on panel size, revenue, and workload: can we hire?"""

    staff = await get_staffing_analysis(db)
    provider_count = staff["provider_count"]
    current_cost = staff["total_cost"]

    # Estimates based on managed care panel assumptions
    estimated_members = provider_count * 500
    estimated_annual_revenue = estimated_members * 1200  # $1,200 PMPY
    monthly_revenue = round(estimated_annual_revenue / 12, 2)

    # Financial capacity
    annual_surplus = round(estimated_annual_revenue - current_cost, 2)
    # Budget ~70% of surplus for a new hire to keep buffer
    max_new_hire_budget = round(annual_surplus * 0.7, 2) if annual_surplus > 0 else 0
    # Estimate average new hire cost at $65K salary + $15K benefits
    avg_hire_cost = 80000
    surplus_after_hire = round(annual_surplus - avg_hire_cost, 2)
    can_hire = annual_surplus > avg_hire_cost

    # Recommended hires based on current staffing gaps
    recommended_hires = []

    # Check if care manager exists
    has_care_manager = any(r["role"] == "care_manager" for r in staff["by_role"])
    if not has_care_manager:
        recommended_hires.append({
            "role": "care_manager",
            "title": "Care Manager (RN)",
            "estimated_salary": 72000,
            "estimated_benefits": 18000,
            "total_cost": 90000,
            "impact": "Coordinates care for high-risk patients, improves RAF accuracy, reduces ER utilization. Expected to close 15-25 HCC gaps per month.",
            "revenue_impact": 120000,
            "break_even_months": 9,
            "priority": "high",
        })

    # Check MA ratio (should be ~1 MA per provider)
    ma_count = sum(r["count"] for r in staff["by_role"] if r["role"] == "ma")
    if provider_count > 0 and ma_count < provider_count:
        recommended_hires.append({
            "role": "ma",
            "title": "Medical Assistant",
            "estimated_salary": 38000,
            "estimated_benefits": 9500,
            "total_cost": 47500,
            "impact": "Improves provider throughput by handling vitals, rooming, and documentation prep. Enables 2-4 additional visits per provider per day.",
            "revenue_impact": 85000,
            "break_even_months": 7,
            "priority": "high" if (provider_count - ma_count) >= 2 else "medium",
        })

    # Check coder ratio
    has_coder = any(r["role"] == "coder" for r in staff["by_role"])
    if not has_coder and provider_count >= 2:
        recommended_hires.append({
            "role": "coder",
            "title": "Certified Medical Coder",
            "estimated_salary": 55000,
            "estimated_benefits": 13750,
            "total_cost": 68750,
            "impact": "Ensures accurate HCC coding and claim submission. Reduces denials and captures missed diagnoses for RAF optimization.",
            "revenue_impact": 95000,
            "break_even_months": 9,
            "priority": "medium",
        })

    # If well-staffed, suggest a biller
    has_biller = any(r["role"] == "biller" for r in staff["by_role"])
    if not has_biller and provider_count >= 3:
        recommended_hires.append({
            "role": "biller",
            "title": "Medical Biller",
            "estimated_salary": 42000,
            "estimated_benefits": 10500,
            "total_cost": 52500,
            "impact": "Reduces claim denial rate and accelerates AR collection. Tracks payer-specific rules and appeals.",
            "revenue_impact": 60000,
            "break_even_months": 11,
            "priority": "low",
        })

    return {
        "current_staff": staff["total_staff"],
        "current_cost": current_cost,
        "monthly_revenue": monthly_revenue,
        "provider_count": provider_count,
        "panel_size": estimated_members,
        "staff_to_provider_ratio": staff["staff_to_provider_ratio"],
        "financial_capacity": {
            "annual_surplus": annual_surplus,
            "max_new_hire_budget": max_new_hire_budget,
            "surplus_after_hire": surplus_after_hire,
            "can_hire": can_hire,
        },
        "recommended_hires": recommended_hires,
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
