"""
Onboarding service — data requirements checklist with payer-specific guidance.

Checks which data types have been loaded into the platform and provides
payer-specific tips on where to find each data type. Powers the onboarding
dashboard that guides MSOs through initial data loading.
"""

from datetime import date, timedelta
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Data Requirements Registry
# ---------------------------------------------------------------------------

DATA_REQUIREMENTS: list[dict] = [
    {
        "key": "member_roster",
        "name": "Member Roster",
        "priority": "required",
        "description": "Active member list with demographics, plan assignment, and PCP attribution. This is the foundation — nothing works without knowing who your members are.",
        "where_to_find": "Health plan portal → Reports → Member Roster or Attributed Member File. Usually available as monthly CSV/Excel.",
        "unlocks": ["population_dashboard", "risk_stratification", "care_gaps", "member_360"],
        "check_table": "members",
        "check_min_rows": 1,
    },
    {
        "key": "medical_claims",
        "name": "Medical Claims",
        "priority": "required",
        "description": "Professional (837P) and institutional (837I) claims with diagnosis codes, procedure codes, dates of service, and paid amounts.",
        "where_to_find": "Health plan portal → Claims → Claims Extract or Encounter Data. Request at least 24 months for meaningful trending.",
        "unlocks": ["hcc_suspects", "cost_analysis", "utilization_patterns", "provider_scorecards"],
        "check_table": "claims",
        "check_filter": "claim_type IN ('professional', 'institutional')",
        "check_min_rows": 1,
    },
    {
        "key": "provider_roster",
        "name": "Provider Roster",
        "priority": "required",
        "description": "List of providers in your network with NPI, specialty, and office/group affiliation. Needed for attribution and scorecards.",
        "where_to_find": "Your internal credentialing system, or health plan portal → Provider Directory. Match NPIs to your practice groups.",
        "unlocks": ["provider_scorecards", "attribution", "org_structure", "panel_management"],
        "check_table": "providers",
        "check_min_rows": 1,
    },
    {
        "key": "eligibility",
        "name": "Eligibility / Enrollment",
        "priority": "recommended",
        "description": "Monthly eligibility snapshots showing which members were active each month. Critical for accurate PMPM calculations and identifying coverage gaps.",
        "where_to_find": "Health plan portal → Eligibility → Monthly Roster or 834 Enrollment File. Often bundled with member roster.",
        "unlocks": ["accurate_pmpm", "coverage_gap_detection", "mlr_calculation"],
        "check_table": "members",
        "check_field": "coverage_start",
        "check_min_rows": 1,
    },
    {
        "key": "pharmacy_claims",
        "name": "Pharmacy Claims (Rx)",
        "priority": "recommended",
        "description": "Prescription drug claims with NDC codes, fill dates, days supply, and costs. Enables medication adherence measures and Rx cost analysis.",
        "where_to_find": "Health plan portal → Pharmacy → Rx Claims Extract. For MAPD plans, may be a separate PBM portal (e.g., OptumRx, CVS Caremark).",
        "unlocks": ["medication_adherence", "pdc_measures", "pharmacy_cost_analysis", "polypharmacy_alerts"],
        "check_table": "claims",
        "check_filter": "claim_type = 'pharmacy'",
        "check_min_rows": 1,
    },
    {
        "key": "prior_year_hcc",
        "name": "Prior Year HCC Scores",
        "priority": "recommended",
        "description": "CMS risk adjustment factor (RAF) scores and confirmed HCC codes from the prior payment year. Needed for recapture suspect generation.",
        "where_to_find": "Health plan portal → Risk Adjustment → RAF Score Report or HCC Profile. CMS releases final RAF scores in August for the prior year.",
        "unlocks": ["hcc_recapture", "raf_trending", "revenue_forecasting"],
        "check_table": "hcc_suspects",
        "check_filter": "suspect_type = 'recapture'",
        "check_min_rows": 1,
    },
    {
        "key": "capitation",
        "name": "Capitation Payments",
        "priority": "enhances",
        "description": "Monthly capitation and sub-capitation payment records. Enables financial reconciliation, MLR tracking, and risk pool settlement analysis.",
        "where_to_find": "Health plan portal → Finance → Capitation Statement or Remittance Report. Usually monthly PDF + CSV.",
        "unlocks": ["financial_reconciliation", "mlr_tracking", "risk_pool_analysis", "subcap_management"],
        "check_table": "capitation_payments",
        "check_min_rows": 1,
    },
    {
        "key": "adt_config",
        "name": "ADT Notifications",
        "priority": "enhances",
        "description": "Real-time Admit/Discharge/Transfer notifications from hospitals. Enables care transition management, TCM billing, and readmission prevention.",
        "where_to_find": "Sign up with Bamboo Health (formerly PatientPing) or Availity ADT. Your health plan may offer ADT feeds directly.",
        "unlocks": ["care_alerts", "tcm_tracking", "readmission_prevention", "er_diversion"],
        "check_table": "adt_sources",
        "check_min_rows": 1,
    },
    {
        "key": "historical_claims",
        "name": "Historical Claims (24+ months)",
        "priority": "enhances",
        "description": "Claims data going back 24+ months enables trending, seasonality analysis, and more accurate predictive models.",
        "where_to_find": "Same source as medical claims — request extended date range. Some plans provide a one-time historical backfill file.",
        "unlocks": ["cost_trending", "seasonality_analysis", "predictive_models", "year_over_year_comparison"],
        "check_table": "claims",
        "check_min_months": 18,
        "check_date_field": "service_date",
    },
    {
        "key": "lab_results",
        "name": "Lab Results",
        "priority": "enhances",
        "description": "Clinical lab results (A1C, LDL, eGFR, etc.) for quality measure closure and clinical risk identification. Complements claims-only view.",
        "where_to_find": "Quest/LabCorp portal, or your EHR's lab interface. Some health plans include lab results in supplemental data feeds.",
        "unlocks": ["quality_measure_closure", "clinical_risk_flags", "condition_monitoring", "gaps_in_care"],
        "check_table": "claims",
        "check_filter": "service_category = 'lab'",
        "check_min_rows": 1,
    },
]


