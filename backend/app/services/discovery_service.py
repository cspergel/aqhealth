"""
Autonomous Discovery Engine — proactively scans ALL data to find insights
nobody asked about.

Runs 6 systematic scans (anomaly, opportunity, comparative, temporal,
cross-module, revenue-cycle), then synthesizes raw findings via Claude into
polished, ranked, actionable insights.
"""

import asyncio
import json
import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func, case, distinct, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.constants import PMPM_BENCHMARKS, CMS_PMPM_BASE
from app.services.llm_guard import guarded_llm_call
from app.models.claim import Claim, ClaimType
from app.models.care_gap import GapMeasure, MemberGap, GapStatus
from app.models.hcc import HccSuspect, SuspectStatus
from app.models.member import Member, RiskTier
from app.models.provider import Provider

logger = logging.getLogger(__name__)


def _sf(v) -> float:
    """Safe float conversion."""
    if v is None:
        return 0.0
    if isinstance(v, Decimal):
        return float(v)
    return float(v)


def _si(v) -> int:
    return int(v) if v is not None else 0


# ---------------------------------------------------------------------------
# Benchmarks / thresholds
# ---------------------------------------------------------------------------

# PMPM_BENCHMARKS imported from app.constants

SNF_LOS_BENCHMARKS = {
    "CHF": 18, "COPD": 14, "UTI": 10, "Hip Fracture": 22,
    "Pneumonia": 12, "Stroke": 20, "Sepsis": 16, "default": 15,
}

DEVIATION_THRESHOLD = 0.15  # 15%


# ---------------------------------------------------------------------------
# 1. Anomaly Scan
# ---------------------------------------------------------------------------

async def anomaly_scan(db: AsyncSession) -> list[dict]:
    """
    For every metric at every level, compare to benchmark / historical average.
    Flag anything deviating >15% from expected.
    """
    findings = []
    today = date.today()
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)

    # Total active lives for PMPM calculations
    pop_q = await db.execute(select(func.count(Member.id)).where(active_filter))
    total_lives = max(_si(pop_q.scalar()), 1)

    # --- PMPM by service category ---
    cat_q = await db.execute(
        select(
            Claim.service_category,
            func.sum(Claim.paid_amount).label("total_spend"),
            func.count(Claim.id).label("claim_count"),
        )
        .where(Claim.service_category.is_not(None))
        .group_by(Claim.service_category)
    )
    for r in cat_q.all():
        cat = r.service_category
        spend = _sf(r.total_spend)
        pmpm = spend / (total_lives * 12)
        benchmark = PMPM_BENCHMARKS.get(cat, 50)
        if benchmark > 0:
            deviation = (pmpm - benchmark) / benchmark
            if abs(deviation) > DEVIATION_THRESHOLD:
                findings.append({
                    "scan": "anomaly",
                    "entity": f"Category: {cat}",
                    "metric": "PMPM",
                    "current_value": round(pmpm, 2),
                    "expected_value": benchmark,
                    "deviation_pct": round(deviation * 100, 1),
                    "direction": "above" if deviation > 0 else "below",
                    "dollar_impact": round((pmpm - benchmark) * total_lives * 12, 0),
                })

    # --- Facility-level spend anomalies ---
    fac_q = await db.execute(
        select(
            Claim.facility_name,
            func.sum(Claim.paid_amount).label("total"),
            func.count(distinct(Claim.claim_id)).label("admits"),
        )
        .where(Claim.facility_name.is_not(None))
        .group_by(Claim.facility_name)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(20)
    )
    facilities = fac_q.all()
    if facilities:
        avg_spend = sum(_sf(f.total) for f in facilities) / len(facilities)
        for f in facilities:
            spend = _sf(f.total)
            if avg_spend > 0:
                deviation = (spend - avg_spend) / avg_spend
                if abs(deviation) > DEVIATION_THRESHOLD:
                    findings.append({
                        "scan": "anomaly",
                        "entity": f"Facility: {f.facility_name}",
                        "metric": "total_spend",
                        "current_value": round(spend, 0),
                        "expected_value": round(avg_spend, 0),
                        "deviation_pct": round(deviation * 100, 1),
                        "direction": "above" if deviation > 0 else "below",
                        "dollar_impact": round(spend - avg_spend, 0),
                    })

    # --- Provider capture rate anomalies ---
    prov_q = await db.execute(
        select(
            Provider.id,
            Provider.first_name,
            Provider.last_name,
            Provider.capture_rate,
            Provider.panel_size,
        ).where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
    )
    providers = prov_q.all()
    if providers:
        rates = [_sf(p.capture_rate) for p in providers if p.capture_rate is not None]
        avg_capture = sum(rates) / max(len(rates), 1) if rates else 0
        for p in providers:
            rate = _sf(p.capture_rate)
            if avg_capture > 0:
                deviation = (rate - avg_capture) / avg_capture
                if deviation < -DEVIATION_THRESHOLD:  # Only flag underperformers
                    estimated_loss = abs(deviation) * _si(p.panel_size) * CMS_PMPM_BASE * 0.1
                    findings.append({
                        "scan": "anomaly",
                        "entity": f"Provider: {p.first_name} {p.last_name}",
                        "metric": "capture_rate",
                        "current_value": round(rate, 1),
                        "expected_value": round(avg_capture, 1),
                        "deviation_pct": round(deviation * 100, 1),
                        "direction": "below",
                        "dollar_impact": round(estimated_loss, 0),
                    })

    # --- Care gap closure anomalies ---
    gap_q = await db.execute(
        select(
            GapMeasure.code,
            GapMeasure.name,
            GapMeasure.stars_weight,
            func.count(MemberGap.id).label("total"),
            func.sum(case((MemberGap.status == GapStatus.closed.value, 1), else_=0)).label("closed"),
        )
        .join(MemberGap, MemberGap.measure_id == GapMeasure.id)
        .where(MemberGap.measurement_year == today.year)
        .group_by(GapMeasure.code, GapMeasure.name, GapMeasure.stars_weight)
    )
    gap_measures = gap_q.all()
    if gap_measures:
        rates = []
        for g in gap_measures:
            total = _si(g.total)
            closed = _si(g.closed)
            if total > 0:
                rates.append(closed / total * 100)
        avg_closure = sum(rates) / max(len(rates), 1) if rates else 0
        for g in gap_measures:
            total = _si(g.total)
            closed = _si(g.closed)
            if total > 0:
                rate = closed / total * 100
                deviation = (rate - avg_closure) / max(avg_closure, 1)
                if deviation < -DEVIATION_THRESHOLD and g.stars_weight and g.stars_weight >= 2:
                    findings.append({
                        "scan": "anomaly",
                        "entity": f"Measure: {g.name} ({g.code})",
                        "metric": "closure_rate",
                        "current_value": round(rate, 1),
                        "expected_value": round(avg_closure, 1),
                        "deviation_pct": round(deviation * 100, 1),
                        "direction": "below",
                        "dollar_impact": None,
                    })

    return findings


