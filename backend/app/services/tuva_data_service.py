"""
Tuva Data Service — read-only access to Tuva's DuckDB analytics for any module.

Provides a clean interface for the AI layer (discovery, insights, any service)
to query Tuva's output marts without knowing DuckDB details. Any service can
import and use these functions to get Tuva's community-validated numbers.

Contract: After copying `generate_schema_name.sql` into `dbt_project/macros/`,
both demo and warehouse DuckDBs emit marts with bare schema names (e.g.
`cms_hcc`, `financial_pmpm`) rather than the default `main_<name>` form. All
queries here use the bare form.
"""

import logging
import os
from typing import Any

import duckdb

from app.services.tuva_export_service import get_duckdb_path

logger = logging.getLogger(__name__)


_DEMO_DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "data", "tuva_demo.duckdb"
)


class TuvaSchemaMismatch(Exception):
    """Raised when a consumer query references a schema/column Tuva didn't emit."""


def _connect(tenant_schema: str | None = None, read_only: bool = True, use_demo: bool = False) -> duckdb.DuckDBPyConnection | None:
    """Get a read-only DuckDB connection. Returns None if the file doesn't exist.

    If use_demo=True, connects to the 1,000-patient Tuva demo database.
    """
    if use_demo:
        path = _DEMO_DB_PATH
    else:
        path = get_duckdb_path(tenant_schema)
        if not os.path.exists(path):
            path = get_duckdb_path()
            if not os.path.exists(path):
                return None
    if not os.path.exists(path):
        return None
    try:
        return duckdb.connect(path, read_only=read_only)
    except Exception as e:
        logger.warning("Could not connect to Tuva DuckDB at %s: %s", path, e)
        return None


def _fetch_with_schema_fallback(
    con: duckdb.DuckDBPyConnection, query: str, bare_schemas: tuple[str, ...]
) -> tuple[list, list[str]]:
    """Execute `query` (written with bare Tuva schemas). If the table/schema
    doesn't resolve, retry once with the legacy `main_<schema>` prefix so
    older warehouse DBs still work until they're rebuilt with the new macro.

    Returns (rows, column_names).
    """
    try:
        cur = con.execute(query)
        cols = [d[0] for d in cur.description] if cur.description else []
        return cur.fetchall(), cols
    except Exception as exc_primary:
        legacy_query = query
        for sch in bare_schemas:
            legacy_query = legacy_query.replace(f" {sch}.", f" main_{sch}.")
            legacy_query = legacy_query.replace(f"FROM {sch}.", f"FROM main_{sch}.")
            legacy_query = legacy_query.replace(f"JOIN {sch}.", f"JOIN main_{sch}.")
        if legacy_query != query:
            try:
                cur = con.execute(legacy_query)
                cols = [d[0] for d in cur.description] if cur.description else []
                return cur.fetchall(), cols
            except Exception:
                pass
        raise exc_primary


def get_risk_scores(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's CMS-HCC risk scores for all members.

    Set use_demo=True to read from the 1,000-patient Tuva demo database.
    Raises on schema/column mismatch; callers decide how to surface.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        rows, _cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT
                person_id,
                v24_risk_score,
                v28_risk_score,
                blended_risk_score,
                payment_risk_score,
                member_months,
                payment_year
            FROM cms_hcc.patient_risk_scores
            """,
            ("cms_hcc",),
        )
        columns = [
            "person_id", "v24_risk_score", "v28_risk_score",
            "blended_risk_score", "payment_risk_score",
            "member_months", "payment_year",
        ]
        return [dict(zip(columns, row)) for row in rows]
    finally:
        con.close()


def get_risk_factors(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's per-member HCC risk factors (demographic + disease + interaction).

    Returns list of dicts with: person_id, factor_type, risk_factor_description,
    coefficient, model_version, payment_year.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        rows, _cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT
                person_id,
                factor_type,
                risk_factor_description,
                coefficient,
                model_version,
                payment_year
            FROM cms_hcc.patient_risk_factors
            """,
            ("cms_hcc",),
        )
        columns = [
            "person_id", "factor_type", "risk_factor_description",
            "coefficient", "model_version", "payment_year",
        ]
        return [dict(zip(columns, row)) for row in rows]
    finally:
        con.close()


def get_pmpm_summary(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's financial PMPM snapshot from `pmpm_prep`.

    Tuva's `pmpm_prep` is a wide-format table with per-service-category
    paid/allowed columns. Rather than invent a `pmpm` scalar that doesn't
    exist, we project the full row and let the caller choose which category
    to display. The schema here matches Tuva's public docs for the claims
    mart — if a Tuva release renames those columns, the fallback raises
    and the router returns a 502 instead of silently returning [].
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        # `pmpm_prep` is intermediate. Use `SELECT *` but dynamically map
        # the resulting columns so we tolerate Tuva's per-release column
        # additions without breaking the backend. The column names are
        # surfaced in the dict so the frontend can discover service
        # categories at render time.
        rows, cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT *
            FROM financial_pmpm.pmpm_prep
            ORDER BY year_month
            LIMIT 1000
            """,
            ("financial_pmpm",),
        )
        return [dict(zip(cols, row)) for row in rows]
    finally:
        con.close()


def get_quality_measures(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's quality measure summary.

    Real Tuva tables: `summary_counts`, `summary_long`, `summary_wide`.
    The `long` form is the most queryable (one row per measure/status).
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        rows, cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT *
            FROM quality_measures.summary_long
            LIMIT 500
            """,
            ("quality_measures",),
        )
        return [dict(zip(cols, row)) for row in rows]
    finally:
        con.close()


