"""
Core data ingestion service.

Reads uploaded CSV/Excel files, applies column mapping, validates rows,
and bulk-inserts records into tenant schema tables (members, claims, providers).
"""

import asyncio
import io
import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.claim import Claim, ClaimType
from app.models.member import Member
from app.models.provider import Provider
from app.services.data_preprocessor import preprocess_file

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Service-category classification
# ---------------------------------------------------------------------------

# Place-of-service code → category mapping
_POS_CATEGORY: dict[str, str] = {
    "21": "inpatient",       # Inpatient Hospital
    "22": "inpatient",       # On-Campus Outpatient Hospital (treated as professional)
    "23": "ed_observation",  # Emergency Room
    "24": "ed_observation",  # Ambulatory Surgical Center
    "31": "snf_postacute",   # Skilled Nursing Facility
    "32": "snf_postacute",   # Nursing Facility
    "33": "snf_postacute",   # Custodial Care
    "34": "snf_postacute",   # Hospice
    "12": "home_health",     # Home
    "13": "home_health",     # Assisted Living
    "01": "pharmacy",        # Pharmacy
    "02": "dme",             # Telehealth (map to professional later)
    "11": "professional",    # Office
    "49": "dme",             # Independent Clinic
    "50": "dme",             # Federally Qualified Health Center
    "65": "dme",             # End-Stage Renal Disease Treatment Facility
}


def classify_service_category(claim_data: dict[str, Any]) -> str:
    """
    Classify a claim row into a service category based on:
    - Place of service code
    - Claim type (institutional vs professional vs pharmacy)
    - Presence of DRG code (indicates inpatient)

    Returns one of: inpatient, ed_observation, professional, snf_postacute,
                    pharmacy, home_health, dme, other
    """
    pos = str(claim_data.get("pos_code", "") or "").strip()
    claim_type = str(claim_data.get("claim_type", "") or "").strip().lower()
    drg = claim_data.get("drg_code")
    ndc = claim_data.get("ndc_code")

    # Pharmacy claims
    if claim_type == "pharmacy" or ndc:
        return "pharmacy"

    # DRG presence strongly indicates inpatient
    if drg:
        return "inpatient"

    # POS-based classification
    if pos in _POS_CATEGORY:
        return _POS_CATEGORY[pos]

    # Institutional claims without DRG — check POS or default
    if claim_type == "institutional":
        if pos in ("23",):
            return "ed_observation"
        return "inpatient"  # conservative default for institutional

    # Professional claims
    if claim_type == "professional":
        return "professional"

    return "other"


# ---------------------------------------------------------------------------
# File reading utilities
# ---------------------------------------------------------------------------

