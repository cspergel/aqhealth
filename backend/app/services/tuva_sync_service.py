"""
Tuva Sync Service — reads Tuva output marts from DuckDB and syncs to PostgreSQL.

Compares Tuva's baseline numbers against AQSoft's calculations.
Preserves both values and flags discrepancies.
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Any

import duckdb
from sqlalchemy import select
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

    def _read_tuva_hcc(self) -> list[dict[str, Any]]:
        """Read CMS-HCC output from Tuva's data mart."""
        con = duckdb.connect(self.duckdb_path, read_only=True)
        try:
            result = con.execute("""
                SELECT
                    person_id,
                    payment_year,
                    raw_risk_score as raf_score
                FROM main.cms_hcc__patient_risk_scores
            """).fetchall()
            columns = ["person_id", "payment_year", "raf_score"]
            return [dict(zip(columns, row)) for row in result]
        except Exception as e:
            logger.warning("Could not read Tuva HCC output: %s", e)
            return []
        finally:
            con.close()

    def _read_tuva_pmpm(self) -> list[dict[str, Any]]:
        """Read Financial PMPM output from Tuva's data mart."""
        con = duckdb.connect(self.duckdb_path, read_only=True)
        try:
            result = con.execute("""
                SELECT
                    year_month,
                    service_category_1 as service_category,
                    pmpm,
                    member_months
                FROM main.financial_pmpm__pmpm_prep
            """).fetchall()
            columns = ["year_month", "service_category", "pmpm", "member_months"]
            return [dict(zip(columns, row)) for row in result]
        except Exception as e:
            logger.warning("Could not read Tuva PMPM output: %s", e)
            return []
        finally:
            con.close()

    async def sync_raf_baselines(self, session: AsyncSession) -> dict[str, int]:
        """Compare Tuva RAF scores against AQSoft's and store both."""
        tuva_scores = self._read_tuva_hcc()
        synced = 0
        discrepancies = 0

        for score in tuva_scores:
            person_id = str(score["person_id"])
            tuva_raf = Decimal(str(score["raf_score"])) if score["raf_score"] is not None else None

            member_result = await session.execute(
                select(Member).where(Member.member_id == person_id)
            )
            member = member_result.scalar_one_or_none()
            aqsoft_raf = Decimal(str(member.current_raf)) if member and member.current_raf else None

            has_discrepancy = False
            raf_diff = None
            detail = None
            if tuva_raf is not None and aqsoft_raf is not None:
                raf_diff = abs(tuva_raf - aqsoft_raf)
                if raf_diff > RAF_DISCREPANCY_THRESHOLD:
                    has_discrepancy = True
                    discrepancies += 1
                    detail = (
                        f"Tuva={tuva_raf}, AQSoft={aqsoft_raf}, "
                        f"diff={raf_diff} (threshold={RAF_DISCREPANCY_THRESHOLD})"
                    )

            baseline = TuvaRafBaseline(
                member_id=person_id,
                payment_year=score.get("payment_year", 2026),
                tuva_raf_score=tuva_raf,
                aqsoft_raf_score=aqsoft_raf,
                has_discrepancy=has_discrepancy,
                discrepancy_detail=detail,
                raf_difference=raf_diff,
                computed_at=datetime.utcnow(),
            )
            session.add(baseline)
            synced += 1

        await session.flush()
        logger.info("Synced %d RAF baselines, %d discrepancies found", synced, discrepancies)
        return {"synced": synced, "discrepancies": discrepancies}

    async def sync_pmpm_baselines(self, session: AsyncSession) -> dict[str, int]:
        """Compare Tuva PMPM against AQSoft's expenditure engine."""
        tuva_pmpm = self._read_tuva_pmpm()
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
                computed_at=datetime.utcnow(),
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