# ---------------------------------------------------------------------------
# 2. Opportunity Scan
# ---------------------------------------------------------------------------

async def opportunity_scan(db: AsyncSession) -> list[dict]:
    """
    Systematically check for actionable opportunities: SNF LOS, HH diversion,
    generic substitution, specificity upgrades.
    """
    findings = []
    today = date.today()

    # --- SNF LOS by facility ---
    snf_q = await db.execute(
        select(
            Claim.facility_name,
            Claim.primary_diagnosis,
            func.avg(Claim.los).label("avg_los"),
            func.count(Claim.id).label("claim_count"),
            func.sum(Claim.paid_amount).label("total_spend"),
        )
        .where(
            Claim.service_category == "snf_postacute",
            Claim.facility_name.is_not(None),
            Claim.los.is_not(None),
        )
        .group_by(Claim.facility_name, Claim.primary_diagnosis)
        .having(func.count(Claim.id) >= 3)
    )
    for r in snf_q.all():
        avg_los = _sf(r.avg_los)
        benchmark = SNF_LOS_BENCHMARKS.get(r.primary_diagnosis, SNF_LOS_BENCHMARKS["default"])
        if avg_los > benchmark * (1 + DEVIATION_THRESHOLD):
            excess_days = avg_los - benchmark
            cost_per_day = _sf(r.total_spend) / max(avg_los * _si(r.claim_count), 1)
            savings = excess_days * _si(r.claim_count) * cost_per_day
            findings.append({
                "scan": "opportunity",
                "type": "snf_los",
                "entity": f"{r.facility_name} — {r.primary_diagnosis or 'All Dx'}",
                "current_value": round(avg_los, 1),
                "benchmark": benchmark,
                "excess_days": round(excess_days, 1),
                "claim_count": _si(r.claim_count),
                "dollar_impact": round(savings, 0),
                "description": f"SNF LOS {round(avg_los, 1)} days vs {benchmark} day benchmark",
            })

    # --- Home Health diversion opportunity ---
    snf_diag_q = await db.execute(
        select(
            Claim.primary_diagnosis,
            func.count(distinct(Claim.member_id)).label("member_count"),
            func.sum(Claim.paid_amount).label("total_spend"),
        )
        .where(Claim.service_category == "snf_postacute")
        .group_by(Claim.primary_diagnosis)
        .having(func.count(distinct(Claim.member_id)) >= 5)
        .order_by(func.sum(Claim.paid_amount).desc())
    )
    hh_divertible = ["UTI", "Pneumonia", "COPD", "CHF", "Cellulitis"]
    for r in snf_diag_q.all():
        dx = r.primary_diagnosis or ""
        if any(d.lower() in dx.lower() for d in hh_divertible):
            savings = _sf(r.total_spend) * 0.65  # HH costs ~35% of SNF
            findings.append({
                "scan": "opportunity",
                "type": "hh_diversion",
                "entity": f"Diagnosis: {dx}",
                "member_count": _si(r.member_count),
                "snf_spend": round(_sf(r.total_spend), 0),
                "dollar_impact": round(savings, 0),
                "description": f"{_si(r.member_count)} SNF patients with {dx} could potentially go home with HH",
            })

    # --- Specificity upgrade opportunities ---
    suspect_spec_q = await db.execute(
        select(
            HccSuspect.hcc_code,
            HccSuspect.hcc_label,
            func.count(HccSuspect.id).label("cnt"),
            func.sum(HccSuspect.annual_value).label("total_value"),
        )
        .where(
            HccSuspect.status == SuspectStatus.open.value,
            HccSuspect.suspect_type == "specificity",
        )
        .group_by(HccSuspect.hcc_code, HccSuspect.hcc_label)
        .order_by(func.sum(HccSuspect.annual_value).desc())
        .limit(10)
    )
    for r in suspect_spec_q.all():
        findings.append({
            "scan": "opportunity",
            "type": "specificity_upgrade",
            "entity": f"HCC {r.hcc_code}: {r.hcc_label}",
            "count": _si(r.cnt),
            "dollar_impact": round(_sf(r.total_value), 0),
            "description": f"{_si(r.cnt)} unspecified codes could be upgraded to capture HCC {r.hcc_code}",
        })

    # --- Generic substitution (pharmacy) ---
    brand_q = await db.execute(
        select(
            Claim.drug_name,
            func.count(distinct(Claim.member_id)).label("members"),
            func.sum(Claim.paid_amount).label("total_spend"),
        )
        .where(
            Claim.claim_type == ClaimType.pharmacy,
            Claim.drug_name.is_not(None),
        )
        .group_by(Claim.drug_name)
        .having(func.sum(Claim.paid_amount) > 50000)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(15)
    )
    for r in brand_q.all():
        # Estimate 30% savings from generic substitution
        findings.append({
            "scan": "opportunity",
            "type": "generic_substitution",
            "entity": f"Drug: {r.drug_name}",
            "member_count": _si(r.members),
            "current_spend": round(_sf(r.total_spend), 0),
            "dollar_impact": round(_sf(r.total_spend) * 0.30, 0),
            "description": f"{r.drug_name}: {_si(r.members)} members, ${_sf(r.total_spend):,.0f} spend — evaluate generic alternatives",
        })

    # Sort by dollar impact
    findings.sort(key=lambda x: abs(x.get("dollar_impact") or 0), reverse=True)
    return findings


