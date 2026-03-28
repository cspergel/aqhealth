"""
Org Discovery Service — analyze uploaded files to discover organizational structure.

Extracts TINs (Tax IDs) and NPIs from uploaded data files, cross-references them
against existing practice_groups and providers, and produces a proposal for human
review. After confirmation, creates new groups and providers via find-or-create
(unique constraints protect against races).
"""

import logging
import re
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import UploadJob
from app.models.practice_group import PracticeGroup
from app.models.provider import Provider
from app.services.county_rate_service import get_county_code_for_zip
from app.services.ingestion_service import read_file_headers_and_sample
from app.utils.tin import mask_tin, normalize_tin

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# NPI validation
# ---------------------------------------------------------------------------

def _validate_npi(raw: str | None) -> str | None:
    """Validate an NPI: must be exactly 10 digits. Returns cleaned NPI or None."""
    if not raw:
        return None
    digits = re.sub(r"\s", "", str(raw).strip())
    if not re.match(r"^\d{10}$", digits):
        return None
    return digits


# ---------------------------------------------------------------------------
# Helpers — column lookups from mapping
# ---------------------------------------------------------------------------

def _find_source_column(column_mapping: dict[str, str], target_field: str) -> str | None:
    """Find the source column name that maps to a given target platform field.

    column_mapping is {source_col: platform_field}.
    """
    for source_col, platform_field in column_mapping.items():
        if platform_field == target_field:
            return source_col
    return None


def _find_source_columns(column_mapping: dict[str, str], target_fields: list[str]) -> dict[str, str]:
    """Find source columns for multiple target fields. Returns {target_field: source_col}."""
    result = {}
    for source_col, platform_field in column_mapping.items():
        if platform_field in target_fields:
            result[platform_field] = source_col
    return result


# ---------------------------------------------------------------------------
# discover_org_structure
# ---------------------------------------------------------------------------

