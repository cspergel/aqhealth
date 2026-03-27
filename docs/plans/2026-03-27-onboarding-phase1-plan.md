# Onboarding Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable seamless onboarding of real MSO data with AI-assisted file identification, org structure discovery, data routing, and a requirements checklist — all with human confirmation gates.

**Architecture:** Extend existing models (PracticeGroup, User, Tenant), add an onboarding service + router, enhance the upload flow with AI file identification and TIN/NPI-based auto-routing, build a React onboarding wizard + data management dashboard.

**Tech Stack:** FastAPI, SQLAlchemy async, React 19, TypeScript, Anthropic Claude API (via llm_guard)

---

### Task 1: Model Extensions

**Files:**
- Modify: `backend/app/models/practice_group.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/tenant.py`
- Modify: `backend/app/services/ingestion_service.py` (ALLOWED columns)

**Step 1: Add fields to PracticeGroup**

```python
# Add after zip_code field (line 20):
relationship_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "owned" | "affiliated"
tin: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)  # Tax ID for auto-routing
phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
fax: Mapped[str | None] = mapped_column(String(20), nullable=True)
contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
county_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # CMS county code, auto-set from ZIP
bonus_pct: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)  # Star bonus tier: 0, 3.5, or 5
org_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Group/organizational NPI
```

**Step 2: Add practice_group_id to User**

```python
# Add after mfa_secret (line 32):
practice_group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
# Scopes user to specific office. NULL = sees all offices in tenant.
# Not an FK because users table is in platform schema, practice_groups in tenant schema.
```

**Step 3: Add org_type to Tenant**

```python
# Add after config (line 24):
org_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "mso" | "aco" | "ipa" | "health_system"
primary_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
```

**Step 4: Commit**

```bash
git add backend/app/models/practice_group.py backend/app/models/user.py backend/app/models/tenant.py
git commit -m "feat: model extensions for onboarding — relationship_type, TIN, bonus_pct, user office scoping"
```

---

### Task 2: Onboarding Service — Data Requirements & Status

**Files:**
- Create: `backend/app/services/onboarding_service.py`

**Purpose:** Tracks what data has been loaded for a tenant, what's missing, and the impact of each gap. Also provides payer-specific guidance.

**Implementation:**

