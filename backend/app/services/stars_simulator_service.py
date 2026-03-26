"""
Stars Rating Simulator Service.

Implements CMS Star Rating methodology:
  - Per-measure rates -> star levels via cutpoints
  - Weighted average -> Part C, Part D, overall ratings
  - Simulation: model interventions and projected rating changes
  - AI-ranked highest-impact interventions by ROI
"""

import logging
import math
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.care_gap import GapMeasure, MemberGap, GapStatus

logger = logging.getLogger(__name__)

# CMS quality bonus threshold
QUALITY_BONUS_THRESHOLD = 4.0
# Per-member quality bonus (approximate CMS benchmark)
QUALITY_BONUS_PER_MEMBER = 248.0
# Approximate total membership for bonus calculation
DEFAULT_MEMBERSHIP = 4832


# ---------------------------------------------------------------------------
# Stars Cutpoints & Weight mapping
# ---------------------------------------------------------------------------

PART_C_MEASURES = [
    "CDC-HbA1c", "CDC-Eye", "BCS", "COL", "CBP",
    "COA-MedReview", "COA-Pain", "COA-Functional",
    "MRP", "FMC", "KED", "AAP",
]

PART_D_MEASURES = [
    "SPD",
]


def _classify_measure(code: str) -> str:
    """Return 'C' or 'D' for Part classification."""
    if code in PART_D_MEASURES:
        return "D"
    return "C"


def _star_level_for_rate(rate: float, measure: dict) -> int:
    """Determine star level (1-5) from rate and cutpoints."""
    s5 = measure.get("star_5_cutpoint")
    s4 = measure.get("star_4_cutpoint")
    s3 = measure.get("star_3_cutpoint")

    if s5 is not None and rate >= s5:
        return 5
    if s4 is not None and rate >= s4:
        return 4
    if s3 is not None and rate >= s3:
        return 3
    if s3 is not None and rate >= s3 * 0.7:
        return 2
    return 1


def _weighted_average(measures: list[dict]) -> float:
    """CMS weighted average: sum(star * weight) / sum(weight)."""
    total_weighted = sum(m["star_level"] * m["weight"] for m in measures)
    total_weight = sum(m["weight"] for m in measures)
    if total_weight == 0:
        return 0.0
    return total_weighted / total_weight


def _round_half_up(x: float) -> float:
    """CMS uses round-half-up for final rating."""
    return math.floor(x * 2 + 0.5) / 2


# ---------------------------------------------------------------------------
# Current Projection
# ---------------------------------------------------------------------------

