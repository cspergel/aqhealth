"""
HCC Suspect Detection Engine.

Core business logic for identifying revenue optimization opportunities:
- Recapture gaps (prior-year HCCs not yet coded in current year)
- Historical drop-offs (HCCs coded 2+ years ago, absent recently)
- Med-Dx gaps (medications without matching diagnoses)
- Specificity upgrades (unspecified codes upgradeable to HCC-mapped codes)
- Near-miss disease interactions (2 of 3 required HCCs present)

Works with the SNF Admit Assist microservice when available, and falls back
to local heuristic logic when the service is unreachable.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func as sa_func

from app.models.claim import Claim, ClaimType
from app.models.hcc import HccSuspect, RafHistory, SuspectStatus, SuspectType
from app.models.learning import SuspectOutcomeLearn
from app.models.member import Member, RiskTier
from app.services.snf_client import SNFClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Load REAL HCC reference data from SNF Admit Assist's CMS V28 mappings
# ---------------------------------------------------------------------------

import json
import os

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")

def _load_hcc_mappings() -> dict:
    """Load the full ICD-10 → HCC mapping from hcc_mappings.json (7,793 codes)."""
    path = os.path.join(_DATA_DIR, "hcc_mappings.json")
    if not os.path.exists(path):
        logger.warning("hcc_mappings.json not found at %s — using empty lookup", path)
        return {}
    with open(path) as f:
        data = json.load(f)
    return data.get("codes_by_icd10", {})

def _load_hcc_raf_lookup() -> dict[int, Decimal]:
    """Build HCC code → RAF weight lookup from the real mappings."""
    codes = _load_hcc_mappings()
    raf_by_hcc: dict[int, Decimal] = {}
    for _icd, entry in codes.items():
        hcc = entry.get("hcc")
        raf = entry.get("raf")
        if hcc is not None and raf is not None:
            raf_by_hcc[int(hcc)] = Decimal(str(raf))
    return raf_by_hcc

# Loaded once at module import — 115 unique HCCs with real CMS V28 RAF weights
HCC_MAPPINGS = _load_hcc_mappings()
HCC_RAF_LOOKUP = _load_hcc_raf_lookup()

# Pre-computed stripped (dot-removed) lookup to avoid O(n) scan in lookup_hcc_for_icd10
_HCC_MAPPINGS_STRIPPED: dict[str, dict] = {k.replace(".", ""): v for k, v in HCC_MAPPINGS.items()}

logger.info("Loaded %d ICD-10→HCC mappings, %d unique HCC RAF weights", len(HCC_MAPPINGS), len(HCC_RAF_LOOKUP))


def lookup_hcc_for_icd10(icd10_code: str) -> dict | None:
    """Look up HCC code and RAF weight for an ICD-10 code using real CMS V28 data.

    Tries dotted format first (E11.65), then without dot (E1165).
    Returns: {hcc: int, raf: float, description: str, disease_group: str} or None.
    """
    # Try as-is (dotted)
    entry = HCC_MAPPINGS.get(icd10_code)
    if entry:
        return entry
    # Try with dot inserted (if code is > 3 chars and has no dot)
    if "." not in icd10_code and len(icd10_code) > 3:
        dotted = icd10_code[:3] + "." + icd10_code[3:]
        entry = HCC_MAPPINGS.get(dotted)
        if entry:
            return entry
    # Try without dot using pre-computed stripped lookup (O(1) instead of O(n))
    stripped = icd10_code.replace(".", "")
    return _HCC_MAPPINGS_STRIPPED.get(stripped)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# CMS average per-member-per-month base rate (approximate, for dollar impact)
from app.constants import CMS_PMPM_BASE as _CMS_BASE, RAF_TIER_THRESHOLDS
CMS_PMPM_BASE = Decimal(str(_CMS_BASE))
ANNUAL_MULTIPLIER = Decimal("12")

# Current payment year — computed at call time so long-running processes
# pick up the correct year after midnight on January 1st.
def get_current_payment_year() -> int:
    return date.today().year

# ---------------------------------------------------------------------------
# Local fallback: Common medication-to-diagnosis mappings
# Used when SNF Admit Assist is unreachable.
# (medication_keyword, diagnosis_description, icd10, hcc_code, hcc_label, raf)
# ---------------------------------------------------------------------------

MED_DX_MAPPINGS: list[tuple[str, str, str, int, str, Decimal]] = [
    ("metformin", "Type 2 diabetes mellitus", "E11.9", 37, "Diabetes without Complication", Decimal("0.166")),
    ("insulin", "Type 2 diabetes with complications", "E11.65", 37, "Diabetes with Complications", Decimal("0.166")),
    ("glipizide", "Type 2 diabetes mellitus", "E11.9", 37, "Diabetes without Complication", Decimal("0.166")),
    ("semaglutide", "Type 2 diabetes mellitus", "E11.9", 37, "Diabetes without Complication", Decimal("0.166")),
    ("lisinopril", "Essential hypertension", "I10", 0, "Hypertension (non-HCC)", Decimal("0.000")),
    ("amlodipine", "Essential hypertension", "I10", 0, "Hypertension (non-HCC)", Decimal("0.000")),
    ("losartan", "Essential hypertension", "I10", 0, "Hypertension (non-HCC)", Decimal("0.000")),
    ("atorvastatin", "Hyperlipidemia", "E78.5", 0, "Hyperlipidemia (non-HCC)", Decimal("0.000")),
    ("rosuvastatin", "Hyperlipidemia", "E78.5", 0, "Hyperlipidemia (non-HCC)", Decimal("0.000")),
    ("warfarin", "Atrial fibrillation", "I48.91", 238, "Specified Heart Arrhythmias", Decimal("0.299")),
    ("apixaban", "Atrial fibrillation", "I48.91", 238, "Specified Heart Arrhythmias", Decimal("0.299")),
    ("rivaroxaban", "Atrial fibrillation", "I48.91", 238, "Specified Heart Arrhythmias", Decimal("0.299")),
    ("albuterol", "Chronic obstructive pulmonary disease", "J44.1", 280, "COPD", Decimal("0.319")),
    ("tiotropium", "Chronic obstructive pulmonary disease", "J44.1", 280, "COPD", Decimal("0.319")),
    ("fluticasone", "Asthma", "J45.40", 0, "Asthma (non-HCC in V28)", Decimal("0.000")),
    ("montelukast", "Asthma", "J45.40", 0, "Asthma (non-HCC in V28)", Decimal("0.000")),
    ("furosemide", "Heart failure", "I50.9", 226, "Congestive Heart Failure", Decimal("0.360")),
    ("carvedilol", "Heart failure", "I50.9", 226, "Congestive Heart Failure", Decimal("0.360")),
    ("spironolactone", "Heart failure", "I50.9", 226, "Congestive Heart Failure", Decimal("0.360")),
    ("levothyroxine", "Hypothyroidism", "E03.9", 0, "Hypothyroidism (non-HCC)", Decimal("0.000")),
    ("sertraline", "Major depressive disorder", "F33.0", 155, "Major Depression, Moderate or Severe", Decimal("0.309")),
    ("escitalopram", "Major depressive disorder", "F33.0", 155, "Major Depression, Moderate or Severe", Decimal("0.309")),
    ("donepezil", "Alzheimer disease", "G30.9", 51, "Dementia Without Complication", Decimal("0.273")),
    ("memantine", "Alzheimer disease", "G30.9", 51, "Dementia Without Complication", Decimal("0.273")),
    ("levodopa", "Parkinson disease", "G20", 78, "Parkinson and Huntington Diseases", Decimal("0.606")),
    ("gabapentin", "Neuropathy", "G62.9", 75, "Polyneuropathy", Decimal("0.100")),
    ("pregabalin", "Neuropathy", "G62.9", 75, "Polyneuropathy", Decimal("0.100")),
    ("tacrolimus", "Transplant status", "Z94.0", 186, "Major Organ Transplant Status", Decimal("0.825")),
    ("mycophenolate", "Transplant status", "Z94.0", 186, "Major Organ Transplant Status", Decimal("0.825")),
    ("epoetin", "Chronic kidney disease stage 4", "N18.4", 327, "CKD Stage 4", Decimal("0.514")),
    ("clozapine", "Schizophrenia", "F20.9", 57, "Schizophrenia", Decimal("0.565")),
    ("lithium", "Bipolar disorder", "F31.9", 59, "Major Depressive and Bipolar Disorders", Decimal("0.309")),
    ("methotrexate", "Rheumatoid arthritis", "M06.9", 40, "Rheumatoid Arthritis and Specified Autoimmune Disorders", Decimal("0.311")),
]

# ---------------------------------------------------------------------------
# Local fallback: Common CMS-HCC V28 disease interaction groups
# Each interaction: (name, list of HCC-groups, bonus_raf)
# A near-miss = member has all-but-one group present.
# ---------------------------------------------------------------------------

DISEASE_INTERACTIONS: list[tuple[str, list[set[int]], Decimal]] = [
    ("Diabetes + CHF", [{37, 38}, {226}], Decimal("0.121")),
    ("Diabetes + CKD", [{37, 38}, {326, 327, 328, 329}], Decimal("0.102")),
    ("CHF + COPD", [{226}, {280}], Decimal("0.154")),
    ("CHF + CKD", [{226}, {326, 327, 328, 329}], Decimal("0.121")),
    ("COPD + CKD", [{280}, {326, 327, 328, 329}], Decimal("0.078")),
    ("CHF + Diabetes + CKD", [{226}, {37, 38}, {326, 327, 328, 329}], Decimal("0.190")),
    ("Stroke + Diabetes", [{100}, {37, 38}], Decimal("0.094")),
    ("Depression + Diabetes", [{155}, {37, 38}], Decimal("0.072")),
    ("Depression + CHF", [{155}, {226}], Decimal("0.087")),
    ("Dementia + Depression", [{51, 52}, {155}], Decimal("0.065")),
]

# ---------------------------------------------------------------------------
# HCC RAF values — loaded from REAL CMS V28 reference data (hcc_mappings.json)
# Falls back to a minimal hardcoded set if the file isn't available.
# ---------------------------------------------------------------------------

LOCAL_HCC_RAF: dict[int, Decimal] = HCC_RAF_LOOKUP if HCC_RAF_LOOKUP else {
    # Minimal fallback only used if hcc_mappings.json is missing
    38: Decimal("0.166"),   # Diabetes
    226: Decimal("0.360"),  # Heart Failure
    328: Decimal("0.127"),  # CKD Stage 3
    155: Decimal("0.299"),  # Depression
    280: Decimal("0.319"),  # COPD
    238: Decimal("0.299"),  # AFib
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _calculate_age(dob: date | None) -> int:
    if dob is None:
        return 0
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _determine_risk_tier(raf: float) -> RiskTier:
    if raf >= RAF_TIER_THRESHOLDS["complex"]:
        return RiskTier.complex
    elif raf >= RAF_TIER_THRESHOLDS["high"]:
        return RiskTier.high
    elif raf >= RAF_TIER_THRESHOLDS["rising"]:
        return RiskTier.rising
    return RiskTier.low


def _annual_dollar_value(raf_value: Decimal, county_pmpm: float | None = None) -> Decimal:
    """Convert a RAF increment to annual dollar value.

    If county_pmpm is provided (from county_rate_service), uses that instead
    of the national average CMS_PMPM_BASE.
    """
    base = Decimal(str(county_pmpm)) if county_pmpm else CMS_PMPM_BASE
    return (raf_value * base * ANNUAL_MULTIPLIER).quantize(Decimal("0.01"))


async def _get_member_claims(
    member_pk: int,
    db: AsyncSession,
    years_back: int = 3,
) -> list[Claim]:
    cutoff = date.today() - timedelta(days=365 * years_back)
    result = await db.execute(
        select(Claim)
        .where(Claim.member_id == member_pk, Claim.service_date >= cutoff)
        .order_by(Claim.service_date.desc())
    )
    return list(result.scalars().all())


def _extract_diagnosis_codes(claims: list[Claim]) -> set[str]:
    codes: set[str] = set()
    for c in claims:
        if c.diagnosis_codes:
            codes.update(c.diagnosis_codes)
    return codes


def _extract_current_year_codes(claims: list[Claim]) -> set[str]:
    codes: set[str] = set()
    year_start = date(get_current_payment_year(), 1, 1)
    for c in claims:
        if c.service_date and c.diagnosis_codes and c.service_date >= year_start:
            codes.update(c.diagnosis_codes)
    return codes


def _extract_medications(claims: list[Claim]) -> list[str]:
    meds: set[str] = set()
    for c in claims:
        if c.claim_type == ClaimType.pharmacy and c.drug_name:
            meds.add(c.drug_name.lower().strip())
    return sorted(meds)


def _codes_by_year(claims: list[Claim]) -> dict[int, set[str]]:
    result: dict[int, set[str]] = {}
    for c in claims:
        if c.service_date and c.diagnosis_codes:
            result.setdefault(c.service_date.year, set()).update(c.diagnosis_codes)
    return result


# ---------------------------------------------------------------------------
# Local fallback logic
# ---------------------------------------------------------------------------

def _local_med_dx_gaps(
    medications: list[str],
    diagnosis_codes: set[str],
) -> list[dict[str, Any]]:
    """Detect medication-diagnosis gaps using the local mapping table."""
    gaps: list[dict[str, Any]] = []
    dx_normalized = {c.upper().replace(".", "") for c in diagnosis_codes}

    for med_keyword, dx_desc, icd10, hcc, hcc_label, raf in MED_DX_MAPPINGS:
        matched_med = None
        for med in medications:
            if med_keyword in med:
                matched_med = med
                break
        if not matched_med:
            continue

        # Check if the expected diagnosis family is already coded
        family_prefix = icd10.upper().replace(".", "")[:3]
        already_coded = any(c.startswith(family_prefix) for c in dx_normalized)

        if not already_coded and hcc > 0:
            gaps.append({
                "medication": matched_med,
                "missing_diagnosis": dx_desc,
                "suggested_codes": [icd10],
                "hcc": hcc,
                "hcc_label": hcc_label,
                "raf": float(raf),
                "evidence": f"{matched_med.title()} prescribed without {dx_desc} diagnosis",
            })

    return gaps


def _local_raf_calculation(
    diagnosis_codes: set[str],
    hcc_list: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Disease-only RAF from local HCC table. No demographic component."""
    total = Decimal("0.000")
    details: list[dict[str, Any]] = []
    seen: set[int] = set()

    if hcc_list:
        for item in hcc_list:
            hcc = item.get("hcc", 0)
            if hcc and hcc not in seen:
                r = LOCAL_HCC_RAF.get(hcc, Decimal("0.100"))
                total += r
                seen.add(hcc)
                details.append({"hcc": hcc, "description": item.get("description", ""), "raf": float(r)})

    # Also resolve HCCs directly from diagnosis codes so the fallback
    # actually produces a non-zero RAF when SNF is down.
    for code in diagnosis_codes:
        entry = lookup_hcc_for_icd10(code)
        if entry and entry.get("hcc"):
            hcc = int(entry["hcc"])
            if hcc not in seen:
                r = Decimal(str(entry.get("raf", 0.1)))
                total += r
                seen.add(hcc)
                details.append({"hcc": hcc, "description": entry.get("description", ""), "raf": float(r)})

    return {
        "total_raf": float(total),
        "demographic_raf": 0.0,
        "disease_raf": float(total),
        "interaction_raf": 0.0,
        "hcc_list": details,
        "interactions": [],
        "near_misses": [],
    }


