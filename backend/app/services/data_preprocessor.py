"""
Data Pre-Processor — handles common real-world data messiness.

Runs BEFORE the AI column mapper and data quality gate.
Fixes issues that would otherwise cause mapping failures or
quarantine cascades. Self-learning: remembers fixes per source.

Common real-world issues handled:
1.  Encoding detection and normalization (Latin-1, UTF-8-BOM, Windows-1252)
2.  Header cleaning (strip whitespace, remove BOM, normalize case)
3.  Column name standardization (common aliases -> canonical names)
4.  Date format detection and normalization across entire column
5.  ICD-10 code cleanup (add dots, strip whitespace, handle legacy ICD-9)
6.  Name parsing (LAST, FIRST -> separate fields)
7.  Amount/currency cleaning ($, commas, parenthetical negatives)
8.  Phone/SSN/ZIP format normalization
9.  Empty row/column removal
10. Duplicate row detection
11. Encoding of special characters
12. Diagnosis code column detection (dx1, dx2... -> merged array)
"""

import logging
import os
import re
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.common_column_aliases import REVERSE_ALIAS_MAP

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Date format patterns ordered by commonality in US healthcare data
_DATE_FORMATS = [
    ("%m/%d/%Y", "MM/DD/YYYY"),
    ("%m-%d-%Y", "MM-DD-YYYY"),
    ("%Y-%m-%d", "YYYY-MM-DD"),
    ("%Y/%m/%d", "YYYY/MM/DD"),
    ("%m/%d/%y", "MM/DD/YY"),
    ("%m-%d-%y", "MM-DD-YY"),
    ("%Y%m%d", "YYYYMMDD"),
    ("%d/%m/%Y", "DD/MM/YYYY"),
    ("%d-%m-%Y", "DD-MM-YYYY"),
    ("%d-%b-%Y", "DD-Mon-YYYY"),
    ("%b %d, %Y", "Mon DD, YYYY"),
    ("%B %d, %Y", "Month DD, YYYY"),
    ("%m%d%Y", "MMDDYYYY"),
    ("%d %b %Y", "DD Mon YYYY"),
    ("%Y-%m-%dT%H:%M:%S", "ISO-8601-datetime"),
    ("%m/%d/%Y %H:%M:%S", "MM/DD/YYYY HH:MM:SS"),
    ("%m/%d/%Y %H:%M", "MM/DD/YYYY HH:MM"),
]

# Null-ish sentinel values commonly found in healthcare CSVs
_NULL_SENTINELS = frozenset({
    "", "null", "none", "na", "n/a", "nan", "#n/a", "#na", ".", "-",
    "not applicable", "not available", "unknown", "missing", "blank",
    "nil", "void", "empty",
})

# ICD-9 code prefixes that indicate legacy codes (for warning purposes)
_ICD9_PREFIXES = frozenset({
    "V", "E",  # ICD-9 supplementary
})

# 2-digit year pivot: 00-49 -> 2000s, 50-99 -> 1900s
_YEAR_PIVOT = 50

# Diagnosis column pattern
_DX_COLUMN_PATTERN = re.compile(
    r"^(dx|diag|diagnosis|icd10?|icd_10?)[\s_\-]?(\d{1,2})$", re.IGNORECASE
)


# ---------------------------------------------------------------------------
# Encoding detection
# ---------------------------------------------------------------------------

def detect_encoding(file_path: str) -> str:
    """
    Detect file encoding.

    Strategy:
    1. Check for BOM markers (UTF-8-BOM, UTF-16 LE/BE)
    2. Try strict UTF-8
    3. Try Latin-1 / Windows-1252
    4. Fall back to chardet if installed
    5. Default to utf-8 with error replacement
    """
    with open(file_path, "rb") as f:
        raw = f.read(min(65536, os.path.getsize(file_path)))

    # Check for BOM
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig"
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return "utf-16"

    # Try strict UTF-8
    try:
        raw.decode("utf-8", errors="strict")
        return "utf-8"
    except UnicodeDecodeError:
        pass

    # Try Windows-1252 (superset of Latin-1, common in healthcare exports)
    try:
        raw.decode("cp1252", errors="strict")
        return "cp1252"
    except UnicodeDecodeError:
        pass

    # Try Latin-1 (never fails technically, but check chardet first)
    try:
        import chardet
        result = chardet.detect(raw)
        if result and result.get("encoding") and result.get("confidence", 0) > 0.7:
            return result["encoding"].lower()
    except ImportError:
        pass

    # Latin-1 accepts all byte values — safe fallback
    return "latin-1"


# ---------------------------------------------------------------------------
# Header cleaning
# ---------------------------------------------------------------------------

