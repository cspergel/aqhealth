"""
Dynamic Cohort Builder Service — build, save, and track custom population segments.

All queries are tenant-scoped (session is already bound to the tenant schema).
"""

import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-memory cohort store (replaced by DB in production)
# ---------------------------------------------------------------------------

_saved_cohorts: dict[int, dict] = {}
_next_cohort_id = 1


# ---------------------------------------------------------------------------
# Build Cohort
# ---------------------------------------------------------------------------

async def build_cohort(db: AsyncSession, filters: dict) -> dict:
    """
    Build a cohort from filter criteria.

    Supported filter keys:
    - age_min, age_max: int
    - gender: str ("M", "F")
    - diagnoses_include: list[str]  (ICD-10 codes the member MUST have)
    - diagnoses_exclude: list[str]  (ICD-10 codes the member must NOT have)
    - medications: list[str]
    - risk_tier: str ("high", "medium", "low")
    - provider_id: int
    - group_id: int
    - er_visits_min: int
    - admissions_min: int
    - raf_min: float
    - raf_max: float
    - care_gaps: list[str]  (measure codes with open gaps)
    - suspect_hccs: list[str]  (HCC codes that are suspects)

    Returns cohort results with aggregate stats.
    """
    # In production, this dynamically builds SQL from filters.
    # For now, return shaped mock data for the "Diabetic 65+ with 2+ ER" cohort.

    members = [
        {
            "id": "M1001",
            "name": "Margaret Chen",
            "age": 72,
            "gender": "F",
            "raf": 1.847,
            "risk_tier": "high",
            "provider": "Dr. Sarah Patel",
            "group": "ISG Tampa",
            "er_visits": 3,
            "admissions": 1,
            "total_spend": 34_200,
            "top_diagnoses": ["E11.65", "I10", "N18.3"],
            "open_gaps": 2,
            "suspect_hccs": ["HCC 18", "HCC 85"],
        },
        {
            "id": "M1047",
            "name": "Robert Williams",
            "age": 68,
            "gender": "M",
            "raf": 2.134,
            "risk_tier": "high",
            "provider": "Dr. James Rivera",
            "group": "ISG Tampa",
            "er_visits": 4,
            "admissions": 2,
            "total_spend": 52_800,
            "top_diagnoses": ["E11.22", "I50.9", "J44.1"],
            "open_gaps": 3,
            "suspect_hccs": ["HCC 18", "HCC 111"],
        },
        {
            "id": "M1123",
            "name": "Dorothy Jackson",
            "age": 78,
            "gender": "F",
            "raf": 1.623,
            "risk_tier": "high",
            "provider": "Dr. Lisa Chen",
            "group": "FMG St. Pete",
            "er_visits": 2,
            "admissions": 1,
            "total_spend": 28_900,
            "top_diagnoses": ["E11.9", "E78.5", "M81.0"],
            "open_gaps": 1,
            "suspect_hccs": ["HCC 18"],
        },
        {
            "id": "M1089",
            "name": "James Thompson",
            "age": 71,
            "gender": "M",
            "raf": 1.956,
            "risk_tier": "high",
            "provider": "Dr. Michael Torres",
            "group": "ISG Tampa",
            "er_visits": 3,
            "admissions": 1,
            "total_spend": 41_300,
            "top_diagnoses": ["E11.65", "I25.10", "N18.4"],
            "open_gaps": 2,
            "suspect_hccs": ["HCC 18", "HCC 138"],
        },
        {
            "id": "M1201",
            "name": "Patricia Davis",
            "age": 66,
            "gender": "F",
            "raf": 1.478,
            "risk_tier": "medium",
            "provider": "Dr. Angela Brooks",
            "group": "FMG St. Pete",
            "er_visits": 2,
            "admissions": 0,
            "total_spend": 22_100,
            "top_diagnoses": ["E11.40", "I10", "E78.0"],
            "open_gaps": 1,
            "suspect_hccs": ["HCC 18"],
        },
        {
            "id": "M1156",
            "name": "William Harris",
            "age": 74,
            "gender": "M",
            "raf": 2.312,
            "risk_tier": "high",
            "provider": "Dr. Sarah Patel",
            "group": "ISG Tampa",
            "er_visits": 5,
            "admissions": 3,
            "total_spend": 67_400,
            "top_diagnoses": ["E11.65", "I50.22", "N18.5", "J44.1"],
            "open_gaps": 4,
            "suspect_hccs": ["HCC 18", "HCC 85", "HCC 138"],
        },
        {
            "id": "M1278",
            "name": "Barbara Martinez",
            "age": 69,
            "gender": "F",
            "raf": 1.589,
            "risk_tier": "high",
            "provider": "Dr. James Rivera",
            "group": "ISG Brandon",
            "er_visits": 2,
            "admissions": 1,
            "total_spend": 31_600,
            "top_diagnoses": ["E11.9", "G47.33", "E66.01"],
            "open_gaps": 2,
            "suspect_hccs": ["HCC 18", "HCC 22"],
        },
        {
            "id": "M1334",
            "name": "Charles Anderson",
            "age": 76,
            "gender": "M",
            "raf": 1.734,
            "risk_tier": "high",
            "provider": "Dr. Lisa Chen",
            "group": "FMG St. Pete",
            "er_visits": 3,
            "admissions": 1,
            "total_spend": 38_200,
            "top_diagnoses": ["E11.22", "I48.91", "N18.3"],
            "open_gaps": 2,
            "suspect_hccs": ["HCC 18", "HCC 96"],
        },
    ]

    total_spend = sum(m["total_spend"] for m in members)
    avg_raf = round(sum(m["raf"] for m in members) / len(members), 3)

    # Aggregate top diagnoses
    diag_counts: dict[str, int] = {}
    suspect_counts: dict[str, int] = {}
    for m in members:
        for d in m["top_diagnoses"]:
            diag_counts[d] = diag_counts.get(d, 0) + 1
        for s in m["suspect_hccs"]:
            suspect_counts[s] = suspect_counts.get(s, 0) + 1

    top_diagnoses = sorted(diag_counts.items(), key=lambda x: -x[1])[:5]
    top_suspects = sorted(suspect_counts.items(), key=lambda x: -x[1])[:5]

    return {
        "member_count": len(members),
        "filters_applied": filters,
        "aggregate_stats": {
            "avg_raf": avg_raf,
            "total_spend": total_spend,
            "avg_spend": round(total_spend / len(members), 2),
            "avg_age": round(sum(m["age"] for m in members) / len(members), 1),
            "avg_er_visits": round(
                sum(m["er_visits"] for m in members) / len(members), 1
            ),
            "avg_admissions": round(
                sum(m["admissions"] for m in members) / len(members), 1
            ),
            "pct_high_risk": round(
                sum(1 for m in members if m["risk_tier"] == "high") / len(members) * 100, 1
            ),
            "total_open_gaps": sum(m["open_gaps"] for m in members),
        },
        "top_diagnoses": [{"code": c, "count": n} for c, n in top_diagnoses],
        "top_suspects": [{"code": c, "count": n} for c, n in top_suspects],
        "members": members,
    }


