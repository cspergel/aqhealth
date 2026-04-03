"""
Tuva Data Service — read-only access to Tuva's DuckDB analytics for any module.

Provides a clean interface for the AI layer (discovery, insights, any service)
to query Tuva's output marts without knowing DuckDB details. Any service can
import and use these functions to get Tuva's community-validated numbers.
"""

import logging
import os
from decimal import Decimal
from typing import Any

import duckdb

from app.services.tuva_export_service import get_duckdb_path

logger = logging.getLogger(__name__)


def _connect(tenant_schema: str | None = None, read_only: bool = True) -> duckdb.DuckDBPyConnection | None:
    """Get a read-only DuckDB connection. Returns None if the file doesn't exist."""
    path = get_duckdb_path(tenant_schema)
    if not os.path.exists(path):
        # Fall back to default warehouse
        path = get_duckdb_path()
        if not os.path.exists(path):
            return None
    try:
        return duckdb.connect(path, read_only=read_only)
    except Exception as e:
        logger.warning("Could not connect to Tuva DuckDB at %s: %s", path, e)
        return None


def get_risk_scores(tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Get Tuva's CMS-HCC risk scores for all members.

    Returns list of dicts with: person_id, v24_risk_score, v28_risk_score,
    blended_risk_score, payment_risk_score, member_months, payment_year.
    """
    con = _connect(tenant_schema)
    if not con:
        return []
    try:
        result = con.execute("""
            SELECT
                person_id,
                v24_risk_score,
                v28_risk_score,
                blended_risk_score,
                payment_risk_score,
                member_months,
                payment_year
            FROM main_cms_hcc.patient_risk_scores
        """).fetchall()
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


def get_tuva_summary(tenant_schema: str | None = None) -> dict[str, Any]:
    """Get a high-level summary of all Tuva data for AI context.

    Returns a dict suitable for inclusion in the insight context graph.
    """
    scores = get_risk_scores(tenant_schema)
    factors = get_risk_factors(tenant_schema)

    if not scores:
        return {}

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
        "source": "tuva_health_v0.17.2",
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


def run_custom_query(query: str, tenant_schema: str | None = None) -> list[dict[str, Any]]:
    """Run a custom read-only SQL query against Tuva's DuckDB.

    Use this for ad-hoc analysis from any service. The query runs read-only.
    Returns list of dicts. Returns empty list on error.
    """
    con = _connect(tenant_schema, read_only=True)
    if not con:
        return []
    try:
        result = con.execute(query).fetchall()
        if not result:
            return []
        columns = [desc[0] for desc in con.description]
        return [dict(zip(columns, row)) for row in result]
    except Exception as e:
        logger.warning("Tuva custom query failed: %s", e)
        return []
    finally:
        con.close()
