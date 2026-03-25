"""
Core data ingestion service.

Reads uploaded CSV/Excel files, applies column mapping, validates rows,
and bulk-inserts records into tenant schema tables (members, claims, providers).
"""

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

async def _upsert_members(
    db: AsyncSession, valid_rows: list[dict]
) -> int:
    """Bulk insert/update members. Returns count of inserted rows."""
    if not valid_rows:
        return 0

    inserted = 0
    for row_data in valid_rows:
        # Check if member already exists by member_id
        result = await db.execute(
            text("SELECT id FROM members WHERE member_id = :mid"),
            {"mid": row_data["member_id"]},
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing member
            sets = ", ".join(
                f"{k} = :{k}" for k in row_data if k != "member_id"
            )
            await db.execute(
                text(f"UPDATE members SET {sets}, updated_at = NOW() WHERE member_id = :member_id"),
                row_data,
            )
        else:
            cols = ", ".join(row_data.keys())
            vals = ", ".join(f":{k}" for k in row_data.keys())
            await db.execute(
                text(f"INSERT INTO members ({cols}) VALUES ({vals})"),
                row_data,
            )
            inserted += 1

    await db.flush()
    return inserted if inserted > 0 else len(valid_rows)


async def _resolve_member_id(db: AsyncSession, raw_member_id: str) -> int | None:
    """Look up the internal member PK from the health-plan member_id string."""
    result = await db.execute(
        text("SELECT id FROM members WHERE member_id = :mid"),
        {"mid": raw_member_id},
    )
    return result.scalar_one_or_none()


async def _upsert_claims(
    db: AsyncSession, valid_rows: list[dict]
) -> int:
    """Bulk insert claims. Returns count of inserted rows."""
    if not valid_rows:
        return 0

    inserted = 0
    for row_data in valid_rows:
        raw_mid = row_data.pop("_member_id_raw", None)
        if raw_mid:
            member_pk = await _resolve_member_id(db, raw_mid)
            if member_pk is None:
                # Skip claims with unknown members — they can be re-processed later
                continue
            row_data["member_id"] = member_pk

        # Remove None values for cleaner insert
        clean_data = {k: v for k, v in row_data.items() if v is not None}
        # Handle array for diagnosis_codes — use parameterized binding
        dx_codes = clean_data.pop("diagnosis_codes", None)

        cols = list(clean_data.keys())
        if dx_codes:
            cols.append("diagnosis_codes")

        vals_parts = [f":{k}" for k in clean_data.keys()]
        if dx_codes:
            # Use parameterized array binding to prevent SQL injection
            dx_params = []
            for i, code in enumerate(dx_codes):
                param_name = f"_dx_{i}"
                dx_params.append(f":{param_name}")
                clean_data[param_name] = code
            vals_parts.append(f"ARRAY[{', '.join(dx_params)}]::varchar[]")

        cols_str = ", ".join(cols)
        vals_str = ", ".join(vals_parts)

        await db.execute(
            text(f"INSERT INTO claims ({cols_str}) VALUES ({vals_str})"),
            clean_data,
        )
        inserted += 1

    await db.flush()
    return inserted


async def _upsert_providers(
    db: AsyncSession, valid_rows: list[dict]
) -> int:
    """Bulk insert/update providers. Returns count."""
    if not valid_rows:
        return 0

    inserted = 0
    for row_data in valid_rows:
        result = await db.execute(
            text("SELECT id FROM providers WHERE npi = :npi"),
            {"npi": row_data["npi"]},
        )
        existing = result.scalar_one_or_none()

        if existing:
            sets = ", ".join(f"{k} = :{k}" for k in row_data if k != "npi")
            if sets:
                await db.execute(
                    text(f"UPDATE providers SET {sets}, updated_at = NOW() WHERE npi = :npi"),
                    row_data,
                )
        else:
            cols = ", ".join(row_data.keys())
            vals = ", ".join(f":{k}" for k in row_data.keys())
            await db.execute(
                text(f"INSERT INTO providers ({cols}) VALUES ({vals})"),
                row_data,
            )
            inserted += 1

    await db.flush()
    return inserted if inserted > 0 else len(valid_rows)


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

    df = _read_full_file(file_path)
    total_rows = len(df)

    reverse_map = _build_reverse_mapping(column_mapping)
    all_errors: list[dict] = []
    valid_rows: list[dict] = []

    for idx, pandas_row in df.iterrows():
        row_dict = {col: pandas_row[col] for col in df.columns}
        row_num = int(idx) + 2  # +2 for 1-based + header row

        if data_type in ("roster", "eligibility"):
            record, errors = _process_member_row(row_dict, reverse_map, row_num)
        elif data_type in ("claims", "pharmacy"):
            record, errors = _process_claim_row(row_dict, column_mapping, reverse_map, row_num)
        elif data_type == "providers":
            record, errors = _process_provider_row(row_dict, reverse_map, row_num)
        else:
            # Unknown type — try roster as default
            record, errors = _process_member_row(row_dict, reverse_map, row_num)

        all_errors.extend(errors)
        if record is not None:
            valid_rows.append(record)

    # Bulk insert based on data type
    try:
        if data_type in ("roster", "eligibility"):
            processed = await _upsert_members(db, valid_rows)
        elif data_type in ("claims", "pharmacy"):
            processed = await _upsert_claims(db, valid_rows)
        elif data_type == "providers":
            processed = await _upsert_providers(db, valid_rows)
        else:
            processed = await _upsert_members(db, valid_rows)

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Database error during ingestion: {e}")
        raise

    # Cap error list to first 100 for storage
    stored_errors = all_errors[:100]

    result = {
        "total_rows": total_rows,
        "processed_rows": processed,
        "error_rows": len(all_errors),
        "errors": stored_errors,
        "data_type": data_type,
    }

    logger.info(
        f"Ingestion complete: {total_rows} total, {processed} processed, "
        f"{len(all_errors)} errors"
    )
    return result
