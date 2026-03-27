#!/usr/bin/env python3
"""
Import CMS MOOP & Cost Sharing data from CSV files into structured JSON.

Reads all CSV files from a CY (Contract Year) folder and extracts the key
cost sharing limits per service category per MOOP tier. Outputs a single
structured JSON file: backend/data/cms_cost_sharing_{year}.json

Usage:
    python import_cms_moop_data.py --year 2026
    python import_cms_moop_data.py --year 2027
    python import_cms_moop_data.py  # processes both 2026 and 2027
"""

import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

# Project root
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR / "data"


def parse_dollar(val: str) -> float | None:
    """Parse a dollar string like '$1,748.00' or '$20.00/day' into a float."""
    if not val or not val.strip():
        return None
    val = val.strip()
    # Remove /day suffix
    val = re.sub(r"/day$", "", val)
    # Remove dollar sign, commas, spaces
    val = val.replace("$", "").replace(",", "").strip()
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def read_csv(filepath: Path) -> list[list[str]]:
    """Read a CSV file and return rows as list of lists."""
    rows = []
    # Try utf-8-sig first, fall back to latin-1 for files with special chars
    for encoding in ["utf-8-sig", "latin-1", "cp1252"]:
        try:
            with open(filepath, "r", encoding=encoding) as f:
                reader = csv.reader(f)
                for row in reader:
                    rows.append(row)
            return rows
        except UnicodeDecodeError:
            rows = []
            continue
    raise ValueError(f"Could not decode {filepath} with any supported encoding")
    return rows


def find_row_by_prefix(rows: list[list[str]], col: int, prefix: str) -> list[str] | None:
    """Find the first row where column `col` starts with `prefix`."""
    for row in rows:
        if len(row) > col and row[col].strip().startswith(prefix):
            return row
    return None


def find_row_containing(rows: list[list[str]], col: int, substring: str) -> list[str] | None:
    """Find the first row where column `col` contains `substring`."""
    for row in rows:
        if len(row) > col and substring.lower() in row[col].lower():
            return row
    return None


def find_table_start(rows: list[list[str]], table_keyword: str) -> int | None:
    """Find the row index where a table header containing the keyword starts."""
    for i, row in enumerate(rows):
        if row and table_keyword.lower() in row[0].lower():
            return i
    return None


def parse_moop_limits(csv_path: Path, year: int) -> dict:
    """Parse MOOP Limits.csv to extract in-network and catastrophic limits."""
    rows = read_csv(csv_path)
    result = {}

    # Strategy: Look in Table 4 (historical table) - has all 3 tiers in one row
    # The row containing "Final CY {year} MOOP Limits" has Lower, Intermediate, Mandatory
    table4_start = find_table_start(rows, "MOOP Limits by Contract Year")
    if table4_start is not None:
        target = f"final cy {year} moop limits"
        for row in rows[table4_start:]:
            if len(row) >= 5 and target in row[1].lower():
                lower = parse_dollar(row[2])
                intermediate = parse_dollar(row[3])
                mandatory = parse_dollar(row[4])
                if lower:
                    result["lower_in_network"] = lower
                if intermediate:
                    result["intermediate_in_network"] = intermediate
                if mandatory:
                    result["mandatory_in_network"] = mandatory
                break

    # Fallback: parse from Table 1 (lower/mandatory) and Table 2 (intermediate)
    if "lower_in_network" not in result or "mandatory_in_network" not in result:
        # Table 1 row G or row E with "Final" and dollar range
        for row in rows:
            if len(row) >= 4 and row[0].strip() == "E" and "rounded" in row[1].lower() and "moop limit" in row[1].lower():
                lower = parse_dollar(row[2])
                mandatory = parse_dollar(row[3])
                if lower and "lower_in_network" not in result:
                    result["lower_in_network"] = lower
                if mandatory and "mandatory_in_network" not in result:
                    result["mandatory_in_network"] = mandatory

    if "intermediate_in_network" not in result:
        for row in rows:
            if len(row) >= 3 and row[0].strip() == "D" and "intermediate" in row[1].lower() and "moop" in row[1].lower() and "rounded" in row[1].lower():
                val = parse_dollar(row[2])
                if val:
                    result["intermediate_in_network"] = val
                    break

    # Table 3 / row C: Combined catastrophic limits
    table3_start = find_table_start(rows, "Combined and Total Catastrophic")
    if table3_start is not None:
        for row in rows[table3_start:]:
            if len(row) >= 5 and row[0].strip() == "C" and "catastrophic" in row[1].lower():
                lower_cat = parse_dollar(row[2])
                intermediate_cat = parse_dollar(row[3])
                mandatory_cat = parse_dollar(row[4])
                if lower_cat:
                    result["lower_catastrophic"] = lower_cat
                if intermediate_cat:
                    result["intermediate_catastrophic"] = intermediate_cat
                if mandatory_cat:
                    result["mandatory_catastrophic"] = mandatory_cat
                break

    return {
        "lower": {
            "in_network": result.get("lower_in_network"),
            "combined_catastrophic": result.get("lower_catastrophic"),
        },
        "intermediate": {
            "in_network": result.get("intermediate_in_network"),
            "combined_catastrophic": result.get("intermediate_catastrophic"),
        },
        "mandatory": {
            "in_network": result.get("mandatory_in_network"),
            "combined_catastrophic": result.get("mandatory_catastrophic"),
        },
    }


