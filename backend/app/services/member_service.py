"""
Member Roster / Panel Management Service.

Provides filtered, paginated member lists with computed fields,
member detail, and aggregate stats for the filtered population.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory mock member data (replaced by DB queries in production)
# ---------------------------------------------------------------------------

_MEMBERS: list[dict[str, Any]] = [
    {"member_id": "M1001", "name": "Margaret Chen", "dob": "1953-08-14", "pcp": "Dr. Sarah Patel", "pcp_id": 1, "group": "ISG Tampa", "group_id": 1, "current_raf": 1.847, "risk_tier": "high", "last_visit_date": "2026-03-10", "days_since_visit": 14, "suspect_count": 3, "gap_count": 2, "total_spend_12mo": 34200, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1002", "name": "Robert Williams", "dob": "1958-03-22", "pcp": "Dr. James Rivera", "pcp_id": 2, "group": "ISG Tampa", "group_id": 1, "current_raf": 1.234, "risk_tier": "rising", "last_visit_date": "2026-01-15", "days_since_visit": 68, "suspect_count": 2, "gap_count": 1, "total_spend_12mo": 22800, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1003", "name": "Dorothy Martinez", "dob": "1945-11-07", "pcp": "Dr. Lisa Chen", "pcp_id": 3, "group": "FMG Clearwater", "group_id": 4, "current_raf": 2.456, "risk_tier": "complex", "last_visit_date": "2025-12-01", "days_since_visit": 113, "suspect_count": 4, "gap_count": 3, "total_spend_12mo": 67500, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1004", "name": "James Thornton", "dob": "1948-06-30", "pcp": "Dr. Michael Torres", "pcp_id": 4, "group": "ISG Tampa", "group_id": 1, "current_raf": 0.800, "risk_tier": "low", "last_visit_date": "2026-03-18", "days_since_visit": 6, "suspect_count": 2, "gap_count": 0, "total_spend_12mo": 8400, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": False},
    {"member_id": "M1005", "name": "Patricia Okafor", "dob": "1942-01-15", "pcp": "Dr. Angela Brooks", "pcp_id": 5, "group": "ISG Tampa", "group_id": 1, "current_raf": 1.100, "risk_tier": "rising", "last_visit_date": "2026-02-20", "days_since_visit": 32, "suspect_count": 1, "gap_count": 1, "total_spend_12mo": 15200, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1006", "name": "Gerald Foster", "dob": "1955-09-18", "pcp": "Dr. James Rivera", "pcp_id": 2, "group": "ISG Tampa", "group_id": 1, "current_raf": 0.950, "risk_tier": "low", "last_visit_date": "2025-09-10", "days_since_visit": 195, "suspect_count": 3, "gap_count": 2, "total_spend_12mo": 12300, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1007", "name": "Helen Washington", "dob": "1940-04-25", "pcp": "Dr. Sarah Patel", "pcp_id": 1, "group": "ISG Tampa", "group_id": 1, "current_raf": 2.891, "risk_tier": "complex", "last_visit_date": "2026-02-05", "days_since_visit": 47, "suspect_count": 2, "gap_count": 4, "total_spend_12mo": 89200, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1008", "name": "Frank Nguyen", "dob": "1952-12-03", "pcp": "Dr. Robert Kim", "pcp_id": 8, "group": "ISG Brandon", "group_id": 3, "current_raf": 1.456, "risk_tier": "rising", "last_visit_date": "2026-01-02", "days_since_visit": 81, "suspect_count": 3, "gap_count": 1, "total_spend_12mo": 24600, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1009", "name": "Barbara Johnson", "dob": "1947-07-21", "pcp": "Dr. Lisa Chen", "pcp_id": 3, "group": "FMG Clearwater", "group_id": 4, "current_raf": 1.678, "risk_tier": "high", "last_visit_date": "2026-03-01", "days_since_visit": 23, "suspect_count": 2, "gap_count": 2, "total_spend_12mo": 31400, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1010", "name": "William Davis", "dob": "1950-10-09", "pcp": "Dr. David Wilson", "pcp_id": 9, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 1.123, "risk_tier": "rising", "last_visit_date": "2025-11-15", "days_since_visit": 129, "suspect_count": 3, "gap_count": 0, "total_spend_12mo": 18900, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": False},
    {"member_id": "M1011", "name": "Alice Foster", "dob": "1949-05-12", "pcp": "Dr. Sarah Patel", "pcp_id": 1, "group": "ISG Tampa", "group_id": 1, "current_raf": 3.214, "risk_tier": "complex", "last_visit_date": "2025-10-20", "days_since_visit": 155, "suspect_count": 5, "gap_count": 3, "total_spend_12mo": 112400, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1012", "name": "Thomas Jackson", "dob": "1960-02-28", "pcp": "Dr. Thomas Lee", "pcp_id": 6, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 0.654, "risk_tier": "low", "last_visit_date": "2026-03-20", "days_since_visit": 4, "suspect_count": 0, "gap_count": 1, "total_spend_12mo": 4200, "plan": "Humana Gold Plus", "has_suspects": False, "has_gaps": True},
    {"member_id": "M1013", "name": "Nancy White", "dob": "1944-08-03", "pcp": "Dr. Karen Murphy", "pcp_id": 7, "group": "ISG Brandon", "group_id": 3, "current_raf": 1.987, "risk_tier": "high", "last_visit_date": "2026-02-14", "days_since_visit": 38, "suspect_count": 3, "gap_count": 2, "total_spend_12mo": 42100, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1014", "name": "Richard Wilson", "dob": "1957-11-25", "pcp": "Dr. Michael Torres", "pcp_id": 4, "group": "ISG Tampa", "group_id": 1, "current_raf": 0.789, "risk_tier": "low", "last_visit_date": "2026-03-15", "days_since_visit": 9, "suspect_count": 1, "gap_count": 0, "total_spend_12mo": 6800, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": False},
    {"member_id": "M1015", "name": "Sandra Mitchell", "dob": "1951-06-17", "pcp": "Dr. Angela Brooks", "pcp_id": 5, "group": "ISG Tampa", "group_id": 1, "current_raf": 1.345, "risk_tier": "rising", "last_visit_date": "2025-12-22", "days_since_visit": 92, "suspect_count": 2, "gap_count": 3, "total_spend_12mo": 19800, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1016", "name": "Charles Brown", "dob": "1946-03-09", "pcp": "Dr. James Rivera", "pcp_id": 2, "group": "ISG Tampa", "group_id": 1, "current_raf": 2.134, "risk_tier": "high", "last_visit_date": "2025-08-05", "days_since_visit": 231, "suspect_count": 4, "gap_count": 3, "total_spend_12mo": 52800, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1017", "name": "Karen Robinson", "dob": "1953-09-14", "pcp": "Dr. Lisa Chen", "pcp_id": 3, "group": "FMG Clearwater", "group_id": 4, "current_raf": 0.432, "risk_tier": "low", "last_visit_date": "2026-03-12", "days_since_visit": 12, "suspect_count": 0, "gap_count": 0, "total_spend_12mo": 3100, "plan": "Humana Gold Plus", "has_suspects": False, "has_gaps": False},
    {"member_id": "M1018", "name": "Joseph Lewis", "dob": "1959-01-22", "pcp": "Dr. Robert Kim", "pcp_id": 8, "group": "ISG Brandon", "group_id": 3, "current_raf": 1.567, "risk_tier": "high", "last_visit_date": "2026-01-28", "days_since_visit": 55, "suspect_count": 2, "gap_count": 1, "total_spend_12mo": 28300, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1019", "name": "Susan Clark", "dob": "1943-12-30", "pcp": "Dr. Jennifer Adams", "pcp_id": 10, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 2.678, "risk_tier": "complex", "last_visit_date": "2025-07-18", "days_since_visit": 249, "suspect_count": 5, "gap_count": 4, "total_spend_12mo": 98700, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1020", "name": "Daniel Harris", "dob": "1956-04-05", "pcp": "Dr. David Wilson", "pcp_id": 9, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 1.890, "risk_tier": "high", "last_visit_date": "2026-02-28", "days_since_visit": 24, "suspect_count": 3, "gap_count": 1, "total_spend_12mo": 36500, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1021", "name": "Betty Hall", "dob": "1941-07-08", "pcp": "Dr. Sarah Patel", "pcp_id": 1, "group": "ISG Tampa", "group_id": 1, "current_raf": 3.456, "risk_tier": "complex", "last_visit_date": "2025-11-01", "days_since_visit": 143, "suspect_count": 6, "gap_count": 5, "total_spend_12mo": 134500, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1022", "name": "Edward Walker", "dob": "1948-10-19", "pcp": "Dr. Thomas Lee", "pcp_id": 6, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 0.912, "risk_tier": "low", "last_visit_date": "2026-03-22", "days_since_visit": 2, "suspect_count": 1, "gap_count": 0, "total_spend_12mo": 7600, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": False},
    {"member_id": "M1023", "name": "Dorothy Garcia", "dob": "1950-01-30", "pcp": "Dr. Karen Murphy", "pcp_id": 7, "group": "ISG Brandon", "group_id": 3, "current_raf": 1.789, "risk_tier": "high", "last_visit_date": "2025-12-10", "days_since_visit": 104, "suspect_count": 3, "gap_count": 2, "total_spend_12mo": 38900, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1024", "name": "Maria Gonzalez", "dob": "1954-05-21", "pcp": "Dr. Angela Brooks", "pcp_id": 5, "group": "ISG Tampa", "group_id": 1, "current_raf": 1.023, "risk_tier": "rising", "last_visit_date": "2026-03-05", "days_since_visit": 19, "suspect_count": 1, "gap_count": 2, "total_spend_12mo": 14100, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1025", "name": "Kevin Park", "dob": "1962-08-14", "pcp": "Dr. Michael Torres", "pcp_id": 4, "group": "ISG Tampa", "group_id": 1, "current_raf": 0.567, "risk_tier": "low", "last_visit_date": "2026-02-10", "days_since_visit": 42, "suspect_count": 0, "gap_count": 1, "total_spend_12mo": 5200, "plan": "Aetna Medicare Advantage", "has_suspects": False, "has_gaps": True},
    {"member_id": "M1026", "name": "William Ross", "dob": "1947-03-17", "pcp": "Dr. James Rivera", "pcp_id": 2, "group": "ISG Tampa", "group_id": 1, "current_raf": 2.345, "risk_tier": "complex", "last_visit_date": "2025-06-12", "days_since_visit": 285, "suspect_count": 4, "gap_count": 3, "total_spend_12mo": 78600, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1027", "name": "Ruth Phillips", "dob": "1939-11-03", "pcp": "Dr. Jennifer Adams", "pcp_id": 10, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 4.123, "risk_tier": "complex", "last_visit_date": "2026-01-20", "days_since_visit": 63, "suspect_count": 7, "gap_count": 4, "total_spend_12mo": 156800, "plan": "Aetna Medicare Advantage", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1028", "name": "Larry Campbell", "dob": "1952-07-29", "pcp": "Dr. Robert Kim", "pcp_id": 8, "group": "ISG Brandon", "group_id": 3, "current_raf": 1.678, "risk_tier": "high", "last_visit_date": "2025-10-05", "days_since_visit": 170, "suspect_count": 2, "gap_count": 3, "total_spend_12mo": 32100, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1029", "name": "Judith Reed", "dob": "1945-04-11", "pcp": "Dr. Lisa Chen", "pcp_id": 3, "group": "FMG Clearwater", "group_id": 4, "current_raf": 1.234, "risk_tier": "rising", "last_visit_date": "2026-03-19", "days_since_visit": 5, "suspect_count": 1, "gap_count": 1, "total_spend_12mo": 16700, "plan": "Humana Gold Plus", "has_suspects": True, "has_gaps": True},
    {"member_id": "M1030", "name": "Carl Morris", "dob": "1958-09-06", "pcp": "Dr. David Wilson", "pcp_id": 9, "group": "FMG St. Petersburg", "group_id": 2, "current_raf": 0.345, "risk_tier": "low", "last_visit_date": "2026-03-21", "days_since_visit": 3, "suspect_count": 0, "gap_count": 0, "total_spend_12mo": 2800, "plan": "Aetna Medicare Advantage", "has_suspects": False, "has_gaps": False},
]


# ---------------------------------------------------------------------------
# Get Member List (paginated + filtered)
# ---------------------------------------------------------------------------

async def get_member_list(db: AsyncSession, filters: dict[str, Any]) -> dict:
    """
    Query members with all filters, includes computed fields.

    Supported filter keys:
    - raf_min, raf_max: float
    - days_not_seen: int (members not seen in X+ days)
    - risk_tier: str (low, rising, high, complex)
    - provider_id: int
    - group_id: int
    - has_suspects: bool
    - has_gaps: bool
    - plan: str
    - search: str (name or member_id)
    - sort_by: str (raf, name, last_visit, suspect_count, gap_count, spend)
    - order: str (asc, desc)
    - page: int
    - page_size: int
    """
    members = list(_MEMBERS)

    # Apply filters
    if filters.get("raf_min") is not None:
        members = [m for m in members if m["current_raf"] >= filters["raf_min"]]
    if filters.get("raf_max") is not None:
        members = [m for m in members if m["current_raf"] <= filters["raf_max"]]
    if filters.get("days_not_seen") is not None:
        members = [m for m in members if m["days_since_visit"] >= filters["days_not_seen"]]
    if filters.get("risk_tier"):
        members = [m for m in members if m["risk_tier"] == filters["risk_tier"]]
    if filters.get("provider_id") is not None:
        members = [m for m in members if m["pcp_id"] == filters["provider_id"]]
    if filters.get("group_id") is not None:
        members = [m for m in members if m["group_id"] == filters["group_id"]]
    if filters.get("has_suspects") is True:
        members = [m for m in members if m["has_suspects"]]
    if filters.get("has_gaps") is True:
        members = [m for m in members if m["has_gaps"]]
    if filters.get("plan"):
        members = [m for m in members if m["plan"] == filters["plan"]]
    if filters.get("search"):
        q = filters["search"].lower()
        members = [m for m in members if q in m["name"].lower() or q in m["member_id"].lower()]

    # Sort
    sort_by = filters.get("sort_by", "raf")
    order = filters.get("order", "desc")
    sort_key_map = {
        "raf": "current_raf",
        "name": "name",
        "last_visit": "days_since_visit",
        "suspect_count": "suspect_count",
        "gap_count": "gap_count",
        "spend": "total_spend_12mo",
    }
    sort_field = sort_key_map.get(sort_by, "current_raf")
    reverse = order == "desc" if sort_by != "name" else order != "asc"
    # For last_visit, higher days_since_visit means older -> desc means show oldest first
    if sort_by == "last_visit":
        reverse = order == "desc"
    members.sort(key=lambda m: m[sort_field], reverse=reverse)

    # Paginate
    page = filters.get("page", 1)
    page_size = filters.get("page_size", 25)
    total = len(members)
    total_pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = members[start:end]

    return {
        "items": page_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


# ---------------------------------------------------------------------------
# Get Member Detail
# ---------------------------------------------------------------------------

async def get_member_detail(db: AsyncSession, member_id: str) -> dict | None:
    """Return full member detail including demographics, RAF, suspects, gaps, claims, meds."""
    member = next((m for m in _MEMBERS if m["member_id"] == member_id), None)
    if not member:
        return None

    return {
        **member,
        "demographics": {
            "age": 2026 - int(member["dob"][:4]),
            "gender": "F" if member["name"].split()[0] in ("Margaret", "Dorothy", "Patricia", "Helen", "Barbara", "Nancy", "Sandra", "Karen", "Susan", "Betty", "Dorothy", "Maria", "Ruth", "Judith", "Alice") else "M",
            "address": "Tampa, FL",
            "phone": "(813) 555-0100",
            "language": "English",
        },
        "recent_claims": [
            {"date": "2026-03-01", "type": "Office Visit", "provider": member["pcp"], "amount": 285, "diagnoses": ["E11.65", "I10"]},
            {"date": "2026-02-15", "type": "Lab", "provider": "Quest Diagnostics", "amount": 145, "diagnoses": ["Z00.00"]},
            {"date": "2026-01-20", "type": "Specialist", "provider": "Dr. Cardiology", "amount": 420, "diagnoses": ["I50.9"]},
        ],
        "medications": [
            {"name": "Metformin 1000mg", "dx_linked": True},
            {"name": "Lisinopril 20mg", "dx_linked": True},
            {"name": "Atorvastatin 40mg", "dx_linked": True},
        ],
    }


# ---------------------------------------------------------------------------
# Get Member Stats (aggregates for filtered population)
# ---------------------------------------------------------------------------

async def get_member_stats(db: AsyncSession, filters: dict[str, Any]) -> dict:
    """Return aggregate stats for the filtered population."""
    # Re-use the filter logic from get_member_list
    result = await get_member_list(db, {**filters, "page": 1, "page_size": 10000})
    members = result["items"]

    if not members:
        return {
            "count": 0,
            "avg_raf": 0,
            "total_suspects": 0,
            "total_gaps": 0,
        }

    return {
        "count": len(members),
        "avg_raf": round(sum(m["current_raf"] for m in members) / len(members), 3),
        "total_suspects": sum(m["suspect_count"] for m in members),
        "total_gaps": sum(m["gap_count"] for m in members),
    }
