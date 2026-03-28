"""
Onboarding API Router — progress tracking, data requirements,
org discovery, and practice group management.

All endpoints require mso_admin or superadmin role.
TINs are masked in responses for non-admin safety.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.practice_group import PracticeGroup
from app.models.provider import Provider
from app.models.user import UserRole
from app.services import onboarding_service, org_discovery_service
from app.services.county_rate_service import get_county_code_for_zip
from app.utils.tin import mask_tin, normalize_tin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

# All endpoints require mso_admin or superadmin
_require_admin = require_role(UserRole.mso_admin, UserRole.superadmin)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PracticeGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    tin: str = Field(..., min_length=1, description="Tax ID (EIN) — will be normalized")
    group_type: str | None = Field("practice", max_length=20)
    relationship_type: str | None = Field("affiliated", max_length=20)
    address: str | None = None
    city: str | None = None
    state: str | None = Field(None, max_length=2)
    zip_code: str | None = Field(None, max_length=10)
    phone: str | None = Field(None, max_length=20)
    fax: str | None = Field(None, max_length=20)
    contact_email: str | None = Field(None, max_length=255)
    org_npi: str | None = Field(None, max_length=20)
    parent_id: int | None = None


class PracticeGroupUpdate(BaseModel):
    name: str | None = Field(None, max_length=200)
    group_type: str | None = Field(None, max_length=20)
    relationship_type: str | None = Field(None, max_length=20)
    address: str | None = None
    city: str | None = None
    state: str | None = Field(None, max_length=2)
    zip_code: str | None = Field(None, max_length=10)
    phone: str | None = Field(None, max_length=20)
    fax: str | None = Field(None, max_length=20)
    contact_email: str | None = Field(None, max_length=255)
    org_npi: str | None = Field(None, max_length=20)
    parent_id: int | None = None
    bonus_pct: float | None = None


class DiscoverStructureRequest(BaseModel):
    job_id: int = Field(..., description="Upload job ID to analyze")


class ConfirmStructureRequest(BaseModel):
    job_id: int = Field(..., description="Upload job ID that was discovered")
    groups: list[dict[str, Any]] = Field(..., description="User-reviewed groups with tin, name, relationship_type")


# ---------------------------------------------------------------------------
# GET /api/onboarding/progress
# ---------------------------------------------------------------------------

@router.get("/progress")
async def get_onboarding_progress(
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Overall onboarding progress — percentage, phase, and requirements breakdown."""
    progress = await onboarding_service.get_onboarding_progress(db)
    return progress


# ---------------------------------------------------------------------------
# GET /api/onboarding/requirements
# ---------------------------------------------------------------------------

