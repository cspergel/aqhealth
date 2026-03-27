"""
Group / Office Scorecard service.

Computes group-level metrics, cross-group comparisons, trend analysis,
and AI-ready intergroup insights.
"""

import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.practice_group import PracticeGroup
from app.models.provider import Provider

logger = logging.getLogger(__name__)

DEFAULT_TARGETS = {
    "avg_capture_rate": 75.0,
    "avg_recapture_rate": 70.0,
    "gap_closure_rate": 65.0,
}


def _float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


def _tier(value: float | None, target: float | None) -> str:
    if value is None or target is None:
        return "gray"
    if value >= target:
        return "green"
    if value >= target * 0.90:
        return "amber"
    return "red"


def _group_to_dict(g: PracticeGroup) -> dict:
    return {
        "id": g.id,
        "name": g.name,
        "client_code": g.client_code,
        "address": g.address,
        "city": g.city,
        "state": g.state,
        "zip_code": g.zip_code,
        "provider_count": g.provider_count or 0,
        "total_panel_size": g.total_panel_size or 0,
        "avg_capture_rate": _float(g.avg_capture_rate),
        "avg_recapture_rate": _float(g.avg_recapture_rate),
        "avg_raf": _float(g.avg_raf),
        "group_pmpm": _float(g.group_pmpm),
        "gap_closure_rate": _float(g.gap_closure_rate),
        "targets": g.targets or {},
    }


def _resolve_targets(group: PracticeGroup) -> dict:
    targets = dict(DEFAULT_TARGETS)
    if group.targets:
        targets.update(group.targets)
    return targets


def _compute_tier(row: dict, targets: dict) -> str:
    tiers = []
    for key in ["avg_capture_rate", "avg_recapture_rate", "gap_closure_rate"]:
        tiers.append(_tier(row.get(key), targets.get(key)))
    if "red" in tiers:
        return "red"
    if "amber" in tiers:
        return "amber"
    return "green"


# ---------------------------------------------------------------------------
# Group list
# ---------------------------------------------------------------------------

async def get_group_list(db: AsyncSession) -> list[dict]:
    """Return all groups with computed metrics and tier."""
    result = await db.execute(select(PracticeGroup).order_by(PracticeGroup.name))
    groups = result.scalars().all()

    rows = []
    for g in groups:
        row = _group_to_dict(g)
        targets = _resolve_targets(g)
        row["tier"] = _compute_tier(row, targets)
        rows.append(row)

    return rows


# ---------------------------------------------------------------------------
# Group scorecard
# ---------------------------------------------------------------------------

