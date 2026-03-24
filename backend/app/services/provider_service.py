"""
Provider Scorecard service.

Computes provider metrics, peer comparisons, performance tiers,
and retrieves AI coaching insights.
"""

import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import select, func, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider import Provider
from app.models.member import Member
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.insight import Insight, InsightCategory, InsightStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default targets (can be overridden per-provider via targets JSONB column)
# ---------------------------------------------------------------------------

DEFAULT_TARGETS = {
    "capture_rate": 80.0,
    "recapture_rate": 75.0,
    "avg_raf": None,          # No default target — peer-relative only
    "panel_pmpm": None,       # No default target — peer-relative only
    "gap_closure_rate": 70.0,
}

METRIC_KEYS = [
    "panel_size",
    "capture_rate",
    "recapture_rate",
    "avg_raf",
    "panel_pmpm",
    "gap_closure_rate",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _float(val: Any) -> float | None:
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


def _tier(value: float | None, target: float | None) -> str:
    """Assign green / amber / red tier based on value vs target."""
    if value is None or target is None:
        return "gray"
    if value >= target:
        return "green"
    if value >= target * 0.90:
        return "amber"
    return "red"


def _percentile_rank(values: list[float], value: float) -> int:
    """Return 0-100 percentile rank for value within values."""
    if not values or value is None:
        return 0
    below = sum(1 for v in values if v < value)
    return round(below / len(values) * 100)


def _resolve_targets(provider: Provider) -> dict:
    """Merge provider-specific overrides with defaults."""
    targets = dict(DEFAULT_TARGETS)
    if provider.targets:
        targets.update(provider.targets)
    return targets


def _provider_to_dict(p: Provider) -> dict:
    return {
        "id": p.id,
        "npi": p.npi,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "name": f"{p.last_name}, {p.first_name}",
        "specialty": p.specialty,
        "practice_name": p.practice_name,
        "panel_size": p.panel_size or 0,
        "capture_rate": _float(p.capture_rate),
        "recapture_rate": _float(p.recapture_rate),
        "avg_raf": _float(p.avg_panel_raf),
        "panel_pmpm": _float(p.panel_pmpm),
        "gap_closure_rate": _float(p.gap_closure_rate),
    }


# ---------------------------------------------------------------------------
# Provider list with metrics + percentile ranks
# ---------------------------------------------------------------------------

SORT_COLUMNS = {
    "name": Provider.last_name,
    "specialty": Provider.specialty,
    "panel_size": Provider.panel_size,
    "capture_rate": Provider.capture_rate,
    "recapture_rate": Provider.recapture_rate,
    "avg_raf": Provider.avg_panel_raf,
    "panel_pmpm": Provider.panel_pmpm,
    "gap_closure_rate": Provider.gap_closure_rate,
}


async def get_provider_list(
    db: AsyncSession,
    sort_by: str = "name",
    order: str = "asc",
    specialty_filter: str | None = None,
    tier_filter: str | None = None,
) -> list[dict]:
    """Return all providers with computed metrics, tiers, and percentile ranks."""
    stmt = select(Provider)
    if specialty_filter:
        stmt = stmt.where(Provider.specialty == specialty_filter)

    col = SORT_COLUMNS.get(sort_by, Provider.last_name)
    stmt = stmt.order_by(col.asc() if order == "asc" else col.desc())

    result = await db.execute(stmt)
    providers = result.scalars().all()

    if not providers:
        return []

    # Build metric vectors for percentile calculations
    metric_vectors: dict[str, list[float]] = {k: [] for k in METRIC_KEYS}
    rows: list[dict] = []

    for p in providers:
        row = _provider_to_dict(p)
        rows.append(row)
        for key in METRIC_KEYS:
            val = row.get(key)
            if val is not None:
                metric_vectors[key].append(val)

    # Compute tiers and percentiles
    for row in rows:
        p_obj = next(p for p in providers if p.id == row["id"])
        targets = _resolve_targets(p_obj)

        # Overall tier = worst tier across targeted metrics
        tiers = []
        for metric_key in ["capture_rate", "recapture_rate", "gap_closure_rate"]:
            t = _tier(row.get(metric_key), targets.get(metric_key))
            tiers.append(t)

        if "red" in tiers:
            row["tier"] = "red"
        elif "amber" in tiers:
            row["tier"] = "amber"
        else:
            row["tier"] = "green"

        # Percentile per metric
        row["percentiles"] = {}
        for key in METRIC_KEYS:
            val = row.get(key)
            if val is not None:
                # For PMPM lower is better — invert
                if key == "panel_pmpm":
                    row["percentiles"][key] = 100 - _percentile_rank(metric_vectors[key], val)
                else:
                    row["percentiles"][key] = _percentile_rank(metric_vectors[key], val)
            else:
                row["percentiles"][key] = None

    # Optional tier filter (applied after computation)
    if tier_filter:
        rows = [r for r in rows if r["tier"] == tier_filter]

    return rows


# ---------------------------------------------------------------------------
# Full scorecard for a single provider
# ---------------------------------------------------------------------------

async def get_provider_scorecard(db: AsyncSession, provider_id: int) -> dict:
    """Full scorecard: metrics, targets, tiers, peer percentile."""
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        return None

    row = _provider_to_dict(provider)
    targets = _resolve_targets(provider)

    # Get all providers for percentile calc
    all_result = await db.execute(select(Provider))
    all_providers = all_result.scalars().all()

    metric_vectors: dict[str, list[float]] = {k: [] for k in METRIC_KEYS}
    for p in all_providers:
        d = _provider_to_dict(p)
        for key in METRIC_KEYS:
            val = d.get(key)
            if val is not None:
                metric_vectors[key].append(val)

    # Build metric cards
    metrics = []
    tiers = []
    for key in METRIC_KEYS:
        val = row.get(key)
        target = targets.get(key)
        tier = _tier(val, target)
        if key in ["capture_rate", "recapture_rate", "gap_closure_rate"]:
            tiers.append(tier)

        if key == "panel_pmpm" and val is not None:
            pct = 100 - _percentile_rank(metric_vectors[key], val)
        elif val is not None:
            pct = _percentile_rank(metric_vectors[key], val)
        else:
            pct = None

        metrics.append({
            "key": key,
            "label": key.replace("_", " ").title(),
            "value": val,
            "target": target,
            "tier": tier,
            "percentile": pct,
            "trend": None,  # Placeholder for QoQ trend
        })

    row["metrics"] = metrics
    row["targets"] = targets
    row["tier"] = "red" if "red" in tiers else ("amber" if "amber" in tiers else "green")

    return row


# ---------------------------------------------------------------------------
# Peer comparison (anonymized benchmarks)
# ---------------------------------------------------------------------------

async def get_peer_comparison(db: AsyncSession, provider_id: int) -> dict:
    """Anonymized benchmarks: network avg, top quartile, bottom quartile per metric."""
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        return None

    all_result = await db.execute(select(Provider))
    all_providers = all_result.scalars().all()

    provider_row = _provider_to_dict(provider)
    comparisons = {}

    for key in METRIC_KEYS:
        values = [_float(getattr(p, "avg_panel_raf" if key == "avg_raf" else key)) for p in all_providers]
        values = [v for v in values if v is not None]

        if not values:
            comparisons[key] = {
                "provider_value": provider_row.get(key),
                "network_avg": None,
                "top_quartile": None,
                "bottom_quartile": None,
            }
            continue

        sorted_vals = sorted(values)
        n = len(sorted_vals)
        comparisons[key] = {
            "provider_value": provider_row.get(key),
            "network_avg": round(sum(sorted_vals) / n, 2),
            "top_quartile": sorted_vals[int(n * 0.75)] if n > 1 else sorted_vals[0],
            "bottom_quartile": sorted_vals[int(n * 0.25)] if n > 1 else sorted_vals[0],
        }

    return {
        "provider_id": provider_id,
        "name": provider_row["name"],
        "comparisons": comparisons,
    }


# ---------------------------------------------------------------------------
# Update provider targets
# ---------------------------------------------------------------------------

async def update_provider_targets(
    db: AsyncSession,
    provider_id: int,
    targets: dict,
) -> dict | None:
    """Update configurable target thresholds for a provider."""
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        return None

    # Merge with existing
    current = provider.targets or {}
    current.update(targets)
    provider.targets = current
    await db.commit()
    await db.refresh(provider)

    return _provider_to_dict(provider)


# ---------------------------------------------------------------------------
# AI coaching insights for a provider
# ---------------------------------------------------------------------------

async def get_provider_insights(db: AsyncSession, provider_id: int) -> list[dict]:
    """Return AI insights filtered to those affecting this provider."""
    # affected_providers is JSONB — check if it contains the provider_id
    stmt = select(Insight).where(
        and_(
            Insight.status == InsightStatus.active,
            Insight.affected_providers.isnot(None),
        )
    )
    result = await db.execute(stmt)
    insights = result.scalars().all()

    # Filter in Python since JSONB contains check varies by structure
    matched = []
    for ins in insights:
        affected = ins.affected_providers
        # affected_providers could be a list of IDs or a dict with IDs
        ids = []
        if isinstance(affected, list):
            ids = affected
        elif isinstance(affected, dict):
            ids = affected.get("ids", affected.get("provider_ids", []))

        if provider_id in ids:
            matched.append({
                "id": ins.id,
                "title": ins.title,
                "description": ins.description,
                "dollar_impact": _float(ins.dollar_impact),
                "recommended_action": ins.recommended_action,
                "confidence": ins.confidence,
                "category": ins.category.value if ins.category else "provider",
            })

    return matched