async def get_current_star_projection(db: AsyncSession) -> dict[str, Any]:
    """Current projected Star rating based on all active measures."""
    measurement_year = __import__("datetime").date.today().year

    result = await db.execute(
        select(GapMeasure).where(GapMeasure.is_active == True).order_by(GapMeasure.code)  # noqa: E712
    )
    measures = result.scalars().all()

    measure_details = []
    for measure in measures:
        counts = await db.execute(
            select(MemberGap.status, func.count(MemberGap.id))
            .where(
                MemberGap.measure_id == measure.id,
                MemberGap.measurement_year == measurement_year,
            )
            .group_by(MemberGap.status)
        )
        status_counts: dict[str, int] = {}
        for row in counts.all():
            key = row[0].value if hasattr(row[0], "value") else str(row[0])
            status_counts[key] = row[1]

        open_count = status_counts.get("open", 0)
        closed_count = status_counts.get("closed", 0)
        excluded = status_counts.get("excluded", 0)
        total = open_count + closed_count + excluded
        rate = round((closed_count / total * 100) if total > 0 else 0.0, 1)

        m_dict = {
            "code": measure.code,
            "name": measure.name,
            "category": measure.category,
            "weight": measure.stars_weight,
            "part": _classify_measure(measure.code),
            "total_eligible": total,
            "numerator": closed_count,
            "current_rate": rate,
            "star_3_cutpoint": float(measure.star_3_cutpoint) if measure.star_3_cutpoint else None,
            "star_4_cutpoint": float(measure.star_4_cutpoint) if measure.star_4_cutpoint else None,
            "star_5_cutpoint": float(measure.star_5_cutpoint) if measure.star_5_cutpoint else None,
        }
        m_dict["star_level"] = _star_level_for_rate(rate, m_dict)

        # Gap to next star
        gap_to_next = None
        if m_dict["star_level"] < 5 and total > 0:
            next_cut = None
            if m_dict["star_level"] < 3:
                next_cut = m_dict["star_3_cutpoint"]
            elif m_dict["star_level"] == 3:
                next_cut = m_dict["star_4_cutpoint"]
            elif m_dict["star_level"] == 4:
                next_cut = m_dict["star_5_cutpoint"]
            if next_cut is not None:
                needed = int((next_cut / 100) * total) - closed_count
                gap_to_next = max(needed, 0)
        m_dict["gaps_to_next_star"] = gap_to_next

        measure_details.append(m_dict)

    # Calculate Part C, Part D, Overall
    part_c = [m for m in measure_details if m["part"] == "C"]
    part_d = [m for m in measure_details if m["part"] == "D"]

    part_c_avg = _weighted_average(part_c) if part_c else 0
    part_d_avg = _weighted_average(part_d) if part_d else 0

    # Overall: CMS combines Part C (2/3 weight) and Part D (1/3 weight) approximately
    if part_c and part_d:
        overall_raw = part_c_avg * 0.67 + part_d_avg * 0.33
    elif part_c:
        overall_raw = part_c_avg
    else:
        overall_raw = part_d_avg

    overall_rating = _round_half_up(overall_raw)
    part_c_rating = _round_half_up(part_c_avg)
    part_d_rating = _round_half_up(part_d_avg)

    # Quality bonus
    qualifies_bonus = overall_rating >= QUALITY_BONUS_THRESHOLD
    bonus_amount = round(QUALITY_BONUS_PER_MEMBER * DEFAULT_MEMBERSHIP * 12) if qualifies_bonus else 0

    return {
        "overall_rating": overall_rating,
        "part_c_rating": part_c_rating,
        "part_d_rating": part_d_rating,
        "measures": measure_details,
        "qualifies_for_bonus": qualifies_bonus,
        "quality_bonus_amount": bonus_amount,
        "total_weighted_score": round(overall_raw, 3),
    }


# ---------------------------------------------------------------------------
# Simulate Scenario
# ---------------------------------------------------------------------------

