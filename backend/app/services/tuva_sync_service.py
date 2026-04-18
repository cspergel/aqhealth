"""
Tuva Sync Service — reads Tuva output marts from DuckDB and syncs to PostgreSQL.

Compares Tuva's baseline numbers against AQSoft's calculations.
Preserves both values and flags discrepancies.
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import duckdb
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tuva_baseline import TuvaRafBaseline, TuvaPmpmBaseline
from app.models.member import Member

logger = logging.getLogger(__name__)

RAF_DISCREPANCY_THRESHOLD = Decimal("0.05")
PMPM_DISCREPANCY_PCT_THRESHOLD = Decimal("5.0")


class TuvaSyncService:
    """Syncs Tuva outputs back to PostgreSQL with discrepancy tracking."""

    def __init__(self, duckdb_path: str):
        self.duckdb_path = duckdb_path

    def _try_query(self, con: duckdb.DuckDBPyConnection, *queries: str) -> tuple[list[tuple], list[str]] | None:
        """Try each query form in order; return (rows, columns) from the first
        that resolves, or None if every form fails. This accommodates both the
        new schema convention (bare `cms_hcc.*`) emitted by our copied macro
        and the legacy `main_<name>.*` convention that older warehouse DBs
        still expose until they're rebuilt.
        """
        last_exc: Exception | None = None
        for q in queries:
            try:
                cur = con.execute(q)
                rows = cur.fetchall()
                cols = [d[0] for d in cur.description] if cur.description else []
                return rows, cols
            except Exception as e:
                last_exc = e
                continue
        if last_exc:
            logger.warning("Tuva query failed on all schema variants: %s", last_exc)
        return None

    def _read_tuva_hcc(self) -> list[dict[str, Any]]:
        """Read CMS-HCC output from Tuva's data mart.

        Real final columns on `cms_hcc.patient_risk_scores` (verified against
        Tuva's `dbt_packages/the_tuva_project/models/data_marts/cms_hcc/final/
        cms_hcc__patient_risk_scores.sql`): person_id, payment_year,
        v24_risk_score, v28_risk_score, blended_risk_score,
        normalized_risk_score, payment_risk_score, member_months, etc.

        We use `blended_risk_score` as the primary RAF (v24+v28 blend per
        CMS's 2026 transition rule). Falls back to v28, then v24.
        """
        con = duckdb.connect(self.duckdb_path, read_only=True)
        try:
            result = self._try_query(
                con,
                """
                SELECT
                    person_id,
                    payment_year,
                    blended_risk_score,
                    v28_risk_score,
                    v24_risk_score
                FROM cms_hcc.patient_risk_scores
                """,
                """
                SELECT
                    person_id,
                    payment_year,
                    blended_risk_score,
                    v28_risk_score,
                    v24_risk_score
                FROM main_cms_hcc.patient_risk_scores
                """,
            )
            if result is None:
                return []
            rows, _ = result
            out: list[dict[str, Any]] = []
            for row in rows:
                person_id, payment_year, blended, v28, v24 = row
                raf = blended if blended is not None else (v28 if v28 is not None else v24)
                out.append({
                    "person_id": person_id,
                    "payment_year": payment_year,
                    "raf_score": raf,
                    "v28_risk_score": v28,
                    "v24_risk_score": v24,
                    "blended_risk_score": blended,
                })
            return out
        finally:
            con.close()

    def _read_tuva_pmpm(self) -> list[dict[str, Any]]:
        """Read Financial PMPM output from Tuva's data mart.

        `pmpm_prep` is wide-format — paid/allowed columns per service category.
        Returning a scalar `pmpm` from this table never worked; instead we
        emit one baseline row per (year_month) with total_paid/allowed/mm
        when available, and let the consumer compute per-category PMPM from
        the raw columns. Sync writes one row per year_month (not per
        category) so TuvaPmpmBaseline stores a total rather than a silent
        zero.
        """
        con = duckdb.connect(self.duckdb_path, read_only=True)
        try:
            # First try new schema convention, then legacy.
            result = self._try_query(
                con,
                "SELECT * FROM financial_pmpm.pmpm_prep ORDER BY year_month",
                "SELECT * FROM main_financial_pmpm.pmpm_prep ORDER BY year_month",
            )
            if result is None:
                return []
            rows, cols = result
            out: list[dict[str, Any]] = []
            for row in rows:
                row_map = dict(zip(cols, row))
                # Tuva's wide format — total all "*_paid_amount" columns for
                # an aggregate PMPM view. Columns we know about include
                # total_paid_amount / total_allowed_amount; fall back to
                # sum-of-service-categories if they're not present.
                total_paid = row_map.get("total_paid_amount")
                if total_paid is None:
                    total_paid = sum(
                        (v or 0) for k, v in row_map.items() if k.endswith("_paid_amount") and isinstance(v, (int, float))
                    ) or None
                member_months = row_map.get("member_months") or row_map.get("total_member_months")
                pmpm = None
                if total_paid is not None and member_months:
                    try:
                        pmpm = float(total_paid) / float(member_months)
                    except (ZeroDivisionError, TypeError):
                        pmpm = None
                out.append({
                    "year_month": row_map.get("year_month"),
                    "service_category": "total",
                    "pmpm": pmpm,
                    "member_months": member_months,
                    "raw": row_map,  # preserve for future drill-down
                })
            return out
        finally:
            con.close()

    async def sync_raf_baselines(self, session: AsyncSession) -> dict[str, int]:
        """Compare Tuva RAF scores against AQSoft's and store both.

        Deletes previous baselines before inserting new ones to avoid duplicates.
        """
        tuva_scores = self._read_tuva_hcc()

        # Clear previous baselines to prevent duplicate accumulation on re-runs
        await session.execute(delete(TuvaRafBaseline))
        await session.flush()

        synced = 0
        discrepancies = 0

        for score in tuva_scores:
            person_id = str(score["person_id"])
            tuva_raf = Decimal(str(score["raf_score"])) if score["raf_score"] is not None else None

            member_result = await session.execute(
                select(Member).where(Member.member_id == person_id)
            )
            member = member_result.scalar_one_or_none()

            # Three-tier RAF comparison:
            # - confirmed = current_raf (claims-only from HCC engine)
            # - projected = projected_raf (confirmed + suspects)
            confirmed_raf = Decimal(str(member.current_raf)) if member and member.current_raf else None
            projected_raf = Decimal(str(member.projected_raf)) if member and member.projected_raf else None

            # Capture opportunity = projected - confirmed
            capture_opp = None
            if projected_raf is not None and confirmed_raf is not None:
                capture_opp = projected_raf - confirmed_raf

            # Discrepancy = between Tuva confirmed and AQSoft confirmed
            has_discrepancy = False
            raf_diff = None
            detail = None
            if tuva_raf is not None and confirmed_raf is not None:
                raf_diff = abs(tuva_raf - confirmed_raf)
                if raf_diff > RAF_DISCREPANCY_THRESHOLD:
                    has_discrepancy = True
                    discrepancies += 1
                    detail = (
                        f"Tuva confirmed={tuva_raf}, AQSoft confirmed={confirmed_raf}, "
                        f"diff={raf_diff} | AQSoft projected={projected_raf}, "
                        f"capture opportunity={capture_opp}"
                    )

            baseline = TuvaRafBaseline(
                member_id=person_id,
                payment_year=score.get("payment_year", 2026),
                tuva_raf_score=tuva_raf,
                aqsoft_confirmed_raf=confirmed_raf,
                aqsoft_projected_raf=projected_raf,
                aqsoft_hcc_list=None,
                capture_opportunity_raf=capture_opp,
                has_discrepancy=has_discrepancy,
                discrepancy_detail=detail,
                raf_difference=raf_diff,
                computed_at=datetime.now(timezone.utc),
            )
            session.add(baseline)
            synced += 1

        await session.flush()
        logger.info("Synced %d RAF baselines, %d discrepancies found", synced, discrepancies)
        return {"synced": synced, "discrepancies": discrepancies}

    async def sync_pmpm_baselines(self, session: AsyncSession) -> dict[str, int]:
        """Compare Tuva PMPM against AQSoft's expenditure engine."""
        tuva_pmpm = self._read_tuva_pmpm()

        # Clear previous baselines
        await session.execute(delete(TuvaPmpmBaseline))
        await session.flush()

        synced = 0
        discrepancies = 0

        for row in tuva_pmpm:
            tuva_val = Decimal(str(row["pmpm"])) if row["pmpm"] is not None else None

            has_discrepancy = False
            disc_pct = None

            baseline = TuvaPmpmBaseline(
                period=str(row["year_month"]),
                service_category=row.get("service_category"),
                tuva_pmpm=tuva_val,
                aqsoft_pmpm=None,  # Will be populated when expenditure comparison is built
                has_discrepancy=has_discrepancy,
                discrepancy_pct=disc_pct,
                member_months=row.get("member_months"),
                computed_at=datetime.now(timezone.utc),
            )
            session.add(baseline)
            synced += 1

        await session.flush()
        logger.info("Synced %d PMPM baselines", synced)
        return {"synced": synced, "discrepancies": discrepancies}

    async def sync_all(self, session: AsyncSession) -> dict[str, Any]:
        """Run full sync of all Tuva outputs."""
        raf_result = await self.sync_raf_baselines(session)
        pmpm_result = await self.sync_pmpm_baselines(session)
        return {"raf": raf_result, "pmpm": pmpm_result}