```python
"""
Onboarding Service — tracks data requirements, onboarding progress,
and provides AI-assisted guidance for MSO setup.
"""
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.member import Member
from app.models.claim import Claim
from app.models.provider import Provider
from app.models.care_gap import GapMeasure, MemberGap
from app.models.hcc import HccSuspect, RafHistory

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data requirements definition
# ---------------------------------------------------------------------------

DATA_REQUIREMENTS = [
    {
        "key": "member_roster",
        "name": "Member Roster",
        "priority": "required",
        "description": "Demographics, health plan, PCP assignment, ZIP code",
        "where_to_find": "Health plan portal → Member Reports, or eligibility file from plan",
        "unlocks": ["Dashboard metrics", "HCC analysis", "Care gap detection", "Member management"],
        "check_table": "members",
    },
    {
        "key": "medical_claims",
        "name": "Medical Claims (12+ months)",
        "priority": "required",
        "description": "Professional, facility, and outpatient claims with diagnosis codes",
        "where_to_find": "Health plan portal → Claims Extract, or clearinghouse (Availity, Change Healthcare)",
        "unlocks": ["HCC suspect detection", "Expenditure analytics", "Utilization patterns", "Provider scorecards"],
        "check_table": "claims",
        "check_filter": "claim_type != 'pharmacy'",
    },
    {
        "key": "provider_roster",
        "name": "Provider Roster",
        "priority": "required",
        "description": "NPI, specialty, office/TIN assignment for each clinician",
        "where_to_find": "Internal HR/credentialing system, or CAQH ProView",
        "unlocks": ["Provider scorecards", "Practice group comparison", "PCP attribution"],
        "check_table": "providers",
    },
    {
        "key": "eligibility",
        "name": "Eligibility / Enrollment",
        "priority": "recommended",
        "description": "Coverage start/end dates, plan product, enrollment status",
        "where_to_find": "Health plan → Eligibility Reports, 834 enrollment files",
        "unlocks": ["Accurate member-months", "Coverage gap detection", "Churn analysis"],
        "check_table": "members",
        "check_field": "coverage_start",
    },
    {
        "key": "pharmacy_claims",
        "name": "Pharmacy Claims",
        "priority": "recommended",
        "description": "NDC codes, drug names, days supply, fill dates",
        "where_to_find": "PBM portal (CVS Caremark, Express Scripts, OptumRx)",
        "unlocks": ["Medication-diagnosis gap detection", "8 additional quality measures (PDC)", "Drug utilization review"],
        "check_table": "claims",
        "check_filter": "claim_type = 'pharmacy'",
    },
    {
        "key": "prior_year_hcc",
        "name": "Prior Year HCC Captures",
        "priority": "recommended",
        "description": "Last year's confirmed HCC codes per member",
        "where_to_find": "Prior year RAF report from health plan, or risk adjustment vendor (Cotiviti, Episource)",
        "unlocks": ["Recapture gap detection (biggest revenue opportunity)", "Year-over-year RAF trending"],
        "check_table": "hcc_suspects",
    },
    {
        "key": "capitation",
        "name": "Capitation / Premium Data",
        "priority": "enhances",
        "description": "Monthly capitation payments, premium amounts by plan/member",
        "where_to_find": "Monthly capitation statements from health plan financial team",
        "unlocks": ["P&L dashboard", "MLR tracking", "Risk accounting", "Financial forecasting"],
        "check_table": "capitation_payments",
    },
    {
        "key": "adt_config",
        "name": "ADT Feed Configuration",
        "priority": "enhances",
        "description": "Real-time hospital admit/discharge/transfer notifications",
        "where_to_find": "Bamboo Health (formerly PatientPing), Availity Patient Alerts",
        "unlocks": ["Live census dashboard", "TCM case management", "Readmission alerts"],
        "check_table": "adt_sources",
    },
    {
        "key": "historical_claims",
        "name": "Historical Claims (24-36 months)",
        "priority": "enhances",
        "description": "Extended claims history for trending and pattern detection",
        "where_to_find": "Same as medical claims, request broader date range",
        "unlocks": ["Year-over-year trending", "Seasonal patterns", "Historical drop-off detection"],
        "check_table": "claims",
        "check_min_months": 24,
    },
    {
        "key": "lab_results",
        "name": "Lab Results",
        "priority": "enhances",
        "description": "Lab values (HbA1c, eGFR, lipid panels, etc.)",
        "where_to_find": "Reference lab portal (Quest, LabCorp) or EMR extract",
        "unlocks": ["Clinical decision support", "Condition monitoring", "Quality measure compliance"],
        "check_table": None,  # Not yet implemented
    },
]

# Payer-specific guidance
PAYER_GUIDANCE = {
    "humana": {
        "claims": "In the Humana portal, go to Availity → Reports → Claims Detail → select 'All Claims' and date range of last 24 months → Export CSV.",
        "pharmacy": "Humana pharmacy claims are available through the Humana Pharmacy portal or Availity → Pharmacy Reports.",
        "eligibility": "Availity → Eligibility & Benefits → Member Roster Export, or request 834 file from your Humana rep.",
        "capitation": "Monthly capitation reports from your Humana network team. Ask for the Capitation Summary Report.",
    },
    "uhc": {
        "claims": "UnitedHealthcare Link portal → Reports → Claims Activity → Export. Or request via Optum Care Solutions.",
        "pharmacy": "OptumRx portal → Claims Reports → Export CSV.",
        "eligibility": "UHC Link → Eligibility → Roster Report, or 834 file from network team.",
        "capitation": "Monthly capitation from UHC network management. Available in UHC Link → Financial Reports.",
    },
    "aetna": {
        "claims": "Availity → Claims → Claims Search → Export, or Aetna Provider portal → Reports.",
        "pharmacy": "CVS Caremark portal (Aetna uses CVS) → Claims Reports.",
        "eligibility": "Availity → Eligibility & Benefits, or request from Aetna provider relations.",
        "capitation": "Monthly statement from Aetna network team.",
    },
}


async def get_data_requirements_status(db: AsyncSession) -> list[dict[str, Any]]:
    """Check which data requirements are met for the current tenant."""
    results = []

    for req in DATA_REQUIREMENTS:
        status = "not_loaded"
        row_count = 0
        date_range = None
        months_loaded = 0

        if req.get("check_table"):
            try:
                table = req["check_table"]
                filter_clause = req.get("check_filter", "")
                where = f"WHERE {filter_clause}" if filter_clause else ""

                count_result = await db.execute(
                    text(f"SELECT COUNT(*) FROM {table} {where}")
                )
                row_count = count_result.scalar() or 0

                if row_count > 0:
                    status = "complete"

                    # Check date range for claims
                    if table == "claims":
                        range_result = await db.execute(
                            text(f"SELECT MIN(service_date), MAX(service_date) FROM {table} {where}")
                        )
                        row = range_result.first()
                        if row and row[0] and row[1]:
                            date_range = {
                                "min": row[0].isoformat(),
                                "max": row[1].isoformat(),
                            }
                            months_loaded = (row[1].year - row[0].year) * 12 + (row[1].month - row[0].month) + 1

                            # Check if enough months for "historical"
                            min_months = req.get("check_min_months")
                            if min_months and months_loaded < min_months:
                                status = "partial"

                elif req.get("check_field"):
                    # Check if a specific field is populated
                    field = req["check_field"]
                    populated = await db.execute(
                        text(f"SELECT COUNT(*) FROM {table} WHERE {field} IS NOT NULL")
                    )
                    if (populated.scalar() or 0) > 0:
                        status = "partial"

            except Exception:
                status = "not_loaded"

        results.append({
            **req,
            "status": status,
            "row_count": row_count,
            "date_range": date_range,
            "months_loaded": months_loaded,
        })

    return results


async def get_onboarding_progress(db: AsyncSession, tenant_config: dict | None = None) -> dict:
    """Get overall onboarding progress for the tenant."""
    requirements = await get_data_requirements_status(db)

    required_met = sum(1 for r in requirements if r["priority"] == "required" and r["status"] == "complete")
    required_total = sum(1 for r in requirements if r["priority"] == "required")
    recommended_met = sum(1 for r in requirements if r["priority"] == "recommended" and r["status"] in ("complete", "partial"))
    recommended_total = sum(1 for r in requirements if r["priority"] == "recommended")

    # Check if HCC analysis has been run
    hcc_run = False
    try:
        result = await db.execute(text("SELECT COUNT(*) FROM raf_history"))
        hcc_run = (result.scalar() or 0) > 0
    except Exception:
        pass

    return {
        "requirements": requirements,
        "required_complete": required_met,
        "required_total": required_total,
        "recommended_complete": recommended_met,
        "recommended_total": recommended_total,
        "overall_pct": round((required_met / required_total) * 100) if required_total > 0 else 0,
        "hcc_analysis_run": hcc_run,
        "ready_for_analytics": required_met == required_total and hcc_run,
        "onboarding_status": (tenant_config or {}).get("onboarding_status", {}),
    }


def get_payer_guidance(payer: str, data_type: str) -> str | None:
    """Get payer-specific guidance for finding a data type."""
    payer_key = payer.lower().strip()
    for key in PAYER_GUIDANCE:
        if key in payer_key:
            return PAYER_GUIDANCE[key].get(data_type)
    return None
```