def _detect_near_miss_interactions(
    member_hccs: set[int],
) -> list[dict[str, Any]]:
    """
    Check for near-miss disease interactions.
    A near-miss means the member has all required HCC groups except one.
    """
    near_misses: list[dict[str, Any]] = []

    for name, hcc_groups, bonus_raf in DISEASE_INTERACTIONS:
        present_count = 0
        missing_group: set[int] | None = None

        for group in hcc_groups:
            if member_hccs & group:
                present_count += 1
            else:
                missing_group = group

        total_groups = len(hcc_groups)

        # Near miss = missing exactly one group
        if present_count == total_groups - 1 and missing_group is not None:
            missing_desc = ", ".join(f"HCC {h}" for h in sorted(missing_group))
            near_misses.append({
                "name": name,
                "potential_raf": float(bonus_raf),
                "missing": missing_desc,
                "missing_hccs": sorted(missing_group),
            })

    return near_misses


# ---------------------------------------------------------------------------
# Recapture gap detection
# ---------------------------------------------------------------------------

async def _detect_recapture_gaps(
    member_id: int,
    current_year_codes: set[str],
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """
    Find prior-year captured HCCs that have not been recaptured this year.
    """
    prior_year = get_current_payment_year() - 1
    result = await db.execute(
        select(HccSuspect).where(
            HccSuspect.member_id == member_id,
            HccSuspect.payment_year == prior_year,
            HccSuspect.status == SuspectStatus.captured.value,
        )
    )
    prior_suspects = result.scalars().all()

    gaps: list[dict[str, Any]] = []

    # Build set of current-year HCC codes for HCC-level comparison
    current_hccs: set[int] = set()
    for code in current_year_codes:
        entry = lookup_hcc_for_icd10(code)
        if entry and entry.get("hcc"):
            current_hccs.add(int(entry["hcc"]))

    for ps in prior_suspects:
        # Check recapture at HCC level, not ICD prefix
        recaptured = ps.hcc_code in current_hccs if ps.hcc_code else False

        if not recaptured:
            raf_val = ps.raf_value if ps.raf_value else Decimal("0.100")
            gaps.append({
                "suspect_type": SuspectType.recapture,
                "hcc_code": ps.hcc_code,
                "hcc_label": ps.hcc_label or "",
                "icd10_code": ps.icd10_code,
                "icd10_label": ps.icd10_label or "",
                "raf_value": raf_val,
                "confidence": 85,
                "evidence_summary": (
                    f"HCC {ps.hcc_code} was captured in {prior_year} "
                    f"but has not been recoded in {get_current_payment_year()} claims."
                ),
            })

    return gaps


# ---------------------------------------------------------------------------
# Historical drop-off detection
# ---------------------------------------------------------------------------

def _detect_historical_dropoffs(
    yearly_codes: dict[int, set[str]],
    current_year_codes: set[str],
) -> list[dict[str, Any]]:
    """
    Detect diagnosis code families present 2+ years ago but absent in recent
    claims. Catches chronic conditions that fell off coding.
    """
    current_year = get_current_payment_year()
    recent_years = {current_year, current_year - 1}
    historical_years = {y for y in yearly_codes if y < current_year - 1}

    if not historical_years:
        return []

    historical_codes: set[str] = set()
    for y in historical_years:
        historical_codes.update(yearly_codes.get(y, set()))

    recent_codes: set[str] = set(current_year_codes)
    for y in recent_years:
        recent_codes.update(yearly_codes.get(y, set()))

    # Build set of recent HCCs for HCC-level comparison (matches recapture logic)
    recent_hccs: set[int] = set()
    for code in recent_codes:
        entry = lookup_hcc_for_icd10(code)
        if entry and entry.get("hcc"):
            recent_hccs.add(int(entry["hcc"]))

    dropoffs: list[dict[str, Any]] = []
    seen_hccs: set[int] = set()

    for code in sorted(historical_codes):
        # Resolve actual HCC code; only create suspect if valid HCC found
        entry = lookup_hcc_for_icd10(code)
        if not entry or not entry.get("hcc"):
            continue
        hcc_code = int(entry["hcc"])

        if hcc_code in seen_hccs:
            continue

        # Check drop-off at HCC level: HCC present historically but absent recently
        if hcc_code not in recent_hccs:
            seen_hccs.add(hcc_code)
            hcc_label = entry.get("description", f"HCC {hcc_code}")
            raf_value = Decimal(str(entry.get("raf", 0.1)))

            dropoffs.append({
                "suspect_type": SuspectType.historical,
                "hcc_code": hcc_code,
                "hcc_label": hcc_label,
                "icd10_code": code,
                "icd10_label": f"Code {code} last seen in historical claims",
                "raf_value": raf_value,
                "confidence": 40,
                "evidence_summary": (
                    f"Diagnosis {code} (HCC {hcc_code}) was coded in prior years but has not "
                    f"appeared in {current_year - 1}-{current_year} claims. "
                    "May represent a chronic condition needing recapture."
                ),
            })

    return dropoffs


# ---------------------------------------------------------------------------
# Self-learning: suspect outcome feedback loop
# ---------------------------------------------------------------------------

async def learn_suspect_outcome(
    db: AsyncSession,
    suspect_id: int,
    outcome: str,
    reason: str | None = None,
) -> None:
    """Record the outcome of a suspect (captured/dismissed) for provider learning.

    Called from routers after a suspect status is updated. Logs the outcome
    with provider context so _get_provider_capture_patterns can adjust
    future confidence scores.
    """
    suspect = await db.get(HccSuspect, suspect_id)
    if not suspect:
        return

    # Determine the responsible provider via the member's PCP
    member = await db.get(Member, suspect.member_id)
    provider_id = member.pcp_provider_id if member else None

    db.add(SuspectOutcomeLearn(
        suspect_id=suspect_id,
        provider_id=provider_id,
        suspect_type=suspect.suspect_type or "",
        hcc_code=suspect.hcc_code,
        outcome=outcome,
        dismissed_reason=reason,
        original_confidence=suspect.confidence,
        outcome_date=date.today(),
    ))
    await db.flush()
    logger.info(
        "Learned suspect outcome: suspect=%d hcc=%d outcome=%s provider=%s",
        suspect_id, suspect.hcc_code, outcome, provider_id,
    )


async def _get_provider_capture_patterns(
    db: AsyncSession, provider_id: int
) -> dict[str, dict[str, Any]]:
    """Return capture vs dismiss rates by suspect_type for a provider.

    Returns: {suspect_type: {captured: N, dismissed: N, capture_rate: float, tier: str}}
    Tier thresholds:
      - 1-2 total: "silent" (no adjustment)
      - 3-4 total: "recommend" (informational)
      - 5+  total: "auto_adjust" (confidence boost/reduction)
    """
    result = await db.execute(
        select(
            SuspectOutcomeLearn.suspect_type,
            SuspectOutcomeLearn.outcome,
            sa_func.count(SuspectOutcomeLearn.id),
        )
        .where(SuspectOutcomeLearn.provider_id == provider_id)
        .group_by(SuspectOutcomeLearn.suspect_type, SuspectOutcomeLearn.outcome)
    )

    patterns: dict[str, dict[str, Any]] = {}
    for row in result.all():
        stype = row[0]
        outcome = row[1]
        count = int(row[2])

        if stype not in patterns:
            patterns[stype] = {"captured": 0, "dismissed": 0}
        if outcome == "captured":
            patterns[stype]["captured"] = count
        elif outcome == "dismissed":
            patterns[stype]["dismissed"] = count

    # Compute rates and tiers
    for stype, data in patterns.items():
        total = data["captured"] + data["dismissed"]
        data["capture_rate"] = data["captured"] / total if total > 0 else 0.0
        if total >= 5:
            data["tier"] = "auto_adjust"
        elif total >= 3:
            data["tier"] = "recommend"
        else:
            data["tier"] = "silent"

    return patterns


def _adjust_confidence_from_patterns(
    base_confidence: int,
    suspect_type: str,
    provider_patterns: dict[str, dict[str, Any]],
) -> int:
    """Adjust a suspect's confidence based on provider capture history.

    Only applies at the 'auto_adjust' tier (5+ outcomes):
      - capture_rate > 0.7 → boost by 10 points
      - capture_rate > 0.5 → boost by 5 points
      - capture_rate < 0.3 → reduce by 10 points
      - capture_rate < 0.5 → reduce by 5 points
    """
    pattern = provider_patterns.get(suspect_type)
    if not pattern or pattern.get("tier") != "auto_adjust":
        return base_confidence

    rate = pattern["capture_rate"]
    adjustment = 0
    if rate > 0.7:
        adjustment = 10
    elif rate > 0.5:
        adjustment = 5
    elif rate < 0.3:
        adjustment = -10
    elif rate < 0.5:
        adjustment = -5

    adjusted = max(1, min(99, base_confidence + adjustment))
    if adjustment != 0:
        logger.debug(
            "Confidence adjusted: %d → %d (suspect_type=%s, capture_rate=%.2f)",
            base_confidence, adjusted, suspect_type, rate,
        )
    return adjusted


# ---------------------------------------------------------------------------
# Main: analyse a single member
# ---------------------------------------------------------------------------

async def analyze_member(
    member_id: int,
    db: AsyncSession,
    snf_client: SNFClient,
) -> dict[str, Any]:
    """
    Run full HCC suspect analysis for a single member.

    Gathers claims, detects gaps, calculates RAF, creates/updates suspect
    records and RAF history snapshot, and updates the member's computed fields.

    Returns:
        {suspects_found, raf_current, raf_projected, uplift}
    """
    # ---- load member ----
    member = await db.get(Member, member_id)
    if not member:
        logger.warning("Member %d not found", member_id)
        return {"suspects_found": 0, "raf_current": 0.0, "raf_projected": 0.0, "uplift": 0.0}

    age = _calculate_age(member.date_of_birth)

    # ---- self-learning: load provider capture patterns ----
    provider_patterns: dict[str, dict[str, Any]] = {}
    if member.pcp_provider_id:
        try:
            provider_patterns = await _get_provider_capture_patterns(db, member.pcp_provider_id)
        except Exception:
            pass  # non-fatal — analysis proceeds without adjustments

    # ---- county-level PMPM rate (if available) ----
    _county_pmpm: float | None = None
    try:
        from app.services.county_rate_service import get_member_pmpm as _get_member_pmpm
        _county_pmpm_val = _get_member_pmpm(get_current_payment_year(), member)
        # Only use if it differs from the default (meaning county data was actually resolved)
        from app.constants import CMS_PMPM_BASE as _fallback
        if _county_pmpm_val != _fallback:
            _county_pmpm = _county_pmpm_val
    except Exception:
        pass  # county rate service not available — use default

    # ---- gather claims ----
    claims = await _get_member_claims(member_id, db)
    all_dx_codes = _extract_diagnosis_codes(claims)
    current_year_codes = _extract_current_year_codes(claims)
    medications = _extract_medications(claims)
    yearly_codes = _codes_by_year(claims)

    suspects: list[dict[str, Any]] = []

    # ---- SNF optimize: med-dx gaps, specificity, non-billable ----
    snf_available = True
    optimize_result = await snf_client.optimize_codes(
        diagnosis_codes=sorted(all_dx_codes),
        medications=medications or None,
    )

    if optimize_result is None:
        snf_available = False
        logger.info("SNF service unavailable; falling back to local logic for member %d", member_id)

        for gap in _local_med_dx_gaps(medications, all_dx_codes):
            suspects.append({
                "suspect_type": SuspectType.med_dx_gap,
                "hcc_code": gap["hcc"],
                "hcc_label": gap.get("hcc_label", ""),
                "icd10_code": gap["suggested_codes"][0] if gap["suggested_codes"] else None,
                "icd10_label": gap.get("missing_diagnosis", ""),
                "raf_value": Decimal(str(gap["raf"])),
                "confidence": 60,
                "evidence_summary": gap.get("evidence", ""),
            })
    else:
        # Specificity upgrades
        for opt in optimize_result.get("optimized_codes", []):
            suspects.append({
                "suspect_type": SuspectType.specificity,
                "hcc_code": opt.get("hcc", 0),
                "hcc_label": opt.get("description", ""),
                "icd10_code": opt.get("suggested_code"),
                "icd10_label": opt.get("description", ""),
                "raf_value": Decimal(str(opt.get("raf", 0))),
                "confidence": 75,
                "evidence_summary": opt.get("evidence", opt.get("reason", "")),
            })
        # Med-dx gaps from SNF — enrich with real HCC/RAF via lookup
        for gap in optimize_result.get("med_dx_gaps", []):
            suggested = gap.get("suggested_codes", [])
            icd10_code = suggested[0] if suggested else None
            hcc_code = 0
            hcc_label = ""
            raf_value = Decimal("0.100")
            if icd10_code:
                hcc_entry = lookup_hcc_for_icd10(icd10_code)
                if hcc_entry and hcc_entry.get("hcc"):
                    hcc_code = int(hcc_entry["hcc"])
                    hcc_label = hcc_entry.get("description", "")
                    raf_value = Decimal(str(hcc_entry.get("raf", 0.1)))
            suspects.append({
                "suspect_type": SuspectType.med_dx_gap,
                "hcc_code": hcc_code,
                "hcc_label": hcc_label,
                "icd10_code": icd10_code,
                "icd10_label": gap.get("missing_diagnosis", ""),
                "raf_value": raf_value,
                "confidence": 65,
                "evidence_summary": gap.get("evidence", ""),
            })
        # Non-billable fixes (only if HCC-relevant)
        for fix in optimize_result.get("non_billable_fixes", []):
            if fix.get("hcc"):
                suspects.append({
                    "suspect_type": SuspectType.new_suspect,
                    "hcc_code": fix.get("hcc", 0),
                    "hcc_label": fix.get("description", ""),
                    "icd10_code": fix.get("suggested_code"),
                    "icd10_label": fix.get("description", ""),
                    "raf_value": Decimal(str(fix.get("raf", 0))),
                    "confidence": 80,
                    "evidence_summary": (
                        f"Non-billable code fix: {fix.get('original_code')} "
                        f"-> {fix.get('suggested_code')}"
                    ),
                })

    # ---- recapture gaps (always local) ----
    suspects.extend(await _detect_recapture_gaps(member_id, current_year_codes, db))

    # ---- historical drop-offs (always local) ----
    suspects.extend(_detect_historical_dropoffs(yearly_codes, current_year_codes))

    # ---- RAF calculation ----
    raf_result: dict[str, Any]
    if snf_available:
        raf_result_or_none = await snf_client.calculate_raf(
            diagnosis_codes=sorted(current_year_codes),
            age=age,
            sex=member.gender or "M",
            medicaid=member.medicaid_status,
            disabled=member.disability_status,
            institutional=member.institutional,
        )
        if raf_result_or_none is None:
            snf_available = False
            raf_result = _local_raf_calculation(current_year_codes)
        else:
            raf_result = raf_result_or_none
    else:
        raf_result = _local_raf_calculation(current_year_codes)

    # ---- near-miss interactions ----
    member_hccs: set[int] = set()
    for item in raf_result.get("hcc_list", []):
        if item.get("hcc"):
            member_hccs.add(item["hcc"])
    for s in suspects:
        if s.get("hcc_code") and s["hcc_code"] > 0:
            member_hccs.add(s["hcc_code"])

    snf_near_misses = raf_result.get("near_misses", [])
    local_near_misses = _detect_near_miss_interactions(member_hccs)

    seen_interaction_names = {nm.get("name") for nm in snf_near_misses}
    all_near_misses = list(snf_near_misses)
    for nm in local_near_misses:
        if nm["name"] not in seen_interaction_names:
            all_near_misses.append(nm)

    for nm in all_near_misses:
        missing_hccs = nm.get("missing_hccs", [])
        representative_hcc = missing_hccs[0] if missing_hccs else 0
        if representative_hcc:
            suspects.append({
                "suspect_type": SuspectType.near_miss,
                "hcc_code": representative_hcc,
                "hcc_label": nm.get("missing", nm.get("name", "")),
                "icd10_code": None,
                "icd10_label": "",
                "raf_value": Decimal(str(nm.get("potential_raf", 0))),
                "confidence": 50,
                "evidence_summary": (
                    f"Near-miss interaction: {nm['name']}. "
                    f"Missing: {nm.get('missing', 'unknown')}. "
                    f"Potential RAF bonus: {nm.get('potential_raf', 0)}"
                ),
            })

    # ---- persist HccSuspect records ----
    today = date.today()
    suspects_created = 0

    for s in suspects:
        hcc_code = s.get("hcc_code", 0)
        if not hcc_code or hcc_code <= 0:
            continue

        # Deduplicate: check for existing open suspect with same key
        existing = await db.execute(
            select(HccSuspect).where(
                HccSuspect.member_id == member_id,
                HccSuspect.hcc_code == hcc_code,
                HccSuspect.suspect_type == s["suspect_type"],
                HccSuspect.payment_year == get_current_payment_year(),
                HccSuspect.status == SuspectStatus.open.value,
            )
        )
        existing_suspect = existing.scalars().first()

        raf_val = s.get("raf_value", Decimal("0"))
        annual_val = _annual_dollar_value(raf_val, county_pmpm=_county_pmpm)

        # Self-learning: adjust confidence based on provider capture history
        base_confidence = s.get("confidence", 50)
        suspect_type_str = s["suspect_type"] if isinstance(s["suspect_type"], str) else s["suspect_type"].value
        adjusted_confidence = _adjust_confidence_from_patterns(
            base_confidence, suspect_type_str, provider_patterns,
        )

        if existing_suspect:
            existing_suspect.raf_value = raf_val
            existing_suspect.annual_value = annual_val
            existing_suspect.confidence = adjusted_confidence
            existing_suspect.evidence_summary = s.get("evidence_summary", "")
            if s.get("icd10_code"):
                existing_suspect.icd10_code = s["icd10_code"]
            if s.get("icd10_label"):
                existing_suspect.icd10_label = s["icd10_label"]
        else:
            db.add(HccSuspect(
                member_id=member_id,
                payment_year=get_current_payment_year(),
                hcc_code=hcc_code,
                hcc_label=s.get("hcc_label", ""),
                icd10_code=s.get("icd10_code"),
                icd10_label=s.get("icd10_label", ""),
                raf_value=raf_val,
                annual_value=annual_val,
                suspect_type=s["suspect_type"],
                status=SuspectStatus.open.value,
                confidence=adjusted_confidence,
                evidence_summary=s.get("evidence_summary", ""),
                identified_date=today,
            ))
            suspects_created += 1

    # ---- RafHistory snapshot ----
    db.add(RafHistory(
        member_id=member_id,
        calculation_date=today,
        payment_year=get_current_payment_year(),
        demographic_raf=Decimal(str(raf_result.get("demographic_raf", 0))),
        disease_raf=Decimal(str(raf_result.get("disease_raf", 0))),
        interaction_raf=Decimal(str(raf_result.get("interaction_raf", 0))),
        total_raf=Decimal(str(raf_result.get("total_raf", 0))),
        hcc_count=len(raf_result.get("hcc_list", [])),
        suspect_count=suspects_created,
    ))

    # ---- update member computed fields ----
    current_raf = float(raf_result.get("total_raf", 0))
    suspect_uplift = sum(
        float(s.get("raf_value", 0)) for s in suspects if s.get("hcc_code", 0) > 0
    )
    projected_raf = current_raf + suspect_uplift

    member.current_raf = current_raf
    member.projected_raf = projected_raf
    member.risk_tier = _determine_risk_tier(projected_raf)

    await db.flush()

    return {
        "suspects_found": suspects_created,
        "raf_current": round(current_raf, 3),
        "raf_projected": round(projected_raf, 3),
        "uplift": round(suspect_uplift, 3),
    }


# ---------------------------------------------------------------------------
# Population-level analysis
# ---------------------------------------------------------------------------

async def analyze_population(
    tenant_schema: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Run HCC suspect analysis for every member in a tenant population.
    Processes in batches of 50 to avoid overwhelming the SNF service.
    """
    snf_client = SNFClient()

    try:
        result = await db.execute(select(Member.id))
        member_ids = [row[0] for row in result.all()]

        total_members = len(member_ids)
        total_suspects = 0
        total_uplift = 0.0
        total_raf = 0.0
        errors = 0

        logger.info(
            "Starting HCC analysis for %d members in schema %s",
            total_members, tenant_schema,
        )

        batch_size = 50
        for batch_start in range(0, total_members, batch_size):
            batch = member_ids[batch_start : batch_start + batch_size]
            batch_num = (batch_start // batch_size) + 1
            total_batches = (total_members + batch_size - 1) // batch_size

            logger.info("Processing batch %d/%d (%d members)", batch_num, total_batches, len(batch))

            for mid in batch:
                try:
                    async with db.begin_nested():
                        summary = await analyze_member(mid, db, snf_client)
                    total_suspects += summary["suspects_found"]
                    total_uplift += summary["uplift"]
                    total_raf += summary["raf_current"]
                except Exception:
                    logger.exception("Error analyzing member %d", mid)
                    errors += 1

            # Commit after each batch
            await db.commit()

        avg_raf = total_raf / total_members if total_members > 0 else 0.0

        summary = {
            "total_members": total_members,
            "total_suspects": total_suspects,
            "avg_raf": round(avg_raf, 3),
            "total_uplift": round(total_uplift, 3),
            "errors": errors,
        }
        logger.info("HCC analysis complete for %s: %s", tenant_schema, summary)
        return summary

    finally:
        await snf_client.close()
