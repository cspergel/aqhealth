# Onboarding & Org Management — Final Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable seamless onboarding of real MSO data with AI-assisted file identification, org structure discovery, TIN/NPI-based auto-routing, and a data requirements checklist — all with human confirmation gates.

**Architecture:** Extend existing models, add onboarding service + router + org discovery, enhance the existing upload flow (not a full wizard yet — that's Phase 2), add `billing_tin` to the claims schema.

**Tech Stack:** FastAPI, SQLAlchemy async, React 19, TypeScript, Anthropic Claude API (via llm_guard)

---

## Critical Implementation Notes (from pre-implementation review)

**These MUST be followed — violating any will cause bugs:**

1. **DO NOT change `_detect_type_heuristic()` return type.** It returns a string. Callers (`propose_mapping` line 505, `_heuristic_mapping` line 335) depend on this. Create a NEW function `detect_type_with_metadata()` that wraps it and returns the dict with confidence + payer hint.

2. **REMOVE `"billing_npi"` from `rendering_npi`'s keyword list** (mapping_service.py line 156) BEFORE adding the new `billing_npi` entry to `_HEURISTIC_MAP`. Otherwise the existing `rendering_npi` entry steals the keyword and the new entry is dead code — TIN routing silently fails.

3. **Fix existing bug: ColumnMapper.tsx sends `mapping` but backend expects `column_mapping`.** Line 80-81 of ColumnMapper.tsx must change `mapping` to `column_mapping` in the POST body. This is already broken independent of this plan.

4. **`billing_tin` must be stored BOTH as a persisted column AND as `_billing_tin` helper key.** The persisted `billing_tin` survives into the DB. The `_billing_tin` helper is popped by the routing logic in `_upsert_claims`. Do NOT strip `billing_tin` — only strip `_billing_tin`.

5. **TIN routing must respect pre-existing `practice_group_id`.** Only set `practice_group_id` if it's not already set on the row: `if not row_data.get("practice_group_id"): row_data["practice_group_id"] = resolved_group_id`

6. **`_upsert_claims` return type annotation says `-> int` but returns `dict`.** Fix to `-> dict[str, int]` when modifying.

7. **`discover-structure` endpoint must accept `job_id`** and load file data from `upload_jobs` table (cleaned_file_path + column_mapping). Do NOT require the frontend to re-send the entire file.

8. **IngestionPage needs explicit 3-state step flow**, not binary toggle: `type Step = "upload" | "orgDiscovery" | "columnMapper"`

9. **`county_rate_service.get_county_code_for_zip()` is synchronous.** Call WITHOUT `await`: `county_code = get_county_code_for_zip(zip_code)`

10. **All onboarding endpoints must use `require_role(UserRole.mso_admin, UserRole.superadmin)`** — not bare `get_current_user`. TINs are sensitive; mask in non-admin responses.

---

## Phase 1: Core Data Loading (8 Tasks)

### Task 1: Model Extensions

**Files:**
- Modify: `backend/app/models/practice_group.py`
- Modify: `backend/app/models/user.py`
- Modify: `backend/app/models/tenant.py`
- Modify: `backend/app/models/claim.py`
- Modify: `backend/app/services/mapping_service.py`
- Modify: `backend/app/services/ingestion_service.py`
- Modify: `frontend/src/components/ingestion/ColumnMapper.tsx`

**Step 1: PracticeGroup — add fields after zip_code (line 20)**

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

**Step 2: User — add field after mfa_secret (line 32)**

```python
# Office scoping — NULL means sees all offices in tenant
# Not a DB FK (cross-schema: users in platform, practice_groups in tenant)
# Application must validate existence when setting
practice_group_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

**Step 3: Tenant — add fields after config (line 24)**

```python
org_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "mso" | "aco" | "ipa" | "health_system"
primary_state: Mapped[str | None] = mapped_column(String(2), nullable=True)
```

**Step 4: Claim — add 3 new columns after rendering_provider_id**

```python
practice_group_id: Mapped[int | None] = mapped_column(
    ForeignKey("practice_groups.id"), nullable=True, index=True
)  # Which office this claim is attributed to (set during ingestion auto-routing)
billing_tin: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
billing_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)
```

**Step 5: mapping_service.py — add billing_tin/billing_npi to PLATFORM_FIELDS and _HEURISTIC_MAP**

Add to `PLATFORM_FIELDS["claims"]` (after `facility_npi`):
```python
"billing_tin", "billing_npi",
```

**CRITICAL: First, REMOVE `"billing_npi"` from the existing `rendering_npi` keyword list** (line ~156). Then add new entries:
```python
"billing_tin": ["billing_tin", "bill_tin", "billing_tax_id", "group_tin", "tax_id", "tin", "federal_tax_id", "fein"],
"billing_npi": ["billing_npi", "bill_npi", "billing_provider_npi", "group_npi", "org_npi"],
```

**Step 6: ingestion_service.py — add to ALLOWED_CLAIM_COLUMNS**

Add `"billing_tin"`, `"billing_npi"`, and `"practice_group_id"` to the `ALLOWED_CLAIM_COLUMNS` set.

**Step 7: Fix ColumnMapper.tsx TARGET_COLUMNS + confirm-mapping bug**

Replace the hardcoded `TARGET_COLUMNS` array (lines 7-34) with values that match backend `PLATFORM_FIELDS` exactly. Include all claims, roster, eligibility, pharmacy, and provider fields.

**CRITICAL FIX: Line 80-81**, change the confirm-mapping POST body from:
```typescript
// BEFORE (broken):
await api.post(`/api/ingestion/${jobId}/confirm-mapping`, { mapping, ...
// AFTER (fixed):
await api.post(`/api/ingestion/${jobId}/confirm-mapping`, { column_mapping: mapping, ...
```

**Step 8: Migrations note**

After model changes, run `create_tenant_tables()` for existing tenants to add new columns. For production, use Alembic: `alembic revision --autogenerate -m "onboarding model extensions" && alembic upgrade head`

**Commit:**
```bash
git commit -m "feat: model extensions — TIN, billing_tin, practice_group_id, relationship_type, ColumnMapper fix"
```

---

### Task 2: TIN Normalization Utility

**Files:**
- Create: `backend/app/utils/__init__.py` (empty, if doesn't exist)
- Create: `backend/app/utils/tin.py`

**Purpose:** Normalize and validate TIN (Tax ID / EIN) values. Used by ingestion, org discovery, and onboarding router.

```python
"""TIN (Tax ID / EIN) normalization and validation."""
import re


def normalize_tin(raw: str | None) -> str | None:
    """Normalize a TIN to 9-digit format. Returns None if invalid.
    Strips hyphens, spaces. Accepts "12-3456789" or "123456789".
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
    """Mask for non-admin display: ***-***6789."""
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

**Key implementation details:**
- `DATA_REQUIREMENTS` list — 10 items (see design doc Section 2 for full list)
- `PAYER_GUIDANCE` dict — tips for Humana, UHC, Aetna
- `get_data_requirements_status(db)` — checks each requirement against DB. **MUST use savepoints** (`async with db.begin_nested()`) for each table check to prevent PostgreSQL transaction poisoning when tables are empty or missing
- `get_onboarding_progress(db, tenant_config)` — overall progress percentage
- `get_payer_guidance(payer, data_type)` — returns guidance string

**Commit:**
```bash
git commit -m "feat: onboarding service — data requirements checklist with payer guidance"
```

---

### Task 4: Org Discovery Service

**Files:**
- Create: `backend/app/services/org_discovery_service.py`

**Purpose:** Analyze uploaded file to discover org structure (TINs → offices, NPIs → providers) for human review before ingestion.

**Functions:**
- `discover_org_structure(db, job_id)` — loads file from upload_jobs, extracts TINs/NPIs, returns proposal
- `confirm_org_structure(db, proposal, user_edits)` — creates approved groups + providers

**Logic:**
1. Load file path + column_mapping from `upload_jobs` table using `job_id`
2. Re-read file via `read_file_headers_and_sample()` (full file, not just 5 rows)
3. Find TIN column from mapping → extract unique TINs → `normalize_tin()` each
4. Find NPI columns from mapping → extract unique NPIs → validate (10 digits + Luhn)
5. Batch-check TINs against `practice_groups.tin` → split into existing vs new
6. Batch-check NPIs against `providers.npi` → split into existing vs new
7. Group new NPIs under their TIN (from same row)
8. Count routable vs unmatched rows
9. Return proposal dict for frontend display

**`confirm_org_structure` uses find-or-create pattern:** For each proposed group, check TIN uniqueness before INSERT (the unique constraint catches races). For providers, check NPI before INSERT.

**Return shape:**
```python
{
    "existing_groups": [{"id": 1, "name": "...", "tin": "***-***6789"}],
    "proposed_groups": [{"tin": "***-***1234", "suggested_name": "Office (TIN ...1234)", "provider_count": 5, "row_count": 3200}],
    "existing_providers": [{"id": 1, "npi": "...", "name": "..."}],
    "new_providers": [{"npi": "...", "suggested_name": "NPI 1234567890", "suggested_group_tin": "..."}],
    "routing_summary": {"routable_by_tin": 13800, "routable_by_npi": 350, "unmatched": 50, "total": 14200},
}
```

**Commit:**
```bash
git commit -m "feat: org discovery — TIN/NPI extraction from uploaded files with find-or-create"
```

---

### Task 5: Enhanced File Type Detection

**Files:**
- Modify: `backend/app/services/mapping_service.py`

**CRITICAL: DO NOT modify `_detect_type_heuristic()` return type.** It must continue returning a string. Create a NEW wrapper function instead.

**Add these functions:**

```python
def detect_type_with_metadata(headers: list[str], sample_rows: list[list[str]] | None = None) -> dict:
    """Enhanced file type detection with confidence and payer hint.
    Wraps _detect_type_heuristic (which returns a string) and adds metadata.
    """
    data_type = _detect_type_heuristic(headers)  # Returns string — DO NOT CHANGE
    normed = [_normalize(h) for h in headers]

    # Confidence: what % of expected signals were found
    signals = _TYPE_SIGNALS.get(data_type, [])
    if signals:
        matched = sum(1 for sig in signals if any(sig in nh for nh in normed))
        confidence = round(matched / len(signals) * 100)
    else:
        confidence = 0

    payer_hint = _detect_payer(headers, sample_rows)

    return {
        "data_type": data_type,
        "confidence": confidence,
        "payer_hint": payer_hint,
    }


def _detect_payer(headers: list[str], sample_rows: list[list[str]] | None = None) -> str | None:
    """Detect likely payer from column names or data values."""
    all_text = " ".join(headers).lower()
    if sample_rows:
        for row in sample_rows[:5]:
            all_text += " " + " ".join(str(v) for v in row).lower()

    if "humana" in all_text or "hicn" in all_text:
        return "Humana"
    if "uhc" in all_text or "optum" in all_text or "united" in all_text:
        return "UHC"
    if "aetna" in all_text or "cvs" in all_text:
        return "Aetna"
    if "cigna" in all_text or "evernorth" in all_text:
        return "Cigna"
    if "anthem" in all_text or "elevance" in all_text:
        return "Anthem"
    return None
```

**Update `propose_mapping()` to include metadata in response:**

After calling `_detect_type_heuristic` (which still returns string), also call `detect_type_with_metadata` and include its result in the returned dict under a `"file_identification"` key. This is additive — does not change existing return shape.

**Update upload endpoint** in `ingestion.py` to include `file_identification` in the `UploadResponse`.

**Commit:**
```bash
git commit -m "feat: file type detection with confidence scores and payer identification"
```

---

### Task 6: Auto-Routing in Ingestion

**Files:**
- Modify: `backend/app/services/ingestion_service.py`

**Add `_resolve_practice_groups_by_tin(db, tins)` batch resolver:**

```python
async def _resolve_practice_groups_by_tin(
    db: AsyncSession, tins: list[str]
) -> dict[str, int]:
    """Batch-resolve normalized TIN strings to practice_group PKs."""
    if not tins:
        return {}
    unique_tins = list(set(t for t in tins if t))
    lookup: dict[str, int] = {}
    for chunk in _chunks(unique_tins, 500):
        placeholders = ", ".join(f":t{i}" for i in range(len(chunk)))
        params = {f"t{i}": t for i, t in enumerate(chunk)}
        result = await db.execute(
            text(f"SELECT tin, id FROM practice_groups WHERE tin IN ({placeholders})"),
            params,
        )
        for row in result.mappings():
            lookup[row["tin"]] = row["id"]
    return lookup
```

**Modify `_process_claim_row`** — add after rendering_npi extraction (line ~382):

```python
# Extract billing TIN for office routing
billing_tin_raw = _clean_str(_get_val(row, reverse_map, "billing_tin"), 20)
if billing_tin_raw:
    from app.utils.tin import normalize_tin
    normalized = normalize_tin(billing_tin_raw)
    claim_data["billing_tin"] = normalized or billing_tin_raw  # persist to DB
    claim_data["_billing_tin"] = normalized  # helper for routing (stripped before insert)
```

**Modify `_upsert_claims`** — add TIN routing after member resolution:

1. Collect all `_billing_tin` values from the batch
2. Call `_resolve_practice_groups_by_tin(db, tins)`
3. For each row:
   - Pop `_billing_tin` helper key
   - If TIN matched → set `practice_group_id` (only if not already set)
   - Else if `rendering_provider_id` is set → look up provider's `practice_group_id` as fallback
4. Track stats: `routed_by_tin`, `routed_by_npi`, `unrouted`

**IMPORTANT:** Only set `practice_group_id` if not already present:
```python
if not row_data.get("practice_group_id"):
    row_data["practice_group_id"] = resolved_group_id
```

**Fix return type annotation:** Change `-> int` to `-> dict[str, int]` on `_upsert_claims`.

**Add routing stats to return dict:**
```python
return {"inserted": inserted, "updated": updated, "routed_by_tin": tin_count, "routed_by_npi": npi_count, "unrouted": unrouted_count}
```

**Commit:**
```bash
git commit -m "feat: auto-route claims to practice groups by TIN with NPI fallback"
```

---

### Task 7: Onboarding API Router

**Files:**
- Create: `backend/app/routers/onboarding.py`
- Modify: `backend/app/main.py` (add to imports + include_router)

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/onboarding/progress` | Overall progress + requirements status |
| GET | `/api/onboarding/requirements` | Detailed requirements with status |
| GET | `/api/onboarding/payer-guidance` | Payer-specific tips |
| POST | `/api/onboarding/practice-groups` | Create practice group (find-or-create by TIN) |
| PUT | `/api/onboarding/practice-groups/{id}` | Update practice group |
| GET | `/api/onboarding/org-structure` | Full org tree: groups → providers |
| POST | `/api/onboarding/discover-structure` | Analyze uploaded file (accepts `job_id`) |
| POST | `/api/onboarding/confirm-structure` | Create approved groups/providers |

**Security:** ALL endpoints use `require_role(UserRole.mso_admin, UserRole.superadmin)`.

**TIN handling in create_practice_group:**
1. Normalize TIN via `normalize_tin()`
2. Check if TIN already exists → if so, return existing group (find-or-create)
3. Auto-set `county_code` from ZIP: `county_code = get_county_code_for_zip(zip_code)` — NO await, it's synchronous
4. Mask TIN in response: show full TIN only for admin roles, masked for others

**discover-structure endpoint:**
- Accepts `job_id: int` as body parameter
- Loads file path + column_mapping from `upload_jobs` table
- Calls `org_discovery_service.discover_org_structure(db, job_id)`
- Returns proposal for frontend review
- Does NOT change upload_job status (stays at "mapping")

**Upload flow state machine:**
```
upload (status: mapping) → [optional: discover-structure → confirm-structure] → confirm-mapping (status: validating) → processing
```
Discovery is OPTIONAL. Skipping it preserves the existing flow exactly.

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
- Modify: `frontend/src/components/ingestion/FileUpload.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`

**CRITICAL: IngestionPage needs explicit step state machine:**

```typescript
type Step = "upload" | "orgDiscovery" | "columnMapper";
const [step, setStep] = useState<Step>("upload");
```

Flow: `upload` → FileUpload completes → set step to `orgDiscovery` → OrgDiscoveryReview (with Skip button) → set step to `columnMapper` → ColumnMapper confirms → done.

**Changes:**

1. **Add DataRequirementsChecklist at top of page** — calls `GET /api/onboarding/progress`, shows priority-colored rows (required=red if missing, recommended=amber, enhances=gray). Reusable component for Phase 2 dashboard.

2. **Enhance FileUpload** — after upload response, show AI file identification: "This looks like a Humana medical claims file (95% confidence). 14,200 rows." User can override type via dropdown.

3. **Add OrgDiscoveryReview between upload and ColumnMapper:**
   - Calls `POST /api/onboarding/discover-structure` with `job_id` from upload response
   - Shows discovered org tree: existing groups (green), proposed new groups (blue), unmatched (red)
   - User can: edit names, set relationship_type, merge groups, skip entirely
   - "Confirm Structure" → calls `POST /api/onboarding/confirm-structure`
   - "Skip" → goes directly to ColumnMapper without creating groups

4. **ColumnMapper TARGET_COLUMNS** already fixed in Task 1 Step 7.

**DataRequirementsChecklist component:**
- Fetches from `/api/onboarding/progress`
- For each requirement: name, status badge (green/amber/red), impact tooltip, "Where to find it" expandable with payer-specific tips
- "Upload" button on each missing item → scrolls to upload zone

**Commit:**
```bash
git commit -m "feat: enhanced ingestion page — requirements checklist, org discovery, file ID"
```

---

## Phase 2: Full Wizard & Dashboard (5 Tasks)

*Phase 2 builds on Phase 1. Only start after Phase 1 is verified working with real data.*

### Task 9: Onboarding Wizard Shell

**Files:**
- Create: `frontend/src/pages/OnboardingPage.tsx`
- Create: `frontend/src/components/onboarding/WizardShell.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx` (add `/onboarding` route)

Multi-step wizard with progress indicator bar. Steps are child components loaded into the shell. Each step has a confirm gate (button → API call → show result → wait for approval).

Wizard state persisted to `Tenant.config.onboarding_status` via `PUT /api/tenants/{id}` (config update).

Navigation: Back/Next buttons. Step indicator: completed (green) / current (blue) / upcoming (gray).

Auto-redirect: if `onboarding_status.wizard_completed === false`, redirect to `/onboarding` on login. After completion, redirect to dashboard. User can always exit wizard and return later.

**Commit:**
```bash
git commit -m "feat: onboarding wizard shell — multi-step with progress persistence"
```

---

### Task 10: Wizard Step 1 — Organization Setup

**Files:**
- Create: `frontend/src/components/onboarding/WizardStep1Org.tsx`

Form fields: org name, type (MSO/ACO/IPA/Health System dropdown), primary state (dropdown with all US states), primary payers (multi-select: Humana, UHC, Aetna, Cigna, Anthem, Other), star rating / bonus tier (0%/3.5%/5% radio).

AI assist: when state is selected, fetch state average county rate and show: "Based on Florida, your average county rate is $1,262 PMPM. Pinellas County (5-star) is $1,310."

Confirm gate: "I'll set up '[Name]' as an MSO in Florida with 5% quality bonus. Proceed?"

On confirm: calls tenant update API to set `org_type`, `primary_state`, `config` with `payer_mix` and `default_bonus_pct`.

---

### Task 11: Wizard Steps 2-4 — Upload, Structure, Quality

**Files:**
- Create: `frontend/src/components/onboarding/WizardStep2Upload.tsx`
- Create: `frontend/src/components/onboarding/WizardStep3Structure.tsx`
- Create: `frontend/src/components/onboarding/WizardStep4Quality.tsx`

**Step 2:** DataRequirementsChecklist (reuse from Phase 1) + FileUpload (reuse) + file type display. Shows the full prioritized data list before the upload zone.

**Step 3:** OrgDiscoveryReview (reuse from Phase 1) in full-screen wizard context. Tree editor with drag-drop for reassigning providers between groups. Bulk edit for relationship_type.

**Step 4:** Data quality review. Shows validation results after mapping confirmed. Grouped errors by type. Fix/skip/reject controls per row. Summary: "98.2% clean, 12 warnings, 3 errors." Confirm gate: "Load X rows?"

---

### Task 12: Wizard Step 5 — Processing & Results

**Files:**
- Create: `frontend/src/components/onboarding/WizardStep5Processing.tsx`

Auto-runs the post-ingestion pipeline with live progress via polling:
1. "Loading 14,188 rows..." (progress bar)
2. "Running HCC analysis on 1,400 members..." → "Found 312 suspects worth $2.1M"
3. "Computing provider scorecards..." → "47 providers updated"
4. "Detecting care gaps..." → "890 open gaps across 39 measures"
5. "Generating AI insights..." → "12 insights generated"
6. Summary cards: members, suspects, dollar opportunity, care gaps, insights

"Go to Dashboard" button. Updates `onboarding_status.wizard_completed = true`.

---

### Task 13: Data Management Dashboard

**Files:**
- Create: `frontend/src/pages/DataManagementPage.tsx`
- Create: `frontend/src/components/onboarding/OrgStructurePanel.tsx`
- Create: `frontend/src/components/onboarding/DataStatusPanel.tsx`
- Create: `frontend/src/components/onboarding/AnalysisStatusPanel.tsx`
- Create: `frontend/src/components/onboarding/UserManagementPanel.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx` (add nav item under Admin section)

Single-page dashboard with collapsible sections (any order):

**Organization Panel:** Tree view (reuse OrgDiscoveryReview in read/edit mode). Add/edit office, add provider, set relationship type. AI pending queue: "2 new NPIs found in latest upload. Add them?" (approve/reject per item).

**Data Status Panel:** DataRequirementsChecklist (reuse) + last upload date per data type + freshness alerts ("Claims data is 45 days old — consider refreshing").

**Upload Zone:** FileUpload (reuse) + optional practice group pre-selector dropdown. Repeat upload intelligence: "This matches your previous Humana claims format. Use same mapping?" → one-click confirm.

**Analysis Status Panel:** Last run timestamp for each: HCC analysis, scorecards, care gaps, insights. Auto-run toggle. Manual "Run Now" button. "Last analyzed 2 hours ago. 3 new suspects found since last upload."

**User Management Panel (admin only):** Table of users. Invite by email + role + optional office. Role templates: "Provider (own panel only)", "Analyst (read-only)", "Care Manager (workflows)".

---

## Execution Notes

### Phase 1 Dependency Graph
```
Task 1 (models + mapping fix) ──────────────┐
Task 2 (TIN utility) ──────────────────────┐ │
                                            │ │
Task 3 (onboarding service) ── needs 1 ────┤ │
Task 5 (file detection) ───── needs 1 ─────┤ │
Task 4 (org discovery) ────── needs 1, 2 ──┤ │
Task 6 (auto-routing) ─────── needs 1, 2 ──┤ │
                                            │ │
Task 7 (router) ────────────── needs 3, 4 ─┤ │
                                            │ │
Task 8 (frontend) ─────────── needs 5, 7 ──┘ │
```

**Parallel execution groups:**
- **Group A:** Tasks 1 + 2 (no dependencies, run in parallel)
- **Group B:** Tasks 3 + 5 (depend on Task 1 only, run in parallel)
- **Group C:** Tasks 4 + 6 (depend on Tasks 1 + 2, run in parallel)
- **Group D:** Task 7 (depends on Tasks 3 + 4)
- **Group E:** Task 8 (depends on Tasks 5 + 7)

### Phase 2 Dependency Graph
```
Task 9 (wizard shell) ─────── needs Phase 1
Task 10 (step 1 org) ──────── needs 9
Task 11 (steps 2-4) ────────── needs 9
Task 12 (step 5 processing) ── needs 11
Task 13 (dashboard) ──────────── needs Phase 1 (parallel with 9-12)
```

### Verification After Phase 1

Before starting Phase 2, verify:
1. Upload a CSV → file type detected with confidence
2. Org discovery finds TINs and NPIs
3. Confirm structure creates practice groups
4. Confirm mapping processes data with TIN-based routing
5. Practice_group_id populated on claims
6. Requirements checklist shows correct status
7. All endpoints return proper role-403 for non-admin users
