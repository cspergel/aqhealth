"""Shared constants used across multiple services."""

# ---------------------------------------------------------------------------
# CMS Medicare Advantage base rate — RAF-to-dollar conversion
# ---------------------------------------------------------------------------
# THIS IS A DEFAULT ESTIMATE. In production, the actual rate should be:
#   - Configured per tenant (each MSO has different plan contracts)
#   - Configured per plan (Humana, Aetna, UHC pay different rates)
#   - Updated annually (CMS publishes new rates each April)
#   - Specific to county/region (CMS benchmarks vary by geography)
#
# The platform should eventually read this from Tenant.config or a
# plan_contracts table. For now, this serves as a reasonable national
# average estimate for Medicare Advantage.
#
# Source: CMS MA Rate Announcement, approximate national average ~$1,100 PMPM
# at 1.0 RAF for 2025-2026. Actual rates range from ~$800-$1,500+ by county.
# ---------------------------------------------------------------------------
CMS_PMPM_BASE = 1100.0  # DEFAULT — override per tenant/plan in production
CMS_ANNUAL_BASE = CMS_PMPM_BASE * 12  # $13,200 per 1.0 RAF per year

# PMPM benchmarks by service category (dollars per member per month).
# Used by insight_service and discovery_service for variance calculations.
PMPM_BENCHMARKS = {
    "inpatient": 450,
    "ed_observation": 85,
    "professional": 200,
    "snf_postacute": 120,
    "pharmacy": 350,
    "home_health": 60,
    "dme": 40,
    "other": 50,
}

# ---------------------------------------------------------------------------
# Expenditure drill-down benchmarks (per-unit cost & utilization thresholds)
# ---------------------------------------------------------------------------
# These are approximate MA industry benchmarks used for KPI status indicators
# in the expenditure drill-down views. Override per tenant in production.
EXPENDITURE_BENCHMARKS = {
    "inpatient_admits_per_1k": 72.0,
    "inpatient_cost_per_admit": 12_800,
    "ed_visits_per_1k": 310.0,
    "ed_cost_per_visit": 1_280,
    "professional_pmpm": 195,
    "professional_cost_per_visit": 198,
    "snf_cost_per_episode": 5_800,
    "pharmacy_pmpm": 175,
}

# ---------------------------------------------------------------------------
# RAF risk-tier thresholds
# ---------------------------------------------------------------------------
# Used by hcc_engine._determine_risk_tier and awv_service priority scoring.
# These define the RAF score breakpoints for risk stratification.
RAF_TIER_THRESHOLDS = {
    "complex": 3.0,    # RAF >= 3.0 → complex
    "high": 1.5,       # RAF >= 1.5 → high
    "rising": 0.8,     # RAF >= 0.8 → rising
    # Below 0.8 → low
}

# ---------------------------------------------------------------------------
# Discovery thresholds
# ---------------------------------------------------------------------------
# Minimum PMPM gap ($) between providers to flag as a comparative finding.
PROVIDER_PMPM_GAP_THRESHOLD = 200
