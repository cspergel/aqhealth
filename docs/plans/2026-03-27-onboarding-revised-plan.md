# Onboarding & Org Management — Revised Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable seamless onboarding of real MSO data with AI-assisted file identification, org structure discovery, TIN/NPI-based auto-routing, and a data requirements checklist — all with human confirmation gates.

**Architecture:** Extend existing models, add onboarding service + router + org discovery, enhance the existing upload flow (not a full wizard yet — that's Phase 2), add `billing_tin` to the claims schema.

**Tech Stack:** FastAPI, SQLAlchemy async, React 19, TypeScript, Anthropic Claude API (via llm_guard)

**Key review findings incorporated:**
- `billing_tin` added to PLATFORM_FIELDS and claims model (routing can't work without it)
- Role checks on all onboarding endpoints (require mso_admin+)
- Upload flow state machine explicitly defined (discover-structure is optional)
- TIN normalization + dedup (find-or-create, not blind insert)
- `practice_group_id` explicitly defined on Claim model with FK + index
- Frontend ColumnMapper TARGET_COLUMNS synced with backend
- Full wizard deferred to Phase 2; Phase 1 enhances existing IngestionPage
- Alembic migration step noted (run after model changes)

---

## Phase 1: Core Data Loading (8 Tasks)

### Task 1: Model Extensions + Migration

**Files:**
- Modify: `backend/app/models/practice_group.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/tenant.py`
- Modify: `backend/app/models/claim.py`

**Step 1: PracticeGroup — add fields after line 20 (after zip_code)**

```python
# Onboarding & org management fields
relationship_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "owned" | "affiliated"
tin: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, index=True)  # Tax ID — unique per office
phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
fax: Mapped[str | None] = mapped_column(String(20), nullable=True)
contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
county_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # CMS county code, auto-set from ZIP
bonus_pct: Mapped[float | None] = mapped_column(Numeric(3, 1), nullable=True)  # 0, 3.5, or 5 only
org_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Group/organizational NPI
```

**Step 2: User — add field after line 32 (after mfa_secret)**

```python
# Office scoping — NULL means sees all offices in tenant
# Not an FK (cross-schema: users in platform, practice_groups in tenant)
# Application must validate existence when setting
practice_group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

**Step 3: Tenant — add fields after line 24 (after config)**

```python
org_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "mso" | "aco" | "ipa" | "health_system"
primary_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
```

**Step 4: Claim — add practice_group_id**

```python
# Add after rendering_provider_id:
practice_group_id: Mapped[int | None] = mapped_column(
    ForeignKey("practice_groups.id"), nullable=True, index=True
)  # Which office this claim is attributed to (set during ingestion auto-routing)
```

**Step 5: Add billing_tin to PLATFORM_FIELDS and _HEURISTIC_MAP**

In `backend/app/services/mapping_service.py`:
- Add `"billing_tin", "billing_npi"` to `PLATFORM_FIELDS["claims"]` (after `facility_npi`)
- Add to `_HEURISTIC_MAP`:
```python
"billing_tin": ["billing_tin", "bill_tin", "billing_tax_id", "group_tin", "tax_id", "tin", "federal_tax_id", "fein"],
"billing_npi": ["billing_npi", "bill_npi", "billing_provider_npi", "group_npi", "org_npi"],
```

**Step 6: Add billing_tin to ingestion ALLOWED_CLAIM_COLUMNS**

In `backend/app/services/ingestion_service.py`, add `"billing_tin"` and `"billing_npi"` to `ALLOWED_CLAIM_COLUMNS`. Also add `"practice_group_id"`.

**Step 7: Add billing_tin and billing_npi columns to Claim model**

```python
billing_tin: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
billing_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)
```

**Step 8: Sync frontend ColumnMapper TARGET_COLUMNS**

In `frontend/src/components/ingestion/ColumnMapper.tsx`, replace the hardcoded `TARGET_COLUMNS` array with a comprehensive list that matches backend `PLATFORM_FIELDS`. Group by data type with section headers.

**Step 9: Note on migrations**

After all model changes, if Alembic is configured:
```bash
cd backend && alembic revision --autogenerate -m "onboarding model extensions"
alembic upgrade head
```

If Alembic is not fully set up yet, the `create_tenant_tables()` function in `database.py` uses `create_all(checkfirst=True)` which will add new tables/columns on next tenant creation. Existing tenants need manual ALTER TABLE or a re-run of `create_tenant_tables`.

**Commit:**
```bash
git commit -m "feat: model extensions for onboarding — TIN, billing_tin, practice_group_id, relationship_type"
```

---

### Task 2: TIN Normalization Utility

**Files:**
- Create: `backend/app/utils/tin.py`

**Purpose:** Normalize and validate TIN (Tax ID / EIN) values. Used by ingestion and org discovery.

```python
"""TIN (Tax ID / EIN) normalization and validation."""

import re


def normalize_tin(raw: str | None) -> str | None:
    """
    Normalize a TIN to 9-digit format.
    Strips hyphens, spaces, dashes. Returns None if invalid.

    Examples:
        "12-3456789" -> "123456789"
        "123456789"  -> "123456789"
        "12-345-6789" -> None (wrong format)
        "" -> None
    """
    if not raw:
        return None
    digits = re.sub(r"[\s\-]", "", raw.strip())
    if not re.match(r"^\d{9}$", digits):
        return None
    return digits


def format_tin(tin: str | None) -> str | None:
    """Format as XX-XXXXXXX for display."""
    if not tin or len(tin) != 9:
        return tin
    return f"{tin[:2]}-{tin[2:]}"


def mask_tin(tin: str | None) -> str | None:
    """Mask TIN for non-admin display: ***-***6789."""
    if not tin or len(tin) < 4:
        return tin
    return f"***-***{tin[-4:]}"
```

**Commit:**
```bash
git commit -m "feat: TIN normalization utility — strip, validate, format, mask"
```

---

### Task 3: Onboarding Service

**Files:**
- Create: `backend/app/services/onboarding_service.py`

**Purpose:** Data requirements checklist, onboarding progress tracking, payer guidance.

Contains:
- `DATA_REQUIREMENTS` list — 10 items with priority, description, where_to_find, what it unlocks, how to check status
- `PAYER_GUIDANCE` dict — tips for Humana, UHC, Aetna on where to find each data type
- `get_data_requirements_status(db)` — checks each requirement against actual DB state (uses savepoints for missing-table safety)
- `get_onboarding_progress(db, tenant_config)` — overall progress percentage + breakdown
- `get_payer_guidance(payer, data_type)` — returns guidance string

The `get_data_requirements_status` function uses savepoints (`async with db.begin_nested()`) for each table check to prevent PostgreSQL transaction poisoning when tables don't exist yet.

**Commit:**
```bash
git commit -m "feat: onboarding service — data requirements checklist with payer-specific guidance"
```

---

### Task 4: Org Discovery Service

**Files:**
- Create: `backend/app/services/org_discovery_service.py`

**Purpose:** Analyze uploaded file data to discover org structure (TINs, NPIs, offices) BEFORE processing. Returns a proposal for human confirmation.

```python
"""
Org Discovery Service — analyzes uploaded data to discover organizational
structure (offices, providers) for human review before ingestion.
"""

async def discover_org_structure(
    db: AsyncSession,
    headers: list[str],
    rows: list[list[str]],
    column_mapping: dict,
    tenant_schema: str = "default",
) -> dict:
    """
    Analyze data to discover org structure.

    Returns:
    {
        "existing_groups": [{"id": 1, "name": "...", "tin": "..."}],
        "proposed_groups": [{"tin": "123456789", "suggested_name": "Office at 123 Main St", "provider_count": 5}],
        "existing_providers": [{"id": 1, "npi": "...", "name": "..."}],
        "new_providers": [{"npi": "...", "name": "Dr. Smith (from NPI)", "suggested_group_tin": "..."}],
        "unmatched_rows": 47,
        "total_rows": 14200,
        "match_rate": 99.7,
    }
    """
```

Logic:
1. Find TIN column in mapping (billing_tin, tin, group_tin)
2. Find NPI columns (rendering_npi, billing_npi, npi)
3. Extract unique TINs — normalize via `normalize_tin()`
4. For each TIN: check `practice_groups.tin` — existing or new?
5. Extract unique NPIs — validate format (10 digits + Luhn)
6. For each NPI: check `providers.npi` — existing or new?
7. Group new NPIs under their TIN
8. Count rows that can be auto-routed vs unmatched
9. Return the proposal for human confirmation

Also:
- `confirm_org_structure(db, proposal, user_edits)` — creates approved groups + providers
- Find-or-create pattern for groups (unique constraint on TIN prevents duplicates)

**Commit:**
```bash
git commit -m "feat: org discovery service — TIN/NPI extraction with find-or-create"
```

---

### Task 5: Enhance File Type Detection

**Files:**
- Modify: `backend/app/services/mapping_service.py`

**Purpose:** Extend existing `_detect_type_heuristic()` to also return confidence score and payer hint. Add payer detection.

Changes to `_detect_type_heuristic`:
- Return a dict instead of bare string: `{"data_type": "claims", "confidence": 85, "payer_hint": "humana"}`
- Add confidence scoring: exact signal count / expected signal count × 100
- Add `_detect_payer(headers, sample_rows)` function:
  - Humana: columns like "HICN", "Humana_ID", headers containing "humana"
  - UHC: "UHCID", "Optum", headers containing "united"
  - Aetna: "AetnaID", headers containing "aetna" or "CVS"
  - Returns payer name or None

Update the `propose_mapping()` flow to include file identification results in the response.

Update the upload endpoint response to include `detected_type` with confidence and payer hint.

**Commit:**
```bash
git commit -m "feat: enhanced file type detection — confidence scores + payer identification"
```

---

### Task 6: Auto-Routing in Ingestion

**Files:**
- Modify: `backend/app/services/ingestion_service.py`

**Purpose:** During `_upsert_claims`, resolve `billing_tin` to `practice_group_id` for office-level attribution.

Add `_resolve_practice_groups_by_tin(db, tins)` function:
```python
async def _resolve_practice_groups_by_tin(
    db: AsyncSession, tins: list[str]
) -> dict[str, int]:
    """Batch-resolve TIN strings to practice_group PKs."""
    # Normalize TINs, batch query, return {normalized_tin: group_id}
```

In `_process_claim_row`:
- Extract `billing_tin` from mapped columns, normalize it
- Store as `_billing_tin` helper field (stripped before insert)

In `_upsert_claims`:
- Batch-resolve all `_billing_tin` values to practice_group_ids
- Fallback: if no TIN match, try rendering_provider_id → provider.practice_group_id
- Set `practice_group_id` on each claim row
- Track routing stats: `{"routed_by_tin": X, "routed_by_npi": Y, "unrouted": Z}`

Return routing stats in the process_upload result so the frontend can show them.

**Commit:**
```bash
git commit -m "feat: auto-route claims to practice groups by TIN with NPI fallback"
```

---

### Task 7: Onboarding API Router

**Files:**
- Create: `backend/app/routers/onboarding.py`
- Modify: `backend/app/main.py` (register router)

**Endpoints (all require mso_admin or superadmin):**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/onboarding/progress` | Overall progress + requirements status |
| GET | `/api/onboarding/requirements` | Detailed requirements with status |
| GET | `/api/onboarding/payer-guidance` | Payer-specific tips for finding data |
| POST | `/api/onboarding/practice-groups` | Create practice group (with TIN normalization + county auto-set) |
| PUT | `/api/onboarding/practice-groups/{id}` | Update practice group |
| GET | `/api/onboarding/org-structure` | Full org tree: groups → providers |
| POST | `/api/onboarding/discover-structure` | Analyze uploaded file for org structure |
| POST | `/api/onboarding/confirm-structure` | Create approved groups/providers from discovery |

**Security:** All endpoints use `require_role(UserRole.mso_admin, UserRole.superadmin)`.

**TIN handling:** `create_practice_group` normalizes TIN before storing. If TIN already exists, returns existing group (find-or-create). Masks TIN in responses unless user is admin.

**Upload flow state machine update:**
The existing flow is: `upload` (status: mapping) → `confirm-mapping` (status: validating) → background processing.

New optional step: `upload` → **`discover-structure`** (status: mapping, no change) → **`confirm-structure`** (creates groups/providers) → `confirm-mapping` (status: validating) → processing.

Discovery is OPTIONAL. If skipped, confirm-mapping works exactly as before. This preserves backward compatibility.

**Commit:**
```bash
git commit -m "feat: onboarding router — progress, requirements, org discovery, role-secured"
```

---

### Task 8: Frontend — Enhance Existing IngestionPage

**Files:**
- Modify: `frontend/src/pages/IngestionPage.tsx`
- Create: `frontend/src/components/onboarding/DataRequirementsChecklist.tsx`
- Create: `frontend/src/components/onboarding/OrgDiscoveryReview.tsx`
- Modify: `frontend/src/components/ingestion/FileUpload.tsx` (show file type detection)
- Modify: `frontend/src/components/ingestion/ColumnMapper.tsx` (sync TARGET_COLUMNS)
- Modify: `frontend/src/components/layout/Sidebar.tsx` (add "Data Management" nav item)

**Changes to existing IngestionPage:**

1. **Add DataRequirementsChecklist at the top** — shows what data is loaded vs missing, with payer tips. Calls `GET /api/onboarding/progress`.

2. **Enhance FileUpload** — after upload, show AI's file type identification: "This looks like a Humana medical claims file (95% confidence). 14,200 rows detected." User can override if AI is wrong.

3. **Add OrgDiscoveryReview step** between upload and column mapping:
   - After upload, call `POST /api/onboarding/discover-structure`
   - Show: "I found 3 offices and 47 providers in this file. Review:"
   - Visual tree of discovered groups + providers
   - User can edit names, merge groups, set relationship type
   - "Confirm Structure" button → calls `POST /api/onboarding/confirm-structure`
   - **Skip button** — user can skip if they just want to load data without org setup

4. **Update ColumnMapper** — sync TARGET_COLUMNS with backend PLATFORM_FIELDS. Group options by data type. Show confidence scores from AI mapping.

**DataRequirementsChecklist component:**
- Reusable — used here and later in the full Data Management Dashboard (Phase 2)
- Fetches from `/api/onboarding/progress`
- Shows priority-colored rows (required = red if missing, recommended = amber, enhances = gray)
- Each row: data type, status badge, impact tooltip, payer-specific "where to find it" expandable

**Commit:**
```bash
git commit -m "feat: enhanced ingestion page — requirements checklist, org discovery, file ID"
```

---

## Phase 2: Full Wizard & Dashboard (5 Tasks)

*Phase 2 builds on Phase 1. Only start after Phase 1 is verified working.*

### Task 9: Onboarding Wizard Shell

**Files:**
- Create: `frontend/src/pages/OnboardingPage.tsx`
- Create: `frontend/src/components/onboarding/WizardShell.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx` (add route)

Multi-step wizard with progress indicator. Steps are components loaded into the shell. Each step has a confirm gate (button that calls API, shows result, waits for user approval). Wizard state persisted to `Tenant.config.onboarding_status` via API.

Navigation: Back/Next buttons, step indicator showing completed/current/upcoming.

Auto-redirect: if tenant has `onboarding_status.wizard_completed = false`, redirect to wizard on login. After completion, redirect to dashboard.

---

### Task 10: Wizard Step 1 — Organization Setup

**Files:**
- Create: `frontend/src/components/onboarding/WizardStep1Org.tsx`

Form: org name, type (MSO/ACO/IPA/Health System dropdown), primary state (dropdown), primary payers (multi-select: Humana, UHC, Aetna, Cigna, Other), star rating / bonus tier.

AI assist: when state is selected, show suggested county rate and MOOP tier. "Based on Florida, your average county rate is $1,262 PMPM."

Confirm gate: "I'll create '[Name]' as an MSO in Florida with 5% quality bonus. Proceed?"

On confirm: calls tenant update API to set org_type, primary_state, config with payer_mix and bonus_pct.

---

### Task 11: Wizard Steps 2-4 — Upload, Structure, Quality

**Files:**
- Create: `frontend/src/components/onboarding/WizardStep2Upload.tsx`
- Create: `frontend/src/components/onboarding/WizardStep3Structure.tsx`
- Create: `frontend/src/components/onboarding/WizardStep4Quality.tsx`

**Step 2:** DataRequirementsChecklist (from Phase 1) + FileUpload + file type display. Same as enhanced IngestionPage but in wizard context.

**Step 3:** OrgDiscoveryReview (from Phase 1) in wizard context. Full-screen tree editor with drag-drop for reassigning providers between groups.

**Step 4:** Data quality review. Shows validation results from the upload. Grouped errors, fix/skip/reject controls. Summary stats: "98.2% clean, 12 warnings, 3 errors."

---

### Task 12: Wizard Step 5 — Processing & Results

**Files:**
- Create: `frontend/src/components/onboarding/WizardStep5Processing.tsx`

Auto-runs the post-ingestion pipeline with live progress:
1. "Loading 14,188 rows..." (progress bar)
2. "Running HCC analysis on 1,400 members..." (progress)
3. "Computing provider scorecards..." (progress)
4. "Detecting care gaps..." (progress)
5. "Generating AI insights..." (progress)
6. "Done! Here's what we found:" → summary cards (members loaded, suspects found, dollar opportunity, care gaps identified)

"Go to Dashboard" button. Updates `onboarding_status.wizard_completed = true`.

---

### Task 13: Data Management Dashboard

**Files:**
- Create: `frontend/src/pages/DataManagementPage.tsx`
- Create: `frontend/src/components/onboarding/OrgStructurePanel.tsx`
- Create: `frontend/src/components/onboarding/DataStatusPanel.tsx`
- Create: `frontend/src/components/onboarding/AnalysisStatusPanel.tsx`
- Create: `frontend/src/components/onboarding/UserManagementPanel.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

Single-page dashboard with collapsible sections:

**Organization Panel:** Tree view (reuse OrgDiscoveryReview in read/edit mode). Add/edit office, add provider, set relationship type. AI pending queue: "2 new NPIs found. Add them?"

**Data Status Panel:** DataRequirementsChecklist (reuse) + last upload dates + freshness alerts.

**Upload Zone:** FileUpload + optional practice group pre-selector. Repeat upload intelligence: "Same format as last month? Use same mapping?"

**Analysis Status Panel:** Last run timestamps. Auto-run toggle. Manual trigger button. "3 new suspects found since last upload."

**User Management Panel (admin only):** Invite users by email, assign role + office. Role templates.

---

## Execution Notes

### Phase 1 Task Dependencies
```
Task 1 (models) ─────────────────────────────┐
Task 2 (TIN util) ──────────────────────────┐ │
Task 3 (onboarding service) ─ depends on ─┘ │ │
Task 5 (file detection) ─── depends on ─────┘ │
Task 4 (org discovery) ──── depends on 1,2 ───┤
Task 6 (auto-routing) ──── depends on 1,2 ────┤
Task 7 (router) ─────────── depends on 3,4 ───┤
Task 8 (frontend) ────────── depends on 7 ─────┘
```

Parallel groups:
- Group A: Tasks 1 + 2 (no dependencies)
- Group B: Tasks 3 + 5 (depend on Task 1)
- Group C: Tasks 4 + 6 (depend on Tasks 1 + 2)
- Group D: Task 7 (depends on 3 + 4)
- Group E: Task 8 (depends on 7)

### Phase 2 Task Dependencies
```
Task 9 (wizard shell) ──── depends on Phase 1
Task 10 (step 1) ─────── depends on 9
Task 11 (steps 2-4) ──── depends on 9
Task 12 (step 5) ──────── depends on 11
Task 13 (dashboard) ───── depends on Phase 1
```

Tasks 9-12 are sequential (wizard steps build on each other).
Task 13 is independent of 9-12 (can be built in parallel).
