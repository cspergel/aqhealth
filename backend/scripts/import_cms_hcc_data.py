#!/usr/bin/env python3
"""
Import CMS HCC Model Data — converts raw CMS download files into the exact
JSON format used by the AQSoft Health Platform.

Downloads from: https://www.cms.gov/medicare/payment/medicare-advantage-rates-statistics/risk-adjustment

Usage:
    python import_cms_hcc_data.py <path_to_cms_zip_or_folder> [--year 2026] [--output-dir ../data]

The CMS model software ZIP typically contains:
    - F_XXXX_YY_*.csv  — ICD-10 to HCC mapping (the main mapping file)
    - C_XXXX_YY_*Labels*.csv — HCC labels and descriptions
    - *.csv with coefficients — RAF weights per HCC

This script produces:
    1. hcc_mappings.json — exact format used by hcc_engine.py
    2. hcc_groups_v28_{year}.json — exact format used by hcc_engine disease interactions

Run with --dry-run to see what would be generated without writing files.
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path


# ---------------------------------------------------------------------------
# HCC Disease Group mapping (which disease category each HCC belongs to)
# This is stable across V28 versions — only needs updating if CMS adds new HCCs
# ---------------------------------------------------------------------------
HCC_DISEASE_GROUPS = {
    1: "Infections", 2: "Infections", 6: "Infections",
    17: "Neoplasms", 18: "Neoplasms", 19: "Neoplasms", 20: "Neoplasms",
    21: "Neoplasms", 22: "Neoplasms", 23: "Neoplasms",
    35: "Diabetes", 36: "Diabetes", 37: "Diabetes", 38: "Diabetes",
    48: "Obesity_Metabolic",
    62: "Liver", 63: "Liver", 64: "Liver",
    68: "Gastrointestinal", 69: "Gastrointestinal",
    77: "Musculoskeletal", 78: "Musculoskeletal", 79: "Musculoskeletal",
    80: "Musculoskeletal", 92: "Musculoskeletal",
    93: "Blood", 94: "Blood",
    102: "Cognitive", 103: "Cognitive",
    106: "Substance_Use", 107: "Substance_Use",
    108: "Psychiatric", 109: "Psychiatric", 110: "Psychiatric",
    111: "Psychiatric", 112: "Psychiatric", 113: "Psychiatric",
    114: "Psychiatric",
    121: "Spinal_Paralysis", 122: "Spinal_Paralysis", 123: "Spinal_Paralysis",
    125: "Spinal_Paralysis", 126: "Spinal_Paralysis",
    131: "Neurological", 132: "Neurological", 135: "Neurological",
    137: "Neurological", 138: "Neurological",
    211: "Cardio_Respiratory_Arrest",
    221: "Heart", 222: "Heart", 223: "Heart", 224: "Heart",
    225: "Heart", 226: "Heart", 227: "Heart", 228: "Heart",
    229: "Heart", 238: "Heart",
    248: "Cerebrovascular", 249: "Cerebrovascular",
    253: "Vascular", 254: "Vascular",
    263: "Lung", 264: "Lung", 267: "Lung", 268: "Lung",
    270: "Lung", 271: "Lung", 280: "Lung", 281: "Lung",
    282: "Lung", 283: "Lung",
    298: "Eye",
    326: "Kidney", 327: "Kidney", 328: "Kidney", 329: "Kidney",
    379: "Skin", 380: "Skin", 381: "Skin", 382: "Skin",
    383: "Skin",
    385: "Injury", 386: "Injury", 387: "Injury", 388: "Injury",
    397: "Transplants", 398: "Transplants", 399: "Transplants",
}

# Group descriptions
GROUP_DESCRIPTIONS = {
    "Infections": "HIV/AIDS, Sepsis, and Opportunistic Infections",
    "Neoplasms": "Cancer and Malignant Neoplasms",
    "Diabetes": "Diabetes with and without complications",
    "Obesity_Metabolic": "Obesity and Metabolic Disorders",
    "Liver": "Liver Disease",
    "Gastrointestinal": "Gastrointestinal Disorders",
    "Musculoskeletal": "Musculoskeletal and Connective Tissue",
    "Blood": "Blood and Immune Disorders",
    "Cognitive": "Dementia and Cognitive Disorders",
    "Substance_Use": "Substance Use Disorders",
    "Psychiatric": "Psychiatric Disorders",
    "Spinal_Paralysis": "Spinal Cord and Paralysis",
    "Neurological": "Neurological Disorders",
    "Cardio_Respiratory_Arrest": "Cardio-Respiratory Failure and Arrest",
    "Heart": "Heart Disease",
    "Cerebrovascular": "Cerebrovascular Disease",
    "Vascular": "Vascular Disease",
    "Lung": "Chronic Lung and Respiratory Disease",
    "Eye": "Eye Disorders",
    "Kidney": "Kidney Disease",
    "Skin": "Skin Disorders and Burns",
    "Injury": "Injury and Poisoning",
    "Transplants": "Organ Transplants",
}


def find_csv_files(source_path: str) -> dict[str, str]:
    """Find the key CSV files in a CMS download (ZIP or folder).

    Returns dict with keys: 'mapping', 'labels', 'coefficients'
    """
    files = {}

    if zipfile.is_zipfile(source_path):
        with zipfile.ZipFile(source_path) as zf:
            names = zf.namelist()
            for name in names:
                lower = name.lower()
                # ICD-10 to HCC mapping file (typically F_XXXX_YY_*.csv)
                if re.search(r'f_\d{4}_\d{2}.*\.csv', lower) or 'icd10' in lower and 'map' in lower:
                    files['mapping'] = ('zip', source_path, name)
                # Labels file
                elif 'label' in lower and lower.endswith('.csv'):
                    files['labels'] = ('zip', source_path, name)
                # Coefficients file
                elif ('coeff' in lower or 'factor' in lower) and lower.endswith('.csv'):
                    files['coefficients'] = ('zip', source_path, name)
    else:
        folder = Path(source_path)
        for f in folder.rglob('*.csv'):
            lower = f.name.lower()
            if re.search(r'f_\d{4}_\d{2}', lower) or ('icd10' in lower and 'map' in lower):
                files['mapping'] = ('file', str(f), f.name)
            elif 'label' in lower:
                files['labels'] = ('file', str(f), f.name)
            elif 'coeff' in lower or 'factor' in lower:
                files['coefficients'] = ('file', str(f), f.name)

    return files


def read_csv_from_source(source_info: tuple) -> list[dict]:
    """Read a CSV file from either a ZIP or filesystem."""
    source_type, path, name = source_info

    if source_type == 'zip':
        with zipfile.ZipFile(path) as zf:
            with zf.open(name) as f:
                text = io.TextIOWrapper(f, encoding='utf-8-sig')
                return list(csv.DictReader(text))
    else:
        with open(path, encoding='utf-8-sig') as f:
            return list(csv.DictReader(f))


def parse_icd10_hcc_mapping(rows: list[dict]) -> dict[str, int]:
    """Parse the ICD-10 to HCC mapping CSV.

    CMS format varies by year but typically has columns like:
    - ICD-10-CM Code (or Diagnosis_Code, ICD10)
    - HCC (or Payment_HCC, CMS_HCC)
    """
    mapping = {}

    # Detect column names
    if not rows:
        return mapping

    sample = rows[0]
    icd_col = None
    hcc_col = None

    for col in sample.keys():
        col_lower = col.lower().strip()
        if any(k in col_lower for k in ['icd', 'diagnosis_code', 'diag']):
            icd_col = col
        elif any(k in col_lower for k in ['payment_hcc', 'cms_hcc', 'hcc']):
            hcc_col = col

    if not icd_col or not hcc_col:
        print(f"  WARNING: Could not identify columns. Available: {list(sample.keys())}")
        # Try positional: first col = ICD, second = HCC
        cols = list(sample.keys())
        if len(cols) >= 2:
            icd_col, hcc_col = cols[0], cols[1]
            print(f"  Falling back to positional: ICD={icd_col}, HCC={hcc_col}")
        else:
            return mapping

    print(f"  Using columns: ICD={icd_col}, HCC={hcc_col}")

    for row in rows:
        icd = row.get(icd_col, '').strip().upper()
        hcc_val = row.get(hcc_col, '').strip()

        if not icd or not hcc_val:
            continue

        # Skip pediatric HCCs (typically in a separate model)
        try:
            hcc_num = int(hcc_val)
        except ValueError:
            continue

        # Add period to ICD-10 if missing (CMS sometimes omits it)
        if len(icd) > 3 and '.' not in icd:
            icd = icd[:3] + '.' + icd[3:]

        mapping[icd] = hcc_num

    return mapping


def parse_labels(rows: list[dict]) -> dict[int, str]:
    """Parse HCC labels CSV. Returns {hcc_number: label_text}."""
    labels = {}
    if not rows:
        return labels

    sample = rows[0]
    hcc_col = None
    label_col = None

    for col in sample.keys():
        col_lower = col.lower().strip()
        if 'hcc' in col_lower and 'label' not in col_lower and 'desc' not in col_lower:
            hcc_col = col
        elif any(k in col_lower for k in ['label', 'description', 'desc']):
            label_col = col

    if not hcc_col or not label_col:
        cols = list(sample.keys())
        if len(cols) >= 2:
            hcc_col, label_col = cols[0], cols[1]

    for row in rows:
        try:
            hcc_num = int(row.get(hcc_col, '').strip())
            label = row.get(label_col, '').strip()
            if label:
                labels[hcc_num] = label
        except (ValueError, AttributeError):
            continue

    return labels


def parse_coefficients(rows: list[dict]) -> dict[int, float]:
    """Parse RAF coefficient CSV. Returns {hcc_number: raf_weight}."""
    coefficients = {}
    if not rows:
        return coefficients

    sample = rows[0]
    # Look for a column with HCC identifier and a numeric coefficient column
    for row in rows:
        for col, val in row.items():
            col_lower = col.lower().strip()
            # CMS coefficient files often have variable names like "HCC1", "HCC2", etc.
            match = re.match(r'hcc_?(\d+)', col_lower)
            if match:
                try:
                    hcc_num = int(match.group(1))
                    coeff = float(val)
                    if coeff > 0:
                        coefficients[hcc_num] = coeff
                except (ValueError, TypeError):
                    continue

    # If the above didn't work, try row-based format
    if not coefficients:
        hcc_col = None
        coeff_col = None
        for col in sample.keys():
            col_lower = col.lower().strip()
            if 'hcc' in col_lower:
                hcc_col = col
            elif any(k in col_lower for k in ['coefficient', 'weight', 'factor', 'raf']):
                coeff_col = col

        if hcc_col and coeff_col:
            for row in rows:
                try:
                    hcc_num = int(row[hcc_col].strip())
                    coeff = float(row[coeff_col].strip())
                    coefficients[hcc_num] = coeff
                except (ValueError, AttributeError):
                    continue

    return coefficients


def load_existing_descriptions(data_dir: str) -> dict[str, str]:
    """Load ICD-10 descriptions from existing hcc_mappings.json if available."""
    path = os.path.join(data_dir, 'hcc_mappings.json')
    if not os.path.exists(path):
        return {}

    with open(path) as f:
        data = json.load(f)

    descriptions = {}
    for code, info in data.get('codes_by_icd10', {}).items():
        if info.get('description'):
            descriptions[code] = info['description']

    return descriptions


def build_hcc_mappings_json(
    icd_to_hcc: dict[str, int],
    labels: dict[int, str],
    coefficients: dict[int, float],
    descriptions: dict[str, str],
    year: str,
) -> dict:
    """Build the hcc_mappings.json in the exact platform format."""

    codes_by_icd10 = {}
    codes_by_hcc = defaultdict(list)
    codes_by_prefix = defaultdict(list)
    hcc_set = set()
    prefix_set = set()

    for icd, hcc in sorted(icd_to_hcc.items()):
        prefix = icd.split('.')[0] if '.' in icd else icd[:3]
        raf = coefficients.get(hcc, 0.0)
        disease_group = HCC_DISEASE_GROUPS.get(hcc, "Other")
        desc = descriptions.get(icd, labels.get(hcc, f"HCC {hcc}"))

        entry = {
            "icd10": icd,
            "hcc": hcc,
            "raf": round(raf, 3),
            "description": desc,
            "prefix": prefix,
            "disease_group": disease_group,
        }

        codes_by_icd10[icd] = entry
        codes_by_hcc[str(hcc)].append(icd)
        codes_by_prefix[prefix].append(icd)
        hcc_set.add(hcc)
        prefix_set.add(prefix)

    # Build hcc_to_disease_group
    hcc_to_disease_group = {}
    for hcc in sorted(hcc_set):
        hcc_to_disease_group[str(hcc)] = HCC_DISEASE_GROUPS.get(hcc, "Other")

    return {
        "metadata": {
            "source_file": f"CMS-HCC V28 Model Software {year}",
            "source_description": f"CMS HCC V28 Model ICD-10 to HCC mappings",
            "indexed_date": date.today().isoformat(),
            "total_codes": len(codes_by_icd10),
            "unique_hccs": len(hcc_set),
            "unique_prefixes": len(prefix_set),
            "payment_year": year,
            "note": "Generated by import_cms_hcc_data.py from official CMS model software download.",
        },
        "codes_by_icd10": codes_by_icd10,
        "codes_by_hcc": dict(codes_by_hcc),
        "codes_by_prefix": dict(codes_by_prefix),
        "hcc_list": sorted(hcc_set),
        "prefix_list": sorted(prefix_set),
        "hcc_to_disease_group": hcc_to_disease_group,
    }


def build_hcc_groups_json(
    labels: dict[int, str],
    coefficients: dict[int, float],
    year: str,
) -> dict:
    """Build the hcc_groups JSON in the exact platform format."""

    groups = defaultdict(lambda: {"description": "", "hierarchy": None, "hccs": []})

    for hcc in sorted(set(HCC_DISEASE_GROUPS.keys())):
        group_name = HCC_DISEASE_GROUPS[hcc]
        label = labels.get(hcc, f"HCC {hcc}")
        raf = coefficients.get(hcc, 0.0)

        groups[group_name]["description"] = GROUP_DESCRIPTIONS.get(group_name, group_name)
        groups[group_name]["hccs"].append({
            "hcc": str(hcc),
            "label": label,
            "raf": round(raf, 3),
        })

    return {
        "metadata": {
            "version": f"V28 {year}",
            "source": f"CMS HCC Model Software {year}",
            "description": f"HCC Category Groupings with Hierarchies for CMS-HCC V28 Payment Model",
            "total_hccs": sum(len(g["hccs"]) for g in groups.values()),
        },
        "groups": dict(groups),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Import CMS HCC model data into AQSoft Health Platform format"
    )
    parser.add_argument(
        "source",
        help="Path to CMS model software ZIP file or extracted folder",
    )
    parser.add_argument(
        "--year", "-y",
        default=str(date.today().year + 1),
        help="Payment year (default: next year)",
    )
    parser.add_argument(
        "--output-dir", "-o",
        default=os.path.join(os.path.dirname(__file__), '..', 'data'),
        help="Output directory (default: backend/data/)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without writing files",
    )
    args = parser.parse_args()

    source = args.source
    year = args.year
    output_dir = os.path.abspath(args.output_dir)

    print(f"CMS HCC Data Import Tool")
    print(f"========================")
    print(f"Source: {source}")
    print(f"Year: {year}")
    print(f"Output: {output_dir}")
    print()

    # Step 1: Find CSV files
    print("Step 1: Locating CSV files...")
    csv_files = find_csv_files(source)

    if 'mapping' not in csv_files:
        print("ERROR: Could not find ICD-10 to HCC mapping CSV in the source.")
        print("Expected a file matching pattern F_XXXX_YY_*.csv or containing 'icd10' and 'map'")
        print(f"Source type: {'ZIP' if zipfile.is_zipfile(source) else 'folder'}")
        if zipfile.is_zipfile(source):
            with zipfile.ZipFile(source) as zf:
                print("Files in ZIP:")
                for name in sorted(zf.namelist()):
                    if name.endswith('.csv'):
                        print(f"  {name}")
        sys.exit(1)

    for key, info in csv_files.items():
        print(f"  Found {key}: {info[2]}")
    print()

    # Step 2: Parse mapping file
    print("Step 2: Parsing ICD-10 to HCC mappings...")
    mapping_rows = read_csv_from_source(csv_files['mapping'])
    icd_to_hcc = parse_icd10_hcc_mapping(mapping_rows)
    print(f"  Parsed {len(icd_to_hcc)} ICD-10 codes")
    print()

    # Step 3: Parse labels (if available)
    labels = {}
    if 'labels' in csv_files:
        print("Step 3: Parsing HCC labels...")
        label_rows = read_csv_from_source(csv_files['labels'])
        labels = parse_labels(label_rows)
        print(f"  Parsed {len(labels)} HCC labels")
    else:
        print("Step 3: No labels file found — using HCC numbers as labels")
    print()

    # Step 4: Parse coefficients (if available)
    coefficients = {}
    if 'coefficients' in csv_files:
        print("Step 4: Parsing RAF coefficients...")
        coeff_rows = read_csv_from_source(csv_files['coefficients'])
        coefficients = parse_coefficients(coeff_rows)
        print(f"  Parsed {len(coefficients)} RAF weights")
    else:
        print("Step 4: No coefficients file found — loading from existing data")
        # Fall back to existing data
        existing_path = os.path.join(output_dir, 'hcc_mappings.json')
        if os.path.exists(existing_path):
            with open(existing_path) as f:
                existing = json.load(f)
            for code_info in existing.get('codes_by_icd10', {}).values():
                hcc = code_info.get('hcc')
                raf = code_info.get('raf', 0)
                if hcc and raf:
                    coefficients[hcc] = raf
            print(f"  Loaded {len(coefficients)} RAF weights from existing hcc_mappings.json")
    print()

    # Step 5: Load existing descriptions for enrichment
    print("Step 5: Loading existing ICD-10 descriptions for enrichment...")
    descriptions = load_existing_descriptions(output_dir)
    print(f"  Loaded {len(descriptions)} existing descriptions")
    print()

    # Step 6: Build output files
    print("Step 6: Building output JSON files...")

    mappings_json = build_hcc_mappings_json(icd_to_hcc, labels, coefficients, descriptions, year)
    groups_json = build_hcc_groups_json(labels, coefficients, year)

    print(f"  hcc_mappings.json: {mappings_json['metadata']['total_codes']} codes, "
          f"{mappings_json['metadata']['unique_hccs']} HCCs")
    print(f"  hcc_groups: {groups_json['metadata']['total_hccs']} HCCs in "
          f"{len(groups_json['groups'])} groups")
    print()

    # Step 7: Compare with existing (if available)
    existing_path = os.path.join(output_dir, 'hcc_mappings.json')
    if os.path.exists(existing_path):
        with open(existing_path) as f:
            existing = json.load(f)
        old_count = existing['metadata']['total_codes']
        new_count = mappings_json['metadata']['total_codes']
        old_hccs = existing['metadata']['unique_hccs']
        new_hccs = mappings_json['metadata']['unique_hccs']

        print("Comparison with existing data:")
        print(f"  ICD-10 codes: {old_count} -> {new_count} ({new_count - old_count:+d})")
        print(f"  Unique HCCs:  {old_hccs} -> {new_hccs} ({new_hccs - old_hccs:+d})")

        # Show added/removed codes
        old_codes = set(existing.get('codes_by_icd10', {}).keys())
        new_codes = set(mappings_json['codes_by_icd10'].keys())
        added = new_codes - old_codes
        removed = old_codes - new_codes
        if added:
            print(f"  Added codes: {len(added)} (e.g., {sorted(added)[:5]})")
        if removed:
            print(f"  Removed codes: {len(removed)} (e.g., {sorted(removed)[:5]})")
        if not added and not removed:
            print(f"  No codes added or removed")
        print()

    # Step 8: Write files
    if args.dry_run:
        print("DRY RUN — no files written")
        print(f"Would write: {output_dir}/hcc_mappings.json")
        print(f"Would write: {output_dir}/hcc_groups_v28_{year}.json")
    else:
        os.makedirs(output_dir, exist_ok=True)

        mappings_path = os.path.join(output_dir, 'hcc_mappings.json')
        groups_path = os.path.join(output_dir, f'hcc_groups_v28_{year}.json')

        # Back up existing files
        for path in [mappings_path, groups_path]:
            if os.path.exists(path):
                backup = path + '.bak'
                os.rename(path, backup)
                print(f"  Backed up: {os.path.basename(path)} -> {os.path.basename(backup)}")

        with open(mappings_path, 'w') as f:
            json.dump(mappings_json, f, indent=2)
        print(f"  Wrote: {mappings_path}")

        with open(groups_path, 'w') as f:
            json.dump(groups_json, f, indent=2)
        print(f"  Wrote: {groups_path}")

    print()
    print("Done!")


if __name__ == '__main__':
    main()
