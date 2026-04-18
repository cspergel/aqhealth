"""
Practice Expense models — staff members, expense categories, and expense entries.

Used for MSO operational cost tracking: staffing, supplies, rent, software, etc.
"""

from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class StaffMember(Base, TimestampMixin):
    """Staff member for practice expense tracking."""

    __tablename__ = "staff_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(100))  # "physician", "np", "ma", "front_desk", "biller", "coder", "care_manager", "admin"
    practice_group_id: Mapped[int | None] = mapped_column(ForeignKey("practice_groups.id"), nullable=True, index=True)
    salary: Mapped[float] = mapped_column(Numeric(10, 2))
    benefits_cost: Mapped[float | None] = mapped_column(Numeric(10, 2))  # annual benefits
    fte: Mapped[float] = mapped_column(Numeric(3, 2), default=1.0)  # 1.0 = full time, 0.5 = part time
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)


class ExpenseCategory(Base, TimestampMixin):
    """Expense category for budgeting."""

    __tablename__ = "expense_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))  # "Staffing", "Supplies", "Rent", "Software", "Equipment", "Insurance", "Marketing"
    budget_annual: Mapped[float | None] = mapped_column(Numeric(12, 2))
    parent_category_id: Mapped[int | None] = mapped_column(ForeignKey("expense_categories.id"), nullable=True, index=True)


class ExpenseEntry(Base, TimestampMixin):
    """Individual expense entry."""

    __tablename__ = "expense_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("expense_categories.id"), index=True)
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    expense_date: Mapped[date] = mapped_column(Date)
    practice_group_id: Mapped[int | None] = mapped_column(ForeignKey("practice_groups.id"), nullable=True, index=True)
    vendor: Mapped[str | None] = mapped_column(String(200))
    recurring: Mapped[bool] = mapped_column(default=False)
    recurring_frequency: Mapped[str | None] = mapped_column(String(20))  # "monthly", "quarterly", "annual"
    notes: Mapped[str | None] = mapped_column(Text)
    entered_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