# ---------------------------------------------------------------------------
# Payer Guidance
# ---------------------------------------------------------------------------

PAYER_GUIDANCE: dict[str, dict[str, str]] = {
    "Humana": {
        "claims": (
            "Humana Provider Portal → Reports → Claims Activity Detail. "
            "Request 'Encounter Data Extract' for the full claims feed. "
            "MA claims include HICN/MBI — use MBI for member matching."
        ),
        "pharmacy": (
            "Humana Pharmacy portal (separate from medical). "
            "Go to Reports → Rx Claims. MAPD Rx data may lag 30-45 days. "
            "NDC codes included; map to GPI for therapeutic class analysis."
        ),
        "eligibility": (
            "Humana Provider Portal → Membership → Monthly Roster File. "
            "Available by the 5th of each month. Includes PCP attribution. "
            "Watch for retro-eligibility changes — reconcile monthly."
        ),
        "capitation": (
            "Humana Provider Portal → Finance → Capitation Reconciliation Report. "
            "Monthly PDF + downloadable CSV. Includes sub-cap breakdowns. "
            "Risk pool settlements are quarterly — check Finance → Settlements."
        ),
        "hcc": (
            "Humana Provider Portal → Risk Adjustment → HCC Gap Report. "
            "Updated quarterly. Shows suspected HCCs from prior year not yet recaptured. "
            "Also check the Humana Clinical Decision Support tool for real-time suspects."
        ),
    },
    "UHC": {
        "claims": (
            "UHC/Optum Provider Portal → Link → Claims & Encounters. "
            "Request the 'Expanded Claims Extract' which includes all service categories. "
            "UHC uses Optum IDs internally — map via MBI crosswalk."
        ),
        "pharmacy": (
            "OptumRx portal (separate credentials from UHC medical). "
            "Reports → Pharmacy Claims. Includes NDC, GPI, DAW codes. "
            "For MAPD, Rx claims are in OptumRx, not the main UHC portal."
        ),
        "eligibility": (
            "UHC Provider Portal → My Patients → Roster. "
            "Can filter by product (MA, MAPD, DSNP). Monthly file available for download. "
            "UHC provides attribution changes mid-month — check for mid-cycle updates."
        ),
        "capitation": (
            "UHC Provider Portal → Payments → Capitation Summary. "
            "Monthly capitation and sub-cap details. "
            "Risk pool settlements are semi-annual — check Payments → Risk Sharing."
        ),
        "hcc": (
            "UHC/Optum Risk Adjustment Portal → Suspect Opportunities. "
            "Updated monthly with gap closures reflected. "
            "Optum provides RAF impact estimates alongside each suspect — useful for prioritization."
        ),
    },
    "Aetna": {
        "claims": (
            "Aetna Provider Portal → Reports → Claims Summary. "
            "Request 'Medicare Advantage Claims Extract'. "
            "Aetna (CVS Health) may also provide data via Availity."
        ),
        "pharmacy": (
            "CVS Caremark portal for pharmacy claims (Aetna MAPD uses CVS as PBM). "
            "Reports → Drug Claims Activity. Includes specialty pharmacy. "
            "Cross-reference with Aetna medical claims for drug-condition alignment."
        ),
        "eligibility": (
            "Aetna Provider Portal → Membership → Enrollment Roster. "
            "Monthly file with effective/term dates. "
            "Aetna sends 834 transactions for real-time enrollment changes if configured."
        ),
        "capitation": (
            "Aetna Provider Portal → Finance → Payment Reconciliation. "
            "Capitation statements posted monthly. "
            "Risk corridor and stop-loss settlements handled separately — check Finance → Settlements."
        ),
        "hcc": (
            "Aetna Provider Portal → Risk Adjustment → HCC Opportunity Report. "
            "Quarterly refresh. Includes both recapture and net-new suspects. "
            "Aetna provides an Impactability Score — use to prioritize outreach."
        ),
    },
}