def parse_inpatient_acute(csv_path: Path) -> dict:
    """Parse Inpatient Hospital Acute cost sharing by MOOP tier and LOS."""
    rows = read_csv(csv_path)
    result = {}

    # Find the final cost sharing rows (row F or D with "Final" in description)
    # Table 2 = Mandatory (row F), Table 3 = Lower (row D), Table 4 = Intermediate (row F)

    tier_map = {
        "mandatory": "Mandatory",
        "lower": "Lower",
        "intermediate": "Intermediate",
    }

    for tier_key, tier_label in tier_map.items():
        # Find the table for this tier
        table_start = None
        for i, row in enumerate(rows):
            if row and tier_label.lower() in row[0].lower() and "inpatient hospital acute cost sharing" in row[0].lower():
                table_start = i
                break

        if table_start is None:
            continue

        # Find the "Final CY" row -- description starts with "Final CY"
        final_row = None
        for row in rows[table_start + 1:]:
            if not row or not row[0].strip():
                break
            desc = row[1].strip() if len(row) > 1 else ""
            if desc.lower().startswith("final cy") and "cost sharing limit" in desc.lower():
                final_row = row
                break

        if final_row and len(final_row) >= 6:
            result[tier_key] = {
                "3_day": parse_dollar(final_row[2]),
                "6_day": parse_dollar(final_row[3]),
                "10_day": parse_dollar(final_row[4]),
                "60_day": parse_dollar(final_row[5]),
            }

    return result


def parse_inpatient_psychiatric(csv_path: Path) -> dict:
    """Parse Inpatient Hospital Psychiatric cost sharing by MOOP tier and LOS."""
    rows = read_csv(csv_path)
    result = {}

    tier_map = {
        "mandatory": "Mandatory",
        "lower": "Lower",
        "intermediate": "Intermediate",
    }

    for tier_key, tier_label in tier_map.items():
        table_start = None
        for i, row in enumerate(rows):
            if row and tier_label.lower() in row[0].lower() and "psychiatric cost sharing" in row[0].lower():
                table_start = i
                break

        if table_start is None:
            continue

        final_row = None
        for row in rows[table_start + 1:]:
            if not row or not row[0].strip():
                break
            desc = row[1].strip() if len(row) > 1 else ""
            if desc.lower().startswith("final cy") and "cost sharing limit" in desc.lower():
                final_row = row
                break

        if final_row and len(final_row) >= 5:
            result[tier_key] = {
                "8_day": parse_dollar(final_row[2]),
                "15_day": parse_dollar(final_row[3]),
                "60_day": parse_dollar(final_row[4]),
            }

    return result


def parse_snf(csv_path: Path) -> dict:
    """Parse Skilled Nursing Facility cost sharing."""
    rows = read_csv(csv_path)
    result = {}

    # Table 1: Days 1-20 per day by MOOP type
    # The data row has dollar values in cols 1-3 (with /day suffix)
    for row in rows:
        if len(row) >= 4:
            lower = parse_dollar(row[1])
            intermediate = parse_dollar(row[2])
            mandatory = parse_dollar(row[3])
            if lower is not None and intermediate is not None and mandatory is not None:
                result["days_1_20_per_day"] = {
                    "lower": lower,
                    "intermediate": intermediate,
                    "mandatory": mandatory,
                }
                break

    # Table 2: Days 21-100 per day (all MOOP types)
    for row in rows:
        if len(row) >= 3 and row[0].strip() == "C" and "day" in row[1].lower() and "21" in row[1].lower():
            val = parse_dollar(row[2])
            if val is not None:
                result["days_21_100_per_day"] = val
                break

    return result


