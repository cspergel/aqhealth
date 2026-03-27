"""
Data Quality Gate service.

Validates roster, claims, and pharmacy rows before database insertion.
Runs aggregate quality checks after ingestion to produce a quality report.
"""

import logging
import re
from datetime import date, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants & helpers
# ---------------------------------------------------------------------------

ICD10_PATTERN = re.compile(r"^[A-Z]\d{2}(\.\d{1,4})?$", re.IGNORECASE)
CPT_PATTERN = re.compile(r"^\d{5}$")
DRG_PATTERN = re.compile(r"^\d{3}$")
NPI_PATTERN = re.compile(r"^\d{10}$")
NDC_PATTERN = re.compile(r"^\d{11}$")
ZIP5_PATTERN = re.compile(r"^\d{5}$")
ZIP9_PATTERN = re.compile(r"^\d{5}-?\d{4}$")

HEALTH_PLAN_NORMALIZE: dict[str, str] = {
    "humana": "Humana",
    "humana gold plus": "Humana",
    "humana gold": "Humana",
    "aetna": "Aetna",
    "aetna medicare advantage": "Aetna",
    "united": "UnitedHealthcare",
    "unitedhealthcare": "UnitedHealthcare",
    "uhc": "UnitedHealthcare",
    "cigna": "Cigna",
    "anthem": "Anthem",
    "anthem bcbs": "Anthem",
    "blue cross": "Blue Cross Blue Shield",
    "bcbs": "Blue Cross Blue Shield",
    "blue cross blue shield": "Blue Cross Blue Shield",
    "wellcare": "WellCare",
    "molina": "Molina",
    "centene": "Centene",
    "devoted": "Devoted Health",
    "devoted health": "Devoted Health",
    "clover": "Clover Health",
    "clover health": "Clover Health",
    "alignment": "Alignment Healthcare",
    "alignment healthcare": "Alignment Healthcare",
}

GENDER_NORMALIZE: dict[str, str] = {
    "m": "M",
    "male": "M",
    "f": "F",
    "female": "F",
}


def _parse_date(value: Any, field_name: str) -> tuple[date | None, str | None]:
    """Try to parse a date from various formats. Returns (date, error)."""
    if isinstance(value, date):
        return value, None
    if isinstance(value, datetime):
        return value.date(), None
    if not isinstance(value, str) or not value.strip():
        return None, f"{field_name}: missing or empty"
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%Y%m%d", "%m/%d/%y", "%d-%b-%Y"):
        try:
            return datetime.strptime(value, fmt).date(), None
        except ValueError:
            continue
    return None, f"{field_name}: invalid date format '{value}'"


def _luhn_check(number: str) -> bool:
    """Validate a number string using the Luhn algorithm."""
    digits = [int(d) for d in number]
    odd_digits = digits[-1::-2]
    even_digits = digits[-2::-2]
    total = sum(odd_digits)
    for d in even_digits:
        total += sum(divmod(d * 2, 10))
    return total % 10 == 0


# ---------------------------------------------------------------------------
# Row-level validation
# ---------------------------------------------------------------------------

async def validate_roster_row(row: dict) -> dict:
    """Validate and clean a roster (member) row.

    Returns: {valid: bool, cleaned_row: dict, errors: list[str], warnings: list[str]}
    """
    errors: list[str] = []
    warnings: list[str] = []
    cleaned = dict(row)

    # Required fields
    required = ["member_id", "first_name", "last_name", "date_of_birth", "gender"]
    for field in required:
        if not row.get(field) and row.get(field) != 0:
            errors.append(f"Missing required field: {field}")

    # date_of_birth
    if row.get("date_of_birth"):
        dob, err = _parse_date(row["date_of_birth"], "date_of_birth")
        if err:
            errors.append(err)
        elif dob:
            if dob.year < 1920 or dob.year > 2010:
                errors.append(f"date_of_birth: year {dob.year} outside valid range 1920-2010")
            cleaned["date_of_birth"] = dob.isoformat()

    # gender
    if row.get("gender"):
        g = str(row["gender"]).strip().lower()
        if g in GENDER_NORMALIZE:
            cleaned["gender"] = GENDER_NORMALIZE[g]
        else:
            errors.append(f"gender: invalid value '{row['gender']}' (expected M/F/Male/Female)")

    # zip_code (optional)
    if row.get("zip_code"):
        z = str(row["zip_code"]).strip()
        if not ZIP5_PATTERN.match(z) and not ZIP9_PATTERN.match(z):
            errors.append(f"zip_code: invalid format '{z}' (expected 5 or 9 digits)")
        else:
            cleaned["zip_code"] = z

    # health_plan (optional)
    if row.get("health_plan"):
        hp = str(row["health_plan"]).strip().lower()
        normalized = HEALTH_PLAN_NORMALIZE.get(hp)
        if normalized:
            cleaned["health_plan"] = normalized
        else:
            # Keep as-is but title-case
            cleaned["health_plan"] = str(row["health_plan"]).strip().title()
            warnings.append(f"health_plan: '{row['health_plan']}' not in known plans, kept as-is")

    # Trim string fields
    for field in ["first_name", "last_name", "member_id"]:
        if row.get(field) and isinstance(row[field], str):
            cleaned[field] = row[field].strip()

    return {
        "valid": len(errors) == 0,
        "cleaned_row": cleaned,
        "errors": errors,
        "warnings": warnings,
    }