async def simulate_scenario(
    db: AsyncSession,
    interventions: list[dict],
) -> dict[str, Any]:
    """
    Simulate interventions and compute new projected rating.

    Each intervention: {"measure_code": "SPD", "gaps_to_close": 200}
    or {"measure_code": "CDC-HbA1c", "rate_improvement_pct": 5.0}
    """
    current = await get_current_star_projection(db)
    simulated_measures = []

    for m in current["measures"]:
        sim = dict(m)
        for intervention in interventions:
            if intervention.get("measure_code") == m["code"]:
                if "gaps_to_close" in intervention:
                    new_numerator = m["numerator"] + intervention["gaps_to_close"]
                    new_rate = round((new_numerator / m["total_eligible"] * 100) if m["total_eligible"] > 0 else 0, 1)
                    sim["current_rate"] = min(new_rate, 100.0)
                    sim["numerator"] = min(new_numerator, m["total_eligible"])
                elif "rate_improvement_pct" in intervention:
                    sim["current_rate"] = min(m["current_rate"] + intervention["rate_improvement_pct"], 100.0)

                sim["star_level"] = _star_level_for_rate(sim["current_rate"], sim)
        simulated_measures.append(sim)

    # Recalculate ratings
    part_c = [m for m in simulated_measures if m["part"] == "C"]
    part_d = [m for m in simulated_measures if m["part"] == "D"]

    part_c_avg = _weighted_average(part_c) if part_c else 0
    part_d_avg = _weighted_average(part_d) if part_d else 0

    if part_c and part_d:
        overall_raw = part_c_avg * 0.67 + part_d_avg * 0.33
    elif part_c:
        overall_raw = part_c_avg
    else:
        overall_raw = part_d_avg

    new_overall = _round_half_up(overall_raw)
    new_part_c = _round_half_up(part_c_avg)
    new_part_d = _round_half_up(part_d_avg)

    # Measures that changed star level
    changed_measures = []
    for orig, sim in zip(current["measures"], simulated_measures):
        if orig["star_level"] != sim["star_level"]:
            changed_measures.append({
                "code": sim["code"],
                "name": sim["name"],
                "weight": sim["weight"],
                "old_star": orig["star_level"],
                "new_star": sim["star_level"],
                "old_rate": orig["current_rate"],
                "new_rate": sim["current_rate"],
            })

    qualifies_bonus = new_overall >= QUALITY_BONUS_THRESHOLD
    bonus = round(QUALITY_BONUS_PER_MEMBER * DEFAULT_MEMBERSHIP * 12) if qualifies_bonus else 0
    bonus_change = bonus - current.get("quality_bonus_amount", 0)

    return {
        "current_overall": current["overall_rating"],
        "projected_overall": new_overall,
        "current_part_c": current["part_c_rating"],
        "projected_part_c": new_part_c,
        "current_part_d": current["part_d_rating"],
        "projected_part_d": new_part_d,
        "rating_change": new_overall - current["overall_rating"],
        "measures_changed": changed_measures,
        "simulated_measures": simulated_measures,
        "qualifies_for_bonus": qualifies_bonus,
        "quality_bonus_amount": bonus,
        "quality_bonus_change": bonus_change,
    }


# ---------------------------------------------------------------------------
# Highest-Impact Interventions
# ---------------------------------------------------------------------------

async def get_highest_impact_interventions(db: AsyncSession) -> list[dict[str, Any]]:
    """
    AI-ranked list: which interventions have the most Stars impact per effort.

    Prioritizes triple-weighted measures close to a cutpoint.
    """
    current = await get_current_star_projection(db)

    opportunities = []
    for m in current["measures"]:
        if m["star_level"] >= 5:
            continue
        gaps_needed = m.get("gaps_to_next_star")
        if gaps_needed is None or gaps_needed <= 0:
            continue

        # ROI = weight * star_gain / gaps_needed
        # Higher weight measures and fewer gaps needed = higher ROI
        roi_score = m["weight"] / max(gaps_needed, 1) * 1000

        # Determine target
        next_star = m["star_level"] + 1
        next_cutpoint = None
        if m["star_level"] < 3:
            next_cutpoint = m["star_3_cutpoint"]
            next_star = 3
        elif m["star_level"] == 3:
            next_cutpoint = m["star_4_cutpoint"]
        elif m["star_level"] == 4:
            next_cutpoint = m["star_5_cutpoint"]

        weight_label = f"{m['weight']}x" if m["weight"] > 1 else "1x"
        if m["weight"] == 3:
            weight_label = "triple-weighted"

        description = (
            f"Closing {gaps_needed} {m['name']} gaps moves {m['code']} "
            f"from {m['star_level']}-star to {next_star}-star "
            f"({weight_label}) "
        )
        if m["weight"] >= 3:
            description += "= highest ROI"

        opportunities.append({
            "measure_code": m["code"],
            "measure_name": m["name"],
            "current_star": m["star_level"],
            "target_star": next_star,
            "gaps_to_close": gaps_needed,
            "weight": m["weight"],
            "current_rate": m["current_rate"],
            "target_rate": next_cutpoint,
            "roi_score": round(roi_score, 1),
            "description": description,
            "impact_type": "triple_weighted" if m["weight"] >= 3 else "standard",
        })

    # Sort by ROI score descending
    opportunities.sort(key=lambda x: x["roi_score"], reverse=True)
    return opportunities