def parse_emergency(csv_path: Path) -> dict:
    """Parse Emergency Services cost sharing (simple per-visit by MOOP)."""
    rows = read_csv(csv_path)
    for row in rows:
        if len(row) >= 4:
            lower = parse_dollar(row[1])
            intermediate = parse_dollar(row[2])
            mandatory = parse_dollar(row[3])
            if lower is not None and intermediate is not None and mandatory is not None:
                return {
                    "lower": lower,
                    "intermediate": intermediate,
                    "mandatory": mandatory,
                }
    return {}


def parse_copay_by_moop_tier(csv_path: Path) -> dict:
    """
    Parse a standard copayment-by-MOOP-tier CSV.
    These have a Table 2 with row D containing final copayment limits
    for Lower, Intermediate, Mandatory MOOP types.
    Used for: Primary Care, Specialist, Chiropractic, OT, PT/SLP,
    Mental Health, Psychiatric, Cardiac Rehab, Intensive Cardiac Rehab,
    Pulmonary Rehab, SET for PAD, Partial Hospitalization, Intensive Outpatient,
    Urgently Needed Services.
    """
    rows = read_csv(csv_path)

    # Find the last row D with "Final" and "copayment limit" in description
    final_row = None
    for row in rows:
        if len(row) >= 5 and row[0].strip() == "D":
            desc = row[1] if len(row) > 1 else ""
            if "final" in desc.lower() and "copayment limit" in desc.lower():
                final_row = row

    if final_row and len(final_row) >= 5:
        lower = parse_dollar(final_row[2])
        intermediate = parse_dollar(final_row[3])
        mandatory = parse_dollar(final_row[4])
        if lower is not None and intermediate is not None and mandatory is not None:
            return {
                "lower": lower,
                "intermediate": intermediate,
                "mandatory": mandatory,
            }

    return {}


def parse_all_moop_single(csv_path: Path) -> dict:
    """
    Parse a CSV with a single copayment limit for all MOOP types.
    Used for: Dialysis, Part B Drugs-Other, Part B Chemo/Radiation,
    Therapeutic Radiological Services.
    """
    rows = read_csv(csv_path)

    for row in rows:
        if len(row) >= 3 and row[0].strip() == "D":
            desc = row[1] if len(row) > 1 else ""
            if "final" in desc.lower() and "copayment limit" in desc.lower():
                val = parse_dollar(row[2])
                if val is not None:
                    return {
                        "lower": val,
                        "intermediate": val,
                        "mandatory": val,
                    }

    return {}


def parse_insulin(csv_path: Path) -> dict:
    """Parse Part B Drugs-Insulin (flat $35 for all MOOP types)."""
    rows = read_csv(csv_path)
    for row in rows:
        if len(row) >= 2 and "cost sharing limit" in row[0].lower():
            val = parse_dollar(row[1])
            if val is not None:
                return {
                    "lower": val,
                    "intermediate": val,
                    "mandatory": val,
                    "note": "Per month supply per insulin type per beneficiary (Inflation Reduction Act)",
                }
    return {}


def parse_home_health(csv_path: Path) -> dict:
    """Parse Home Health (only lower MOOP has cost sharing; intermediate/mandatory = $0)."""
    rows = read_csv(csv_path)
    for row in rows:
        if len(row) >= 3 and row[0].strip() == "D":
            desc = row[1] if len(row) > 1 else ""
            if "final" in desc.lower() and "copayment limit" in desc.lower():
                val = parse_dollar(row[2])
                if val is not None:
                    return {
                        "lower": val,
                        "intermediate": 0,
                        "mandatory": 0,
                        "note": "Only lower MOOP has cost sharing; intermediate/mandatory $0 per original Medicare",
                    }
    return {}