def detect_file_type(file_path: str) -> str:
    """Detect file type from extension and content."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        return "excel"
    elif suffix == ".csv":
        return "csv"
    else:
        # Try to detect from content
        try:
            with open(file_path, "rb") as f:
                header = f.read(4)
            # Excel files start with PK (zip) or specific bytes
            if header[:2] == b"PK" or header[:4] == b"\xd0\xcf\x11\xe0":
                return "excel"
        except Exception:
            pass
        return "csv"  # default


def read_file_headers_and_sample(
    file_path: str, max_rows: int = 5
) -> tuple[list[str], list[list[str]]]:
    """Read the headers and first N sample rows from a file."""
    file_type = detect_file_type(file_path)

    if file_type == "excel":
        df = pd.read_excel(file_path, nrows=max_rows, dtype=str)
    else:
        # Try common encodings
        for encoding in ("utf-8", "latin-1", "cp1252"):
            try:
                df = pd.read_csv(
                    file_path, nrows=max_rows, dtype=str, encoding=encoding
                )
                break
            except UnicodeDecodeError:
                continue
        else:
            df = pd.read_csv(file_path, nrows=max_rows, dtype=str, encoding="utf-8",
                             errors="replace")

    headers = list(df.columns)
    sample_rows = df.fillna("").values.tolist()
    return headers, sample_rows


def _read_full_file(file_path: str) -> pd.DataFrame:
    """Read the entire file into a DataFrame."""
    file_type = detect_file_type(file_path)

    if file_type == "excel":
        return pd.read_excel(file_path, dtype=str)

    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(file_path, dtype=str, encoding=encoding)
        except UnicodeDecodeError:
            continue

    return pd.read_csv(file_path, dtype=str, encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _parse_date(value: Any) -> date | None:
    """Try to parse a date from various string formats."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    if isinstance(value, (date, datetime)):
        return value if isinstance(value, date) else value.date()

    s = str(value).strip()
    formats = [
        "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%Y%m%d",
        "%m/%d/%y", "%m-%d-%y", "%d/%m/%Y", "%Y/%m/%d",
        "%b %d, %Y", "%B %d, %Y", "%d-%b-%Y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue

    # pandas fallback
    try:
        return pd.to_datetime(s).date()
    except Exception:
        return None


def _parse_decimal(value: Any) -> Decimal | None:
    """Parse a decimal value, stripping currency symbols."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    s = str(value).strip().replace("$", "").replace(",", "")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _parse_int(value: Any) -> int | None:
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return None
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None


def _clean_str(value: Any, max_len: int | None = None) -> str | None:
    """Clean a string value."""
    if value is None:
        return None
    s = str(value).strip()
    if s == "" or s.lower() in ("nan", "none", "null", "na", "n/a"):
        return None
    if max_len:
        s = s[:max_len]
    return s


def _parse_gender(value: Any) -> str:
    """Normalize gender to M/F/U."""
    s = _clean_str(value)
    if not s:
        return "U"
    s = s.upper()
    if s in ("M", "MALE", "1"):
        return "M"
    elif s in ("F", "FEMALE", "2"):
        return "F"
    return "U"


def _parse_bool(value: Any) -> bool:
    """Parse boolean-like values."""
    s = _clean_str(value)
    if not s:
        return False
    return s.upper() in ("Y", "YES", "TRUE", "1", "T")


def _parse_diagnosis_codes(row: dict, mapping: dict) -> list[str]:
    """
    Extract all diagnosis codes from a row.
    Handles both single-column (comma/semicolon separated) and
    multi-column (diag_1, diag_2, ...) scenarios.
    """
    codes: list[str] = []
    for source_col, field_info in mapping.items():
        pf = field_info.get("platform_field") if isinstance(field_info, dict) else field_info
        if pf != "diagnosis_codes":
            continue
        val = row.get(source_col)
        if val is None or (isinstance(val, str) and val.strip() == ""):
            continue
        s = str(val).strip()
        # Could be comma or semicolon separated
        for code in re.split(r"[,;|]+", s):
            code = code.strip().upper()
            if code and code.lower() not in ("nan", "none", "null", "na"):
                codes.append(code)
    return codes


# ---------------------------------------------------------------------------
# Row processors per data type
# ---------------------------------------------------------------------------

def _build_reverse_mapping(column_mapping: dict) -> dict[str, str]:
    """
    Convert {source_col: {"platform_field": "x", ...}} or {source_col: "x"}
    into {platform_field: source_col}, skipping unmapped columns.
    For diagnosis_codes (may have multiple source cols), returns the first one.
    """
    reverse: dict[str, str] = {}
    for src, info in column_mapping.items():
        pf = info.get("platform_field") if isinstance(info, dict) else info
        if pf and pf not in reverse:
            reverse[pf] = src
    return reverse


def _get_val(row: dict, reverse_map: dict[str, str], field: str) -> Any:
    """Get the raw value from the row using the reverse mapping."""
    src_col = reverse_map.get(field)
    if src_col is None:
        return None
    return row.get(src_col)


def _process_member_row(
    row: dict, reverse_map: dict[str, str], row_idx: int
) -> tuple[dict | None, list[dict]]:
    """Validate and transform a single member/roster row."""
    errors: list[dict] = []

    member_id = _clean_str(_get_val(row, reverse_map, "member_id"), 50)
    if not member_id:
        errors.append({"row": row_idx, "field": "member_id", "error": "Required field missing"})
        return None, errors

    first_name = _clean_str(_get_val(row, reverse_map, "first_name"), 100)
    last_name = _clean_str(_get_val(row, reverse_map, "last_name"), 100)
    if not first_name or not last_name:
        errors.append({"row": row_idx, "field": "name", "error": "First and last name required"})
        return None, errors

    dob = _parse_date(_get_val(row, reverse_map, "date_of_birth"))
    if not dob:
        errors.append({"row": row_idx, "field": "date_of_birth", "error": "Invalid or missing date of birth"})
        return None, errors

    return {
        "member_id": member_id,
        "first_name": first_name,
        "last_name": last_name,
        "date_of_birth": dob,
        "gender": _parse_gender(_get_val(row, reverse_map, "gender")),
        "zip_code": _clean_str(_get_val(row, reverse_map, "zip_code"), 10),
        "health_plan": _clean_str(_get_val(row, reverse_map, "health_plan"), 200),
        "plan_product": _clean_str(_get_val(row, reverse_map, "plan_product"), 100),
        "coverage_start": _parse_date(_get_val(row, reverse_map, "coverage_start")),
        "coverage_end": _parse_date(_get_val(row, reverse_map, "coverage_end")),
        "medicaid_status": _parse_bool(_get_val(row, reverse_map, "medicaid_status")),
        "disability_status": _parse_bool(_get_val(row, reverse_map, "disability_status")),
        "institutional": _parse_bool(_get_val(row, reverse_map, "institutional")),
    }, errors


def _process_claim_row(
    row: dict, column_mapping: dict, reverse_map: dict[str, str], row_idx: int
) -> tuple[dict | None, list[dict]]:
    """Validate and transform a single claims row."""
    errors: list[dict] = []

    member_id_raw = _clean_str(_get_val(row, reverse_map, "member_id"), 50)
    if not member_id_raw:
        errors.append({"row": row_idx, "field": "member_id", "error": "Required field missing"})
        return None, errors

    service_date = _parse_date(_get_val(row, reverse_map, "service_date"))
    if not service_date:
        errors.append({"row": row_idx, "field": "service_date", "error": "Invalid or missing service date"})
        return None, errors

    # Determine claim type
    raw_type = _clean_str(_get_val(row, reverse_map, "claim_type"))
    claim_type = ClaimType.professional  # default
    if raw_type:
        rt = raw_type.lower()
        if rt in ("i", "institutional", "837i", "inpatient", "facility"):
            claim_type = ClaimType.institutional
        elif rt in ("p", "professional", "837p", "outpatient"):
            claim_type = ClaimType.professional
        elif rt in ("rx", "pharmacy", "drug"):
            claim_type = ClaimType.pharmacy

    # Parse diagnosis codes — may come from multiple columns
    dx_codes = _parse_diagnosis_codes(row, column_mapping)

    claim_data = {
        "_member_id_raw": member_id_raw,  # will be resolved to FK later
        "claim_id": _clean_str(_get_val(row, reverse_map, "claim_id"), 50),
        "claim_type": claim_type,
        "service_date": service_date,
        "paid_date": _parse_date(_get_val(row, reverse_map, "paid_date")),
        "diagnosis_codes": dx_codes if dx_codes else None,
        "procedure_code": _clean_str(_get_val(row, reverse_map, "procedure_code"), 10),
        "drg_code": _clean_str(_get_val(row, reverse_map, "drg_code"), 10),
        "ndc_code": _clean_str(_get_val(row, reverse_map, "ndc_code"), 15),
        "facility_name": _clean_str(_get_val(row, reverse_map, "facility_name"), 200),
        "facility_npi": _clean_str(_get_val(row, reverse_map, "facility_npi"), 15),
        "billed_amount": _parse_decimal(_get_val(row, reverse_map, "billed_amount")),
        "allowed_amount": _parse_decimal(_get_val(row, reverse_map, "allowed_amount")),
        "paid_amount": _parse_decimal(_get_val(row, reverse_map, "paid_amount")),
        "member_liability": _parse_decimal(_get_val(row, reverse_map, "member_liability")),
        "pos_code": _clean_str(_get_val(row, reverse_map, "pos_code"), 5),
        "drug_name": _clean_str(_get_val(row, reverse_map, "drug_name"), 200),
        "drug_class": _clean_str(_get_val(row, reverse_map, "drug_class"), 100),
        "quantity": float(_parse_decimal(_get_val(row, reverse_map, "quantity"))) if _parse_decimal(_get_val(row, reverse_map, "quantity")) is not None else None,
        "days_supply": _parse_int(_get_val(row, reverse_map, "days_supply")),
    }

    # Classify service category
    claim_data["service_category"] = classify_service_category(claim_data)

    return claim_data, errors


def _process_provider_row(
    row: dict, reverse_map: dict[str, str], row_idx: int
) -> tuple[dict | None, list[dict]]:
    """Validate and transform a single provider row."""
    errors: list[dict] = []

    npi = _clean_str(_get_val(row, reverse_map, "npi"), 15)
    if not npi:
        errors.append({"row": row_idx, "field": "npi", "error": "NPI is required"})
        return None, errors

    first_name = _clean_str(_get_val(row, reverse_map, "first_name"), 100)
    last_name = _clean_str(_get_val(row, reverse_map, "last_name"), 100)
    if not first_name or not last_name:
        errors.append({"row": row_idx, "field": "name", "error": "Provider name required"})
        return None, errors

    return {
        "npi": npi,
        "first_name": first_name,
        "last_name": last_name,
        "specialty": _clean_str(_get_val(row, reverse_map, "specialty"), 100),
        "practice_name": _clean_str(_get_val(row, reverse_map, "practice_name"), 200),
        "tin": _clean_str(_get_val(row, reverse_map, "tin"), 15),
    }, errors


# ---------------------------------------------------------------------------
# Bulk insert helpers
# ---------------------------------------------------------------------------

ALLOWED_MEMBER_COLUMNS = {
    "member_id", "first_name", "last_name", "date_of_birth", "gender",
    "zip_code", "health_plan", "plan_product", "coverage_start",
    "coverage_end", "pcp_provider_id", "medicaid_status",
    "disability_status", "institutional", "current_raf", "projected_raf",
    "risk_tier", "extra",
}

ALLOWED_CLAIM_COLUMNS = {
    "member_id", "claim_id", "claim_type", "service_date", "paid_date",
    "diagnosis_codes", "procedure_code", "drg_code", "ndc_code",
    "rendering_provider_id", "facility_name", "facility_npi",
    "billed_amount", "allowed_amount", "paid_amount", "member_liability",
    "service_category", "pos_code", "drug_name", "drug_class",
    "quantity", "days_supply", "extra", "data_tier", "is_estimated",
}

ALLOWED_PROVIDER_COLUMNS = {
    "npi", "first_name", "last_name", "specialty", "practice_name",
    "tin", "extra",
}


def _filter_allowed_columns(row_data: dict, allowed: set[str]) -> dict:
    """Filter row_data keys against allowlist, logging unknown columns."""
    filtered = {}
    for k, v in row_data.items():
        if k in allowed:
            filtered[k] = v
        elif not k.startswith("_"):
            # Internal keys (prefixed with _) are silently dropped
            logger.warning("Skipping unknown column during ingestion: %s", k)
    return filtered


def _chunks(lst: list, size: int):
    """Yield successive chunks of *size* from *lst*."""
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


async def _upsert_members(
    db: AsyncSession, valid_rows: list[dict]
) -> dict[str, int]:
    """Bulk insert/update members using INSERT ... ON CONFLICT.

    Returns {"inserted": int, "updated": int}.
    """
    if not valid_rows:
        return {"inserted": 0, "updated": 0}

    inserted = 0
    updated = 0

    for batch in _chunks(valid_rows, 500):
        for row_data in batch:
            safe_data = _filter_allowed_columns(row_data, ALLOWED_MEMBER_COLUMNS)
            if not safe_data.get("member_id"):
                continue

            cols = list(safe_data.keys())
            # Prefix parameter names to avoid collisions with SQL keywords
            vals = {f"v_{k}": v for k, v in safe_data.items()}

            col_list = ", ".join(cols)
            val_list = ", ".join(f":v_{c}" for c in cols)
            update_cols = [c for c in cols if c != "member_id"]
            update_list = ", ".join(f"{c} = :v_{c}" for c in update_cols)

            if update_list:
                sql = (
                    f"INSERT INTO members ({col_list}) VALUES ({val_list}) "
                    f"ON CONFLICT (member_id) DO UPDATE SET {update_list}, updated_at = NOW()"
                )
            else:
                sql = (
                    f"INSERT INTO members ({col_list}) VALUES ({val_list}) "
                    f"ON CONFLICT (member_id) DO NOTHING"
                )

            result = await db.execute(text(sql), vals)
            # xmax = 0 means a fresh insert in PostgreSQL; otherwise it's an update.
            # With ON CONFLICT we can't easily tell, so we approximate:
            # rowcount > 0 means either insert or update happened.
            if result.rowcount > 0:
                # Heuristic: we check if the row existed before this batch.
                # Since we can't easily distinguish, count all as "processed"
                # and use a follow-up query approach below.
                inserted += 1

        await db.commit()

    # Re-count: query how many members were actually freshly created vs updated.
    # For simplicity in the ON CONFLICT model, report total affected.
    return {"inserted": inserted, "updated": 0}


async def _resolve_member_ids_batch(
    db: AsyncSession, raw_member_ids: list[str]
) -> dict[str, int]:
    """Batch-resolve health-plan member_id strings to internal PKs."""
    if not raw_member_ids:
        return {}
    unique_ids = list(set(raw_member_ids))
    lookup: dict[str, int] = {}
    # Process in chunks to avoid overly large IN clauses
    chunk_size = 500
    for i in range(0, len(unique_ids), chunk_size):
        chunk = unique_ids[i : i + chunk_size]
        params = {f"mid_{j}": mid for j, mid in enumerate(chunk)}
        placeholders = ", ".join(f":mid_{j}" for j in range(len(chunk)))
        result = await db.execute(
            text(f"SELECT id, member_id FROM members WHERE member_id IN ({placeholders})"),
            params,
        )
        for row in result.fetchall():
            lookup[row.member_id] = row.id
    return lookup


async def _upsert_claims(
    db: AsyncSession, valid_rows: list[dict], all_errors: list[dict] | None = None
) -> int:
    """Bulk insert claims in batches. Returns count of inserted rows.

    When a member_id cannot be resolved via the lookup table, entity
    resolution is attempted as a fallback.  If that also fails the row
    is recorded as a validation error (when *all_errors* is provided)
    instead of being silently skipped.
    """
    if not valid_rows:
        return 0

    # Batch-resolve all member IDs upfront instead of one-by-one
    raw_mids = [r.get("_member_id_raw") for r in valid_rows if r.get("_member_id_raw")]
    member_lookup = await _resolve_member_ids_batch(db, raw_mids)

    inserted = 0

    for batch in _chunks(valid_rows, 500):
        for row_data in batch:
            raw_mid = row_data.get("_member_id_raw")
            row_data.pop("_member_id_raw", None)
            if raw_mid:
                member_pk = member_lookup.get(raw_mid)

                # --- Fallback: entity resolution when lookup fails ----------
                if member_pk is None:
                    try:
                        from app.services.entity_resolution_service import match_member
                        # Build an incoming record for entity resolution
                        # raw_mid is the external member_id; we also pass any
                        # name/dob fields that were stashed on the row.
                        er_incoming: dict[str, Any] = {"member_id": raw_mid}
                        for fld in ("first_name", "last_name", "date_of_birth"):
                            if row_data.get(f"_er_{fld}"):
                                er_incoming[fld] = row_data.pop(f"_er_{fld}")
                        er_result = await match_member(db, er_incoming)
                        if er_result.get("matched") and er_result.get("member_id"):
                            member_pk = er_result["member_id"]
                            # Cache so subsequent rows with the same raw id
                            # don't trigger another resolution call.
                            member_lookup[raw_mid] = member_pk
                    except Exception as er_exc:
                        logger.warning("Entity resolution fallback failed for %s: %s", raw_mid, er_exc)

                if member_pk is None:
                    # Record as a validation error instead of silently skipping
                    if all_errors is not None:
                        all_errors.append({
                            "row": row_data.get("_source_row_num", 0),
                            "field": "member_id",
                            "error": f"Could not resolve member_id '{raw_mid}' to an existing member",
                        })
                    continue
                row_data["member_id"] = member_pk

            # Strip internal helper keys before DB insert
            for key in list(row_data.keys()):
                if key.startswith("_"):
                    row_data.pop(key)

            # Filter against allowlist to prevent SQL injection
            safe_data = _filter_allowed_columns(
                {k: v for k, v in row_data.items() if v is not None},
                ALLOWED_CLAIM_COLUMNS,
            )
            # Handle array for diagnosis_codes — use parameterized binding
            dx_codes = safe_data.pop("diagnosis_codes", None)

            cols = list(safe_data.keys())
            if dx_codes:
                cols.append("diagnosis_codes")

            vals_parts = [f":{k}" for k in safe_data.keys()]
            if dx_codes:
                dx_params = []
                for i, code in enumerate(dx_codes):
                    param_name = f"_dx_{i}"
                    dx_params.append(f":{param_name}")
                    safe_data[param_name] = code
                vals_parts.append(f"ARRAY[{', '.join(dx_params)}]::varchar[]")

            cols_str = ", ".join(cols)
            vals_str = ", ".join(vals_parts)

            await db.execute(
                text(f"INSERT INTO claims ({cols_str}) VALUES ({vals_str})"),
                safe_data,
            )
            inserted += 1

        await db.commit()

    return inserted


async def _upsert_providers(
    db: AsyncSession, valid_rows: list[dict]
) -> dict[str, int]:
    """Bulk insert/update providers using INSERT ... ON CONFLICT.

    Returns {"inserted": int, "updated": int}.
    """
    if not valid_rows:
        return {"inserted": 0, "updated": 0}

    inserted = 0
    updated = 0

    for batch in _chunks(valid_rows, 500):
        for row_data in batch:
            safe_data = _filter_allowed_columns(row_data, ALLOWED_PROVIDER_COLUMNS)
            if not safe_data.get("npi"):
                continue

            cols = list(safe_data.keys())
            vals = {f"v_{k}": v for k, v in safe_data.items()}

            col_list = ", ".join(cols)
            val_list = ", ".join(f":v_{c}" for c in cols)
            update_cols = [c for c in cols if c != "npi"]
            update_list = ", ".join(f"{c} = :v_{c}" for c in update_cols)

            if update_list:
                sql = (
                    f"INSERT INTO providers ({col_list}) VALUES ({val_list}) "
                    f"ON CONFLICT (npi) DO UPDATE SET {update_list}, updated_at = NOW()"
                )
            else:
                sql = (
                    f"INSERT INTO providers ({col_list}) VALUES ({val_list}) "
                    f"ON CONFLICT (npi) DO NOTHING"
                )

            result = await db.execute(text(sql), vals)
            if result.rowcount > 0:
                inserted += 1

        await db.commit()

    return {"inserted": inserted, "updated": 0}


# ---------------------------------------------------------------------------
# Main processing entry point
# ---------------------------------------------------------------------------

async def process_upload(
    file_path: str,
    column_mapping: dict[str, Any],
    data_type: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """
    Main ingestion entry point.

    Reads the file, applies column mapping, validates each row,
    and bulk-inserts into the appropriate tenant schema table.

    Args:
        file_path: Path to the uploaded file on disk.
        column_mapping: {source_column: {"platform_field": "x", "confidence": 0.9}}
        data_type: One of roster, claims, eligibility, pharmacy, providers.
        db: Tenant-scoped async database session.

    Returns:
        {
            "total_rows": int,
            "processed_rows": int,
            "error_rows": int,
            "errors": [{"row": int, "field": str, "error": str}],
            "data_type": str,
        }
    """
    logger.info(f"Processing upload: {file_path} as {data_type}")

    # Step 0: Pre-process the raw file to fix common data messiness
    try:
        prep_result = await asyncio.to_thread(preprocess_file, file_path)
        if prep_result["cleaned_path"]:
            file_path = prep_result["cleaned_path"]  # use cleaned version
        # Log what was cleaned
        for change in prep_result["changes_made"]:
            logger.info(f"Pre-processed: {change['description']}")
        for warning in prep_result.get("warnings", []):
            logger.warning(f"Pre-processor warning: {warning}")
    except Exception as prep_err:
        logger.warning(f"Pre-processing failed (continuing with original file): {prep_err}")

    reverse_map = _build_reverse_mapping(column_mapping)
    all_errors: list[dict] = []
    total_rows = 0
    total_inserted = 0
    total_updated = 0

    # Use chunked reading for CSV to avoid loading entire file into memory
    file_type = detect_file_type(file_path)
    if file_type == "csv":
        chunk_iter = None
        for encoding in ("utf-8", "latin-1", "cp1252"):
            try:
                chunk_iter = pd.read_csv(
                    file_path, dtype=str, encoding=encoding, chunksize=5000
                )
                break
            except UnicodeDecodeError:
                continue
        if chunk_iter is None:
            chunk_iter = pd.read_csv(
                file_path, dtype=str, encoding="utf-8", errors="replace",
                chunksize=5000,
            )
        chunks = chunk_iter
    else:
        # Excel files: use openpyxl read_only mode for large files (>10k rows)
        excel_path = Path(file_path)
        try:
            import openpyxl
            wb = openpyxl.load_workbook(str(excel_path), read_only=True, data_only=True)
            ws = wb.active
            # Estimate row count from max_row (may be approximate in read_only)
            estimated_rows = ws.max_row or 0
            wb.close()
        except Exception:
            estimated_rows = 0

        if estimated_rows > 10_000:
            # Read Excel in chunks via pandas with skiprows/nrows
            excel_chunks = []
            header_df = pd.read_excel(file_path, dtype=str, nrows=0)
            excel_headers = list(header_df.columns)
            rows_read = 0
            while True:
                chunk_df = pd.read_excel(
                    file_path, dtype=str, skiprows=range(1, rows_read + 1),
                    nrows=5000, header=0
                )
                if chunk_df.empty:
                    break
                # Ensure consistent column names from first header read
                chunk_df.columns = excel_headers[:len(chunk_df.columns)]
                excel_chunks.append(chunk_df)
                rows_read += len(chunk_df)
                if len(chunk_df) < 5000:
                    break
            chunks = excel_chunks
        else:
            chunks = [pd.read_excel(file_path, dtype=str)]

    # Maintain a running row offset so row_num is correct across chunks
    chunk_offset = 0

    for df_chunk in chunks:
        chunk_valid_rows: list[dict] = []
        chunk_size = len(df_chunk)
        total_rows += chunk_size

        for local_idx, (_, pandas_row) in enumerate(df_chunk.iterrows()):
            row_dict = {col: pandas_row[col] for col in df_chunk.columns}
            row_num = chunk_offset + local_idx + 2  # +2 for 1-based + header row

            if data_type in ("roster", "eligibility"):
                record, errors = _process_member_row(row_dict, reverse_map, row_num)
            elif data_type in ("claims", "pharmacy"):
                record, errors = _process_claim_row(row_dict, column_mapping, reverse_map, row_num)
                # Stash source row number so error reporting works in _upsert_claims
                if record is not None:
                    record["_source_row_num"] = row_num
            elif data_type == "providers":
                record, errors = _process_provider_row(row_dict, reverse_map, row_num)
            else:
                record, errors = _process_member_row(row_dict, reverse_map, row_num)

            all_errors.extend(errors)
            if record is not None:
                chunk_valid_rows.append(record)

        chunk_offset += chunk_size

        # Insert/upsert this chunk's valid rows immediately (don't accumulate)
        if chunk_valid_rows:
            try:
                if data_type in ("roster", "eligibility"):
                    result_counts = await _upsert_members(db, chunk_valid_rows)
                    total_inserted += result_counts["inserted"]
                    total_updated += result_counts["updated"]
                elif data_type in ("claims", "pharmacy"):
                    count = await _upsert_claims(db, chunk_valid_rows, all_errors)
                    total_inserted += count
                elif data_type == "providers":
                    result_counts = await _upsert_providers(db, chunk_valid_rows)
                    total_inserted += result_counts["inserted"]
                    total_updated += result_counts["updated"]
                else:
                    result_counts = await _upsert_members(db, chunk_valid_rows)
                    total_inserted += result_counts["inserted"]
                    total_updated += result_counts["updated"]

                await db.commit()
            except Exception as e:
                await db.rollback()
                logger.error(f"Database error during ingestion chunk: {e}")
                raise

    # Cap error list to first 100 for storage
    stored_errors = all_errors[:100]

    processed = total_inserted + total_updated

    result = {
        "total_rows": total_rows,
        "processed_rows": processed,
        "inserted_rows": total_inserted,
        "updated_rows": total_updated,
        "error_rows": len(all_errors),
        "errors": stored_errors,
        "data_type": data_type,
    }

    logger.info(
        f"Ingestion complete: {total_rows} total, {total_inserted} inserted, "
        f"{total_updated} updated, {len(all_errors)} errors"
    )
    return result