**Step 2: Commit**

```bash
git add backend/app/services/onboarding_service.py
git commit -m "feat: onboarding service — data requirements checklist with status tracking"
```

---

### Task 3: Onboarding API Router

**Files:**
- Create: `backend/app/routers/onboarding.py`
- Modify: `backend/app/main.py` (register router)

**Implementation:**

```python
"""Onboarding API — org setup, data requirements, upload flow."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_tenant_db
from app.services import onboarding_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


class OrgSetupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    org_type: str = Field("mso", pattern="^(mso|aco|ipa|health_system)$")
    primary_state: str = Field(..., min_length=2, max_length=2)
    primary_payers: list[str] = Field(default_factory=list)
    default_bonus_pct: float = Field(0.0)


class PracticeGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    group_type: str = Field("practice", pattern="^(mso|practice|location|department)$")
    relationship_type: str = Field("owned", pattern="^(owned|affiliated)$")
    tin: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None
    parent_id: int | None = None
    bonus_pct: float | None = None


@router.get("/progress")
async def get_progress(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Get onboarding progress and data requirements status."""
    return await onboarding_service.get_onboarding_progress(db)


@router.get("/requirements")
async def get_requirements(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Get detailed data requirements with status."""
    return await onboarding_service.get_data_requirements_status(db)


@router.get("/payer-guidance")
async def get_payer_guidance(
    payer: str = Query(..., description="Payer name (e.g., Humana, UHC)"),
    data_type: str = Query(..., description="Data type (claims, pharmacy, eligibility, capitation)"),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get payer-specific guidance for finding data."""
    guidance = onboarding_service.get_payer_guidance(payer, data_type)
    return {
        "payer": payer,
        "data_type": data_type,
        "guidance": guidance or f"Contact your {payer} network representative for {data_type} data exports.",
    }


@router.post("/practice-groups")
async def create_practice_group(
    body: PracticeGroupCreate,
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new practice group / office."""
    from app.models.practice_group import PracticeGroup
    from app.services.county_rate_service import get_county_code_for_zip

    group = PracticeGroup(
        name=body.name,
        group_type=body.group_type,
        relationship_type=body.relationship_type,
        tin=body.tin,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        parent_id=body.parent_id,
        bonus_pct=body.bonus_pct,
    )

    # Auto-set county code from ZIP
    if body.zip_code:
        county = get_county_code_for_zip(body.zip_code)
        if county:
            group.county_code = county

    db.add(group)
    await db.commit()
    await db.refresh(group)

    return {
        "id": group.id,
        "name": group.name,
        "group_type": group.group_type,
        "relationship_type": group.relationship_type,
        "tin": group.tin,
        "county_code": group.county_code,
        "bonus_pct": group.bonus_pct,
    }


@router.get("/org-structure")
async def get_org_structure(
    db: AsyncSession = Depends(get_tenant_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get the full org tree: groups → providers."""
    from sqlalchemy import select
    from app.models.practice_group import PracticeGroup
    from app.models.provider import Provider

    groups_result = await db.execute(select(PracticeGroup).order_by(PracticeGroup.name))
    groups = groups_result.scalars().all()

    providers_result = await db.execute(select(Provider).order_by(Provider.last_name))
    providers = providers_result.scalars().all()

    # Build provider lookup by group
    providers_by_group = {}
    unassigned = []
    for p in providers:
        entry = {
            "id": p.id, "npi": p.npi,
            "name": f"{p.first_name or ''} {p.last_name or ''}".strip(),
            "specialty": p.specialty,
        }
        if p.practice_group_id:
            providers_by_group.setdefault(p.practice_group_id, []).append(entry)
        else:
            unassigned.append(entry)

    tree = []
    for g in groups:
        tree.append({
            "id": g.id,
            "name": g.name,
            "group_type": g.group_type,
            "relationship_type": g.relationship_type,
            "parent_id": g.parent_id,
            "tin": g.tin,
            "address": g.address,
            "city": g.city,
            "state": g.state,
            "zip_code": g.zip_code,
            "county_code": g.county_code,
            "bonus_pct": g.bonus_pct,
            "provider_count": len(providers_by_group.get(g.id, [])),
            "providers": providers_by_group.get(g.id, []),
        })

    return {
        "groups": tree,
        "unassigned_providers": unassigned,
        "total_groups": len(tree),
        "total_providers": len(providers),
        "total_unassigned": len(unassigned),
    }
```