def parse_dme_diabetic_shoes(csv_path: Path) -> dict:
    """Parse DME Diabetic Shoes or Inserts (lower+intermediate share one limit, mandatory separate)."""
    rows = read_csv(csv_path)
    lower_intermediate = None
    mandatory = None

    # Find Table 2 (Lower and Intermediate) and Table 3 (Mandatory)
    in_mandatory_table = False
    for row in rows:
        if row and "mandatory" in row[0].lower() and "moop" in row[0].lower():
            in_mandatory_table = True
            continue

        if len(row) >= 3 and row[0].strip() == "D":
            desc = row[1] if len(row) > 1 else ""
            if "final" in desc.lower() and "copayment limit" in desc.lower():
                val = parse_dollar(row[2])
                if val is not None:
                    if in_mandatory_table:
                        mandatory = val
                    else:
                        lower_intermediate = val

    if lower_intermediate is not None and mandatory is not None:
        return {
            "lower": lower_intermediate,
            "intermediate": lower_intermediate,
            "mandatory": mandatory,
        }
    return {}


def parse_dme_split_tiers(csv_path: Path) -> dict:
    """
    Parse DME files that have separate tables for lower+intermediate and mandatory.
    Used for 2027 DME Diabetic Monitors and DME Diabetic Supplies.
    """
    rows = read_csv(csv_path)
    lower_intermediate = None
    mandatory = None

    in_mandatory_table = False
    for row in rows:
        if row and "mandatory" in row[0].lower() and "moop" in row[0].lower():
            in_mandatory_table = True
            continue

        if len(row) >= 3 and row[0].strip() == "D":
            desc = row[1] if len(row) > 1 else ""
            if "final" in desc.lower() and "copayment limit" in desc.lower():
                val = parse_dollar(row[2])
                if val is not None:
                    if in_mandatory_table:
                        mandatory = val
                    else:
                        lower_intermediate = val

    if lower_intermediate is not None and mandatory is not None:
        return {
            "lower": lower_intermediate,
            "intermediate": lower_intermediate,
            "mandatory": mandatory,
        }
    return {}


def slugify(name: str) -> str:
    """Convert a service name to a JSON-friendly key."""
    slug = name.lower().strip()
    slug = slug.replace("&", "and")
    slug = slug.replace("/", "_")
    slug = slug.replace("-", "_")
    slug = slug.replace("(", "").replace(")", "")
    slug = re.sub(r"[^a-z0-9_]", "_", slug)
    slug = re.sub(r"_+", "_", slug)
    slug = slug.strip("_")
    return slug


# Map CSV filenames to parser functions and display names
# The key is a normalized filename (without .csv), value is (parser_func, display_name)
SERVICE_PARSERS = {
    "Inpatient Hospital Acute": ("inpatient_acute", parse_inpatient_acute, "inpatient_acute"),
    "Inpatient Hospital Psychiatric": ("inpatient_psychiatric", parse_inpatient_psychiatric, "inpatient_psychiatric"),
    "Skilled Nursing Facility": ("snf", parse_snf, "snf"),
    "Emergency Services": ("emergency", parse_emergency, "emergency"),
    "Primary Care Physician": ("primary_care", parse_copay_by_moop_tier, "primary_care"),
    "Physician Specialist": ("specialist", parse_copay_by_moop_tier, "specialist"),
    "Chiropractic Care": ("chiropractic", parse_copay_by_moop_tier, "chiropractic"),
    "Occupational Therapy": ("occupational_therapy", parse_copay_by_moop_tier, "occupational_therapy"),
    "PT & Speech-language Pathology": ("pt_speech_therapy", parse_copay_by_moop_tier, "pt_speech_therapy"),
    "Physical Therapy & Speech-language Pathology": ("pt_speech_therapy", parse_copay_by_moop_tier, "pt_speech_therapy"),
    "Mental Health Specialty Services": ("mental_health", parse_copay_by_moop_tier, "mental_health"),
    "Psychiatric Services": ("psychiatric", parse_copay_by_moop_tier, "psychiatric"),
    "Cardiac Rehabilitation Services": ("cardiac_rehab", parse_copay_by_moop_tier, "cardiac_rehab"),
    "Intensive Cardiac Rehabilitation": ("intensive_cardiac_rehab", parse_copay_by_moop_tier, "intensive_cardiac_rehab"),
    "Pulmonary Rehabilitation Services": ("pulmonary_rehab", parse_copay_by_moop_tier, "pulmonary_rehab"),
    "SET for PAD": ("set_for_pad", parse_copay_by_moop_tier, "set_for_pad"),
    "Partial Hospitalization": ("partial_hospitalization", parse_copay_by_moop_tier, "partial_hospitalization"),
    "Intensive Outpatient Services": ("intensive_outpatient", parse_copay_by_moop_tier, "intensive_outpatient"),
    "Urgently Needed Services": ("urgently_needed", parse_copay_by_moop_tier, "urgently_needed"),
    "Home Health": ("home_health", parse_home_health, "home_health"),
    "Part B Drugs-Insulin": ("part_b_drugs_insulin", parse_insulin, "part_b_drugs_insulin"),
    "Part B Drugs-Other": ("part_b_drugs_other", parse_all_moop_single, "part_b_drugs_other"),
    "Part B Drugs - Other": ("part_b_drugs_other", parse_all_moop_single, "part_b_drugs_other"),
    "Part B-Chemo Radiation Drugs": ("part_b_chemo_radiation", parse_all_moop_single, "part_b_chemo_radiation"),
    "Part B - Chemotherapy Radiation Drugs": ("part_b_chemo_radiation", parse_all_moop_single, "part_b_chemo_radiation"),
    "Dialysis Services": ("dialysis", parse_all_moop_single, "dialysis"),
    "Therapeutic Radiological Services": ("therapeutic_radiology", parse_all_moop_single, "therapeutic_radiology"),
    "DME Diabetic Shoes or Inserts": ("dme_diabetic_shoes", parse_dme_diabetic_shoes, "dme_diabetic_shoes"),
    "DME Diabetic Monitors": ("dme_diabetic_monitors", parse_dme_split_tiers, "dme_diabetic_monitors"),
    "DME Diabetic Supplies": ("dme_diabetic_supplies", parse_dme_split_tiers, "dme_diabetic_supplies"),
}