def clean_headers(headers: list[str]) -> list[str]:
    """
    Clean and normalize column headers.

    - Strip whitespace and BOM characters
    - Lowercase
    - Replace spaces/hyphens/dots with underscores
    - Remove quotes and other non-alphanumeric chars (except underscores)
    - Handle duplicate column names (append _2, _3)
    - Standardize common abbreviations
    """
    cleaned: list[str] = []
    seen: dict[str, int] = {}

    for header in headers:
        h = str(header)

        # Strip BOM characters and whitespace
        h = h.strip().strip("\ufeff").strip("\ufffe").strip()

        # Remove surrounding quotes
        if (h.startswith('"') and h.endswith('"')) or \
           (h.startswith("'") and h.endswith("'")):
            h = h[1:-1].strip()

        # Lowercase
        h = h.lower()

        # Replace separators with underscores
        h = re.sub(r"[\s\-\.]+", "_", h)

        # Remove non-alphanumeric characters (keep underscores)
        h = re.sub(r"[^a-z0-9_]", "", h)

        # Remove leading/trailing underscores
        h = h.strip("_")

        # NOTE: Abbreviation expansion removed intentionally.
        # Expanding abbreviations (dx->diagnosis, amt->amount, etc.) before
        # alias lookup breaks the alias table which uses the short forms.
        # The alias table and AI mapper handle semantic mapping instead.

        # Collapse multiple underscores
        h = re.sub(r"_+", "_", h)

        # Handle empty header
        if not h:
            h = "unnamed_column"

        # Handle duplicates
        if h in seen:
            seen[h] += 1
            h = f"{h}_{seen[h]}"
        else:
            seen[h] = 1

        cleaned.append(h)

    return cleaned


def standardize_headers_with_aliases(headers: list[str]) -> tuple[list[str], dict[str, str]]:
    """
    After cleaning, try to map headers to canonical platform field names
    using the comprehensive alias table.

    Returns (standardized_headers, mapping_of_original_to_canonical).
    """
    standardized: list[str] = []
    alias_matches: dict[str, str] = {}

    for header in headers:
        normalized = header.strip().lower().replace(" ", "_").replace("-", "_").replace(".", "_")
        canonical = REVERSE_ALIAS_MAP.get(normalized)
        if canonical:
            standardized.append(canonical)
            alias_matches[header] = canonical
        else:
            standardized.append(header)

    return standardized, alias_matches


# ---------------------------------------------------------------------------
# Date handling
# ---------------------------------------------------------------------------

def detect_date_format(values: list[str]) -> str | None:
    """
    Detect the date format used in a column by sampling values.

    Samples up to 50 non-null values and tests each format pattern.
    Returns the format string if >80% match, None otherwise.
    Handles ambiguous MM/DD vs DD/MM by checking if any day value > 12.
    """
    # Filter to non-null, non-empty strings
    samples = []
    for v in values:
        if v is None:
            continue
        s = str(v).strip()
        if s and s.lower() not in _NULL_SENTINELS:
            samples.append(s)
        if len(samples) >= 50:
            break

    if not samples:
        return None

    best_format = None
    best_count = 0

    for fmt, _label in _DATE_FORMATS:
        success = 0
        for s in samples:
            try:
                datetime.strptime(s.split(".")[0].strip(), fmt)  # strip fractional seconds
                success += 1
            except (ValueError, TypeError):
                pass
        if success > best_count:
            best_count = success
            best_format = fmt

    if best_format and best_count / len(samples) >= 0.80:
        # Disambiguation for MM/DD vs DD/MM
        if best_format in ("%m/%d/%Y", "%d/%m/%Y"):
            has_day_above_12 = False
            for s in samples:
                parts = s.split("/")
                if len(parts) >= 2:
                    try:
                        first_part = int(parts[0])
                        if first_part > 12:
                            has_day_above_12 = True
                            break
                    except ValueError:
                        pass
            if has_day_above_12:
                # First number > 12 means it must be DD/MM
                best_format = "%d/%m/%Y"
            else:
                # Assume US format (MM/DD) when ambiguous — most healthcare data is US
                best_format = "%m/%d/%Y"

        return best_format

    return None


def _pivot_two_digit_year(year_2d: int) -> int:
    """Convert 2-digit year to 4-digit using pivot."""
    if year_2d < _YEAR_PIVOT:
        return 2000 + year_2d
    return 1900 + year_2d


def normalize_dates(values: list[str], detected_format: str) -> list[str | None]:
    """
    Convert all dates in a list to ISO format (YYYY-MM-DD).

    Handles 2-digit years with a pivot (00-49 -> 2000s, 50-99 -> 1900s).
    Returns the original value unchanged if parsing fails.
    Preserves None/NaN for originally-null values (avoids "nan" strings).
    """
    results: list[str] = []
    for v in values:
        # Preserve None/NaN — do not convert to string
        if v is None:
            results.append(None)
            continue
        s = str(v).strip()
        # Filter out NaN-like string representations
        if s.lower() in ("nan", "nat", "none", "") or s.lower() in _NULL_SENTINELS:
            results.append(None)
            continue
        try:
            # Strip fractional seconds if present
            dt = datetime.strptime(s.split(".")[0].strip(), detected_format)
            # Fix 2-digit year interpretation
            if dt.year < 100:
                dt = dt.replace(year=_pivot_two_digit_year(dt.year))
            results.append(dt.strftime("%Y-%m-%d"))
        except (ValueError, TypeError):
            results.append(v)  # leave as-is
    return results


# ---------------------------------------------------------------------------
# ICD-10 cleanup
# ---------------------------------------------------------------------------