Register in main.py: add `onboarding` to the router imports and `app.include_router(onboarding.router)`.

**Step 2: Commit**

```bash
git add backend/app/routers/onboarding.py backend/app/main.py
git commit -m "feat: onboarding API — progress, requirements, payer guidance, org structure"
```

---

### Task 4: Upload Auto-Routing by TIN / NPI

**Files:**
- Modify: `backend/app/services/ingestion_service.py`

**Purpose:** When processing a mixed file with multiple offices, auto-route each row to the correct practice group by TIN match first, then provider NPI match.

**Implementation:** Add to `process_upload()` after row processing and before upsert:

1. Extract unique TINs from the processed rows
2. Batch-lookup TINs against `practice_groups.tin` to get group IDs
3. For rows without TIN match, look up rendering NPI → provider → practice_group_id
4. Stamp each row with `_practice_group_id` for tracking
5. Rows that can't be matched go into an `unmatched_rows` list returned in the result

Add a `_resolve_practice_groups_batch(db, tins)` function similar to `_resolve_member_ids_batch`.

Add `practice_group_id` to the Claim model (if not already there) so we can track which office a claim came from.

**Step 2: Commit**

```bash
git add backend/app/services/ingestion_service.py
git commit -m "feat: auto-route uploaded data to practice groups by TIN and NPI"
```

---

### Task 5: AI File Identification Enhancement

**Files:**
- Modify: `backend/app/services/mapping_service.py`

**Purpose:** Before column mapping, AI should identify what TYPE of file it is (claims, roster, eligibility, pharmacy, capitation, provider roster) and its likely payer source.

**Implementation:** Add `identify_file_type()` function:

1. Takes headers + sample_rows
2. Uses heuristic detection first (fast):
   - Has "claim_id" or "ICN" → claims
   - Has "NDC" + "days_supply" → pharmacy
   - Has "member_id" + "date_of_birth" but no "claim_id" → roster
   - Has "coverage_start" or "enrollment_date" → eligibility
   - Has "NPI" + "specialty" but no "member_id" → provider roster
   - Has "capitation" or "premium" → capitation
3. If heuristic is uncertain (< 70% confidence), ask Claude via llm_guard
4. Returns: `{"file_type": "claims", "confidence": 95, "payer_hint": "Humana", "row_count_estimate": 14200}`