async def discover_org_structure(
    db: AsyncSession, job_id: int
) -> dict[str, Any]:
    """Analyze an uploaded file to discover TIN/NPI org structure.

    Loads the file path and column_mapping from the upload_jobs table,
    re-reads the file (up to 10,000 rows), and extracts unique TINs and NPIs.
    Cross-references against existing practice_groups and providers.

    Returns a proposal dict for frontend display + human confirmation.
    """
    # 1. Load upload job
    result = await db.execute(select(UploadJob).where(UploadJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise ValueError(f"Upload job {job_id} not found")

    file_path = job.cleaned_file_path or job.filename
    column_mapping = job.column_mapping or {}

    if not column_mapping:
        raise ValueError(f"Upload job {job_id} has no column_mapping — run mapping first")

    # 2. Re-read file with full scan (up to 10,000 rows)
    headers, sample_rows = read_file_headers_and_sample(file_path, max_rows=10000)

    if not sample_rows:
        return {
            "existing_groups": [],
            "proposed_groups": [],
            "existing_providers": [],
            "new_providers": [],
            "routing_summary": {
                "routable_by_tin": 0,
                "routable_by_npi": 0,
                "unmatched": 0,
                "total": 0,
            },
        }

    # 3. Find TIN and NPI columns from mapping
    tin_source_col = _find_source_column(column_mapping, "billing_tin")
    npi_fields = ["rendering_npi", "billing_npi"]
    npi_cols = _find_source_columns(column_mapping, npi_fields)

    # Build header-index lookup
    header_idx = {h: i for i, h in enumerate(headers)}

    tin_col_idx = header_idx.get(tin_source_col) if tin_source_col else None
    npi_col_indices = {}
    for target_field, source_col in npi_cols.items():
        if source_col in header_idx:
            npi_col_indices[target_field] = header_idx[source_col]

    # 4. Extract unique TINs and NPIs from rows
    raw_tins: set[str] = set()
    raw_npis: set[str] = set()
    # Track TIN→NPI associations and row counts
    tin_npi_map: dict[str, set[str]] = {}  # normalized_tin → set of NPIs
    tin_row_counts: dict[str, int] = {}  # normalized_tin → row count
    rows_with_tin = 0
    rows_with_npi = 0
    total_rows = len(sample_rows)

    for row in sample_rows:
        row_tin = None
        row_npis_found: list[str] = []

        # Extract TIN
        if tin_col_idx is not None and tin_col_idx < len(row):
            raw_val = str(row[tin_col_idx]).strip() if row[tin_col_idx] else ""
            normalized = normalize_tin(raw_val)
            if normalized:
                raw_tins.add(normalized)
                row_tin = normalized
                rows_with_tin += 1
                tin_row_counts[normalized] = tin_row_counts.get(normalized, 0) + 1

        # Extract NPIs
        for target_field, col_idx in npi_col_indices.items():
            if col_idx < len(row):
                raw_val = str(row[col_idx]).strip() if row[col_idx] else ""
                validated = _validate_npi(raw_val)
                if validated:
                    raw_npis.add(validated)
                    row_npis_found.append(validated)
                    rows_with_npi += 1

        # Associate NPIs with their TIN
        if row_tin and row_npis_found:
            if row_tin not in tin_npi_map:
                tin_npi_map[row_tin] = set()
            tin_npi_map[row_tin].update(row_npis_found)

    # 5. Batch-check TINs against practice_groups
    existing_groups: list[dict] = []
    new_tins: set[str] = set()

    if raw_tins:
        tin_list = list(raw_tins)
        stmt = select(PracticeGroup).where(PracticeGroup.tin.in_(tin_list))
        result = await db.execute(stmt)
        found_groups = result.scalars().all()
        found_tin_set = set()
        for g in found_groups:
            found_tin_set.add(g.tin)
            existing_groups.append({
                "id": g.id,
                "name": g.name,
                "tin": mask_tin(g.tin),
                "provider_count": g.provider_count,
            })
        new_tins = raw_tins - found_tin_set

    # 6. Batch-check NPIs against providers
    existing_providers: list[dict] = []
    new_npis: set[str] = set()

    if raw_npis:
        npi_list = list(raw_npis)
        stmt = select(Provider).where(Provider.npi.in_(npi_list))
        result = await db.execute(stmt)
        found_providers = result.scalars().all()
        found_npi_set = {p.npi for p in found_providers}
        for p in found_providers:
            existing_providers.append({
                "id": p.id,
                "npi": p.npi,
                "name": f"{p.first_name} {p.last_name}".strip(),
                "practice_group_id": p.practice_group_id,
            })
        new_npis = raw_npis - found_npi_set

    # 7. Build proposed groups with their new providers
    proposed_groups: list[dict] = []
    for tin in sorted(new_tins):
        associated_npis = tin_npi_map.get(tin, set())
        new_associated = associated_npis & new_npis  # Only NPIs not yet in DB
        proposed_groups.append({
            "tin": mask_tin(tin),
            "tin_raw": tin,  # Needed for confirm step — stripped before sending to frontend
            "suggested_name": f"Office (TIN ...{tin[-4:]})",
            "provider_count": len(associated_npis),
            "new_provider_count": len(new_associated),
            "row_count": tin_row_counts.get(tin, 0),
        })

    # 8. Build new providers list
    new_providers: list[dict] = []
    for npi in sorted(new_npis):
        # Find which TIN this NPI is associated with
        suggested_tin = None
        for tin, npis in tin_npi_map.items():
            if npi in npis:
                suggested_tin = tin
                break
        new_providers.append({
            "npi": npi,
            "suggested_name": f"NPI {npi}",
            "suggested_group_tin": mask_tin(suggested_tin) if suggested_tin else None,
            "suggested_group_tin_raw": suggested_tin,  # For confirm step
        })

    # 9. Routing summary
    # Routable = rows where we can resolve to a practice_group (existing TIN match)
    existing_tin_set = raw_tins - new_tins
    routable_by_tin = sum(
        tin_row_counts.get(tin, 0) for tin in existing_tin_set
    )
    # NPI-routable: rows with existing NPI but no TIN routing
    routable_by_npi = len(raw_npis & {p.npi for p in found_providers}) if raw_npis else 0
    unmatched = total_rows - rows_with_tin  # rows without any TIN

    routing_summary = {
        "routable_by_tin": routable_by_tin,
        "routable_by_npi": routable_by_npi,
        "unmatched": max(0, unmatched),
        "total": total_rows,
    }

    return {
        "job_id": job_id,
        "existing_groups": existing_groups,
        "proposed_groups": proposed_groups,
        "existing_providers": existing_providers,
        "new_providers": new_providers,
        "routing_summary": routing_summary,
    }


# ---------------------------------------------------------------------------
# confirm_org_structure
# ---------------------------------------------------------------------------

async def confirm_org_structure(
    db: AsyncSession,
    proposal: dict[str, Any],
    user_edits: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create approved groups and providers from the discovery proposal.

    Uses find-or-create pattern: checks for existing TIN/NPI before INSERT.
    Unique constraints on practice_groups.tin and providers.npi protect against races.

    Args:
        db: Async database session.
        proposal: The proposal dict from discover_org_structure().
        user_edits: Optional overrides from the user, keyed by TIN or NPI:
            {
                "groups": {"<tin>": {"name": "Custom Name", "approved": true}},
                "providers": {"<npi>": {"first_name": "...", "last_name": "...", "approved": true}},
                "rejected_tins": ["<tin>", ...],
                "rejected_npis": ["<npi>", ...],
            }

    Returns:
        Dict with created_groups and created_providers lists.
    """
    user_edits = user_edits or {}
    group_edits = user_edits.get("groups", {})
    provider_edits = user_edits.get("providers", {})
    rejected_tins = set(user_edits.get("rejected_tins", []))
    rejected_npis = set(user_edits.get("rejected_npis", []))

    created_groups: list[dict] = []
    created_providers: list[dict] = []

    # TIN → group_id mapping (for linking providers)
    tin_to_group_id: dict[str, int] = {}

    # Also map existing group TINs to IDs
    for eg in proposal.get("existing_groups", []):
        # existing_groups may have masked TINs; look up from DB if needed
        if eg.get("id"):
            stmt = select(PracticeGroup).where(PracticeGroup.id == eg["id"])
            result = await db.execute(stmt)
            group = result.scalar_one_or_none()
            if group and group.tin:
                tin_to_group_id[group.tin] = group.id

    # --- Create approved new groups ---
    for pg in proposal.get("proposed_groups", []):
        tin = pg.get("tin_raw")
        if not tin or tin in rejected_tins:
            continue

        edits = group_edits.get(tin, {})
        if edits.get("approved") is False:
            continue

        # Find-or-create by TIN
        stmt = select(PracticeGroup).where(PracticeGroup.tin == tin)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            tin_to_group_id[tin] = existing.id
            created_groups.append({
                "id": existing.id,
                "name": existing.name,
                "tin": mask_tin(tin),
                "status": "already_exists",
            })
            continue

        # Create new group
        group_name = edits.get("name") or pg.get("suggested_name", f"Office (TIN ...{tin[-4:]})")
        zip_code = edits.get("zip_code")
        county_code = None
        if zip_code:
            county_code = get_county_code_for_zip(zip_code)  # Sync — no await

        new_group = PracticeGroup(
            name=group_name,
            tin=tin,
            group_type="practice",
            relationship_type=edits.get("relationship_type", "affiliated"),
            address=edits.get("address"),
            city=edits.get("city"),
            state=edits.get("state"),
            zip_code=zip_code,
            county_code=county_code,
            phone=edits.get("phone"),
            contact_email=edits.get("contact_email"),
        )
        db.add(new_group)

        try:
            await db.flush()  # Get the ID; unique constraint will raise on race
            tin_to_group_id[tin] = new_group.id
            created_groups.append({
                "id": new_group.id,
                "name": new_group.name,
                "tin": mask_tin(tin),
                "status": "created",
            })
        except Exception as e:
            logger.warning("Race condition creating group with TIN %s: %s", mask_tin(tin), e)
            await db.rollback()
            # Re-fetch — another transaction won
            stmt = select(PracticeGroup).where(PracticeGroup.tin == tin)
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                tin_to_group_id[tin] = existing.id
                created_groups.append({
                    "id": existing.id,
                    "name": existing.name,
                    "tin": mask_tin(tin),
                    "status": "already_exists",
                })

    # --- Create approved new providers ---
    for np in proposal.get("new_providers", []):
        npi = np.get("npi")
        if not npi or npi in rejected_npis:
            continue

        edits = provider_edits.get(npi, {})
        if edits.get("approved") is False:
            continue

        # Find-or-create by NPI
        stmt = select(Provider).where(Provider.npi == npi)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            created_providers.append({
                "id": existing.id,
                "npi": existing.npi,
                "name": f"{existing.first_name} {existing.last_name}".strip(),
                "status": "already_exists",
            })
            continue

        # Resolve practice_group_id from TIN
        suggested_tin = np.get("suggested_group_tin_raw")
        practice_group_id = tin_to_group_id.get(suggested_tin) if suggested_tin else None

        # Apply user edits
        first_name = edits.get("first_name", "")
        last_name = edits.get("last_name", "") or f"NPI {npi}"
        specialty = edits.get("specialty")

        new_provider = Provider(
            npi=npi,
            first_name=first_name,
            last_name=last_name,
            specialty=specialty,
            practice_group_id=practice_group_id,
            tin=suggested_tin,
        )
        db.add(new_provider)

        try:
            await db.flush()
            created_providers.append({
                "id": new_provider.id,
                "npi": new_provider.npi,
                "name": f"{first_name} {last_name}".strip(),
                "practice_group_id": practice_group_id,
                "status": "created",
            })
        except Exception as e:
            logger.warning("Race condition creating provider with NPI %s: %s", npi, e)
            await db.rollback()
            stmt = select(Provider).where(Provider.npi == npi)
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                created_providers.append({
                    "id": existing.id,
                    "npi": existing.npi,
                    "name": f"{existing.first_name} {existing.last_name}".strip(),
                    "status": "already_exists",
                })

    return {
        "created_groups": created_groups,
        "created_providers": created_providers,
        "summary": {
            "groups_created": sum(1 for g in created_groups if g["status"] == "created"),
            "groups_existing": sum(1 for g in created_groups if g["status"] == "already_exists"),
            "providers_created": sum(1 for p in created_providers if p["status"] == "created"),
            "providers_existing": sum(1 for p in created_providers if p["status"] == "already_exists"),
        },
    }
