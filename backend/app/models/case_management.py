"""Case Management models — case assignments and case notes."""

from datetime import date
from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CaseAssignment(Base, TimestampMixin):
    __tablename__ = "case_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    care_manager_id: Mapped[int] = mapped_column(Integer, index=True)  # staff user ID
    care_manager_name: Mapped[str] = mapped_column(String(200))
    assignment_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str | None] = mapped_column(String(200))  # "high_risk", "post_discharge", "chronic_disease", "complex_case"
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    last_contact_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_contact_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    contact_count: Mapped[int] = mapped_column(default=0)
    notes: Mapped[str | None] = mapped_column(Text)


class CaseNote(Base, TimestampMixin):
    __tablename__ = "case_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("case_assignments.id"), index=True)
    note_type: Mapped[str] = mapped_column(String(50))  # "phone_call", "in_person", "coordination", "assessment", "follow_up"
    content: Mapped[str] = mapped_column(Text)
    contact_method: Mapped[str | None] = mapped_column(String(20))  # "phone", "in_person", "video", "email", "letter"
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    author_id: Mapped[int] = mapped_column(Integer)
    author_name: Mapped[str] = mapped_column(String(200))