# ---------------------------------------------------------------------------
# 3. Comparative Scan
# ---------------------------------------------------------------------------

async def comparative_scan(db: AsyncSession) -> list[dict]:
    """
    Compare every facility/provider/group to peers. Find largest performance gaps.
    """
    findings = []

    # --- Provider-to-provider comparisons ---
    prov_q = await db.execute(
        select(
            Provider.id,
            Provider.first_name,
            Provider.last_name,
            Provider.specialty,
            Provider.panel_size,
            Provider.capture_rate,
            Provider.recapture_rate,
            Provider.panel_pmpm,
            Provider.gap_closure_rate,
        ).where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
    )
    providers = prov_q.all()

    if len(providers) >= 2:
        # Find biggest capture rate gaps within same specialty
        by_spec: dict[str, list] = {}
        for p in providers:
            spec = p.specialty or "Unknown"
            by_spec.setdefault(spec, []).append(p)

        for spec, group in by_spec.items():
            if len(group) < 2:
                continue
            sorted_group = sorted(group, key=lambda x: _sf(x.capture_rate), reverse=True)
            best = sorted_group[0]
            worst = sorted_group[-1]
            gap = _sf(best.capture_rate) - _sf(worst.capture_rate)
            if gap > 15:  # >15 percentage point gap
                findings.append({
                    "scan": "comparative",
                    "type": "provider_capture_gap",
                    "entity_a": f"{best.first_name} {best.last_name}",
                    "entity_b": f"{worst.first_name} {worst.last_name}",
                    "metric": "capture_rate",
                    "value_a": round(_sf(best.capture_rate), 1),
                    "value_b": round(_sf(worst.capture_rate), 1),
                    "gap": round(gap, 1),
                    "specialty": spec,
                    "actionable": True,
                    "dollar_impact": round(gap / 100 * _si(worst.panel_size) * CMS_PMPM_BASE, 0),
                    "description": f"{best.first_name} {best.last_name} captures at {_sf(best.capture_rate):.0f}% vs {worst.first_name} {worst.last_name} at {_sf(worst.capture_rate):.0f}% — same specialty ({spec})",
                })

            # PMPM gap
            sorted_pmpm = sorted(group, key=lambda x: _sf(x.panel_pmpm))
            low = sorted_pmpm[0]
            high = sorted_pmpm[-1]
            pmpm_gap = _sf(high.panel_pmpm) - _sf(low.panel_pmpm)
            if pmpm_gap > 200:
                findings.append({
                    "scan": "comparative",
                    "type": "provider_pmpm_gap",
                    "entity_a": f"{low.first_name} {low.last_name}",
                    "entity_b": f"{high.first_name} {high.last_name}",
                    "metric": "panel_pmpm",
                    "value_a": round(_sf(low.panel_pmpm), 0),
                    "value_b": round(_sf(high.panel_pmpm), 0),
                    "gap": round(pmpm_gap, 0),
                    "specialty": spec,
                    "actionable": True,
                    "dollar_impact": round(pmpm_gap * _si(high.panel_size) * 12, 0),
                    "description": f"PMPM gap of ${pmpm_gap:,.0f} between {low.first_name} {low.last_name} and {high.first_name} {high.last_name} ({spec})",
                })

    # --- Facility-to-facility comparisons ---
    fac_q = await db.execute(
        select(
            Claim.facility_name,
            func.sum(Claim.paid_amount).label("total"),
            func.count(distinct(Claim.member_id)).label("members"),
            func.avg(Claim.los).label("avg_los"),
        )
        .where(Claim.facility_name.is_not(None))
        .group_by(Claim.facility_name)
        .having(func.count(distinct(Claim.member_id)) >= 10)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(10)
    )
    facilities = fac_q.all()
    if len(facilities) >= 2:
        avg_per_member = sum(_sf(f.total) / max(_si(f.members), 1) for f in facilities) / len(facilities)
        for f in facilities:
            per_member = _sf(f.total) / max(_si(f.members), 1)
            if per_member > avg_per_member * (1 + DEVIATION_THRESHOLD):
                findings.append({
                    "scan": "comparative",
                    "type": "facility_cost_outlier",
                    "entity_a": f.facility_name,
                    "entity_b": "Network Average",
                    "metric": "cost_per_member",
                    "value_a": round(per_member, 0),
                    "value_b": round(avg_per_member, 0),
                    "gap": round(per_member - avg_per_member, 0),
                    "actionable": True,
                    "dollar_impact": round((per_member - avg_per_member) * _si(f.members), 0),
                    "description": f"{f.facility_name} costs ${per_member:,.0f}/member vs ${avg_per_member:,.0f} network avg",
                })

    findings.sort(key=lambda x: abs(x.get("dollar_impact") or 0), reverse=True)
    return findings


