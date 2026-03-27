#!/usr/bin/env python3
"""
Import CMS County Rate Book CSV → structured JSON for use by county_rate_service.

Usage:
    python -m scripts.import_cms_county_rates              # defaults to 2026
    python -m scripts.import_cms_county_rates --year 2027  # future years

Input:  backend/data/{year}-ratebook/CSV/CountyRate{year}.csv
Output: backend/data/cms_county_rates_{year}.json
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
from pathlib import Path


def _parse_money(val: str) -> float | None:
    """Parse a money string like '1,369.86' → 1369.86. Returns None for blanks."""
    val = val.strip().strip('"')
    if not val:
        return None
    return float(val.replace(",", ""))


def import_county_rates(year: int) -> dict:
    """Parse the CMS county rate CSV and return structured data."""

    base_dir = Path(__file__).resolve().parent.parent / "data"
    csv_path = base_dir / f"{year}-ratebook" / "CSV" / f"CountyRate{year}.csv"

    if not csv_path.exists():
        print(f"ERROR: CSV not found at {csv_path}", file=sys.stderr)
        sys.exit(1)

    rates_by_county_code: dict[str, dict] = {}
    rates_by_state_county: dict[str, str] = {}
    state_rates: dict[str, list[float]] = {}  # for computing state averages

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        # Skip the 4 header/note lines
        for _ in range(4):
            next(f)

        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("Code") or "").strip()
            state = (row.get("State") or "").strip()
            county = (row.get("County Name") or "").strip()

            if not code or not state:
                continue  # skip empty trailing rows

            rate_5 = _parse_money(row.get(f"Parts A&B 5% Bonus {year} Rate", ""))
            rate_3_5 = _parse_money(row.get(f"Parts A&B 3.5% Bonus {year} Rate", ""))
            rate_0 = _parse_money(row.get(f"Parts A&B 0% Bonus {year} Rate", ""))
            rate_esrd = _parse_money(row.get(f"Parts A&B ESRD {year} Rate", ""))

            if rate_0 is None:
                continue  # skip rows without valid rate data

            entry = {
                "state": state,
                "county": county,
                "rate_5pct_bonus": rate_5,
                "rate_3_5pct_bonus": rate_3_5,
                "rate_0pct_bonus": rate_0,
                "rate_esrd": rate_esrd,
            }

            rates_by_county_code[code] = entry

            # State|county lookup (uppercased for consistency)
            key = f"{state.upper()}|{county.upper()}"
            rates_by_state_county[key] = code

            # Accumulate for state averages
            state_upper = state.upper()
            if state_upper not in state_rates:
                state_rates[state_upper] = []
            state_rates[state_upper].append(rate_0)

    # Compute state averages (0% bonus) for fallback
    state_averages = {}
    for st, vals in state_rates.items():
        state_averages[st] = round(statistics.mean(vals), 2)

    # Compute national stats
    all_rates_0 = [e["rate_0pct_bonus"] for e in rates_by_county_code.values() if e["rate_0pct_bonus"]]
    national_stats = {
        "min": round(min(all_rates_0), 2),
        "max": round(max(all_rates_0), 2),
        "mean": round(statistics.mean(all_rates_0), 2),
        "median": round(statistics.median(all_rates_0), 2),
    }

    result = {
        "metadata": {
            "year": year,
            "total_counties": len(rates_by_county_code),
            "source": f"CMS {year} MA Rate Book",
            "national_stats_0pct": national_stats,
        },
        "state_averages": state_averages,
        "rates_by_county_code": rates_by_county_code,
        "rates_by_state_county": rates_by_state_county,
    }

    return result


def main():
    parser = argparse.ArgumentParser(description="Import CMS county rate CSV to JSON")
    parser.add_argument("--year", type=int, default=2026, help="Rate book year")
    args = parser.parse_args()

    data = import_county_rates(args.year)

    output_path = Path(__file__).resolve().parent.parent / "data" / f"cms_county_rates_{args.year}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    meta = data["metadata"]
    stats = meta["national_stats_0pct"]
    print(f"Imported {meta['total_counties']} counties for {meta['year']}")
    print(f"  National 0% bonus: min=${stats['min']}, max=${stats['max']}, "
          f"mean=${stats['mean']}, median=${stats['median']}")
    print(f"  States with averages: {len(data['state_averages'])}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