# ---------------------------------------------------------------------------
# Save Cohort
# ---------------------------------------------------------------------------

async def save_cohort(db: AsyncSession, name: str, filters: dict) -> dict:
    """Save a named cohort definition for tracking over time."""
    global _next_cohort_id
    cohort_id = _next_cohort_id
    _next_cohort_id += 1

    cohort = {
        "id": cohort_id,
        "name": name,
        "filters": filters,
        "created_at": date.today().isoformat(),
        "member_count": 8,  # Would be computed from filters
        "last_run": date.today().isoformat(),
    }
    _saved_cohorts[cohort_id] = cohort
    return cohort


# ---------------------------------------------------------------------------
# List / Get Cohorts
# ---------------------------------------------------------------------------

async def list_cohorts(db: AsyncSession) -> list[dict]:
    """Return all saved cohorts."""
    # Include pre-seeded cohorts plus any saved during this session
    seeded: list[dict] = [
        {
            "id": 100,
            "name": "Diabetic 65+ with 2+ ER Visits",
            "filters": {
                "age_min": 65,
                "diagnoses_include": ["E11"],
                "er_visits_min": 2,
            },
            "created_at": "2026-01-15",
            "member_count": 8,
            "last_run": "2026-03-24",
            "trend_sparkline": [6, 7, 7, 8, 8, 8],
        },
        {
            "id": 101,
            "name": "High-Risk CHF Patients",
            "filters": {
                "risk_tier": "high",
                "diagnoses_include": ["I50"],
            },
            "created_at": "2026-02-01",
            "member_count": 42,
            "last_run": "2026-03-24",
            "trend_sparkline": [38, 40, 41, 42, 42, 42],
        },
        {
            "id": 102,
            "name": "Rising Risk — RAF 1.0-1.5",
            "filters": {
                "raf_min": 1.0,
                "raf_max": 1.5,
                "risk_tier": "medium",
            },
            "created_at": "2026-02-10",
            "member_count": 312,
            "last_run": "2026-03-24",
            "trend_sparkline": [290, 298, 305, 308, 310, 312],
        },
        {
            "id": 103,
            "name": "Uncontrolled Diabetes — Open Gaps",
            "filters": {
                "diagnoses_include": ["E11"],
                "care_gaps": ["CDC-HbA1c"],
            },
            "created_at": "2026-02-20",
            "member_count": 127,
            "last_run": "2026-03-24",
            "trend_sparkline": [142, 138, 134, 131, 129, 127],
        },
    ]

    saved_list = list(_saved_cohorts.values())
    return seeded + saved_list


