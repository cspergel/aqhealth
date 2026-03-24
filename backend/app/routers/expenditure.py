"""
Expenditure Analytics API endpoints.

Provides overview, category drill-downs, insights, and CSV export.
All endpoints are tenant-scoped via JWT auth.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services.expenditure_service import (
    get_expenditure_overview,
    get_category_drilldown,
    get_expenditure_insights,
    SERVICE_CATEGORIES,
)
from app.services.export_service import export_to_csv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/expenditure", tags=["expenditure"])

VALID_CATEGORIES = set(SERVICE_CATEGORIES)


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------

class CategoryOut(BaseModel):
    key: str
    label: str
    total_spend: float
    pmpm: float
    pct_of_total: float
    claim_count: int
    trend_vs_prior: float


class OverviewOut(BaseModel):
    total_spend: float
    pmpm: float
    mlr: float
    member_count: int
    categories: list[CategoryOut]


class KpiOut(BaseModel):
    label: str
    value: str


class TableOut(BaseModel):
    title: str
    columns: list[str]
    rows: list[dict]


class DrillDownOut(BaseModel):
    category: str
    label: str
    total_spend: float
    pmpm: float
    claim_count: int
    unique_members: int
    kpis: list[KpiOut]
    tables: list[TableOut]


class InsightOut(BaseModel):
    id: int
    title: str
    description: str
    dollar_impact: float | None = None
    recommended_action: str | None = None
    confidence: int | None = None
    category: str


# ---------------------------------------------------------------------------
# GET /api/expenditure — overview with all categories
# ---------------------------------------------------------------------------

@router.get("", response_model=OverviewOut)
async def expenditure_overview(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return expenditure overview with category breakdown."""
    data = await get_expenditure_overview(db)
    return OverviewOut(**data)


# ---------------------------------------------------------------------------
# GET /api/expenditure/export — CSV export
# ---------------------------------------------------------------------------

@router.get("/export")
async def expenditure_export(
    category: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Export expenditure data as CSV."""
    if category and category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    if category:
        data = await get_category_drilldown(db, category)
        # Flatten tables into export rows
        rows = []
        for table in data.get("tables", []):
            for row in table.get("rows", []):
                rows.append(row)
        filename = f"expenditure_{category}.csv"
    else:
        overview = await get_expenditure_overview(db)
        rows = overview["categories"]
        filename = "expenditure_overview.csv"

    return export_to_csv(rows, filename=filename)


# ---------------------------------------------------------------------------
# GET /api/expenditure/{category} — drill-down for specific category
# ---------------------------------------------------------------------------

@router.get("/{category}", response_model=DrillDownOut)
async def expenditure_drilldown(
    category: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return detailed drill-down for a specific service category."""
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    data = await get_category_drilldown(db, category)
    return DrillDownOut(**data)


# ---------------------------------------------------------------------------
# GET /api/expenditure/{category}/insights — insights for category
# ---------------------------------------------------------------------------

@router.get("/{category}/insights", response_model=list[InsightOut])
async def expenditure_category_insights(
    category: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return AI-generated cost insights for a specific category."""
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    insights = await get_expenditure_insights(db, category)
    return [InsightOut(**i) for i in insights]
