"""
Provider Scorecard service.

Computes provider metrics, peer comparisons, performance tiers,
and retrieves AI coaching insights.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select, and_, func, case, literal, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider import Provider
from app.models.member import Member
from app.models.claim import Claim
from app.models.hcc import HccSuspect
from app.models.care_gap import MemberGap
from app.models.practice_group import PracticeGroup
from app.models.insight import Insight, InsightStatus

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


# Metric -> DB column mapping used by _fetch_provider_percentiles.
# "avg_raf" is surfaced via Provider.avg_panel_raf column.
_PERCENTILE_COLUMNS: dict[str, str] = {
    "panel_size": "panel_size",
    "capture_rate": "capture_rate",
    "recapture_rate": "recapture_rate",
    "avg_raf": "avg_panel_raf",
    "panel_pmpm": "panel_pmpm",
    "gap_closure_rate": "gap_closure_rate",
}

# For PMPM, lower is better — we invert (100 - rank) in the caller.
_PMPM_KEY = "panel_pmpm"


async def _fetch_provider_percentiles(
    db: AsyncSession,
) -> dict[str, dict[int, int]]:
    """Compute 0-100 percentile rank per provider per metric in SQL.

    Returns a nested dict: {metric_key: {provider_id: pct}}.

    Uses Postgres ``PERCENT_RANK()`` (0.0..1.0) scaled to 0..100. NULL rows
    for a given metric are excluded from that metric's ranking via a
    ``WHERE col IS NOT NULL`` filter inside the window subquery (each
    metric's window runs over its non-null subset — matching the prior
    Python behaviour which filtered None before computing).

    Replaces the hot path ``scalars().all()`` -> Python percentile loop that
    pulled every Provider row into memory.
    """
    # Build one UNION ALL query that returns (metric, provider_id, pct).
    # PERCENT_RANK for PMPM is NOT inverted here — callers invert.
    parts: list[str] = []
    for metric_key, col in _PERCENTILE_COLUMNS.items():
        parts.append(
            f"""
            SELECT
                '{metric_key}' AS metric,
                id             AS provider_id,
                ROUND(PERCENT_RANK() OVER (ORDER BY {col}) * 100)::int AS pct
            FROM providers
            WHERE {col} IS NOT NULL
            """
        )
    stmt = text(" UNION ALL ".join(parts))

    rows = (await db.execute(stmt)).all()
    percentiles: dict[str, dict[int, int]] = {k: {} for k in _PERCENTILE_COLUMNS}
    for row in rows:
        percentiles[row.metric][row.provider_id] = int(row.pct or 0)
    return percentiles


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
        "name": f"{p.last_name or ''}, {p.first_name or ''}".strip(", "),
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
    """Return all providers with computed metrics, tiers, and percentile ranks.

    Percentile ranks are computed in SQL via PERCENT_RANK() (see
    ``_fetch_provider_percentiles``), eliminating the prior pattern that
    loaded every Provider row into Python just to build metric vectors.
    """
    stmt = select(Provider)
    if specialty_filter:
        stmt = stmt.where(Provider.specialty == specialty_filter)

    col = SORT_COLUMNS.get(sort_by, Provider.last_name)
    stmt = stmt.order_by(col.asc() if order == "asc" else col.desc())

    result = await db.execute(stmt)
    providers = result.scalars().all()

    if not providers:
        return []

    # One SQL round-trip computes every (metric, provider) percentile rank.
    percentiles = await _fetch_provider_percentiles(db)

    rows: list[dict] = []
    for p in providers:
        row = _provider_to_dict(p)
        targets = _resolve_targets(p)

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

        # Percentile per metric — looked up from the SQL-computed map.
        row["percentiles"] = {}
        for key in METRIC_KEYS:
            val = row.get(key)
            if val is None:
                row["percentiles"][key] = None
                continue
            pct = percentiles.get(key, {}).get(p.id)
            if pct is None:
                row["percentiles"][key] = None
            elif key == _PMPM_KEY:
                # Lower PMPM is better — invert so top performers = 100.
                row["percentiles"][key] = 100 - pct
            else:
                row["percentiles"][key] = pct
        rows.append(row)

    # Optional tier filter (applied after computation)
    if tier_filter:
        rows = [r for r in rows if r["tier"] == tier_filter]

    return rows


# ---------------------------------------------------------------------------
# Full scorecard for a single provider
# ---------------------------------------------------------------------------

async def get_provider_scorecard(db: AsyncSession, provider_id: int) -> dict:
    """Full scorecard: metrics, targets, tiers, peer percentile.

    Peer percentile is computed in SQL; we no longer pull every Provider
    row into Python just to rank one.
    """
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        return None

    row = _provider_to_dict(provider)
    targets = _resolve_targets(provider)

    # Percentile ranks via PERCENT_RANK() in SQL (one round-trip)
    percentiles = await _fetch_provider_percentiles(db)

    # Build metric cards
    metrics = []
    tiers = []
    for key in METRIC_KEYS:
        val = row.get(key)
        target = targets.get(key)
        tier = _tier(val, target)
        if key in ["capture_rate", "recapture_rate", "gap_closure_rate"]:
            tiers.append(tier)

        if val is None:
            pct = None
        else:
            raw_pct = percentiles.get(key, {}).get(provider_id)
            if raw_pct is None:
                pct = None
            elif key == _PMPM_KEY:
                pct = 100 - raw_pct
            else:
                pct = raw_pct

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
    """Anonymized benchmarks: network avg, top quartile, bottom quartile per metric.

    Quartiles + averages are computed entirely in Postgres via
    ``percentile_cont`` — we no longer pull every Provider row to Python.
    """
    result = await db.execute(select(Provider).where(Provider.id == provider_id))
    provider = result.scalar_one_or_none()
    if not provider:
        return None

    provider_row = _provider_to_dict(provider)
    comparisons: dict[str, dict[str, Any]] = {}

    # One UNION-ed aggregate per metric — all in a single round-trip.
    parts: list[str] = []
    for metric_key, col in _PERCENTILE_COLUMNS.items():
        parts.append(
            f"""
            SELECT
                '{metric_key}'                                                      AS metric,
                AVG({col})::float                                                   AS network_avg,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY {col})::float          AS top_quartile,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY {col})::float          AS bottom_quartile
            FROM providers
            WHERE {col} IS NOT NULL
            """
        )
    stmt = text(" UNION ALL ".join(parts))
    agg_rows = (await db.execute(stmt)).all()
    agg_by_metric: dict[str, Any] = {row.metric: row for row in agg_rows}

    for key in METRIC_KEYS:
        agg = agg_by_metric.get(key)
        if not agg or agg.network_avg is None:
            comparisons[key] = {
                "provider_value": provider_row.get(key),
                "network_avg": None,
                "top_quartile": None,
                "bottom_quartile": None,
            }
            continue
        comparisons[key] = {
            "provider_value": provider_row.get(key),
            "network_avg": round(agg.network_avg, 2),
            "top_quartile": round(agg.top_quartile, 2) if agg.top_quartile is not None else None,
            "bottom_quartile": round(agg.bottom_quartile, 2) if agg.bottom_quartile is not None else None,
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
            Insight.status == InsightStatus.active.value,
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
                "category": ins.category if ins.category else "provider",
            })

    return matched


# ---------------------------------------------------------------------------
# Refresh provider & practice-group scorecards (batch computation)
# ---------------------------------------------------------------------------

async def refresh_provider_scorecards(db: AsyncSession) -> dict[str, Any]:
    """
    Recompute all computed scorecard fields for every Provider and
    PracticeGroup in one pass using batch SQL queries (no N+1).

    Returns a summary dict with counts of updated providers and groups.
    """
    logger.info("Starting provider scorecard refresh")

    twelve_months_ago = date.today() - timedelta(days=365)

    # ------------------------------------------------------------------
    # 1. panel_size: COUNT(members) per provider
    # ------------------------------------------------------------------
    panel_size_q = (
        select(
            Member.pcp_provider_id.label("provider_id"),
            func.count(Member.id).label("panel_size"),
        )
        .where(Member.pcp_provider_id.isnot(None))
        .group_by(Member.pcp_provider_id)
    )
    panel_size_result = await db.execute(panel_size_q)
    panel_sizes: dict[int, int] = {
        row.provider_id: row.panel_size for row in panel_size_result
    }

    # ------------------------------------------------------------------
    # 2. avg_panel_raf: AVG(member.current_raf) per provider
    # ------------------------------------------------------------------
    avg_raf_q = (
        select(
            Member.pcp_provider_id.label("provider_id"),
            func.avg(Member.current_raf).label("avg_raf"),
        )
        .where(
            and_(
                Member.pcp_provider_id.isnot(None),
                Member.current_raf.isnot(None),
            )
        )
        .group_by(Member.pcp_provider_id)
    )
    avg_raf_result = await db.execute(avg_raf_q)
    avg_rafs: dict[int, float] = {
        row.provider_id: float(row.avg_raf) for row in avg_raf_result
    }

    # ------------------------------------------------------------------
    # 3. capture_rate: captured / total suspects per provider panel
    #    We join HccSuspect → Member on member_id, group by pcp_provider_id
    # ------------------------------------------------------------------
    capture_q = (
        select(
            Member.pcp_provider_id.label("provider_id"),
            func.count(HccSuspect.id).label("total"),
            func.count(
                case(
                    (HccSuspect.status == "captured", HccSuspect.id),
                )
            ).label("captured"),
        )
        .select_from(HccSuspect)
        .join(Member, HccSuspect.member_id == Member.id)
        .where(Member.pcp_provider_id.isnot(None))
        .group_by(Member.pcp_provider_id)
    )
    capture_result = await db.execute(capture_q)
    capture_rates: dict[int, float] = {}
    for row in capture_result:
        if row.total > 0:
            capture_rates[row.provider_id] = round(row.captured / row.total * 100, 2)

    # ------------------------------------------------------------------
    # 4. recapture_rate: captured recapture suspects / total recapture suspects
    # ------------------------------------------------------------------
    recapture_q = (
        select(
            Member.pcp_provider_id.label("provider_id"),
            func.count(HccSuspect.id).label("total"),
            func.count(
                case(
                    (HccSuspect.status == "captured", HccSuspect.id),
                )
            ).label("captured"),
        )
        .select_from(HccSuspect)
        .join(Member, HccSuspect.member_id == Member.id)
        .where(
            and_(
                Member.pcp_provider_id.isnot(None),
                HccSuspect.suspect_type == "recapture",
            )
        )
        .group_by(Member.pcp_provider_id)
    )
    recapture_result = await db.execute(recapture_q)
    recapture_rates: dict[int, float] = {}
    for row in recapture_result:
        if row.total > 0:
            recapture_rates[row.provider_id] = round(row.captured / row.total * 100, 2)

    # ------------------------------------------------------------------
    # 5. panel_pmpm: SUM(paid_amount for panel in last 12mo) / panel_size / 12
    # ------------------------------------------------------------------
    pmpm_q = (
        select(
            Member.pcp_provider_id.label("provider_id"),
            func.coalesce(func.sum(Claim.paid_amount), 0).label("total_paid"),
        )
        .select_from(Claim)
        .join(Member, Claim.member_id == Member.id)
        .where(
            and_(
                Member.pcp_provider_id.isnot(None),
                Claim.service_date >= twelve_months_ago,
            )
        )
        .group_by(Member.pcp_provider_id)
    )
    pmpm_result = await db.execute(pmpm_q)
    panel_pmpms: dict[int, float] = {}
    for row in pmpm_result:
        prov_id = row.provider_id
        ps = panel_sizes.get(prov_id, 0)
        if ps > 0:
            panel_pmpms[prov_id] = round(float(row.total_paid) / ps / 12, 2)

    # ------------------------------------------------------------------
    # 6. gap_closure_rate: closed / total MemberGap per provider panel
    # ------------------------------------------------------------------
    gap_q = (
        select(
            Member.pcp_provider_id.label("provider_id"),
            func.count(MemberGap.id).label("total"),
            func.count(
                case(
                    (MemberGap.status == "closed", MemberGap.id),
                )
            ).label("closed"),
        )
        .select_from(MemberGap)
        .join(Member, MemberGap.member_id == Member.id)
        .where(Member.pcp_provider_id.isnot(None))
        .group_by(Member.pcp_provider_id)
    )
    gap_result = await db.execute(gap_q)
    gap_closure_rates: dict[int, float] = {}
    for row in gap_result:
        if row.total > 0:
            gap_closure_rates[row.provider_id] = round(row.closed / row.total * 100, 2)

    # ------------------------------------------------------------------
    # 7. Update all providers in batch
    # ------------------------------------------------------------------
    all_providers_result = await db.execute(select(Provider))
    all_providers = all_providers_result.scalars().all()

    providers_updated = 0
    for provider in all_providers:
        pid = provider.id
        provider.panel_size = panel_sizes.get(pid, 0)
        provider.capture_rate = capture_rates.get(pid)
        provider.recapture_rate = recapture_rates.get(pid)
        provider.avg_panel_raf = avg_rafs.get(pid)
        provider.panel_pmpm = panel_pmpms.get(pid)
        provider.gap_closure_rate = gap_closure_rates.get(pid)
        providers_updated += 1

    # ------------------------------------------------------------------
    # 8. Aggregate into PracticeGroups (weighted averages)
    # ------------------------------------------------------------------
    all_groups_result = await db.execute(select(PracticeGroup))
    all_groups = all_groups_result.scalars().all()

    # Build a mapping: group_id -> list of providers
    group_providers: dict[int, list[Provider]] = {}
    for provider in all_providers:
        if provider.practice_group_id is not None:
            group_providers.setdefault(provider.practice_group_id, []).append(provider)

    groups_updated = 0
    for group in all_groups:
        gid = group.id
        members = group_providers.get(gid, [])
        group.provider_count = len(members)

        total_panel = sum(p.panel_size or 0 for p in members)
        group.total_panel_size = total_panel

        if total_panel > 0:
            # Weighted averages by panel_size
            group.avg_capture_rate = round(
                sum((p.capture_rate or 0) * (p.panel_size or 0) for p in members) / total_panel, 2
            )
            group.avg_recapture_rate = round(
                sum((p.recapture_rate or 0) * (p.panel_size or 0) for p in members) / total_panel, 2
            )
            group.avg_raf = round(
                sum((p.avg_panel_raf or 0) * (p.panel_size or 0) for p in members) / total_panel, 2
            )
            group.gap_closure_rate = round(
                sum((p.gap_closure_rate or 0) * (p.panel_size or 0) for p in members) / total_panel, 2
            )

            # group_pmpm: total spend across all panel members / total_panel / 12
            total_spend = sum((p.panel_pmpm or 0) * (p.panel_size or 0) * 12 for p in members)
            group.group_pmpm = round(total_spend / total_panel / 12, 2)
        else:
            group.avg_capture_rate = None
            group.avg_recapture_rate = None
            group.avg_raf = None
            group.group_pmpm = None
            group.gap_closure_rate = None

        groups_updated += 1

    await db.commit()

    logger.info(
        "Provider scorecard refresh complete: %d providers, %d groups updated",
        providers_updated,
        groups_updated,
    )

    return {
        "providers_updated": providers_updated,
        "groups_updated": groups_updated,
    }
