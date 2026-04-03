"""
Clinical Gap Detector — finds uncoded/miscoded diagnoses by comparing
clinical note content against actual claims coding.

Three types of gaps detected:

1. UNCODED: Condition documented in clinical note but NO matching ICD-10 in claims
   → Provider documented it but nobody coded it. Easy capture.

2. UNDERCODED: Condition in note suggests higher specificity than what's coded
   → Note says "chronic systolic heart failure, EF 35%" but claims have I50.9 (unspecified)
   → Should be I50.22 (chronic systolic, HCC 226, RAF 0.360)

3. HISTORICAL: Condition mentioned in note as historical/resolved but was an active HCC
   → "History of colon cancer, status post resection 2020" — may still qualify for recapture

Each gap includes:
- The evidence quote from the clinical note
- The source document (type, date, provider)
- The suggested ICD-10 code with HCC/RAF impact
- What's currently coded (if anything) for comparison

This service works with data from clinical_nlp_service.py extractions
and cross-references against claims in PostgreSQL.
"""

import logging
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.claim import Claim
from app.models.member import Member
from app.services.hcc_engine import lookup_hcc_for_icd10, build_code_ladder

logger = logging.getLogger(__name__)


async def detect_clinical_gaps(
    member_id: int,
    extracted_conditions: list[dict],
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """Compare NLP-extracted conditions against claims coding.

    Parameters
    ----------
    member_id : int
        Database ID of the member
    extracted_conditions : list[dict]
        Conditions extracted by clinical_nlp_service, each with:
        icd10_code, description, evidence_quote, clinical_status
    db : AsyncSession
        Database session (tenant-scoped)

    Returns
    -------
    list of gap dicts, each with:
        gap_type, icd10_suggested, icd10_current, hcc_code, raf_value,
        description, evidence_quote, source_document, code_ladder
    """
    if not extracted_conditions:
        return []

    # Get all diagnosis codes currently in claims for this member
    result = await db.execute(
        select(Claim.diagnosis_codes).where(
            Claim.member_id == member_id,
            Claim.diagnosis_codes.isnot(None),
        )
    )
    coded_dx: set[str] = set()
    for row in result.all():
        if row[0]:
            coded_dx.update(row[0])

    # Normalize coded codes (strip dots for comparison)
    coded_normalized = {c.upper().replace(".", "") for c in coded_dx}

    gaps: list[dict[str, Any]] = []

    for condition in extracted_conditions:
        icd10 = condition.get("icd10_code", "")
        if not icd10:
            continue

        description = condition.get("description", "")
        evidence = condition.get("evidence_quote", "")
        clinical_status = condition.get("clinical_status", "active")
        source = condition.get("source", {})

        # Normalize the extracted code
        extracted_normalized = icd10.upper().replace(".", "")

        # Look up HCC mapping for the extracted code
        hcc_entry = lookup_hcc_for_icd10(icd10)
        hcc_code = int(hcc_entry["hcc"]) if hcc_entry and hcc_entry.get("hcc") else None
        raf_value = float(hcc_entry.get("raf", 0)) if hcc_entry else 0

        # Check if this code (or a related code) is already in claims
        is_coded = extracted_normalized in coded_normalized

        # Check for family match (same first 3-4 chars = same condition family)
        family_prefix = extracted_normalized[:3]
        family_coded = [c for c in coded_normalized if c.startswith(family_prefix)]

        if not is_coded and not family_coded:
            # GAP TYPE 1: UNCODED — condition in note but not in claims at all
            if clinical_status in ("active", "recurrence"):
                gap_type = "uncoded"
                gap_reason = f"Documented in clinical note but no {family_prefix}* code found in claims"
            elif clinical_status in ("resolved",):
                gap_type = "historical"
                gap_reason = f"Historical condition documented — may qualify for HCC recapture"
            else:
                continue  # Skip conditions that are clearly not active

            gaps.append({
                "gap_type": gap_type,
                "icd10_suggested": icd10,
                "icd10_current": None,
                "hcc_code": hcc_code,
                "raf_value": raf_value,
                "description": description,
                "evidence_quote": evidence,
                "gap_reason": gap_reason,
                "clinical_status": clinical_status,
                "confidence": 80 if gap_type == "uncoded" else 60,
                "code_ladder": build_code_ladder(icd10) if hcc_code else [],
                "source": source,
            })

        elif family_coded and not is_coded:
            # GAP TYPE 2: UNDERCODED — same condition family but different specificity
            # Find what's currently coded in this family
            current_codes = []
            for coded in coded_dx:
                if coded.upper().replace(".", "").startswith(family_prefix):
                    current_entry = lookup_hcc_for_icd10(coded)
                    current_codes.append({
                        "code": coded,
                        "hcc": int(current_entry["hcc"]) if current_entry and current_entry.get("hcc") else None,
                        "raf": float(current_entry.get("raf", 0)) if current_entry else 0,
                    })

            # Is the extracted code higher-value than what's coded?
            max_current_raf = max((c["raf"] for c in current_codes), default=0)

            if raf_value > max_current_raf:
                raf_uplift = raf_value - max_current_raf
                current_best = max(current_codes, key=lambda c: c["raf"]) if current_codes else None

                gaps.append({
                    "gap_type": "undercoded",
                    "icd10_suggested": icd10,
                    "icd10_current": current_best["code"] if current_best else None,
                    "hcc_code": hcc_code,
                    "raf_value": raf_uplift,  # The incremental RAF gain
                    "raf_total": raf_value,   # Total RAF if upgraded
                    "current_raf": max_current_raf,
                    "description": description,
                    "evidence_quote": evidence,
                    "gap_reason": (
                        f"Clinical note supports more specific code: "
                        f"{icd10} ({description}) vs current {current_best['code'] if current_best else '?'} "
                        f"(RAF uplift: +{raf_uplift:.3f})"
                    ),
                    "clinical_status": clinical_status,
                    "confidence": 75,
                    "code_ladder": build_code_ladder(icd10),
                    "source": source,
                })

    # Sort by RAF value descending
    gaps.sort(key=lambda g: -(g.get("raf_value", 0)))

    logger.info(
        "Clinical gap detection for member %d: %d gaps found (%d uncoded, %d undercoded, %d historical)",
        member_id,
        len(gaps),
        sum(1 for g in gaps if g["gap_type"] == "uncoded"),
        sum(1 for g in gaps if g["gap_type"] == "undercoded"),
        sum(1 for g in gaps if g["gap_type"] == "historical"),
    )

    return gaps


async def run_clinical_gap_analysis(
    member_id: int,
    nlp_extractions: list[dict[str, Any]],
    db: AsyncSession,
) -> dict[str, Any]:
    """Run full clinical gap analysis for a member across all their NLP extractions.

    Aggregates gaps from multiple clinical notes, deduplicates, and
    returns a comprehensive gap report.
    """
    all_conditions: list[dict] = []
    for extraction in nlp_extractions:
        conditions = extraction.get("conditions", [])
        source = extraction.get("source", {})
        doc_ref = extraction.get("document_ref", {})
        # Attach source info to each condition
        for c in conditions:
            c["source"] = {**source, **doc_ref}
        all_conditions.extend(conditions)

    gaps = await detect_clinical_gaps(member_id, all_conditions, db)

    # Deduplicate by ICD-10 code (keep highest confidence)
    seen_codes: dict[str, dict] = {}
    for gap in gaps:
        code = gap["icd10_suggested"]
        if code not in seen_codes or gap["confidence"] > seen_codes[code]["confidence"]:
            seen_codes[code] = gap
    deduped = sorted(seen_codes.values(), key=lambda g: -(g.get("raf_value", 0)))

    total_raf = sum(g.get("raf_value", 0) for g in deduped)

    return {
        "member_id": member_id,
        "total_gaps": len(deduped),
        "total_raf_opportunity": round(total_raf, 3),
        "gaps_by_type": {
            "uncoded": [g for g in deduped if g["gap_type"] == "uncoded"],
            "undercoded": [g for g in deduped if g["gap_type"] == "undercoded"],
            "historical": [g for g in deduped if g["gap_type"] == "historical"],
        },
        "all_gaps": deduped,
    }
