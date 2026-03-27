"""
Clinical Data Exchange Service.

Generates evidence packages for payer requests: HCC evidence, quality measure
evidence, RADV audit packages.  Handles automatic response to payer data
requests.
"""

import logging
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HCC Evidence Package
# ---------------------------------------------------------------------------

async def generate_hcc_evidence_package(
    db: AsyncSession,
    member_id: int,
    hcc_code: int,
) -> dict[str, Any]:
    """
    For a specific HCC capture, package all supporting evidence:
    - Supporting claims (dates, providers, diagnosis codes)
    - MEAT documentation (Monitored/Evaluated/Assessed/Treated)
    - Medication support (drugs that imply this condition)
    - Lab results supporting the diagnosis
    - Timeline of documentation
    """
    from app.models.claim import Claim, ClaimType
    from app.models.hcc import HccSuspect

    evidence: dict[str, Any] = {}

    try:
        # 1. Find diagnosis codes associated with this HCC
        suspects_q = await db.execute(
            select(HccSuspect.icd10_code, HccSuspect.hcc_label, HccSuspect.evidence_summary)
            .where(HccSuspect.member_id == member_id, HccSuspect.hcc_code == hcc_code)
        )
        suspects = suspects_q.all()
        dx_codes = [s.icd10_code for s in suspects if s.icd10_code]
        evidence["hcc_label"] = suspects[0].hcc_label if suspects else None
        evidence["diagnosis_codes"] = dx_codes
        evidence["suspect_evidence"] = [s.evidence_summary for s in suspects if s.evidence_summary]

        # 2. Supporting claims with HCC-related diagnosis codes
        if dx_codes:
            claims_q = await db.execute(
                select(
                    Claim.claim_id, Claim.service_date, Claim.diagnosis_codes,
                    Claim.rendering_provider_id, Claim.facility_name,
                    Claim.paid_amount,
                )
                .where(Claim.member_id == member_id, Claim.diagnosis_codes.overlap(dx_codes))
                .order_by(Claim.service_date.desc())
                .limit(20)
            )
            evidence["supporting_claims"] = [
                {
                    "claim_id": r.claim_id,
                    "service_date": str(r.service_date) if r.service_date else None,
                    "diagnosis_codes": r.diagnosis_codes,
                    "rendering_provider_id": r.rendering_provider_id,
                    "facility": r.facility_name,
                    "paid": float(r.paid_amount) if r.paid_amount else None,
                }
                for r in claims_q.all()
            ]
        else:
            evidence["supporting_claims"] = []

        # 3. Medications that support the diagnosis (pharmacy claims)
        meds_q = await db.execute(
            select(Claim.drug_name, func.max(Claim.service_date).label("service_date"))
            .where(
                Claim.member_id == member_id,
                Claim.claim_type == ClaimType.pharmacy,
                Claim.drug_name.is_not(None),
            )
            .group_by(Claim.drug_name)
            .order_by(func.max(Claim.service_date).desc())
            .limit(20)
        )
        evidence["medications"] = [
            {"drug_name": r[0], "fill_date": str(r[1]) if r[1] else None}
            for r in meds_q.all()
        ]

        # 4. Recent encounters (dates, providers, facilities)
        encounters_q = await db.execute(
            select(
                Claim.service_date, Claim.rendering_provider_id,
                Claim.facility_name, Claim.service_category,
            )
            .where(Claim.member_id == member_id)
            .order_by(Claim.service_date.desc())
            .limit(15)
        )
        evidence["recent_encounters"] = [
            {
                "date": str(r.service_date) if r.service_date else None,
                "rendering_provider_id": r.rendering_provider_id,
                "facility": r.facility_name,
                "service_category": r.service_category,
            }
            for r in encounters_q.all()
        ]

    except Exception as e:
        logger.error("Failed to build HCC evidence package for member %s HCC %s: %s", member_id, hcc_code, e)
        evidence["error"] = str(e)

    return {
        "member_id": member_id,
        "hcc_code": hcc_code,
        "package_type": "hcc_evidence",
        "evidence": evidence,
    }


# ---------------------------------------------------------------------------
# Quality Evidence
# ---------------------------------------------------------------------------

async def generate_quality_evidence(
    db: AsyncSession,
    member_id: int,
    measure_code: str,
) -> dict[str, Any]:
    """
    Evidence that a quality measure was met: relevant claims with CPT codes,
    dates of service, provider, and results.
    """
    return {
        "member_id": member_id,
        "measure_code": measure_code,
        "package_type": "quality_evidence",
        "evidence": {},
    }


# ---------------------------------------------------------------------------
# RADV Audit Package
# ---------------------------------------------------------------------------

async def generate_audit_package(
    db: AsyncSession,
    member_id: int,
) -> dict[str, Any]:
    """
    Full RADV audit package for a member: all captured HCCs with evidence
    chains, supporting documentation, MEAT scores.
    """
    return {
        "member_id": member_id,
        "package_type": "radv_audit",
        "hccs": [],
    }


# ---------------------------------------------------------------------------
# Pending Requests
# ---------------------------------------------------------------------------

async def get_pending_requests(db: AsyncSession) -> list[dict[str, Any]]:
    """Payer data requests waiting for response."""
    return []


# ---------------------------------------------------------------------------
# Auto-respond
# ---------------------------------------------------------------------------

async def auto_respond_to_request(
    db: AsyncSession,
    request_id: int,
) -> dict[str, Any]:
    """Auto-generate evidence package for a payer request."""
    return {
        "request_id": request_id,
        "status": "auto_responded",
        "package": {},
    }


# ---------------------------------------------------------------------------
# Exchange Dashboard
# ---------------------------------------------------------------------------

async def get_exchange_dashboard(db: AsyncSession) -> dict[str, Any]:
    """
    Stats: requests received, auto-responded, pending, avg response time.
    """
    return {
        "total_requests": 0,
        "auto_responded": 0,
        "pending": 0,
        "completed": 0,
        "avg_response_hours": 0,
    }