Also detect likely payer from column naming conventions (Humana uses different column names than UHC).

**Step 2: Commit**

```bash
git add backend/app/services/mapping_service.py
git commit -m "feat: AI file type identification — detects claims, roster, pharmacy, eligibility, capitation"
```

---

### Task 6: Onboarding Wizard Frontend — Pages

**Files:**
- Create: `frontend/src/pages/OnboardingPage.tsx`
- Create: `frontend/src/components/onboarding/WizardStep1Org.tsx`
- Create: `frontend/src/components/onboarding/WizardStep2Upload.tsx`
- Create: `frontend/src/components/onboarding/WizardStep3Structure.tsx`
- Create: `frontend/src/components/onboarding/WizardStep4Review.tsx`
- Create: `frontend/src/components/onboarding/WizardStep5Processing.tsx`
- Create: `frontend/src/components/onboarding/DataRequirementsChecklist.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx` (add route)

**Implementation:** 5-screen wizard with confirm gates:
- Step 1: Org name, type, state. Confirm gate.
- Step 2: Data requirements checklist + drag-drop upload. AI identifies file. Confirm gate.
- Step 3: Org structure tree (discovered from data). Edit/confirm gate.
- Step 4: Data quality review. Fix/skip/confirm gate.
- Step 5: Processing progress + results.

`DataRequirementsChecklist` is a reusable component used both in the wizard (Step 2) and the Data Management Dashboard.

Each wizard step calls the onboarding API endpoints and the existing ingestion endpoints.

**Step 2: Commit**

```bash
git add frontend/src/pages/OnboardingPage.tsx frontend/src/components/onboarding/
git commit -m "feat: onboarding wizard — 5-step flow with AI file identification and confirm gates"
```

---

### Task 7: Data Management Dashboard Page

**Files:**
- Create: `frontend/src/pages/DataManagementPage.tsx`
- Create: `frontend/src/components/onboarding/OrgStructurePanel.tsx`
- Create: `frontend/src/components/onboarding/DataStatusPanel.tsx`
- Create: `frontend/src/components/onboarding/AnalysisStatusPanel.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx` (add route)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (add nav item)

**Implementation:** Single-page dashboard with collapsible sections:
- Organization Panel: tree view of groups + providers, add/edit buttons
- Data Status Panel: requirements checklist with live status
- Upload Zone: reuse FileUpload component with optional practice group selector
- Analysis Status Panel: last run timestamps, auto-run toggle
- User Management Panel: admin-only, invite users

**Step 2: Commit**

```bash
git add frontend/src/pages/DataManagementPage.tsx frontend/src/components/onboarding/
git commit -m "feat: data management dashboard — org tree, data status, upload, analysis panels"
```

---

### Task 8: Wire Org Structure Discovery Into Upload Flow

**Files:**
- Modify: `backend/app/routers/ingestion.py`
- Create: `backend/app/services/org_discovery_service.py`

**Purpose:** After a file is uploaded and columns mapped, analyze the data to discover org structure (unique TINs, NPIs, offices) and present it for confirmation before processing.

**Implementation:** `org_discovery_service.py`:

1. `discover_org_structure(headers, rows, column_mapping, db)`:
   - Extract unique TINs from mapped "tin" or "billing_tin" column
   - Extract unique NPIs from "rendering_npi" or "npi" column
   - For each TIN: look up existing practice_group, or propose new one
   - For each NPI: look up existing provider, or mark as new (with NPI Registry data if available)
   - Group providers under TINs
   - Return: `{"existing_groups": [...], "new_groups": [...], "existing_providers": [...], "new_providers": [...], "unmatched": [...]}`

2. Add endpoint `POST /api/ingestion/discover-structure` that runs this on the uploaded file before confirm-mapping

3. Add endpoint `POST /api/ingestion/confirm-structure` that creates the proposed groups/providers, then proceeds to confirm-mapping

**Step 2: Commit**

```bash
git add backend/app/services/org_discovery_service.py backend/app/routers/ingestion.py
git commit -m "feat: org structure discovery from uploaded data — TIN/NPI extraction and grouping"
```

---

## Execution Order

Tasks 1-3 are backend foundation (models, service, router).
Tasks 4-5 are backend enhancements (routing, file ID).
Tasks 6-7 are frontend (wizard, dashboard).
Task 8 ties it all together (discovery flow).

Tasks 1, 2, 3 can be done in parallel.
Tasks 4, 5 can be done in parallel after Task 1.
Tasks 6, 7 can be done in parallel after Task 3.
Task 8 depends on Tasks 4 + 5.
