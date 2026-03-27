"""
CMS MOOP & Cost Sharing Service

Provides functions to look up CMS-mandated cost sharing limits by year,
MOOP tier, and service category. Used for compliance checking, member
liability estimation, and plan design validation.

Data is loaded from pre-generated JSON files (cms_cost_sharing_{year}.json)
produced by scripts/import_cms_moop_data.py.
"""

import json
import logging
from pathlib import Path
from typing import Any  # noqa: F401 - kept for potential future use

logger = logging.getLogger(__name__)

# Path to data directory
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"

# Cache: year -> parsed JSON dict
_cache: dict[int, dict] = {}

VALID_TIERS = ("lower", "intermediate", "mandatory")


def _load_year(year: int) -> dict | None:
    """Load and cache cost sharing data for a given year. Returns None if unavailable."""
    if year in _cache:
        return _cache[year]

    json_path = DATA_DIR / f"cms_cost_sharing_{year}.json"
    if not json_path.exists():
        logger.warning("CMS cost sharing data not found for year %d at %s", year, json_path)
        _cache[year] = None  # Cache negative result to avoid re-checking filesystem
        return None

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _cache[year] = data
        logger.info(
            "Loaded CMS cost sharing data for CY %d (%d service categories)",
            year,
            data.get("metadata", {}).get("service_count", 0),
        )
        return data
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to load CMS cost sharing data for year %d: %s", year, e)
        return None


def _validate_tier(moop_tier: str) -> str:
    """Normalize and validate MOOP tier name."""
    tier = moop_tier.strip().lower()
    if tier not in VALID_TIERS:
        raise ValueError(
            f"Invalid MOOP tier '{moop_tier}'. Must be one of: {', '.join(VALID_TIERS)}"
        )
    return tier


def get_available_years() -> list[int]:
    """Return list of years that have CMS cost sharing data available."""
    years = []
    if DATA_DIR.exists():
        for f in sorted(DATA_DIR.glob("cms_cost_sharing_*.json")):
            try:
                year = int(f.stem.replace("cms_cost_sharing_", ""))
                years.append(year)
            except ValueError:
                continue
    return years


def get_moop_limits(year: int, moop_tier: str = "mandatory") -> dict | None:
    """
    Get MOOP limits for a given year and tier.

    Args:
        year: Contract year (e.g. 2026)
        moop_tier: One of 'lower', 'intermediate', 'mandatory'

    Returns:
        Dict with 'in_network' and 'combined_catastrophic' dollar limits,
        or None if data is unavailable.

    Example:
        >>> get_moop_limits(2026, "mandatory")
        {"in_network": 9250.0, "combined_catastrophic": 13900.0}
    """
    tier = _validate_tier(moop_tier)
    data = _load_year(year)
    if data is None:
        return None

    limits = data.get("moop_limits", {}).get(tier)
    if limits is None:
        logger.warning("No MOOP limits found for year %d, tier %s", year, tier)
    return limits


def get_all_moop_limits(year: int) -> dict | None:
    """
    Get MOOP limits for all tiers for a given year.

    Returns:
        Dict with keys 'lower', 'intermediate', 'mandatory', each containing
        'in_network' and 'combined_catastrophic'. Or None if unavailable.
    """
    data = _load_year(year)
    if data is None:
        return None
    return data.get("moop_limits")


def get_cost_sharing(
    year: int, service_category: str, moop_tier: str = "mandatory"
) -> dict | float | None:
    """
    Get cost sharing limits for a service category and MOOP tier.

    Args:
        year: Contract year (e.g. 2026)
        service_category: Service key (e.g. 'primary_care', 'inpatient_acute', 'snf')
        moop_tier: One of 'lower', 'intermediate', 'mandatory'

    Returns:
        - For simple services (primary_care, specialist, etc.): the copay limit as float
        - For inpatient services: dict with LOS-based limits (e.g. {'3_day': 2230.0, ...})
        - For SNF: dict with 'days_1_20_per_day' and 'days_21_100_per_day'
        - None if not found

    Example:
        >>> get_cost_sharing(2026, "primary_care", "mandatory")
        40.0
        >>> get_cost_sharing(2026, "inpatient_acute", "mandatory")
        {"3_day": 2230.0, "6_day": 2445.0, "10_day": 2721.0, "60_day": 6171.0}
    """
    tier = _validate_tier(moop_tier)
    data = _load_year(year)
    if data is None:
        return None

    service_data = data.get("cost_sharing", {}).get(service_category)
    if service_data is None:
        logger.warning(
            "No cost sharing data for service '%s' in year %d", service_category, year
        )
        return None

    # SNF has a unique structure: days_1_20_per_day (per tier) + days_21_100_per_day (all tiers)
    if service_category == "snf":
        result = {}
        days_1_20 = service_data.get("days_1_20_per_day", {})
        if isinstance(days_1_20, dict) and tier in days_1_20:
            result["days_1_20_per_day"] = days_1_20[tier]
        days_21_100 = service_data.get("days_21_100_per_day")
        if days_21_100 is not None:
            result["days_21_100_per_day"] = days_21_100
        return result if result else None

    # Inpatient services have LOS-based limits nested under tier
    if service_category in ("inpatient_acute", "inpatient_psychiatric"):
        tier_data = service_data.get(tier)
        return tier_data

    # Standard copay services: {lower: X, intermediate: Y, mandatory: Z}
    if tier in service_data:
        return service_data[tier]

    # Some services have the same limit for all tiers
    if "all_tiers" in service_data:
        return service_data["all_tiers"]

    return None