def get_chronic_conditions(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's chronic condition prevalence data.

    Real columns on `chronic_conditions__tuva_chronic_conditions_long`:
    person_id, condition, first_diagnosis_date, last_diagnosis_date, tuva_last_run.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        rows, _cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT
                person_id,
                condition,
                first_diagnosis_date,
                last_diagnosis_date
            FROM chronic_conditions.tuva_chronic_conditions_long
            LIMIT 500
            """,
            ("chronic_conditions",),
        )
        columns = ["person_id", "condition", "first_diagnosis_date", "last_diagnosis_date"]
        return [dict(zip(columns, row)) for row in rows]
    finally:
        con.close()


def get_tuva_summary(tenant_schema: str | None = None, use_demo: bool = False) -> dict[str, Any]:
    """Get a high-level summary of all Tuva data for AI context.

    Uses a single DuckDB connection for efficiency.
    Set use_demo=True for the 1,000-patient demo dataset.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return {}

    try:
        scores_raw, _ = _fetch_with_schema_fallback(
            con,
            """
            SELECT person_id, v28_risk_score, payment_year
            FROM cms_hcc.patient_risk_scores
            """,
            ("cms_hcc",),
        )
        if not scores_raw:
            return {}

        factors_raw, _ = _fetch_with_schema_fallback(
            con,
            """
            SELECT person_id, factor_type, risk_factor_description, coefficient, model_version
            FROM cms_hcc.patient_risk_factors
            """,
            ("cms_hcc",),
        )
    finally:
        con.close()

    scores = [
        {"person_id": r[0], "v28_risk_score": r[1], "payment_year": r[2]}
        for r in scores_raw
    ]
    factors = [
        {"person_id": r[0], "factor_type": r[1], "risk_factor_description": r[2],
         "coefficient": r[3], "model_version": r[4]}
        for r in factors_raw
    ]

    # Aggregate risk scores
    v28_scores = [s["v28_risk_score"] for s in scores if s.get("v28_risk_score") is not None]
    avg_v28 = sum(v28_scores) / len(v28_scores) if v28_scores else 0
    min_v28 = min(v28_scores) if v28_scores else 0
    max_v28 = max(v28_scores) if v28_scores else 0

    # Count HCCs per member from factors
    disease_factors = [f for f in factors if f.get("factor_type") == "disease"]
    hcc_by_member: dict[str, list[str]] = {}
    for f in disease_factors:
        pid = f["person_id"]
        if pid not in hcc_by_member:
            hcc_by_member[pid] = []
        hcc_by_member[pid].append(f["risk_factor_description"])

    # Most common HCCs
    hcc_counts: dict[str, int] = {}
    for f in disease_factors:
        desc = f["risk_factor_description"]
        hcc_counts[desc] = hcc_counts.get(desc, 0) + 1
    top_hccs = sorted(hcc_counts.items(), key=lambda x: -x[1])[:10]

    return {
        "source": "tuva_health",
        "model": "CMS-HCC V28",
        "members_scored": len(scores),
        "avg_v28_risk_score": round(avg_v28, 3),
        "min_v28_risk_score": round(min_v28, 3),
        "max_v28_risk_score": round(max_v28, 3),
        "per_member_scores": [
            {
                "person_id": s["person_id"],
                "v28_risk_score": round(float(s["v28_risk_score"]), 3) if s.get("v28_risk_score") else None,
                "hccs": hcc_by_member.get(s["person_id"], []),
            }
            for s in scores
        ],
        "top_hccs_by_prevalence": [
            {"hcc": hcc, "count": cnt} for hcc, cnt in top_hccs
        ],
    }


def get_tuva_suspects(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's HCC suspect list (from hcc_suspecting mart).

    Returns Tuva's independently-detected HCC opportunities with reason
    and contributing factor. Compare against AQSoft's suspects for
    cross-validation.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        rows, _cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT
                person_id,
                hcc_code,
                hcc_description,
                reason,
                contributing_factor,
                suspect_date
            FROM hcc_suspecting.list
            """,
            ("hcc_suspecting",),
        )
        columns = [
            "person_id", "hcc_code", "hcc_description",
            "reason", "contributing_factor", "suspect_date",
        ]
        return [dict(zip(columns, row)) for row in rows]
    finally:
        con.close()


def get_tuva_recapture_opportunities(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's HCC recapture opportunities from the `hcc_recapture` mart.

    Real Tuva finals (no `summary` table — that was never a Tuva output):
      - gap_status: per-member per-HCC gap (captured vs. not)
      - hcc_status: historical confirmation status
      - recapture_rates, recapture_rates_monthly, recapture_rates_monthly_ytd

    `hcc_status` gives the most useful per-member opportunity view.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        rows, cols = _fetch_with_schema_fallback(
            con,
            """
            SELECT *
            FROM hcc_recapture.hcc_status
            LIMIT 500
            """,
            ("hcc_recapture",),
        )
        return [dict(zip(cols, row)) for row in rows]
    finally:
        con.close()


def is_tuva_available(tenant_schema: str | None = None, use_demo: bool = False) -> bool:
    """Check if Tuva DuckDB has data (risk scores exist)."""
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return False
    try:
        rows, _cols = _fetch_with_schema_fallback(
            con,
            "SELECT count(*) FROM cms_hcc.patient_risk_scores",
            ("cms_hcc",),
        )
        return bool(rows and rows[0][0] and rows[0][0] > 0)
    except Exception:
        return False
    finally:
        con.close()