async def get_cohort_detail(db: AsyncSession, cohort_id: int) -> dict | None:
    """Return cohort detail with members."""
    # For pre-seeded cohorts, return mock data
    if cohort_id in (100, 101, 102, 103):
        cohorts = await list_cohorts(db)
        cohort = next((c for c in cohorts if c["id"] == cohort_id), None)
        if cohort:
            result = await build_cohort(db, cohort["filters"])
            return {**cohort, **result}
    # Check in-memory saved cohorts
    if cohort_id in _saved_cohorts:
        result = await build_cohort(db, _saved_cohorts[cohort_id]["filters"])
        return {**_saved_cohorts[cohort_id], **result}
    return None


# ---------------------------------------------------------------------------
# Cohort Trends
# ---------------------------------------------------------------------------

async def get_cohort_trends(db: AsyncSession, cohort_id: int) -> dict:
    """Return monthly metric trends for a saved cohort."""
    return {
        "cohort_id": cohort_id,
        "months": [
            {
                "month": "2025-10",
                "member_count": 6,
                "avg_raf": 1.712,
                "total_spend": 178_400,
                "avg_spend": 29_733,
                "gap_closure_rate": 42.1,
            },
            {
                "month": "2025-11",
                "member_count": 7,
                "avg_raf": 1.734,
                "total_spend": 201_200,
                "avg_spend": 28_743,
                "gap_closure_rate": 45.8,
            },
            {
                "month": "2025-12",
                "member_count": 7,
                "avg_raf": 1.756,
                "total_spend": 215_800,
                "avg_spend": 30_829,
                "gap_closure_rate": 48.3,
            },
            {
                "month": "2026-01",
                "member_count": 8,
                "avg_raf": 1.789,
                "total_spend": 242_100,
                "avg_spend": 30_263,
                "gap_closure_rate": 51.2,
            },
            {
                "month": "2026-02",
                "member_count": 8,
                "avg_raf": 1.821,
                "total_spend": 268_300,
                "avg_spend": 33_538,
                "gap_closure_rate": 55.6,
            },
            {
                "month": "2026-03",
                "member_count": 8,
                "avg_raf": 1.834,
                "total_spend": 316_500,
                "avg_spend": 39_563,
                "gap_closure_rate": 58.9,
            },
        ],
    }
