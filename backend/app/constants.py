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