# ---------------------------------------------------------------------------
# 4. Temporal Scan
# ---------------------------------------------------------------------------

async def temporal_scan(db: AsyncSession) -> list[dict]:
    """
    What changed this month vs last month? What's trending over 3+ months?
    What's new?
    """
    findings = []
    today = date.today()
    this_month_start = today.replace(day=1)
    last_month_start = (this_month_start - timedelta(days=1)).replace(day=1)
    three_months_ago = (this_month_start - timedelta(days=90)).replace(day=1)

    # --- Month-over-month spend by category ---
    for period_label, start, end in [
        ("current", this_month_start, today),
        ("prior", last_month_start, this_month_start - timedelta(days=1)),
    ]:
        pass  # We'll query both periods

    current_q = await db.execute(
        select(
            Claim.service_category,
            func.sum(Claim.paid_amount).label("spend"),
        )
        .where(Claim.service_date >= this_month_start, Claim.service_category.is_not(None))
        .group_by(Claim.service_category)
    )
    current_spend = {r.service_category: _sf(r.spend) for r in current_q.all()}

    prior_q = await db.execute(
        select(
            Claim.service_category,
            func.sum(Claim.paid_amount).label("spend"),
        )
        .where(
            Claim.service_date >= last_month_start,
            Claim.service_date < this_month_start,
            Claim.service_category.is_not(None),
        )
        .group_by(Claim.service_category)
    )
    prior_spend = {r.service_category: _sf(r.spend) for r in prior_q.all()}

    for cat in set(current_spend) | set(prior_spend):
        curr = current_spend.get(cat, 0)
        prev = prior_spend.get(cat, 0)
        if prev > 0:
            change = (curr - prev) / prev
            if abs(change) > DEVIATION_THRESHOLD:
                findings.append({
                    "scan": "temporal",
                    "metric": f"{cat}_spend",
                    "trend_direction": "up" if change > 0 else "down",
                    "change_pct": round(change * 100, 1),
                    "current_value": round(curr, 0),
                    "prior_value": round(prev, 0),
                    "duration_months": 1,
                    "significance": "high" if abs(change) > 0.25 else "medium",
                    "dollar_impact": round(curr - prev, 0),
                    "description": f"{cat} spend {'up' if change > 0 else 'down'} {abs(change)*100:.0f}% month-over-month (${curr:,.0f} vs ${prev:,.0f})",
                })

    # --- New high-cost members (appeared in last 30 days) ---
    new_member_q = await db.execute(
        select(func.count(Member.id)).where(
            Member.coverage_start >= this_month_start
        )
    )
    new_members = _si(new_member_q.scalar())
    if new_members > 0:
        findings.append({
            "scan": "temporal",
            "metric": "new_members",
            "trend_direction": "new",
            "change_pct": None,
            "current_value": new_members,
            "prior_value": None,
            "duration_months": 1,
            "significance": "medium",
            "dollar_impact": None,
            "description": f"{new_members} new members enrolled this month — review for risk assessment",
        })

    # --- Suspect HCC trend ---
    new_suspects_q = await db.execute(
        select(func.count(HccSuspect.id)).where(
            HccSuspect.identified_date >= this_month_start,
            HccSuspect.status == SuspectStatus.open.value,
        )
    )
    new_suspects = _si(new_suspects_q.scalar())

    prior_suspects_q = await db.execute(
        select(func.count(HccSuspect.id)).where(
            HccSuspect.identified_date >= last_month_start,
            HccSuspect.identified_date < this_month_start,
            HccSuspect.status == SuspectStatus.open.value,
        )
    )
    prior_suspects = _si(prior_suspects_q.scalar())

    if prior_suspects > 0:
        change = (new_suspects - prior_suspects) / prior_suspects
        if abs(change) > DEVIATION_THRESHOLD:
            findings.append({
                "scan": "temporal",
                "metric": "new_suspect_hccs",
                "trend_direction": "up" if change > 0 else "down",
                "change_pct": round(change * 100, 1),
                "current_value": new_suspects,
                "prior_value": prior_suspects,
                "duration_months": 1,
                "significance": "medium",
                "dollar_impact": None,
                "description": f"New suspect HCCs {'increased' if change > 0 else 'decreased'} {abs(change)*100:.0f}% MoM ({new_suspects} vs {prior_suspects})",
            })

    return findings


