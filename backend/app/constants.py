"""Shared constants used across multiple services."""

# CMS Medicare Advantage base rate — used for RAF-to-dollar conversions.
# This is the single source of truth. All services must import from here.
# Approximate MA capitation rate per member per month.
CMS_PMPM_BASE = 1100.0
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