# ---------------------------------------------------------------------------
# Status Checks
# ---------------------------------------------------------------------------

async def get_data_requirements_status(db: AsyncSession) -> list[dict]:
    """Check each data requirement against the current DB state.

    Uses savepoints (begin_nested) for EACH table check to prevent
    PostgreSQL transaction poisoning when a table doesn't exist yet.
    If a query fails (e.g., table missing), the savepoint rolls back
    and the requirement is marked as not loaded.
    """
    results = []

    for req in DATA_REQUIREMENTS:
        status = {
            "key": req["key"],
            "name": req["name"],
            "priority": req["priority"],
            "description": req["description"],
            "where_to_find": req["where_to_find"],
            "unlocks": req["unlocks"],
            "loaded": False,
            "row_count": 0,
            "detail": None,
        }

        try:
            # Use a savepoint so a failed query doesn't poison the transaction
            async with db.begin_nested():
                if req.get("check_min_months"):
                    # Check date span in months
                    date_field = req.get("check_date_field", "service_date")
                    table = req["check_table"]
                    query = text(
                        f"SELECT MIN({date_field}), MAX({date_field}), COUNT(*) "
                        f"FROM {table}"
                    )
                    result = await db.execute(query)
                    row = result.one()
                    min_date, max_date, count = row[0], row[1], row[2] or 0
                    status["row_count"] = count

                    if min_date and max_date:
                        months_span = (
                            (max_date.year - min_date.year) * 12
                            + (max_date.month - min_date.month)
                            + 1
                        )
                        status["loaded"] = months_span >= req["check_min_months"]
                        status["detail"] = (
                            f"{months_span} months of data "
                            f"({min_date.isoformat()} to {max_date.isoformat()})"
                        )
                    else:
                        status["detail"] = "No date range found"

                elif req.get("check_field"):
                    # Check that a specific field is populated
                    table = req["check_table"]
                    field = req["check_field"]
                    min_rows = req.get("check_min_rows", 1)
                    query = text(
                        f"SELECT COUNT(*) FROM {table} "
                        f"WHERE {field} IS NOT NULL"
                    )
                    result = await db.execute(query)
                    count = result.scalar() or 0
                    status["row_count"] = count
                    status["loaded"] = count >= min_rows
                    if count > 0:
                        status["detail"] = f"{count:,} records with {field} populated"

                elif req.get("check_filter"):
                    # Check with a WHERE filter
                    table = req["check_table"]
                    where = req["check_filter"]
                    min_rows = req.get("check_min_rows", 1)
                    query = text(
                        f"SELECT COUNT(*) FROM {table} WHERE {where}"
                    )
                    result = await db.execute(query)
                    count = result.scalar() or 0
                    status["row_count"] = count
                    status["loaded"] = count >= min_rows
                    if count > 0:
                        status["detail"] = f"{count:,} matching records"

                else:
                    # Simple row count check
                    table = req["check_table"]
                    min_rows = req.get("check_min_rows", 1)
                    query = text(f"SELECT COUNT(*) FROM {table}")
                    result = await db.execute(query)
                    count = result.scalar() or 0
                    status["row_count"] = count
                    status["loaded"] = count >= min_rows
                    if count > 0:
                        status["detail"] = f"{count:,} records loaded"

        except Exception:
            # Table doesn't exist or query failed — requirement not met.
            # The savepoint rollback already happened via begin_nested context.
            status["loaded"] = False
            status["detail"] = "Table not yet created"

        results.append(status)

    return results