# ---------------------------------------------------------------------------
# 5. Cross-Module Scan
# ---------------------------------------------------------------------------

async def cross_module_scan(db: AsyncSession) -> list[dict]:
    """
    Find entities flagged across multiple alert categories simultaneously.
    """
    findings = []
    today = date.today()
    current_year = today.year

    # Members with 3+ open suspects
    multi_suspect_q = await db.execute(
        select(
            HccSuspect.member_id,
            func.count(HccSuspect.id).label("cnt"),
            func.sum(HccSuspect.annual_value).label("val"),
        )
        .where(HccSuspect.status == SuspectStatus.open.value)
        .group_by(HccSuspect.member_id)
        .having(func.count(HccSuspect.id) >= 3)
    )
    suspect_members = {r.member_id: {"count": r.cnt, "value": _sf(r.val)} for r in multi_suspect_q.all()}

    # Members with 2+ open care gaps
    multi_gap_q = await db.execute(
        select(MemberGap.member_id, func.count(MemberGap.id).label("cnt"))
        .where(MemberGap.status == GapStatus.open.value, MemberGap.measurement_year == current_year)
        .group_by(MemberGap.member_id)
        .having(func.count(MemberGap.id) >= 2)
    )
    gap_members = {r.member_id: r.cnt for r in multi_gap_q.all()}

    # High-cost members (top 5%)
    active_filter = (Member.coverage_end.is_(None)) | (Member.coverage_end >= today)
    pop_count = _si((await db.execute(select(func.count(Member.id)).where(active_filter))).scalar())
    high_cost_q = await db.execute(
        select(Claim.member_id, func.sum(Claim.paid_amount).label("total"))
        .group_by(Claim.member_id)
        .order_by(func.sum(Claim.paid_amount).desc())
        .limit(max(pop_count // 20, 5))
    )
    high_cost = {r.member_id: _sf(r.total) for r in high_cost_q.all()}

    # Members in 2+ categories
    all_flagged = set(suspect_members) | set(gap_members) | set(high_cost)
    multi_flag_members = []
    for mid in all_flagged:
        modules = []
        combined_impact = 0.0
        if mid in suspect_members:
            modules.append("hcc_suspects")
            combined_impact += suspect_members[mid]["value"]
        if mid in gap_members:
            modules.append("care_gaps")
        if mid in high_cost:
            modules.append("high_cost")
            combined_impact += high_cost[mid]
        if len(modules) >= 2:
            multi_flag_members.append({
                "member_id": mid,
                "modules_flagged": modules,
                "combined_impact": round(combined_impact, 0),
            })

    multi_flag_members.sort(key=lambda x: x["combined_impact"], reverse=True)

    if multi_flag_members:
        count_3plus = sum(1 for m in multi_flag_members if len(m["modules_flagged"]) >= 3)
        count_2plus = len(multi_flag_members)
        total_impact = sum(m["combined_impact"] for m in multi_flag_members[:50])

        findings.append({
            "scan": "cross_module",
            "entity": "Multi-flag members",
            "modules_flagged": ["hcc_suspects", "care_gaps", "high_cost"],
            "combined_impact": round(total_impact, 0),
            "priority_score": 95,
            "count_3_plus": count_3plus,
            "count_2_plus": count_2plus,
            "top_members": multi_flag_members[:20],
            "dollar_impact": round(total_impact, 0),
            "description": f"{count_2plus} members flagged in 2+ categories ({count_3plus} in all 3). Combined impact: ${total_impact:,.0f}",
        })

    # --- Providers with correlated issues ---
    prov_q = await db.execute(
        select(
            Provider.id,
            Provider.first_name,
            Provider.last_name,
            Provider.capture_rate,
            Provider.panel_pmpm,
            Provider.gap_closure_rate,
        ).where(Provider.panel_size.is_not(None), Provider.panel_size > 0)
    )
    for p in prov_q.all():
        issues = []
        if _sf(p.capture_rate) < 50:
            issues.append("low_capture")
        if _sf(p.panel_pmpm) > 1500:
            issues.append("high_cost")
        if _sf(p.gap_closure_rate) < 50:
            issues.append("low_gap_closure")
        if len(issues) >= 2:
            findings.append({
                "scan": "cross_module",
                "entity": f"Provider: {p.first_name} {p.last_name}",
                "modules_flagged": issues,
                "combined_impact": None,
                "priority_score": 80 + len(issues) * 5,
                "dollar_impact": None,
                "description": f"Dr. {p.last_name} underperforms on {', '.join(issues).replace('_', ' ')} — correlated issues suggest systematic problem",
            })

    return findings


# ---------------------------------------------------------------------------
# 6. Revenue Cycle Scan
# ---------------------------------------------------------------------------

async def revenue_cycle_scan(db: AsyncSession) -> list[dict]:
    """
    Billing timeliness, denial patterns, collection rates.
    """
    findings = []
    today = date.today()

    # --- Timely filing risk (claims > 90 days from service) ---
    ninety_days_ago = today - timedelta(days=90)
    late_q = await db.execute(
        select(
            func.count(Claim.id).label("cnt"),
            func.sum(Claim.paid_amount).label("total"),
        )
        .where(
            Claim.service_date <= ninety_days_ago,
            Claim.status == "pending",
        )
    )
    late_row = late_q.one_or_none()
    if late_row and _si(late_row.cnt) > 0:
        findings.append({
            "scan": "revenue_cycle",
            "issue": "timely_filing_risk",
            "affected_claims": _si(late_row.cnt),
            "financial_impact": round(_sf(late_row.total), 0),
            "root_cause": "Claims pending >90 days from service date",
            "dollar_impact": round(_sf(late_row.total), 0),
            "description": f"{_si(late_row.cnt)} claims filed >90 days — ${_sf(late_row.total):,.0f} at risk of timely filing denial",
        })

    # --- Denial patterns by service category ---
    denial_q = await db.execute(
        select(
            Claim.service_category,
            func.count(Claim.id).label("denied"),
            func.sum(Claim.paid_amount).label("denied_amount"),
        )
        .where(Claim.status == "denied", Claim.service_category.is_not(None))
        .group_by(Claim.service_category)
        .order_by(func.sum(Claim.paid_amount).desc())
    )
    for r in denial_q.all():
        if _si(r.denied) >= 5:
            findings.append({
                "scan": "revenue_cycle",
                "issue": "denial_pattern",
                "affected_claims": _si(r.denied),
                "financial_impact": round(_sf(r.denied_amount), 0),
                "root_cause": f"High denial rate in {r.service_category}",
                "dollar_impact": round(_sf(r.denied_amount), 0),
                "description": f"{_si(r.denied)} denied claims in {r.service_category} — ${_sf(r.denied_amount):,.0f} impact",
            })

    # --- Provider-level denial patterns ---
    prov_denial_q = await db.execute(
        select(
            Claim.rendering_provider_id,
            func.count(Claim.id).label("denied"),
            func.sum(Claim.paid_amount).label("amount"),
        )
        .where(Claim.status == "denied", Claim.rendering_provider_id.is_not(None))
        .group_by(Claim.rendering_provider_id)
        .having(func.count(Claim.id) >= 10)
        .order_by(func.count(Claim.id).desc())
        .limit(5)
    )
    for r in prov_denial_q.all():
        findings.append({
            "scan": "revenue_cycle",
            "issue": "provider_denial_pattern",
            "affected_claims": _si(r.denied),
            "financial_impact": round(_sf(r.amount), 0),
            "root_cause": f"Provider {r.rendering_provider_id} has elevated denial rate",
            "dollar_impact": round(_sf(r.amount), 0),
            "description": f"Provider ID {r.rendering_provider_id}: {_si(r.denied)} denied claims totaling ${_sf(r.amount):,.0f}",
        })

    return findings


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

async def synthesize_discoveries(raw_discoveries: list[dict], cross_module_context: dict | None = None, tenant_schema: str = "default") -> list[dict]:
    """
    Send raw scan results to Claude for ranking, connecting, and polishing
    into actionable insights.  Includes cross-module context (practice costs,
    risk accounting, BOI, clinical exchange, AWV, TCM) so Claude can draw
    connections like "overhead is 22% above benchmark AND capture rate is low".
    """
    if not settings.anthropic_api_key:
        logger.warning("No API key — returning raw discoveries as-is")
        return _fallback_synthesize(raw_discoveries)

    system_prompt = """\
You are an autonomous healthcare analytics engine for a Medicare Advantage MSO.
You receive raw findings from systematic data scans across the entire population,
PLUS summary data from every operational module (practice costs, risk accounting,
BOI/interventions, clinical data exchange, AWV tracking, TCM compliance).

Your job:
1) Rank by dollar impact and actionability.
2) Connect related findings across scans AND across modules (e.g., a facility anomaly + SNF LOS opportunity + denial pattern = one connected insight; practice overhead above benchmark + low capture rate = hiring a dedicated coder would cost $X but generate $Y in RAF uplift).
3) Generate plain-English insights with specific numbers.
4) For each insight, specify WHO should see it (admin, provider, group_lead) and WHERE it should surface (dashboard, hcc, expenditure, providers, care_gaps, revenue_cycle, practice_costs, risk_accounting, boi, awv, tcm).
5) Suggest follow-up analyses.
6) Specifically look for cross-module synergies: staffing investments that could close care gaps, AWV completion driving HCC capture, TCM compliance reducing readmissions, etc.

Be specific. Name dollar amounts. Be actionable."""

    context_section = ""
    if cross_module_context:
        context_section = f"""

CROSS-MODULE CONTEXT (current state of all operational modules):

{json.dumps(cross_module_context, indent=2, default=str)}
"""

    user_prompt = f"""\
Here are raw findings from 6 systematic data scans:

{json.dumps(raw_discoveries, indent=2, default=str)}{context_section}

Generate 10-20 polished insights. For each, return a JSON object with:
- "category": one of "revenue", "cost", "quality", "provider", "cross_module", "trend"
- "title": concise headline (max 120 chars)
- "description": 2-3 sentence explanation with specific numbers
- "dollar_impact": estimated annual dollar impact (number or null)
- "recommended_action": specific next step
- "confidence": 0-100
- "affected_members": list of member IDs if available, else []
- "affected_providers": list of provider IDs if available, else []
- "source_modules": list from ["hcc_engine", "expenditure", "care_gaps", "provider_scorecard", "population", "revenue_cycle"]
- "connections": dict mapping record types to IDs, e.g. {{"scans": ["anomaly", "opportunity"]}}
- "surface_on": list from ["dashboard", "hcc", "expenditure", "providers", "care_gaps", "revenue_cycle"]
- "scan_type": primary scan that found this (anomaly, opportunity, comparative, temporal, cross_module, revenue_cycle)
- "target_audience": list from ["admin", "provider", "group_lead"]

Return ONLY a JSON array. No markdown. No explanation."""

    try:
        guard_result = await guarded_llm_call(
            tenant_schema=tenant_schema,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            context_data={"discovery_count": len(raw_discoveries), "has_cross_module": cross_module_context is not None},
            max_tokens=4096,
        )
        if guard_result["warnings"]:
            logger.warning("Synthesis LLM output warnings: %s", guard_result["warnings"])
        text = guard_result["response"].strip()
        if not text:
            return _fallback_synthesize(raw_discoveries)
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3].strip()
        result = json.loads(text)
        if isinstance(result, list):
            return result
    except Exception as e:
        logger.error("Synthesis LLM call failed: %s", e, exc_info=True)

    return _fallback_synthesize(raw_discoveries)


def _fallback_synthesize(raw_discoveries: list[dict]) -> list[dict]:
    """Convert raw scan results into insight format without LLM."""
    insights = []
    for d in raw_discoveries:
        scan = d.get("scan", "unknown")
        cat_map = {
            "anomaly": "cost",
            "opportunity": "revenue",
            "comparative": "provider",
            "temporal": "trend",
            "cross_module": "cross_module",
            "revenue_cycle": "cost",
        }
        insights.append({
            "category": cat_map.get(scan, "cross_module"),
            "title": d.get("description", d.get("entity", "Discovery"))[:120],
            "description": d.get("description", str(d)),
            "dollar_impact": d.get("dollar_impact"),
            "recommended_action": None,
            "confidence": 70,
            "affected_members": [],
            "affected_providers": [],
            "source_modules": [scan],
            "connections": {"scans": [scan]},
            "surface_on": ["dashboard"],
            "scan_type": scan,
            "target_audience": ["admin"],
        })

    # Sort by dollar impact
    insights.sort(key=lambda x: abs(x.get("dollar_impact") or 0), reverse=True)
    return insights[:20]


# ---------------------------------------------------------------------------
# Cross-module context gathering (for richer AI synthesis)
# ---------------------------------------------------------------------------

async def _gather_cross_module_context(db: AsyncSession) -> dict:
    """Pull summary data from ALL modules so Claude can make cross-module
    connections during synthesis (e.g. practice overhead + capture rate).

    Each section is wrapped in try/except so a single module failure
    never blocks the rest of the discovery pipeline.
    """
    context: dict = {}

    # --- Practice costs summary ---
    try:
        from app.services.practice_expense_service import get_expense_dashboard
        expense_data = await get_expense_dashboard(db)
        context["practice_costs"] = {
            "total_operational_cost": expense_data.get("total_actual", 0),
            "total_budget": expense_data.get("total_budget", 0),
            "budget_utilization_pct": expense_data.get("budget_utilization", 0),
            "staffing_cost": expense_data.get("staffing_cost", 0),
        }
    except Exception as e:
        logger.debug("Cross-module: practice costs unavailable: %s", e)

    # --- Risk accounting summary ---
    try:
        from app.services.risk_accounting_service import get_risk_dashboard
        risk_data = await get_risk_dashboard(db)
        context["risk_accounting"] = {
            "cap_revenue": risk_data.get("total_cap_revenue", 0),
            "medical_spend": risk_data.get("total_medical_spend", 0),
            "mlr": risk_data.get("mlr", 0),
            "surplus_deficit": risk_data.get("surplus_deficit", 0),
            "ibnr_estimate": risk_data.get("ibnr_estimate", 0),
        }
    except Exception as e:
        logger.debug("Cross-module: risk accounting unavailable: %s", e)

    # --- BOI summary ---
    try:
        from app.services.boi_service import get_boi_dashboard
        boi_data = await get_boi_dashboard(db)
        active_interventions = [
            i for i in boi_data.get("interventions", []) if i.get("status") == "active"
        ]
        avg_roi = 0.0
        roi_vals = [i["roi_percentage"] for i in active_interventions if i.get("roi_percentage")]
        if roi_vals:
            avg_roi = sum(roi_vals) / len(roi_vals)
        context["boi"] = {
            "active_interventions": len(active_interventions),
            "total_invested": boi_data.get("total_invested", 0),
            "total_returned": boi_data.get("total_returned", 0),
            "avg_roi": round(avg_roi, 1),
        }
    except Exception as e:
        logger.debug("Cross-module: BOI unavailable: %s", e)

    # --- Clinical exchange stats ---
    try:
        from app.services.clinical_exchange_service import get_exchange_dashboard
        exchange_data = await get_exchange_dashboard(db)
        auto_responded = exchange_data.get("auto_responded", 0)
        total_req = exchange_data.get("total_requests", 0)
        context["clinical_exchange"] = {
            "total_requests": total_req,
            "pending": exchange_data.get("pending", 0),
            "auto_responded": auto_responded,
            "auto_response_rate": round(auto_responded / total_req * 100, 1) if total_req else 0,
            "avg_response_hours": exchange_data.get("avg_response_hours", 0),
        }
    except Exception as e:
        logger.debug("Cross-module: clinical exchange unavailable: %s", e)

    # --- AWV completion rate ---
    try:
        from app.services.awv_service import get_awv_dashboard
        awv_data = await get_awv_dashboard(db)
        context["awv"] = {
            "total_members": awv_data.get("total_members", 0),
            "completed": awv_data.get("awv_completed", 0),
            "overdue": awv_data.get("awv_overdue", 0),
            "completion_rate": awv_data.get("completion_rate", 0),
            "revenue_opportunity": awv_data.get("revenue_opportunity", 0),
        }
    except Exception as e:
        logger.debug("Cross-module: AWV unavailable: %s", e)

    # --- TCM compliance rate ---
    try:
        from app.services.tcm_service import get_tcm_dashboard
        tcm_data = await get_tcm_dashboard(db)
        context["tcm"] = {
            "active_cases": tcm_data.get("active_cases", 0),
            "compliance_rate": tcm_data.get("compliance_rate", 0),
            "revenue_captured": tcm_data.get("revenue_captured", 0),
            "revenue_potential": tcm_data.get("revenue_potential", 0),
        }
    except Exception as e:
        logger.debug("Cross-module: TCM unavailable: %s", e)

    return context


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

async def run_full_discovery(db: AsyncSession, tenant_schema: str = "default") -> list[dict]:
    """
    Orchestrate all 6 scans, gather cross-module context, and synthesize
    results into ranked discoveries.
    """
    logger.info("Starting autonomous discovery scan...")

    # Run all scans
    scans = {}
    scan_funcs = {
        "anomaly": anomaly_scan,
        "opportunity": opportunity_scan,
        "comparative": comparative_scan,
        "temporal": temporal_scan,
        "cross_module": cross_module_scan,
        "revenue_cycle": revenue_cycle_scan,
    }

    all_raw: list[dict] = []
    for name, func_ref in scan_funcs.items():
        try:
            results = await func_ref(db)
            scans[name] = len(results)
            all_raw.extend(results)
            logger.info("Scan '%s' found %d raw findings", name, len(results))
        except Exception as e:
            logger.error("Scan '%s' failed: %s", name, e, exc_info=True)
            scans[name] = 0

    logger.info("Total raw findings: %d across %d scans", len(all_raw), len(scans))

    if not all_raw:
        return []

    # Gather cross-module context for richer AI synthesis
    cross_module_context = await _gather_cross_module_context(db)
    logger.info("Gathered cross-module context from %d modules", len(cross_module_context))

    # Synthesize into polished insights (with cross-module context)
    discoveries = await synthesize_discoveries(all_raw, cross_module_context, tenant_schema=tenant_schema)
    logger.info("Synthesized %d discoveries", len(discoveries))

    return discoveries