async def validate_claim_row(row: dict) -> dict:
    """Validate and clean a claims row.

    Returns: {valid: bool, cleaned_row: dict, errors: list[str], warnings: list[str]}
    """
    errors: list[str] = []
    warnings: list[str] = []
    cleaned = dict(row)

    # Required: member_id, service_date, at least one diagnosis code
    if not row.get("member_id"):
        errors.append("Missing required field: member_id")

    # service_date
    if not row.get("service_date"):
        errors.append("Missing required field: service_date")
    else:
        sd, err = _parse_date(row["service_date"], "service_date")
        if err:
            errors.append(err)
        elif sd:
            if sd > date.today():
                errors.append(f"service_date: {sd.isoformat()} is in the future")
            elif sd.year < 2020:
                errors.append(f"service_date: {sd.isoformat()} is before 2020")
            cleaned["service_date"] = sd.isoformat()

    # At least one diagnosis code
    dx_fields = [k for k in row if k.startswith("diagnosis") or k.startswith("dx_") or k == "icd10_code"]
    has_dx = any(row.get(f) for f in dx_fields)
    if not has_dx and not row.get("diagnosis_code"):
        errors.append("At least one diagnosis code is required")

    # ICD-10 validation
    for field in dx_fields + ["diagnosis_code"]:
        val = row.get(field)
        if val and isinstance(val, str) and val.strip():
            code = val.strip().upper()
            if not ICD10_PATTERN.match(code):
                errors.append(f"{field}: invalid ICD-10 format '{code}' (expected letter + 2-7 chars)")
            else:
                cleaned[field] = code

    # CPT validation
    for field in ["cpt_code", "procedure_code"]:
        val = row.get(field)
        if val and isinstance(val, str) and val.strip():
            code = val.strip()
            if not CPT_PATTERN.match(code):
                errors.append(f"{field}: invalid CPT format '{code}' (expected 5 digits)")
            else:
                cleaned[field] = code

    # DRG validation
    if row.get("drg_code"):
        code = str(row["drg_code"]).strip()
        if not DRG_PATTERN.match(code):
            errors.append(f"drg_code: invalid DRG format '{code}' (expected 3 digits)")
        else:
            cleaned["drg_code"] = code

    # NPI validation
    for field in ["npi", "provider_npi", "rendering_npi", "billing_npi"]:
        val = row.get(field)
        if val:
            npi_str = str(val).strip()
            if not NPI_PATTERN.match(npi_str):
                errors.append(f"{field}: invalid NPI format '{npi_str}' (expected 10 digits)")
            elif not _luhn_check(npi_str):
                warnings.append(f"{field}: NPI '{npi_str}' fails Luhn check")
            else:
                cleaned[field] = npi_str

    # Amounts: must be non-negative
    for field in ["billed_amount", "allowed_amount", "paid_amount", "copay", "coinsurance", "deductible"]:
        val = row.get(field)
        if val is not None:
            try:
                amount = float(val)
                if amount < 0:
                    errors.append(f"{field}: negative amount {amount}")
                cleaned[field] = amount
            except (ValueError, TypeError):
                errors.append(f"{field}: invalid numeric value '{val}'")

    return {
        "valid": len(errors) == 0,
        "cleaned_row": cleaned,
        "errors": errors,
        "warnings": warnings,
    }


