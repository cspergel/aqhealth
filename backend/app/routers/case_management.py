"""
Case Management API endpoints.

Caseload dashboard, CRUD for case assignments, notes, and workload analytics.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.case_management_service import (
    get_case_dashboard,
    get_cases,
    get_case_detail,
    create_case,
    update_case,
    add_case_note,
    get_workload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cases", tags=["case-management"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CaseCreate(BaseModel):
    member_id: int
    care_manager_id: int
    care_manager_name: str
    assignment_date: str
    reason: str | None = None
    status: str = "active"
    priority: str = "medium"
    next_contact_date: str | None = None
    notes: str | None = None


class CaseUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None
    end_date: str | None = None
    next_contact_date: str | None = None
    notes: str | None = None


class NoteCreate(BaseModel):
    note_type: str
    content: str
    contact_method: str | None = None
    duration_minutes: int | None = None
    author_id: int
    author_name: str


# ---------------------------------------------------------------------------
# GET /api/cases/dashboard — caseload overview
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def case_dashboard(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Caseload overview: total active, by manager, by priority, overdue contacts."""
    return await get_case_dashboard(db)


# ---------------------------------------------------------------------------
# GET /api/cases/workload — workload balance
# ---------------------------------------------------------------------------

@router.get("/workload")
async def case_workload(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Workload balance across care managers."""
    return await get_workload(db)


# ---------------------------------------------------------------------------
# GET /api/cases — list cases
# ---------------------------------------------------------------------------

@router.get("")
async def list_cases(
    care_manager_id: int | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return cases optionally filtered by care_manager_id."""
    return await get_cases(db, care_manager_id=care_manager_id)


# ---------------------------------------------------------------------------
# GET /api/cases/{id} — case detail with notes
# ---------------------------------------------------------------------------

@router.get("/{case_id}")
async def case_detail(
    case_id: int,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return a case with its notes."""
    result = await get_case_detail(db, case_id)
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")
    return result


# ---------------------------------------------------------------------------
# POST /api/cases — assign a member
# ---------------------------------------------------------------------------

@router.post("")
async def assign_case(
    body: CaseCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Assign a member to a care manager."""
    return await create_case(db, body.model_dump())


# ---------------------------------------------------------------------------
# PATCH /api/cases/{id} — update assignment
# ---------------------------------------------------------------------------

@router.patch("/{case_id}")
async def patch_case(
    case_id: int,
    body: CaseUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Update a case assignment."""
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    result = await update_case(db, case_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Case not found")
    return result


# ---------------------------------------------------------------------------
# POST /api/cases/{id}/notes — add case note
# ---------------------------------------------------------------------------

@router.post("/{case_id}/notes")
async def create_note(
    case_id: int,
    body: NoteCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Add a case note and log the contact."""
    return await add_case_note(db, case_id, body.model_dump())