async def get_group_scorecard(db: AsyncSession, group_id: int) -> dict | None:
    """Full group scorecard with per-metric detail."""
    result = await db.execute(select(PracticeGroup).where(PracticeGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        return None

    row = _group_to_dict(group)
    targets = _resolve_targets(group)
    row["tier"] = _compute_tier(row, targets)

    metric_keys = [
        ("provider_count", "Provider Count"),
        ("total_panel_size", "Total Panel Size"),
        ("avg_capture_rate", "Avg Capture Rate"),
        ("avg_recapture_rate", "Avg Recapture Rate"),
        ("avg_raf", "Avg RAF Score"),
        ("group_pmpm", "Group PMPM"),
        ("gap_closure_rate", "Gap Closure Rate"),
    ]

    metrics = []
    for key, label in metric_keys:
        val = row.get(key)
        target = targets.get(key)
        metrics.append({
            "key": key,
            "label": label,
            "value": val,
            "target": target,
            "tier": _tier(val, target),
        })

    row["metrics"] = metrics
    return row


# ---------------------------------------------------------------------------
# Group comparison (side-by-side)
# ---------------------------------------------------------------------------

async def get_group_comparison(
    db: AsyncSession, group_id_a: int, group_id_b: int
) -> dict | None:
    """Side-by-side comparison of two groups."""
    result_a = await db.execute(select(PracticeGroup).where(PracticeGroup.id == group_id_a))
    result_b = await db.execute(select(PracticeGroup).where(PracticeGroup.id == group_id_b))
    ga = result_a.scalar_one_or_none()
    gb = result_b.scalar_one_or_none()
    if not ga or not gb:
        return None

    row_a = _group_to_dict(ga)
    row_b = _group_to_dict(gb)
    row_a["tier"] = _compute_tier(row_a, _resolve_targets(ga))
    row_b["tier"] = _compute_tier(row_b, _resolve_targets(gb))

    compare_keys = [
        "provider_count", "total_panel_size", "avg_capture_rate",
        "avg_recapture_rate", "avg_raf", "group_pmpm", "gap_closure_rate",
    ]

    metrics = []
    for key in compare_keys:
        val_a = row_a.get(key)
        val_b = row_b.get(key)
        # For PMPM lower is better
        if key == "group_pmpm" and val_a is not None and val_b is not None:
            winner = "a" if val_a <= val_b else "b"
        elif val_a is not None and val_b is not None:
            winner = "a" if val_a >= val_b else "b"
        else:
            winner = None
        metrics.append({
            "key": key,
            "value_a": val_a,
            "value_b": val_b,
            "winner": winner,
        })

    return {
        "group_a": row_a,
        "group_b": row_b,
        "metrics": metrics,
    }


# ---------------------------------------------------------------------------
# Intergroup analysis (AI insights)
# ---------------------------------------------------------------------------

async def get_intergroup_analysis(db: AsyncSession) -> list[dict]:
    """AI-ready analysis of what top groups do differently."""
    groups = await get_group_list(db)
    if len(groups) < 2:
        return []

    sorted_by_capture = sorted(groups, key=lambda g: g.get("avg_capture_rate") or 0, reverse=True)
    top = sorted_by_capture[0]
    bottom = sorted_by_capture[-1]

    insights = []
    if top.get("avg_capture_rate") and bottom.get("avg_capture_rate"):
        diff = (top["avg_capture_rate"] or 0) - (bottom["avg_capture_rate"] or 0)
        insights.append({
            "id": 1,
            "category": "group",
            "title": f"{top['name']} leads in capture rate by {diff:.1f} percentage points",
            "description": (
                f"{top['name']} achieves {top['avg_capture_rate']:.1f}% capture rate vs "
                f"{bottom['name']}'s {bottom['avg_capture_rate']:.1f}%. "
                f"Consider sharing {top['name']}'s coding workflows with underperforming offices."
            ),
            "recommended_action": f"Arrange a best-practices session between {top['name']} and {bottom['name']}.",
            "confidence": 0.87,
        })

    sorted_by_pmpm = sorted(groups, key=lambda g: g.get("group_pmpm") or 9999)
    low_cost = sorted_by_pmpm[0]
    high_cost = sorted_by_pmpm[-1]
    if low_cost.get("group_pmpm") and high_cost.get("group_pmpm"):
        diff = (high_cost["group_pmpm"] or 0) - (low_cost["group_pmpm"] or 0)
        insights.append({
            "id": 2,
            "category": "cost",
            "title": f"${diff:,.0f} PMPM gap between most and least efficient offices",
            "description": (
                f"{low_cost['name']} runs at ${low_cost['group_pmpm']:,.0f} PMPM while "
                f"{high_cost['name']} is at ${high_cost['group_pmpm']:,.0f}. "
                f"Investigate referral patterns and utilization differences."
            ),
            "recommended_action": f"Deep-dive into {high_cost['name']}'s ED and inpatient utilization.",
            "confidence": 0.91,
        })

    sorted_by_gap = sorted(groups, key=lambda g: g.get("gap_closure_rate") or 0, reverse=True)
    top_gap = sorted_by_gap[0]
    if top_gap.get("gap_closure_rate"):
        insights.append({
            "id": 3,
            "category": "quality",
            "title": f"{top_gap['name']} leads gap closure at {top_gap['gap_closure_rate']:.1f}%",
            "description": (
                f"{top_gap['name']} has the highest gap closure rate across all offices. "
                f"Their care coordination model should be documented and replicated."
            ),
            "recommended_action": "Document and standardize top-performing group's gap closure workflow.",
            "confidence": 0.85,
        })

    return insights


# ---------------------------------------------------------------------------
# Group trends
# ---------------------------------------------------------------------------

async def get_group_trends(db: AsyncSession, group_id: int) -> dict | None:
    """Trend data for a group (placeholder — returns static QoQ shape)."""
    result = await db.execute(select(PracticeGroup).where(PracticeGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        return None

    # TODO: Trend data will be populated once the analytics pipeline stores
    # quarterly snapshots per group. Until then, return an explicit indicator
    # so callers know this is not yet available.
    return {
        "group_id": group_id,
        "group_name": group.name,
        "data_available": False,
        "message": "Trend data not yet available. Quarterly snapshots will populate after the analytics pipeline is enabled.",
        "quarters": ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025", "Q1 2026"],
        "capture_rate": [],
        "recapture_rate": [],
        "group_pmpm": [],
        "gap_closure_rate": [],
    }


# ---------------------------------------------------------------------------
# Group providers
# ---------------------------------------------------------------------------

async def get_group_providers(db: AsyncSession, group_id: int) -> list[dict]:
    """Return all providers belonging to a group."""
    result = await db.execute(
        select(Provider).where(Provider.practice_group_id == group_id).order_by(Provider.last_name)
    )
    providers = result.scalars().all()

    rows = []
    for p in providers:
        rows.append({
            "id": p.id,
            "npi": p.npi,
            "name": f"{p.last_name}, {p.first_name}",
            "specialty": p.specialty,
            "panel_size": p.panel_size or 0,
            "capture_rate": _float(p.capture_rate),
            "recapture_rate": _float(p.recapture_rate),
            "avg_raf": _float(p.avg_panel_raf),
            "panel_pmpm": _float(p.panel_pmpm),
            "gap_closure_rate": _float(p.gap_closure_rate),
        })

    return rows
