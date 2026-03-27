"""Shared constants used across multiple services."""

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