# ---------------------------------------------------------------------------
# Onboarding Progress
# ---------------------------------------------------------------------------

async def get_onboarding_progress(
    db: AsyncSession, tenant_config: dict | None = None
) -> dict:
    """Calculate overall onboarding progress as a percentage with breakdown.

    Weights: required = 3, recommended = 2, enhances = 1.
    Returns overall percentage plus per-category breakdown.
    """
    statuses = await get_data_requirements_status(db)

    weights = {"required": 3, "recommended": 2, "enhances": 1}
    total_weight = 0
    earned_weight = 0

    categories: dict[str, dict] = {
        "required": {"total": 0, "loaded": 0, "items": []},
        "recommended": {"total": 0, "loaded": 0, "items": []},
        "enhances": {"total": 0, "loaded": 0, "items": []},
    }

    for s in statuses:
        priority = s["priority"]
        w = weights.get(priority, 1)
        total_weight += w
        categories[priority]["total"] += 1
        categories[priority]["items"].append(s["key"])

        if s["loaded"]:
            earned_weight += w
            categories[priority]["loaded"] += 1

    overall_pct = round(earned_weight / total_weight * 100) if total_weight > 0 else 0

    # Determine current phase / next steps
    required_done = all(s["loaded"] for s in statuses if s["priority"] == "required")
    recommended_done = all(s["loaded"] for s in statuses if s["priority"] == "recommended")

    if not required_done:
        phase = "getting_started"
        next_step = "Upload the required data files: member roster, medical claims, and provider roster."
    elif not recommended_done:
        phase = "core_complete"
        next_step = "Core data loaded! Add eligibility, pharmacy claims, and prior-year HCC scores to unlock more insights."
    else:
        phase = "fully_operational"
        next_step = "All key data loaded. Consider adding capitation, ADT, historical claims, or lab results for maximum value."

    # Check tenant config for payer info
    payer = None
    if tenant_config:
        payer = tenant_config.get("primary_payer") or tenant_config.get("payer")

    return {
        "overall_pct": overall_pct,
        "phase": phase,
        "next_step": next_step,
        "payer_detected": payer,
        "categories": categories,
        "requirements": statuses,
    }


# ---------------------------------------------------------------------------
# Payer Guidance
# ---------------------------------------------------------------------------

def get_payer_guidance(payer: str | None, data_type: str | None = None) -> str | dict:
    """Return payer-specific guidance for finding data.

    Args:
        payer: Payer name (e.g., "Humana", "UHC", "Aetna"). Case-insensitive.
        data_type: Optional specific data type (e.g., "claims", "pharmacy").
                   If None, returns all guidance for that payer.

    Returns:
        A guidance string if data_type is specified, or a dict of all
        guidance for the payer. Returns a generic message if payer is unknown.
    """
    if not payer:
        return "No payer specified. Upload your data and we'll try to auto-detect the payer from file contents."

    # Normalize payer name
    payer_upper = payer.strip().upper()
    payer_key = None
    for known in PAYER_GUIDANCE:
        if known.upper() == payer_upper or known.upper() in payer_upper:
            payer_key = known
            break

    if not payer_key:
        return (
            f"We don't have specific guidance for '{payer}' yet. "
            "General tips: check your health plan's provider portal under Reports or Data Extracts. "
            "Most plans offer CSV/Excel downloads of claims, eligibility, and risk adjustment data."
        )

    guidance = PAYER_GUIDANCE[payer_key]

    if data_type:
        dt_lower = data_type.strip().lower()
        # Map common aliases
        aliases = {
            "medical_claims": "claims",
            "pharmacy_claims": "pharmacy",
            "rx": "pharmacy",
            "enrollment": "eligibility",
            "member_roster": "eligibility",
            "prior_year_hcc": "hcc",
            "hcc": "hcc",
            "raf": "hcc",
            "capitation": "capitation",
            "cap": "capitation",
        }
        dt_key = aliases.get(dt_lower, dt_lower)
        return guidance.get(dt_key, f"No specific {data_type} guidance available for {payer_key}.")

    return guidance