def cleanup_icd10_codes(value: str) -> str:
    """
    Clean up a single ICD-10 code.

    - Strip whitespace
    - Convert to uppercase
    - Add dot after 3rd character if missing and length > 3
    - Detect (but do not convert) legacy ICD-9 codes
    """
    if value is None:
        return value
    s = str(value).strip().upper()
    s = s.rstrip(".")
    if not s or s.lower() in _NULL_SENTINELS:
        return s

    # Remove existing dots for normalization then re-add
    s_nodot = s.replace(".", "")

    if len(s_nodot) > 3 and "." not in s:
        # Insert dot after position 3
        s = s_nodot[:3] + "." + s_nodot[3:]

    return s


def is_likely_icd9(code: str) -> bool:
    """
    Heuristic check: is this likely an ICD-9 code rather than ICD-10?

    ICD-10 codes start with a letter (A-Z except U).
    ICD-9 codes: numeric (001-999), or V/E codes.
    """
    if not code:
        return False
    c = code.strip().upper().replace(".", "")
    if not c:
        return False
    # ICD-9 numeric: starts with digit, 3-5 chars
    if c[0].isdigit() and 3 <= len(c) <= 5:
        return True
    # ICD-9 V codes: V01-V91
    if c[0] == "V" and len(c) <= 4:
        return True
    # ICD-9 E codes: E800-E999
    if c[0] == "E" and len(c) <= 5 and len(c) >= 4:
        try:
            int(c[1:])
            return True
        except ValueError:
            pass
    return False


# ---------------------------------------------------------------------------
# Diagnosis column merging
# ---------------------------------------------------------------------------

def _find_dx_columns(columns: list[str]) -> list[str]:
    """Identify diagnosis columns (dx1, dx2, diag_1, etc.) from column list."""
    dx_cols: list[tuple[int, str]] = []
    for col in columns:
        match = _DX_COLUMN_PATTERN.match(col)
        if match:
            num = int(match.group(2))
            dx_cols.append((num, col))

    # Sort by number
    dx_cols.sort(key=lambda x: x[0])
    return [col for _, col in dx_cols]


def merge_diagnosis_columns(df: pd.DataFrame, dx_columns: list[str] | None = None) -> pd.Series:
    """
    Detect dx1, dx2, dx3... columns and merge into a single array column.

    Removes null/empty values from the resulting array.
    Returns a Series of lists.
    """
    if dx_columns is None:
        dx_columns = _find_dx_columns(list(df.columns))

    if not dx_columns:
        return pd.Series([[] for _ in range(len(df))], index=df.index)

    def _merge_row(row: pd.Series) -> list[str]:
        codes: list[str] = []
        for col in dx_columns:
            val = row.get(col)
            if val is not None:
                s = str(val).strip()
                if s and s.lower() not in _NULL_SENTINELS:
                    cleaned = cleanup_icd10_codes(s)
                    if cleaned:
                        codes.append(cleaned)
        return codes

    return df.apply(_merge_row, axis=1)


# ---------------------------------------------------------------------------
# Name parsing
# ---------------------------------------------------------------------------

_SUFFIXES = {"JR", "SR", "II", "III", "IV", "V", "MD", "DO", "PHD",
             "NP", "PA", "RN", "ESQ", "DDS", "DPM", "DC", "OD"}