async def validate_pharmacy_row(row: dict) -> dict:
    """Validate and clean a pharmacy row.

    Returns: {valid: bool, cleaned_row: dict, errors: list[str], warnings: list[str]}
    """
    errors: list[str] = []
    warnings: list[str] = []
    cleaned = dict(row)

    # Required: member_id
    if not row.get("member_id"):
        errors.append("Missing required field: member_id")

    # Required: service_date
    if not row.get("service_date"):
        errors.append("Missing required field: service_date")
    else:
        sd, err = _parse_date(row["service_date"], "service_date")
        if err:
            errors.append(err)
        elif sd:
            if sd > date.today():
                errors.append(f"service_date: {sd.isoformat()} is in the future")
            cleaned["service_date"] = sd.isoformat()

    # Required: drug_name or ndc_code
    if not row.get("drug_name") and not row.get("ndc_code"):
        errors.append("At least one of drug_name or ndc_code is required")

    # NDC validation
    if row.get("ndc_code"):
        ndc = str(row["ndc_code"]).strip().replace("-", "")
        if not NDC_PATTERN.match(ndc):
            errors.append(f"ndc_code: invalid NDC format '{row['ndc_code']}' (expected 11 digits)")
        else:
            cleaned["ndc_code"] = ndc

    # days_supply
    if row.get("days_supply") is not None:
        try:
            ds = int(row["days_supply"])
            if ds < 1 or ds > 365:
                errors.append(f"days_supply: {ds} outside valid range 1-365")
            cleaned["days_supply"] = ds
        except (ValueError, TypeError):
            errors.append(f"days_supply: invalid value '{row['days_supply']}'")

    # quantity
    if row.get("quantity") is not None:
        try:
            qty = float(row["quantity"])
            if qty <= 0:
                errors.append(f"quantity: must be positive, got {qty}")
            cleaned["quantity"] = qty
        except (ValueError, TypeError):
            errors.append(f"quantity: invalid value '{row['quantity']}'")

    # Drug name cleanup
    if row.get("drug_name") and isinstance(row["drug_name"], str):
        cleaned["drug_name"] = row["drug_name"].strip().title()

    return {
        "valid": len(errors) == 0,
        "cleaned_row": cleaned,
        "errors": errors,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Aggregate quality checks (post-ingestion)
# ---------------------------------------------------------------------------

async def run_quality_checks(db: AsyncSession, ingestion_job_id: int) -> dict:
    """Run aggregate quality checks on ingested data and return a quality report.

    Returns: {score: 0-100, checks: [{name, status, details, severity}], quarantined_count}
    """
    checks: list[dict] = []
    total_deductions = 0

    # 1. Completeness: % of rows with null in key fields
    try:
        result = await db.execute(text("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN first_name IS NULL OR last_name IS NULL THEN 1 ELSE 0 END) as missing_name,
                SUM(CASE WHEN date_of_birth IS NULL THEN 1 ELSE 0 END) as missing_dob,
                SUM(CASE WHEN gender IS NULL THEN 1 ELSE 0 END) as missing_gender
            FROM members
        """))
        row = result.fetchone()
        if row and row.total > 0:
            completeness_pct = round(100 * (1 - (row.missing_name + row.missing_dob + row.missing_gender) / (row.total * 3)), 1)
            status = "passed" if completeness_pct >= 95 else ("warned" if completeness_pct >= 80 else "failed")
            deduction = max(0, (100 - completeness_pct) * 0.3)
            total_deductions += deduction
            checks.append({
                "name": "Completeness",
                "status": status,
                "details": f"{completeness_pct}% of key fields populated ({row.total} members)",
                "severity": "high" if status == "failed" else "medium",
            })
        else:
            checks.append({
                "name": "Completeness",
                "status": "passed",
                "details": "No members to check",
                "severity": "low",
            })
    except Exception as e:
        logger.warning("Completeness check failed: %s", e)
        checks.append({"name": "Completeness", "status": "skipped", "details": str(e), "severity": "low"})

    # 2. Referential integrity: all claim.member_ids exist in members
    try:
        result = await db.execute(text("""
            SELECT COUNT(*) as orphan_count
            FROM claims c
            LEFT JOIN members m ON c.member_id = m.id
            WHERE m.id IS NULL
        """))
        row = result.fetchone()
        orphan_count = row.orphan_count if row else 0
        status = "passed" if orphan_count == 0 else ("warned" if orphan_count < 10 else "failed")
        deduction = min(20, orphan_count * 2)
        total_deductions += deduction
        checks.append({
            "name": "Referential Integrity",
            "status": status,
            "details": f"{orphan_count} claims reference non-existent members",
            "severity": "high" if status == "failed" else "medium",
        })
    except Exception as e:
        logger.warning("Referential integrity check failed: %s", e)
        checks.append({"name": "Referential Integrity", "status": "skipped", "details": str(e), "severity": "low"})

    # 3. Duplicate detection
    try:
        result = await db.execute(text("""
            SELECT COUNT(*) as dup_count FROM (
                SELECT member_id, service_date, diagnosis_codes::text, rendering_provider_id
                FROM claims
                GROUP BY member_id, service_date, diagnosis_codes::text, rendering_provider_id
                HAVING COUNT(*) > 1
            ) dups
        """))
        row = result.fetchone()
        dup_count = row.dup_count if row else 0
        status = "passed" if dup_count == 0 else ("warned" if dup_count < 20 else "failed")
        deduction = min(15, dup_count)
        total_deductions += deduction
        checks.append({
            "name": "Duplicate Detection",
            "status": status,
            "details": f"{dup_count} potential duplicate claim groups",
            "severity": "medium",
        })
    except Exception as e:
        logger.warning("Duplicate detection check failed: %s", e)
        checks.append({"name": "Duplicate Detection", "status": "skipped", "details": str(e), "severity": "low"})

    # 4. Distribution check: flag if >20% of claims have same diagnosis
    try:
        result = await db.execute(text("""
            SELECT dx_code, COUNT(*) as cnt,
                   ROUND(100.0 * COUNT(*) / NULLIF((SELECT COUNT(*) FROM claims WHERE diagnosis_codes IS NOT NULL), 0), 1) as pct
            FROM (
                SELECT unnest(diagnosis_codes) as dx_code
                FROM claims
                WHERE diagnosis_codes IS NOT NULL
            ) expanded
            GROUP BY dx_code
            ORDER BY cnt DESC
            LIMIT 1
        """))
        row = result.fetchone()
        if row and row.pct and float(row.pct) > 20:
            status = "failed"
            total_deductions += 10
            checks.append({
                "name": "Diagnosis Distribution",
                "status": status,
                "details": f"Code {row.dx_code} appears in {row.pct}% of claims (threshold: 20%)",
                "severity": "high",
            })
        else:
            checks.append({
                "name": "Diagnosis Distribution",
                "status": "passed",
                "details": "No single diagnosis exceeds 20% of claims",
                "severity": "low",
            })
    except Exception as e:
        logger.warning("Distribution check failed: %s", e)
        checks.append({"name": "Diagnosis Distribution", "status": "skipped", "details": str(e), "severity": "low"})

    # 5. Date range check
    try:
        result = await db.execute(text("""
            SELECT
                MIN(service_date) as earliest,
                MAX(service_date) as latest,
                SUM(CASE WHEN service_date > CURRENT_DATE THEN 1 ELSE 0 END) as future_count,
                SUM(CASE WHEN service_date < '2020-01-01' THEN 1 ELSE 0 END) as old_count
            FROM claims
        """))
        row = result.fetchone()
        if row:
            issues = (row.future_count or 0) + (row.old_count or 0)
            status = "passed" if issues == 0 else ("warned" if issues < 5 else "failed")
            deduction = min(10, issues * 2)
            total_deductions += deduction
            checks.append({
                "name": "Date Range",
                "status": status,
                "details": f"Range: {row.earliest} to {row.latest}. {row.future_count or 0} future dates, {row.old_count or 0} pre-2020 dates.",
                "severity": "medium" if status != "passed" else "low",
            })
    except Exception as e:
        logger.warning("Date range check failed: %s", e)
        checks.append({"name": "Date Range", "status": "skipped", "details": str(e), "severity": "low"})

    # 6. Financial sanity: claims > $500K
    try:
        result = await db.execute(text("""
            SELECT COUNT(*) as high_claims
            FROM claims
            WHERE billed_amount > 500000 OR paid_amount > 500000
        """))
        row = result.fetchone()
        high_count = row.high_claims if row else 0
        status = "passed" if high_count == 0 else "warned"
        if high_count > 0:
            total_deductions += 5
        checks.append({
            "name": "Financial Sanity",
            "status": status,
            "details": f"{high_count} claims exceed $500K (flagged for review)",
            "severity": "high" if high_count > 0 else "low",
        })
    except Exception as e:
        logger.warning("Financial sanity check failed: %s", e)
        checks.append({"name": "Financial Sanity", "status": "skipped", "details": str(e), "severity": "low"})

    # Count quarantined records for this job
    quarantined_count = 0
    try:
        result = await db.execute(text(
            "SELECT COUNT(*) as cnt FROM quarantined_records WHERE upload_job_id = :job_id"
        ), {"job_id": ingestion_job_id})
        row = result.fetchone()
        quarantined_count = row.cnt if row else 0
    except Exception:
        pass

    score = max(0, min(100, round(100 - total_deductions)))

    return {
        "score": score,
        "checks": checks,
        "quarantined_count": quarantined_count,
    }