def get_service_categories(year: int) -> list[str]:
    """Return list of available service category keys for a given year."""
    data = _load_year(year)
    if data is None:
        return []
    return sorted(data.get("cost_sharing", {}).keys())


def estimate_member_liability(
    year: int,
    moop_tier: str = "mandatory",
    service_category: str = "primary_care",
    los_days: int = 1,
) -> float | None:
    """
    Estimate member out-of-pocket liability for a service.

    For inpatient services, uses the appropriate LOS tier.
    For SNF, calculates based on actual days.
    For outpatient/office visits, returns the per-visit copay limit.

    Args:
        year: Contract year
        moop_tier: MOOP tier ('lower', 'intermediate', 'mandatory')
        service_category: Service category key
        los_days: Length of stay in days (relevant for inpatient and SNF)

    Returns:
        Estimated member liability in dollars, or None if data unavailable.
    """
    tier = _validate_tier(moop_tier)
    cost_data = get_cost_sharing(year, service_category, tier)
    if cost_data is None:
        return None

    # SNF: calculate based on days
    if service_category == "snf":
        if not isinstance(cost_data, dict):
            return None
        total = 0.0
        per_day_1_20 = cost_data.get("days_1_20_per_day", 0)
        per_day_21_100 = cost_data.get("days_21_100_per_day", 0)

        # Days 1-20
        days_in_first_tier = min(los_days, 20)
        total += days_in_first_tier * per_day_1_20

        # Days 21-100
        if los_days > 20:
            days_in_second_tier = min(los_days - 20, 80)
            total += days_in_second_tier * per_day_21_100

        return total

    # Inpatient acute: pick the nearest LOS bracket
    if service_category == "inpatient_acute":
        if not isinstance(cost_data, dict):
            return None
        # LOS brackets: 3, 6, 10, 60 days
        if los_days <= 3:
            return cost_data.get("3_day")
        elif los_days <= 6:
            return cost_data.get("6_day")
        elif los_days <= 10:
            return cost_data.get("10_day")
        else:
            return cost_data.get("60_day")

    # Inpatient psychiatric: pick the nearest LOS bracket
    if service_category == "inpatient_psychiatric":
        if not isinstance(cost_data, dict):
            return None
        # LOS brackets: 8, 15, 60 days
        if los_days <= 8:
            return cost_data.get("8_day")
        elif los_days <= 15:
            return cost_data.get("15_day")
        else:
            return cost_data.get("60_day")

    # Standard copay services: per-visit amount
    if isinstance(cost_data, (int, float)):
        return float(cost_data) * los_days

    return None


def check_cost_sharing_compliance(
    year: int,
    moop_tier: str = "mandatory",
    service_category: str = "primary_care",
    plan_copay: float = 0.0,
) -> dict:
    """
    Check whether a plan's copay for a service exceeds CMS limits.

    Args:
        year: Contract year
        moop_tier: MOOP tier
        service_category: Service category key
        plan_copay: The plan's copay amount for the service

    Returns:
        Dict with:
            - compliant: bool
            - cms_limit: float or dict (the CMS maximum)
            - plan_copay: float (what was submitted)
            - excess: float (amount over limit, 0 if compliant)
            - message: str (human-readable explanation)
    """
    tier = _validate_tier(moop_tier)
    cost_data = get_cost_sharing(year, service_category, tier)

    if cost_data is None:
        return {
            "compliant": None,
            "cms_limit": None,
            "plan_copay": plan_copay,
            "excess": 0,
            "message": f"No CMS cost sharing data available for {service_category} in CY {year}, tier {tier}.",
        }

    # For inpatient and SNF, compliance is more complex (LOS-dependent)
    if isinstance(cost_data, dict):
        # Return the limit structure with a note
        return {
            "compliant": None,
            "cms_limit": cost_data,
            "plan_copay": plan_copay,
            "excess": 0,
            "message": (
                f"CMS limits for {service_category} are LOS-dependent. "
                f"Limits by LOS: {cost_data}. "
                f"Use estimate_member_liability() for specific LOS comparisons."
            ),
        }

    # Simple copay comparison
    cms_limit = float(cost_data)
    is_compliant = plan_copay <= cms_limit
    excess = max(0, plan_copay - cms_limit)

    if is_compliant:
        message = (
            f"Plan copay ${plan_copay:.2f} is within CMS {tier} MOOP limit "
            f"of ${cms_limit:.2f} for {service_category} (CY {year})."
        )
    else:
        message = (
            f"EXCEEDS LIMIT: Plan copay ${plan_copay:.2f} exceeds CMS {tier} MOOP limit "
            f"of ${cms_limit:.2f} for {service_category} (CY {year}) by ${excess:.2f}."
        )

    return {
        "compliant": is_compliant,
        "cms_limit": cms_limit,
        "plan_copay": plan_copay,
        "excess": excess,
        "message": message,
    }


def get_cost_sharing_summary(year: int, moop_tier: str = "mandatory") -> dict | None:
    """
    Get a summary of all cost sharing limits for a MOOP tier.
    Useful for displaying a plan comparison table.

    Returns:
        Dict mapping service_category -> limit value(s), or None if unavailable.
    """
    tier = _validate_tier(moop_tier)
    data = _load_year(year)
    if data is None:
        return None

    summary = {}
    for category, service_data in data.get("cost_sharing", {}).items():
        limit = get_cost_sharing(year, category, tier)
        if limit is not None:
            summary[category] = limit

    return summary