@router.get("/requirements")
async def get_data_requirements(
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Detailed data requirements with current load status."""
    statuses = await onboarding_service.get_data_requirements_status(db)
    return {"requirements": statuses}


# ---------------------------------------------------------------------------
# GET /api/onboarding/payer-guidance
# ---------------------------------------------------------------------------

@router.get("/payer-guidance")
async def get_payer_guidance(
    payer: str | None = Query(None, description="Payer name (e.g., Humana, UHC, Aetna)"),
    data_type: str | None = Query(None, description="Specific data type (e.g., claims, pharmacy)"),
    current_user: dict = Depends(_require_admin),
):
    """Payer-specific tips on where to find data files."""
    guidance = onboarding_service.get_payer_guidance(payer, data_type)
    return {"payer": payer, "data_type": data_type, "guidance": guidance}


# ---------------------------------------------------------------------------
# POST /api/onboarding/practice-groups
# ---------------------------------------------------------------------------

@router.post("/practice-groups", status_code=201)
async def create_practice_group(
    body: PracticeGroupCreate,
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create a practice group (find-or-create by TIN).

    - Normalizes TIN to 9-digit format
    - If TIN already exists, returns existing group
    - Auto-sets county_code from ZIP code (sync lookup)
    - Masks TIN in response
    """
    # 1. Normalize TIN
    normalized_tin = normalize_tin(body.tin)
    if not normalized_tin:
        raise HTTPException(status_code=422, detail="Invalid TIN format — must be 9 digits (e.g., 12-3456789)")

    # 2. Check if TIN already exists (find-or-create)
    stmt = select(PracticeGroup).where(PracticeGroup.tin == normalized_tin)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        return {
            "id": existing.id,
            "name": existing.name,
            "tin": mask_tin(existing.tin),
            "status": "already_exists",
            "message": f"Practice group already exists with TIN {mask_tin(existing.tin)}",
        }

    # 3. Auto-set county_code from ZIP (SYNC — no await)
    county_code = None
    if body.zip_code:
        county_code = get_county_code_for_zip(body.zip_code)

    # 4. Create new group
    new_group = PracticeGroup(
        name=body.name,
        tin=normalized_tin,
        group_type=body.group_type,
        relationship_type=body.relationship_type,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        county_code=county_code,
        phone=body.phone,
        fax=body.fax,
        contact_email=body.contact_email,
        org_npi=body.org_npi,
        parent_id=body.parent_id,
    )
    db.add(new_group)
    await db.flush()
    await db.commit()

    logger.info(
        "Created practice group %d (TIN %s) by user %d",
        new_group.id, mask_tin(normalized_tin), current_user["user_id"],
    )

    return {
        "id": new_group.id,
        "name": new_group.name,
        "tin": mask_tin(normalized_tin),
        "county_code": county_code,
        "status": "created",
    }


# ---------------------------------------------------------------------------
# PUT /api/onboarding/practice-groups/{id}
# ---------------------------------------------------------------------------

@router.put("/practice-groups/{group_id}")
async def update_practice_group(
    group_id: int,
    body: PracticeGroupUpdate,
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update an existing practice group."""
    stmt = select(PracticeGroup).where(PracticeGroup.id == group_id)
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()

    if not group:
        raise HTTPException(status_code=404, detail=f"Practice group {group_id} not found")

    # Apply non-None fields from the update body
    update_data = body.model_dump(exclude_unset=True)

    # If ZIP is being updated, auto-update county_code (SYNC — no await)
    if "zip_code" in update_data and update_data["zip_code"]:
        update_data["county_code"] = get_county_code_for_zip(update_data["zip_code"])

    for field, value in update_data.items():
        setattr(group, field, value)

    await db.flush()
    await db.commit()

    return {
        "id": group.id,
        "name": group.name,
        "tin": mask_tin(group.tin),
        "county_code": group.county_code,
        "status": "updated",
    }


# ---------------------------------------------------------------------------
# GET /api/onboarding/org-structure
# ---------------------------------------------------------------------------

@router.get("/org-structure")
async def get_org_structure(
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Full org tree: groups with their providers.

    Returns all practice groups with nested provider lists.
    TINs are masked in the response.
    """
    # Fetch all groups
    groups_result = await db.execute(
        select(PracticeGroup).order_by(PracticeGroup.name)
    )
    groups = groups_result.scalars().all()

    # Fetch all providers
    providers_result = await db.execute(
        select(Provider).order_by(Provider.last_name, Provider.first_name)
    )
    providers = providers_result.scalars().all()

    # Build provider lookup by group_id
    providers_by_group: dict[int | None, list[dict]] = {}
    for p in providers:
        entry = {
            "id": p.id,
            "npi": p.npi,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "specialty": p.specialty,
            "practice_group_id": p.practice_group_id,
        }
        providers_by_group.setdefault(p.practice_group_id, []).append(entry)

    # Build group tree
    org_tree = []
    for g in groups:
        org_tree.append({
            "id": g.id,
            "name": g.name,
            "tin": mask_tin(g.tin),
            "group_type": g.group_type,
            "relationship_type": g.relationship_type,
            "city": g.city,
            "state": g.state,
            "zip_code": g.zip_code,
            "county_code": g.county_code,
            "org_npi": g.org_npi,
            "provider_count": len(providers_by_group.get(g.id, [])),
            "providers": providers_by_group.get(g.id, []),
        })

    # Unassigned providers (no practice_group_id)
    unassigned = providers_by_group.get(None, [])

    return {
        "groups": org_tree,
        "unassigned_providers": unassigned,
        "summary": {
            "total_groups": len(groups),
            "total_providers": len(providers),
            "unassigned_provider_count": len(unassigned),
        },
    }


# ---------------------------------------------------------------------------
# POST /api/onboarding/discover-structure
# ---------------------------------------------------------------------------

@router.post("/discover-structure")
async def discover_structure(
    body: DiscoverStructureRequest,
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Analyze an uploaded file to discover org structure (TINs/NPIs).

    Accepts a job_id, loads the file from upload_jobs table,
    and returns a proposal for human review. Does NOT change
    the upload job status.
    """
    try:
        proposal = await org_discovery_service.discover_org_structure(db, body.job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return proposal


# ---------------------------------------------------------------------------
# POST /api/onboarding/confirm-structure
# ---------------------------------------------------------------------------

@router.post("/confirm-structure")
async def confirm_structure(
    body: ConfirmStructureRequest,
    current_user: dict = Depends(_require_admin),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Create approved groups and providers from the discovery proposal.

    The frontend sends {job_id, groups: [{tin, name, relationship_type}, ...]}.
    We re-run discover to get the full proposal, then build user_edits from the
    confirmed groups list so the existing service logic is unchanged.
    """
    # 1. Re-discover to get the full proposal (with provider lists, etc.)
    try:
        proposal = await org_discovery_service.discover_org_structure(db, body.job_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # 2. Build user_edits from the frontend's confirmed groups
    confirmed_tins = {g["tin"] for g in body.groups}
    all_tins = {
        pg.get("tin_raw") or pg.get("tin")
        for pg in proposal.get("proposed_groups", [])
    }
    rejected_tins = list(all_tins - confirmed_tins)

    group_overrides = {}
    for g in body.groups:
        group_overrides[g["tin"]] = {
            "name": g.get("name"),
            "relationship_type": g.get("relationship_type"),
            "approved": True,
        }

    user_edits = {
        "groups": group_overrides,
        "rejected_tins": rejected_tins,
    }

    result = await org_discovery_service.confirm_org_structure(
        db, proposal, user_edits
    )
    await db.commit()
    return result