def process_year(year: int) -> dict:
    """Process all CSV files for a given contract year."""
    csv_dir = DATA_DIR / f"cy-{year}-moop-and-cost-sharing-calculations" / "CSV"

    if not csv_dir.exists():
        print(f"ERROR: CSV directory not found: {csv_dir}")
        sys.exit(1)

    print(f"\nProcessing CY {year} from {csv_dir}")

    # Parse MOOP limits first
    moop_path = csv_dir / "MOOP Limits.csv"
    if not moop_path.exists():
        print(f"ERROR: MOOP Limits.csv not found in {csv_dir}")
        sys.exit(1)

    moop_limits = parse_moop_limits(moop_path, year)
    print(f"  MOOP Limits parsed: Lower={moop_limits['lower']['in_network']}, "
          f"Intermediate={moop_limits['intermediate']['in_network']}, "
          f"Mandatory={moop_limits['mandatory']['in_network']}")

    # Parse each service category
    cost_sharing = {}
    csv_files = sorted(csv_dir.glob("*.csv"))

    for csv_file in csv_files:
        name = csv_file.stem  # filename without .csv
        if name == "MOOP Limits":
            continue

        if name in SERVICE_PARSERS:
            key, parser_func, _ = SERVICE_PARSERS[name]
            data = parser_func(csv_file)
            if data:
                cost_sharing[key] = data
                print(f"  {name} -> {key}: OK")
            else:
                print(f"  {name} -> {key}: WARNING - no data extracted")
        else:
            print(f"  {name}: SKIPPED (no parser registered)")

    # Build final structure
    output = {
        "metadata": {
            "year": year,
            "source": f"CMS CY{year} MOOP and Cost Sharing Calculations",
            "generated": date.today().isoformat(),
            "service_count": len(cost_sharing),
        },
        "moop_limits": moop_limits,
        "cost_sharing": cost_sharing,
    }

    return output


def main():
    parser = argparse.ArgumentParser(description="Import CMS MOOP & Cost Sharing CSV data to JSON")
    parser.add_argument("--year", type=int, help="Contract year to process (e.g. 2026). Omit to process all available.")
    args = parser.parse_args()

    if args.year:
        years = [args.year]
    else:
        # Auto-detect available years
        years = []
        for d in sorted(DATA_DIR.glob("cy-*-moop-and-cost-sharing-calculations")):
            match = re.search(r"cy-(\d{4})-", d.name)
            if match:
                years.append(int(match.group(1)))

    if not years:
        print("No CY data directories found.")
        sys.exit(1)

    print(f"Will process years: {years}")

    for year in years:
        result = process_year(year)
        output_path = DATA_DIR / f"cms_cost_sharing_{year}.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n  Output written to: {output_path}")
        print(f"  Services parsed: {result['metadata']['service_count']}")

    print("\nDone.")


if __name__ == "__main__":
    main()
