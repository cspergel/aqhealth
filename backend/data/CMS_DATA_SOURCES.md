# CMS Data Sources — Update Reference

This document tracks all external CMS data the platform depends on, where to get updates,
and when to check for new versions.

---

## 1. CMS-HCC Risk Adjustment (ICD-10 → HCC Mappings & RAF Coefficients)

**What we use it for:** HCC suspect detection, RAF score calculation, revenue projections

**Current version:** CMS-HCC V28 (2025 final mappings, 7,793 ICD-10 codes)
**Local file:** `backend/data/hcc_mappings.json`

**Where to get updates:**
- Main page: https://www.cms.gov/medicare/payment/medicare-advantage-rates-statistics/risk-adjustment
- Model Software & ICD-10 Mappings: https://www.cms.gov/medicare/health-plans/medicareadvtgspecratestats/risk-adjustors/2026-model-software-icd-10-mappings
  (Change "2026" to the target year)
- Proposed/draft models: https://www.cms.gov/medicare/health-plans/medicareadvtgspecratestats/risk-adjustors-items/riskothermodel-related

**Update frequency:** Annually — final mappings published with the Rate Announcement (typically April)
**When to check:** April 1 each year for the next payment year's final model

**What's in the download (ZIP):**
- `F_XXXX_YY_CRMCR.csv` — ICD-10 to HCC mapping table (the key file)
- `C_XXXX_YY_CRMCR_Labels.csv` — HCC labels and descriptions
- `V28_coefficients.csv` — RAF weight per HCC (used for dollar value calculation)
- SAS programs for the official CMS calculation methodology

**Status:**
- CY2025-2026: Using V28 final (3-year phase-in: 75% V28 / 25% V24 in 2024, 100% V28 by 2026)
- CY2027: Proposed Part C model available (DO NOT USE until final rule in April 2027)

---

## 2. MA County Benchmark Rates (Per-County PMPM)

**What we use it for:** Accurate per-member dollar values (replacing national average CMS_PMPM_BASE)

**Current status:** Using national average estimate ($1,100 PMPM). County-level rates NOT YET IMPLEMENTED.
**Formula:** `member_payment = county_benchmark_pmpm × 12 × member_RAF × quality_bonus_multiplier`

**Where to get updates:**
- Rate Announcements: https://www.cms.gov/medicare/payment/medicare-advantage-rates-statistics
  Look for "Rate Announcement" or "Ratebook" section
- County benchmark file is typically in the Rate Announcement ZIP
- FFS Expenditure Data by County also available on the main page

**Update frequency:** Annually — published with the Rate Announcement (April)
**When to check:** April 1 each year

**What you need:**
1. County benchmark CSV (FIPS county code → PMPM rate)
2. ZIP-to-FIPS crosswalk (see section 6 below)

**Implementation plan:** Store as `backend/data/cms_county_rates_{year}.json`

---

## 3. MOOP and Cost Sharing Calculations

**What we use it for:** Prior auth compliance, member liability estimates, plan design analysis

**Current version:** CY2026 and CY2027 data loaded
**Local files:**
- `backend/data/cy-2026-moop-and-cost-sharing-calculations/`
- `backend/data/cy-2027-moop-and-cost-sharing-calculations/`

**Where to get updates:**
- https://www.cms.gov/medicare/payment/medicare-advantage-rates-statistics
  Downloads section → "MOOP and Cost Sharing Limit Calculations"

**Update frequency:** Annually (typically published mid-year for the following CY)
**When to check:** July-August each year for next year's limits

**What's in the download (ZIP):**
- CSV files per service category (Inpatient, SNF, Emergency, etc.)
- MOOP Limits CSV (mandatory and voluntary MOOP thresholds)
- Excel workbook with all calculations combined

---

## 4. Quality Measures (HEDIS/Stars)

**What we use it for:** Care gap detection, Stars simulator, quality measure tracking

**Current version:** 39 measures defined in `quality_measures.json`
**Local file:** `backend/data/quality_measures.json`

**Where to get updates:**
- CMS Star Ratings: https://www.cms.gov/medicare/quality/star-ratings
- HEDIS measures: https://www.ncqa.org/hedis/measures/
- Star Ratings cut points: Published annually by CMS (October for following year)

**Update frequency:** Annually — cut points published ~October, measure specs updated ~January
**When to check:**
- October: New Star Rating cut points
- January: Updated HEDIS measure specifications

---

## 5. DRG Weights and Cost Data

**What we use it for:** Inpatient cost estimation, reconciliation, facility benchmarking

**Where to get updates:**
- MS-DRG weights: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/ms-drg-classifications-and-software
- Medicare Provider Utilization & Payment (MUP): https://data.cms.gov/provider-summary-by-type-of-service
- Hospital Cost Reports: https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports

**Update frequency:**
- DRG weights: Annually (October, effective for the federal fiscal year)
- MUP files: Annually (typically 2-year lag)
- Cost reports: Quarterly updates

---

## 6. ZIP Code → FIPS County Crosswalk

**What we use it for:** Mapping member ZIP codes to counties for county-level benchmark rates

**Where to get updates:**
- HUD USPS ZIP Crosswalk (recommended, easier format): https://www.huduser.gov/portal/datasets/usps_crosswalk.html
- Census Bureau ZCTA: https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html

**Update frequency:** Quarterly (HUD) or annually (Census)
**When to check:** Quarterly if using HUD, or annually with each rate update

---

## 7. Eligible CPT/HCPCS Codes for Risk Adjustment

**What we use it for:** Validating which encounter types are eligible for risk adjustment submission

**Where to get updates:**
- https://www.cms.gov/medicare/payment/medicare-advantage-rates-statistics/risk-adjustment
  Look for "Medicare Risk Adjustment Eligible CPT/HCPCS Codes"
- Also: "Outpatient CPT HCPCS Excluded Services Lists"

**Update frequency:** Annually
**When to check:** January each year

---

## Annual Update Calendar

| Month | What to Check | Action |
|-------|--------------|--------|
| January | HEDIS measure spec updates | Update quality_measures.json if specs changed |
| February | CMS Advance Notice (proposed rates) | Review for major changes, DO NOT implement yet |
| April | **CMS Final Rate Announcement** | Update county benchmarks, RAF model if changed |
| July-Aug | MOOP/Cost Sharing for next CY | Download and load new MOOP data |
| October | Star Rating cut points + DRG weights | Update Stars simulator cut points, DRG weights |
| Quarterly | HUD ZIP-FIPS crosswalk | Update if using county-level rates |

---

## Data File Inventory

| File | Source | Year | Status |
|------|--------|------|--------|
| `hcc_mappings.json` | CMS-HCC V28 ICD-10 mappings | 2025 | Final |
| `hcc_groups_v28_2025midyear.json` | HCC group interactions | 2025 | Final |
| `quality_measures.json` | HEDIS/Stars measures | 2025 | Current |
| `cy-2026-moop-and-cost-sharing-calculations/` | MOOP limits | 2026 | Final |
| `cy-2027-moop-and-cost-sharing-calculations/` | MOOP limits | 2027 | Final |
| `cms_county_rates_{year}.json` | County benchmarks | — | NOT YET LOADED |
| `zip_to_fips.json` | ZIP-county crosswalk | — | NOT YET LOADED |