def parse_name_field(value: str) -> dict[str, str | None]:
    """
    Parse a full name string into components.

    Handles:
    - "SMITH, JOHN A"       -> last=Smith, first=John, middle=A
    - "JOHN SMITH"          -> first=John, last=Smith
    - "JOHN A SMITH JR"     -> first=John, middle=A, last=Smith, suffix=Jr
    - All-caps, mixed-case

    Returns dict with keys: first_name, last_name, middle, suffix.
    """
    if not value or str(value).strip().lower() in _NULL_SENTINELS:
        return {"first_name": None, "last_name": None, "middle": None, "suffix": None}

    s = str(value).strip()

    # Detect and extract suffix
    suffix = None
    for sfx in _SUFFIXES:
        # Check if the name ends with the suffix (case-insensitive)
        pattern = re.compile(r"\b" + re.escape(sfx) + r"\.?\s*$", re.IGNORECASE)
        if pattern.search(s):
            suffix = sfx.title()
            s = pattern.sub("", s).strip().rstrip(",").strip()
            break

    # "LAST, FIRST MIDDLE" format
    if "," in s:
        parts = [p.strip() for p in s.split(",", 1)]
        last_name = parts[0]
        rest = parts[1].split() if len(parts) > 1 else []
        first_name = rest[0] if rest else None
        middle = rest[1] if len(rest) > 1 else None
    else:
        # "FIRST [MIDDLE] LAST" format
        parts = s.split()
        if len(parts) == 1:
            first_name = parts[0]
            last_name = None
            middle = None
        elif len(parts) == 2:
            first_name = parts[0]
            last_name = parts[1]
            middle = None
        else:
            first_name = parts[0]
            last_name = parts[-1]
            middle = " ".join(parts[1:-1])

    def _title(v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        # Title-case but handle single letters (initials)
        if len(v) == 1:
            return v.upper()
        return v.title()

    return {
        "first_name": _title(first_name),
        "last_name": _title(last_name),
        "middle": _title(middle),
        "suffix": suffix,
    }


# ---------------------------------------------------------------------------
# Amount / currency cleaning
# ---------------------------------------------------------------------------

def clean_amount(value: str) -> float | None:
    """
    Clean a currency/amount string to a float.

    Handles:
    - "$1,234.56" -> 1234.56
    - "(500.00)"  -> -500.0    (parenthetical negatives)
    - "N/A", "null", "-", ""   -> None
    - Trailing spaces/chars
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in _NULL_SENTINELS:
        return None

    # Detect parenthetical negative: (123.45) -> -123.45
    is_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1].strip()

    # Also detect leading minus
    if s.startswith("-"):
        is_negative = True
        s = s[1:].strip()

    # Remove currency symbols and commas
    s = s.replace("$", "").replace(",", "").replace(" ", "")

    # Remove trailing non-numeric (e.g., "100.00 USD")
    s = re.sub(r"[^0-9.\-].*$", "", s)

    if not s:
        return None

    try:
        result = float(s)
        return -result if is_negative else result
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Phone / SSN / ZIP normalization
# ---------------------------------------------------------------------------

def normalize_phone(value: str) -> str | None:
    """
    Normalize a US phone number to (XXX) XXX-XXXX format.

    Handles: 1234567890, 123-456-7890, (123)456-7890, +1-123-456-7890, etc.
    Returns None for invalid/empty values.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in _NULL_SENTINELS:
        return None

    # Extract only digits
    digits = re.sub(r"\D", "", s)

    # Remove leading country code "1" if 11 digits
    if len(digits) == 11 and digits[0] == "1":
        digits = digits[1:]

    if len(digits) != 10:
        return s  # Return as-is if not a valid 10-digit phone

    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def normalize_ssn(value: str) -> str | None:
    """
    Normalize SSN to XXX-XX-XXXX format.

    Returns None for invalid/empty values.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in _NULL_SENTINELS:
        return None

    digits = re.sub(r"\D", "", s)
    if len(digits) != 9:
        return s  # Return as-is

    return f"{digits[:3]}-{digits[3:5]}-{digits[5:]}"


def normalize_zip(value: str) -> str | None:
    """
    Normalize ZIP code to 5-digit or ZIP+4 format.

    Handles: "12345", "12345-6789", "123456789", "12345.0" (float artifact).
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in _NULL_SENTINELS:
        return None

    # Handle float artifact: "12345.0"
    if "." in s:
        try:
            s = str(int(float(s)))
        except (ValueError, TypeError):
            pass

    digits = re.sub(r"\D", "", s)

    if len(digits) == 5:
        return digits
    if len(digits) == 9:
        return f"{digits[:5]}-{digits[5:]}"
    if len(digits) == 4:
        # Leading zero dropped — common for northeast US ZIPs
        return f"0{digits}"

    return s  # Return as-is


# ---------------------------------------------------------------------------
# Empty row / column removal and duplicate detection
# ---------------------------------------------------------------------------

def remove_empty_rows(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """
    Drop rows where ALL values are null/empty.

    Returns (cleaned_df, count_removed).
    """
    # Vectorized approach: replace null sentinels with NaN in one pass,
    # then check if all columns are null per row.
    df_check = df.replace(
        to_replace={col: {v: pd.NA for v in _NULL_SENTINELS} for col in df.columns}
    )
    # Also catch actual None/NaN and whitespace-only strings
    df_check = df_check.where(
        df_check.apply(lambda col: col.astype(str).str.strip() != "", axis=0),
        other=pd.NA,
    )
    mask = df_check.isna().all(axis=1)
    removed_count = mask.sum()
    return df[~mask].reset_index(drop=True), int(removed_count)


def remove_empty_columns(df: pd.DataFrame, threshold: float = 0.95) -> tuple[pd.DataFrame, list[str]]:
    """
    Drop columns where >threshold proportion of values are null/empty.

    Returns (cleaned_df, list_of_removed_column_names).
    """
    removed: list[str] = []
    cols_to_keep: list[str] = []

    for col in df.columns:
        null_count = df[col].apply(
            lambda x: 1 if (x is None or str(x).strip().lower() in _NULL_SENTINELS or str(x).strip() == "") else 0
        ).sum()
        null_ratio = null_count / len(df) if len(df) > 0 else 1.0
        if null_ratio > threshold:
            removed.append(col)
        else:
            cols_to_keep.append(col)

    return df[cols_to_keep].copy(), removed


def detect_duplicates(df: pd.DataFrame, remove: bool = True) -> tuple[pd.DataFrame, int]:
    """
    Identify exact duplicate rows (ALL columns identical).

    IMPORTANT: This only removes rows where EVERY column is identical —
    meaning it's a true data entry error or file export bug.
    It does NOT remove rows that merely share some fields like:
    - Same member + same date + different procedure (legitimate)
    - Same diagnosis at multiple encounters (recapture)
    - Same medication filled twice (early refill, dose change)
    - Multiple claims for same admission (facility + professional)

    Healthcare data frequently has legitimate "duplicates" by some fields.
    Only exact full-row duplication is safe to remove.

    Args:
        df: DataFrame to check
        remove: If True, removes duplicates. If False, only counts them.

    Returns (cleaned_df, count_found).
    """
    before = len(df)
    duplicated_count = df.duplicated(keep="first").sum()

    if remove and duplicated_count > 0:
        df_deduped = df.drop_duplicates(keep="first").reset_index(drop=True)
        return df_deduped, int(duplicated_count)

    return df, int(duplicated_count)


# ---------------------------------------------------------------------------
# Column-type detection helpers
# ---------------------------------------------------------------------------

def _looks_like_date_column(series: pd.Series) -> bool:
    """Heuristic: does this column contain date-like values?"""
    sample = series.dropna().head(20).astype(str)
    if sample.empty:
        return False
    date_pattern = re.compile(
        r"^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$"  # MM/DD/YYYY or DD/MM/YYYY
        r"|^\d{4}[/\-]\d{1,2}[/\-]\d{1,2}$"     # YYYY-MM-DD
        r"|^\d{8}$"                                # YYYYMMDD
    )
    match_count = sum(1 for v in sample if date_pattern.match(str(v).strip()))
    return match_count / len(sample) >= 0.6


def _looks_like_amount_column(series: pd.Series) -> bool:
    """Heuristic: does this column contain monetary amounts?"""
    sample = series.dropna().head(20).astype(str)
    if sample.empty:
        return False
    amount_pattern = re.compile(r"^[\$\(]?\-?\$?\d[\d,]*\.?\d*\)?$")
    match_count = sum(1 for v in sample if amount_pattern.match(str(v).strip()))
    return match_count / len(sample) >= 0.6


def _looks_like_icd_column(col_name: str, series: pd.Series) -> bool:
    """Heuristic: does this column contain ICD codes?"""
    name_lower = col_name.lower()
    name_signals = ("dx", "diag", "icd", "diagnosis")
    if not any(sig in name_lower for sig in name_signals):
        return False

    sample = series.dropna().head(20).astype(str)
    if sample.empty:
        return False

    # ICD-10 pattern: letter + digits, optionally with dot
    icd_pattern = re.compile(r"^[A-TV-Z]\d{2,4}\.?\d{0,4}$", re.IGNORECASE)
    match_count = sum(1 for v in sample if icd_pattern.match(str(v).strip()))
    return match_count / len(sample) >= 0.5


def _looks_like_phone_column(col_name: str) -> bool:
    """Check column name for phone-related keywords."""
    return any(kw in col_name.lower() for kw in ("phone", "tel", "fax", "mobile", "cell"))


def _looks_like_ssn_column(col_name: str) -> bool:
    """Check column name for SSN-related keywords."""
    return any(kw in col_name.lower() for kw in ("ssn", "social_security", "ss_number"))


def _looks_like_zip_column(col_name: str) -> bool:
    """Check column name for ZIP-related keywords."""
    return any(kw in col_name.lower() for kw in ("zip", "postal", "zip_code", "zipcode"))


def _looks_like_name_column(col_name: str, series: pd.Series) -> bool:
    """Check if column contains combined name values (LAST, FIRST format)."""
    _NAME_COLUMN_EXACT = {"full_name", "member_name", "patient_name", "name"}
    name_lower = col_name.lower().strip()
    if name_lower not in _NAME_COLUMN_EXACT:
        return False
    # Check for comma-separated names in sample
    sample = series.dropna().head(20).astype(str)
    comma_count = sum(1 for v in sample if "," in str(v))
    return comma_count / max(len(sample), 1) >= 0.5


# ---------------------------------------------------------------------------
# Headerless CSV detection
# ---------------------------------------------------------------------------

def _detect_headerless_csv(columns: list[str]) -> bool:
    """
    Heuristic: detect if a CSV's first row is data, not headers.

    If most "column names" look like dates, numbers, ICD codes, or other
    data values, the file likely has no header row.
    """
    if not columns:
        return False

    data_like_count = 0
    date_pattern = re.compile(r"^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$")
    number_pattern = re.compile(r"^[\$\-]?\d[\d,]*\.?\d*$")
    icd_pattern = re.compile(r"^[A-Z]\d{2,4}\.?\d{0,4}$", re.IGNORECASE)

    for col in columns:
        s = str(col).strip()
        if date_pattern.match(s) or number_pattern.match(s) or icd_pattern.match(s):
            data_like_count += 1
        # Also flag if "column name" is entirely numeric (common for headerless CSVs)
        elif s.replace(".", "").replace("-", "").isdigit():
            data_like_count += 1

    # If >60% of columns look like data values, it's likely headerless
    return data_like_count / len(columns) >= 0.6


# ---------------------------------------------------------------------------
# Main preprocessing entry point
# ---------------------------------------------------------------------------

def preprocess_file(file_path: str, source_name: str | None = None) -> dict[str, Any]:
    """
    Main data pre-processing entry point.

    Runs on raw file data BEFORE the AI column mapper and validation pipeline.
    Detects and fixes common real-world data messiness.

    Args:
        file_path: Path to the uploaded CSV/Excel file.
        source_name: Optional source identifier for learning per-source fixes.

    Returns:
        {
            "cleaned_path": str | None,
            "original_encoding": str,
            "headers_cleaned": list[str],
            "changes_made": list[dict],
            "rows_removed": int,
            "columns_removed": list[str],
            "date_format_detected": dict,
            "diagnosis_columns_merged": bool,
            "warnings": list[str],
        }
    """
    changes: list[dict] = []
    warnings: list[str] = []
    rows_removed = 0
    columns_removed: list[str] = []
    date_formats_detected: dict[str, str] = {}
    diagnosis_merged = False
    merged_dx_columns: list[str] = []

    # ---------------------------------------------------------------
    # Step 0: File size check — skip full preprocessing for very large files
    # ---------------------------------------------------------------
    _MAX_PREPROCESS_SIZE = 200 * 1024 * 1024  # 200 MB
    try:
        file_size = os.path.getsize(file_path)
    except OSError:
        file_size = 0

    if file_size > _MAX_PREPROCESS_SIZE:
        logger.warning(
            "File '%s' is %d MB — exceeds 200 MB limit. "
            "Skipping full preprocessing; only doing header cleaning + encoding detection.",
            file_path, file_size // (1024 * 1024),
        )
        file_ext = Path(file_path).suffix.lower()
        is_csv = file_ext not in (".xlsx", ".xls")
        original_encoding = detect_encoding(file_path) if is_csv else "n/a (excel)"

        # Read just the headers (first row)
        try:
            if is_csv:
                df_head = pd.read_csv(file_path, nrows=0, dtype=str, encoding=original_encoding)
            else:
                df_head = pd.read_excel(file_path, nrows=0, dtype=str)
            cleaned_hdrs = clean_headers(list(df_head.columns))
        except Exception as e:
            logger.warning("Failed to read headers from large file %s: %s", file_path, e)
            cleaned_hdrs = []

        warnings.append(
            f"File is {file_size // (1024 * 1024)} MB — only header cleaning and "
            "encoding detection were performed to avoid memory issues."
        )
        return {
            "cleaned_path": None,
            "original_encoding": original_encoding,
            "headers_cleaned": cleaned_hdrs,
            "changes_made": [],
            "rows_removed": 0,
            "columns_removed": [],
            "date_format_detected": {},
            "diagnosis_columns_merged": False,
            "merged_dx_columns": [],
            "warnings": warnings,
        }

    # ---------------------------------------------------------------
    # Step 1: Detect encoding
    # ---------------------------------------------------------------
    file_ext = Path(file_path).suffix.lower()
    is_csv = file_ext not in (".xlsx", ".xls")

    if is_csv:
        original_encoding = detect_encoding(file_path)
    else:
        original_encoding = "n/a (excel)"

    # ---------------------------------------------------------------
    # Step 2: Read the file into a DataFrame
    # ---------------------------------------------------------------
    try:
        if is_csv:
            df = pd.read_csv(file_path, dtype=str, encoding=original_encoding)
            # Detect headerless CSV: if all "column names" look like data values
            # (e.g., dates, numbers, ICD codes) rather than field names, re-read with no header
            _header_looks_like_data = _detect_headerless_csv(list(df.columns))
            if _header_looks_like_data:
                df = pd.read_csv(file_path, dtype=str, encoding=original_encoding, header=None)
                # Generate placeholder column names
                df.columns = [f"column_{i+1}" for i in range(len(df.columns))]
                changes.append({
                    "type": "headerless_csv",
                    "description": "No header row detected — generated placeholder column names (column_1, column_2, ...)",
                    "rows_affected": len(df),
                })
                warnings.append(
                    "CSV appears to have no header row. Placeholder column names were generated. "
                    "Column mapping will need to be configured manually or via AI mapper."
                )
            if original_encoding not in ("utf-8", "utf-8-sig"):
                changes.append({
                    "type": "encoding",
                    "description": f"Detected and converted encoding from {original_encoding} to UTF-8",
                    "rows_affected": len(df),
                })
        else:
            # Handle Excel files with multiple sheets: concatenate all sheets
            xls = pd.ExcelFile(file_path)
            sheet_names = xls.sheet_names
            if len(sheet_names) > 1:
                dfs = []
                for sheet in sheet_names:
                    sheet_df = pd.read_excel(file_path, sheet_name=sheet, dtype=str)
                    if not sheet_df.empty:
                        dfs.append(sheet_df)
                if dfs:
                    # Only concatenate sheets with matching columns (same schema)
                    ref_cols = set(dfs[0].columns)
                    matching = [dfs[0]]
                    other_sheets = []
                    for sdf in dfs[1:]:
                        if set(sdf.columns) == ref_cols:
                            matching.append(sdf)
                        else:
                            other_sheets.append(sdf)
                    df = pd.concat(matching, ignore_index=True) if matching else dfs[0]
                    if other_sheets:
                        warnings.append(
                            f"Excel file has {len(sheet_names)} sheets. "
                            f"Merged {len(matching)} sheets with matching columns; "
                            f"ignored {len(other_sheets)} sheets with different schemas."
                        )
                    else:
                        changes.append({
                            "type": "multi_sheet_merge",
                            "description": f"Merged {len(matching)} Excel sheets into single dataset ({len(df)} rows)",
                            "rows_affected": len(df),
                        })
                else:
                    df = pd.DataFrame()
            else:
                df = pd.read_excel(file_path, dtype=str)
    except Exception as e:
        logger.error("Failed to read file during preprocessing: %s", e)
        return {
            "cleaned_path": None,
            "original_encoding": original_encoding,
            "headers_cleaned": [],
            "changes_made": [],
            "rows_removed": 0,
            "columns_removed": [],
            "date_format_detected": {},
            "diagnosis_columns_merged": False,
            "merged_dx_columns": [],
            "warnings": [f"Could not read file: {e}"],
        }

    if df.empty:
        warnings.append("File contains no data rows")
        return {
            "cleaned_path": None,
            "original_encoding": original_encoding,
            "headers_cleaned": list(df.columns),
            "changes_made": [],
            "rows_removed": 0,
            "columns_removed": [],
            "date_format_detected": {},
            "diagnosis_columns_merged": False,
            "merged_dx_columns": [],
            "warnings": warnings,
        }

    # ---------------------------------------------------------------
    # Step 3: Clean headers
    # ---------------------------------------------------------------
    original_headers = list(df.columns)
    cleaned_hdrs = clean_headers(original_headers)

    if cleaned_hdrs != original_headers:
        header_changes = []
        for orig, clean in zip(original_headers, cleaned_hdrs):
            if orig != clean:
                header_changes.append(f"'{orig}' -> '{clean}'")
        if header_changes:
            changes.append({
                "type": "header_cleaning",
                "description": f"Cleaned {len(header_changes)} column headers: {'; '.join(header_changes[:10])}"
                               + (f" (and {len(header_changes) - 10} more)" if len(header_changes) > 10 else ""),
                "rows_affected": 0,
            })

    df.columns = cleaned_hdrs

    # ---------------------------------------------------------------
    # Step 4: Remove empty rows
    # ---------------------------------------------------------------
    df, empty_rows = remove_empty_rows(df)
    if empty_rows > 0:
        rows_removed += empty_rows
        changes.append({
            "type": "empty_row_removal",
            "description": f"Removed {empty_rows} completely empty rows",
            "rows_affected": empty_rows,
        })

    # ---------------------------------------------------------------
    # Step 5: Remove empty columns (>95% null)
    # ---------------------------------------------------------------
    df, empty_cols = remove_empty_columns(df)
    if empty_cols:
        columns_removed = empty_cols
        changes.append({
            "type": "empty_column_removal",
            "description": f"Removed {len(empty_cols)} mostly-empty columns: {', '.join(empty_cols[:10])}",
            "rows_affected": 0,
        })

    # ---------------------------------------------------------------
    # Step 6: Detect exact duplicate rows (ALL columns identical)
    # NOTE: Only removes rows where EVERY column matches. Does NOT
    # remove legitimate records that share some fields (same member +
    # same date + different procedure, etc.). Healthcare data commonly
    # has "partial duplicates" that are valid separate records.
    # ---------------------------------------------------------------
    df, dup_count = detect_duplicates(df, remove=True)
    if dup_count > 0:
        rows_removed += dup_count
        changes.append({
            "type": "duplicate_removal",
            "description": f"Removed {dup_count} exact duplicate rows (all columns identical — safe to remove)",
            "rows_affected": dup_count,
        })

    # ---------------------------------------------------------------
    # Step 7: Detect and normalize dates
    # ---------------------------------------------------------------
    for col in df.columns:
        if _looks_like_date_column(df[col]):
            values = df[col].dropna().astype(str).tolist()
            fmt = detect_date_format(values)
            if fmt and fmt != "%Y-%m-%d":
                date_formats_detected[col] = fmt
                all_values = df[col].astype(str).tolist()
                normalized = normalize_dates(all_values, fmt)
                df[col] = normalized
                changes.append({
                    "type": "date_normalization",
                    "description": f"Normalized dates in '{col}' from {fmt} to ISO format (YYYY-MM-DD)",
                    "rows_affected": len(df),
                })
            elif fmt == "%Y-%m-%d":
                date_formats_detected[col] = fmt

    # ---------------------------------------------------------------
    # Step 8: Clean ICD codes
    # ---------------------------------------------------------------
    icd9_warnings: list[str] = []
    for col in df.columns:
        if _looks_like_icd_column(col, df[col]):
            original_values = df[col].copy()
            df[col] = df[col].apply(
                lambda x: cleanup_icd10_codes(x) if pd.notna(x) else x
            )
            changed_count = (df[col] != original_values).sum()
            if changed_count > 0:
                changes.append({
                    "type": "icd_cleanup",
                    "description": f"Cleaned ICD codes in '{col}' (added dots, normalized case) — {changed_count} values",
                    "rows_affected": int(changed_count),
                })

            # Check for ICD-9 codes
            icd9_count = df[col].dropna().apply(lambda x: is_likely_icd9(str(x))).sum()
            if icd9_count > 0:
                pct = icd9_count / max(df[col].dropna().shape[0], 1) * 100
                icd9_warnings.append(
                    f"Column '{col}' contains {icd9_count} likely ICD-9 codes ({pct:.0f}%)"
                )

    if icd9_warnings:
        warnings.extend(icd9_warnings)

    # ---------------------------------------------------------------
    # Step 9: Merge diagnosis columns (dx1, dx2, ...)
    # ---------------------------------------------------------------
    dx_columns = _find_dx_columns(list(df.columns))
    if len(dx_columns) >= 2:
        df["diagnosis_codes"] = merge_diagnosis_columns(df, dx_columns)
        diagnosis_merged = True
        merged_dx_columns = list(dx_columns)
        changes.append({
            "type": "diagnosis_merge",
            "description": f"Merged {len(dx_columns)} diagnosis columns ({', '.join(dx_columns)}) into 'diagnosis_codes' array",
            "rows_affected": len(df),
        })
        # Do NOT drop original dx columns — mapper may still want them
        # But record them so downstream mapper can skip them if diagnosis_codes exists

    # ---------------------------------------------------------------
    # Step 10: Clean currency/amount columns
    # ---------------------------------------------------------------
    for col in df.columns:
        if _looks_like_amount_column(df[col]):
            original_values = df[col].copy()
            df[col] = df[col].apply(
                lambda x: f"{clean_amount(str(x)):.2f}" if pd.notna(x) and clean_amount(str(x)) is not None else x
            )
            changed_count = (df[col] != original_values).sum()
            if changed_count > 0:
                changes.append({
                    "type": "amount_cleanup",
                    "description": f"Cleaned currency values in '{col}' (removed $, commas, fixed negatives) — {changed_count} values",
                    "rows_affected": int(changed_count),
                })

    # ---------------------------------------------------------------
    # Step 11: Normalize phone numbers
    # ---------------------------------------------------------------
    for col in df.columns:
        if _looks_like_phone_column(col):
            original_values = df[col].copy()
            df[col] = df[col].apply(lambda x: normalize_phone(str(x)) if pd.notna(x) else x)
            changed_count = (df[col] != original_values).sum()
            if changed_count > 0:
                changes.append({
                    "type": "phone_normalization",
                    "description": f"Normalized phone numbers in '{col}' — {changed_count} values",
                    "rows_affected": int(changed_count),
                })

    # ---------------------------------------------------------------
    # Step 12: Normalize SSN
    # ---------------------------------------------------------------
    for col in df.columns:
        if _looks_like_ssn_column(col):
            original_values = df[col].copy()
            df[col] = df[col].apply(lambda x: normalize_ssn(str(x)) if pd.notna(x) else x)
            changed_count = (df[col] != original_values).sum()
            if changed_count > 0:
                changes.append({
                    "type": "ssn_normalization",
                    "description": f"Normalized SSNs in '{col}' — {changed_count} values",
                    "rows_affected": int(changed_count),
                })

    # ---------------------------------------------------------------
    # Step 13: Normalize ZIP codes
    # ---------------------------------------------------------------
    for col in df.columns:
        if _looks_like_zip_column(col):
            original_values = df[col].copy()
            df[col] = df[col].apply(lambda x: normalize_zip(str(x)) if pd.notna(x) else x)
            changed_count = (df[col] != original_values).sum()
            if changed_count > 0:
                changes.append({
                    "type": "zip_normalization",
                    "description": f"Normalized ZIP codes in '{col}' — {changed_count} values",
                    "rows_affected": int(changed_count),
                })

    # ---------------------------------------------------------------
    # Step 14: Detect and split combined name columns
    # ---------------------------------------------------------------
    for col in list(df.columns):
        if _looks_like_name_column(col, df[col]):
            parsed = df[col].apply(lambda x: parse_name_field(str(x)) if pd.notna(x) else
                                   {"first_name": None, "last_name": None, "middle": None, "suffix": None})
            # Only split if first_name/last_name columns don't already exist
            if "first_name" not in df.columns and "last_name" not in df.columns:
                df["first_name"] = parsed.apply(lambda x: x["first_name"])
                df["last_name"] = parsed.apply(lambda x: x["last_name"])
                middle_has_values = parsed.apply(lambda x: x["middle"]).notna().any()
                if middle_has_values:
                    df["middle_name"] = parsed.apply(lambda x: x["middle"])
                changes.append({
                    "type": "name_parsing",
                    "description": f"Parsed combined name column '{col}' into first_name, last_name"
                                   + (", middle_name" if middle_has_values else ""),
                    "rows_affected": len(df),
                })
                warnings.append(f"Split name column '{col}' — please verify first/last name assignment")

    # ---------------------------------------------------------------
    # Step 15: Write cleaned file to temp location
    # ---------------------------------------------------------------
    try:
        suffix = ".csv"  # Always write cleaned output as CSV for consistency
        temp_dir = Path(tempfile.gettempdir()) / "aqsoft_preprocessed"
        temp_dir.mkdir(parents=True, exist_ok=True)

        cleaned_filename = f"cleaned_{Path(file_path).stem}_{uuid.uuid4().hex[:12]}{suffix}"
        cleaned_path = str(temp_dir / cleaned_filename)

        # Handle the diagnosis_codes column (list -> semicolon-separated for CSV)
        df_out = df.copy()
        if "diagnosis_codes" in df_out.columns:
            df_out["diagnosis_codes"] = df_out["diagnosis_codes"].apply(
                lambda x: ";".join(x) if isinstance(x, list) else x
            )

        df_out.to_csv(cleaned_path, index=False, encoding="utf-8")

        if changes:
            logger.info(
                "Preprocessor made %d changes to '%s' (source=%s). Cleaned file: %s",
                len(changes), file_path, source_name or "unknown", cleaned_path,
            )

    except Exception as e:
        logger.error("Failed to write cleaned file: %s", e)
        cleaned_path = None
        warnings.append(f"Could not write cleaned file: {e}")

    return {
        "cleaned_path": cleaned_path,
        "original_encoding": original_encoding,
        "headers_cleaned": list(df.columns),
        "changes_made": changes,
        "rows_removed": rows_removed,
        "columns_removed": columns_removed,
        "date_format_detected": date_formats_detected,
        "diagnosis_columns_merged": diagnosis_merged,
        "merged_dx_columns": merged_dx_columns,
        "warnings": warnings,
    }
