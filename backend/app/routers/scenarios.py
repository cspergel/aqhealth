"""
Scenario Modeling / What-If Analysis API endpoints.

Provides pre-built and custom scenario execution with financial
impact projections.  All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db, require_role
from app.models.user import UserRole
from app.services import scenario_service

logger = logging.getLogger(__name__)

# Scenario modeling — intelligence / finance. Provider excluded
# (frontend hidePages "/scenarios").
router = APIRouter(
    prefix="/api/scenarios",
    tags=["scenarios"],
    dependencies=[Depends(require_role(
        UserRole.superadmin,
        UserRole.mso_admin,
        UserRole.analyst,
        UserRole.care_manager,
        UserRole.financial,
        UserRole.auditor,
    ))],
)


class ScenarioRequest(BaseModel):
    type: str = Field(..., description="Scenario type: capture_improvement, facility_redirect, gap_closure, membership_change, cost_reduction, provider_education")
    params: dict = Field(default_factory=dict, description="Scenario parameters")


@router.get("/prebuilt")
async def list_prebuilt_scenarios(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Return list of pre-built scenario definitions."""
    return scenario_service.get_prebuilt_scenarios()


@router.post("/run")
async def run_scenario(
    body: ScenarioRequest,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Run a scenario with the given parameters and return projected impact."""
    valid_types = {"capture_improvement", "facility_redirect", "gap_closure", "membership_change", "cost_reduction", "provider_education"}
    if body.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid scenario type '{body.type}'. Must be one of: {', '.join(sorted(valid_types))}")
    result = await scenario_service.run_scenario(db, {"type": body.type, "params": body.params})
    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])
    return result
