"""
Tuva Data Service — read-only access to Tuva's DuckDB analytics for any module.

Provides a clean interface for the AI layer (discovery, insights, any service)
to query Tuva's output marts without knowing DuckDB details. Any service can
import and use these functions to get Tuva's community-validated numbers.
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


def _query_with_schema_fallback(con: duckdb.DuckDBPyConnection, query: str) -> list:
    """Execute a query, trying alternative schema prefixes if the first fails.

    Tuva uses different schema prefixes depending on how dbt was configured:
    - Our project: main_cms_hcc, main_financial_pmpm, etc.
    - Demo project: cms_hcc, financial_pmpm, etc.
    """
    try:
        return con.execute(query).fetchall()
    except Exception:
        # Try without 'main_' prefix
        alt_query = query.replace("main_cms_hcc.", "cms_hcc.").replace(
            "main_financial_pmpm.", "financial_pmpm."
        ).replace("main_chronic_conditions.", "chronic_conditions.").replace(
            "main_quality_measures.", "quality_measures."
        ).replace("main_hcc_suspecting.", "hcc_suspecting.")
        try:
            return con.execute(alt_query).fetchall()
        except Exception as e:
            logger.debug("Query failed with both schema prefixes: %s", e)
            return []


def get_risk_scores(tenant_schema: str | None = None, use_demo: bool = False) -> list[dict[str, Any]]:
    """Get Tuva's CMS-HCC risk scores for all members.

    Set use_demo=True to read from the 1,000-patient Tuva demo database.
    """
    con = _connect(tenant_schema, use_demo=use_demo)
    if not con:
        return []
    try:
        result = _query_with_schema_fallback(con, """
            SELECT
                person_id,
                v24_risk_score,
                v28_risk_score,
                blended_risk_score,
                payment_risk_score,
                member_months,
                payment_year
            FROM main_cms_hcc.patient_risk_scores
        """)
        columns = [
            "person_id", "v24_risk_score", "v28_risk_score",
            "blended_risk_score", "payment_risk_score",
            "member_months", "payment_year",
        ]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.debug("Could not read Tuva risk scores: %s", e)
        return []
    finally:
        con.close()


def get_risk_factors(tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Get Tuva's per-member HCC risk factors (demographic + disease + interaction).

    Returns list of dicts with: person_id, factor_type, risk_factor_description,
    coefficient, model_version, payment_year.
    """
    con = _connect(tenant_schema)
    if not con:
        return []
    try:
        result = con.execute("""
            SELECT
                person_id,
                factor_type,
                risk_factor_description,
                coefficient,
                model_version,
                payment_year
            FROM main_cms_hcc.patient_risk_factors
        """).fetchall()
        columns = [
            "person_id", "factor_type", "risk_factor_description",
            "coefficient", "model_version", "payment_year",
        ]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.debug("Could not read Tuva risk factors: %s", e)
        return []
    finally:
        con.close()


def get_pmpm_summary(tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Get Tuva's financial PMPM by service category.

    Returns list of dicts with: year_month, service_category, pmpm, member_months.
    """
    con = _connect(tenant_schema)
    if not con:
        return []
    try:
        result = con.execute("""
            SELECT
                year_month,
                service_category_1 as service_category,
                pmpm,
                member_months
            FROM main_financial_pmpm.pmpm_prep
        """).fetchall()
        columns = ["year_month", "service_category", "pmpm", "member_months"]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.debug("Could not read Tuva PMPM: %s", e)
        return []
    finally:
        con.close()


def get_quality_measures(tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Get Tuva's quality measure results if available."""
    con = _connect(tenant_schema)
    if not con:
        return []
    try:
        result = con.execute("""
            SELECT *
            FROM main_quality_measures.summary
            LIMIT 100
        """).fetchall()
        if not result:
            return []
        columns = [desc[0] for desc in con.description]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.debug("Could not read Tuva quality measures: %s", e)
        return []
    finally:
        con.close()


def get_chronic_conditions(tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Get Tuva's chronic condition prevalence data if available."""
    con = _connect(tenant_schema)
    if not con:
        return []
    try:
        result = con.execute("""
            SELECT person_id, condition, condition_date
            FROM main_chronic_conditions.tuva_chronic_conditions_long
            LIMIT 500
        """).fetchall()
        columns = ["person_id", "condition", "condition_date"]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.debug("Could not read Tuva chronic conditions: %s", e)
        return []
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
        # Fetch scores and factors in one connection
        scores_raw = _query_with_schema_fallback(con, """
            SELECT person_id, v28_risk_score, payment_year
            FROM main_cms_hcc.patient_risk_scores
        """)
        if not scores_raw:
            return {}

        factors_raw = _query_with_schema_fallback(con, """
            SELECT person_id, factor_type, risk_factor_description, coefficient, model_version
            FROM main_cms_hcc.patient_risk_factors
        """)
    except Exception as e:
        logger.debug("Could not read Tuva summary data: %s", e)
        return {}
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
        result = _query_with_schema_fallback(con, """
            SELECT
                person_id,
                hcc_code,
                hcc_description,
                reason,
                contributing_factor,
                suspect_date
            FROM main_hcc_suspecting.list
        """)
        columns = [
            "person_id", "hcc_code", "hcc_description",
            "reason", "contributing_factor", "suspect_date",
        ]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.debug("Could not read Tuva suspects: %s", e)
        return []
    finally:
        con.close()


def get_tuva_recapture_opportunities(tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Get Tuva's HCC recapture opportunities.

    These are HCCs that were coded in a prior period but not the current year.
    Cross-reference with AQSoft's recapture suspects.
    """
    con = _connect(tenant_schema)
    if not con:
        return []
    try:
        # Try the recapture mart
        result = con.execute("""
            SELECT * FROM hcc_recapture.summary LIMIT 100
        """).fetchall()
        if result:
            columns = [desc[0] for desc in con.description]
            return [dict(zip(columns, row)) for row in result]
        return []
    except Exception as e:
        logger.debug("Could not read Tuva recapture: %s", e)
        return []
    finally:
        con.close()


def is_tuva_available(tenant_schema: str | None = None) -> bool:
    """Check if Tuva DuckDB has data (risk scores exist)."""
    con = _connect(tenant_schema)
    if not con:
        return False
    try:
        r = con.execute("SELECT count(*) FROM main_cms_hcc.patient_risk_scores").fetchone()
        return r[0] > 0 if r else False
    except Exception:
        return False
    finally:
        con.close()
