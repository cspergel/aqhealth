# The Skeptic — Round 2 Review

**Reviewer:** review-skeptic (forgeplan)
**Date:** 2026-04-17
**Default stance:** NEEDS WORK. Edge cases in newly-changed code are the focus of this pass.
**Scope:** `git diff HEAD` (15 files, +634/-95).

---

## CLOSED (round-1 findings verified fixed)

None of the round-1 findings were outright closed in this diff. This session touched UX/error-handling surfaces and the journey service; it did not re-open the hcc_engine, llm_guard, or skill_service files where most round-1 CRITICALs live.

---

## DEFERRED BY USER (acknowledged, not re-scored)

Per the user, these remain technically open but were explicitly parked this round:
- Alembic empty migrations (round-1 CRITICAL #4).
- Hardcoded confidence scores labeled "evidence-based" (IMPORTANT).
- Recapture detection driven by prior-year suspects rather than prior-year claims (round-1 CRITICAL #2).
- `validate_llm_output` whitelists "estimated" (IMPORTANT).
- `auto_extract_icd10_codes` confidence 95 on regex match (IMPORTANT).
- N+1 inside `analyze_member` suspect persistence (IMPORTANT).
- `RafHistory` no unique constraint (IMPORTANT).
- `_local_raf_calculation` zeros demographic_raf (IMPORTANT).
- Six skill actions stubbed as `not_implemented` (round-1 CRITICAL #5).
- Unauthenticated `/api/tuva/process-note` (round-1 CRITICAL #1).
- Demo axios adapter mutation with no restore (round-1 CRITICAL #3).
- `test_care_gaps`, `test_tuva_sync`, `test_tuva_comparison` lenient tests (IMPORTANT).
- `filter_service.apply_filter` no-op (IMPORTANT).

---

## STILL OPEN (in-scope findings NOT fixed this pass)

- **`analyze_population` commits outside try/except** (round-1 IMPORTANT). Not touched.
- **`date.today()` timezone sensitivity** (round-1 IMPORTANT). Not touched.
- **Hard-coded PMPM/SNF/EXPENDITURE benchmarks** (round-1 IMPORTANT). Not touched.
- **Tuva e2e / synthetic-data "611/624 models" unverifiable from code** (round-1 IMPORTANT). No new CI artifact committed.
- **Metriport skeleton adapter still registered** (round-1 IMPORTANT). No guard added.
- **`_demo_session` bare `except: pass` on SET search_path reset** (round-1 MINOR). Not touched.
- **`SuspectStatus.captured` vs `.captured.value` comparison-style mismatch** (round-1 MINOR). Not touched.
- **`CMS_PMPM_BASE = 1100.0` used as base dollar impact everywhere** (round-1 MINOR). Not touched.

---

## NEW FINDINGS

### [CRITICAL] `func.strftime` used against Postgres — silently zeros out cost trajectory
**Location:** `backend/app/services/journey_service.py:273-283`
**Claim:** `get_member_risk_trajectory` returns monthly cost spend alongside RAF, so the Journey page can overlay cost-vs-risk.
**Evidence:**
```python
cost_q = await db.execute(
    select(
        func.strftime("%Y-%m", Claim.service_date).label("ym"),
        func.coalesce(func.sum(Claim.paid_amount), 0).label("spend"),
    )
    .where(Claim.member_id == member_id)
    .group_by("ym")
)
cost_by_month: dict[str, float] = {}
try:
    for ym, spend in cost_q.all():
        if ym:
            cost_by_month[ym] = float(spend or 0)
except Exception:
    cost_by_month = {}
```
`strftime` is a SQLite-only SQL function. `backend/app/config.py:6` sets `database_url = "postgresql+asyncpg://..."` as the default, confirmed with `grep -R strftime` — this is the only `func.strftime` call in the codebase, and it will raise `ProgrammingError: function strftime(...) does not exist` on Postgres. The bare `except Exception: cost_by_month = {}` then swallows the error, so every caller sees `cost = 0.0` for every month. Also, `cost_q.all()` for asyncpg must be awaited — `cost_q` is already the awaited Result, but `.all()` on async Result returns a list, not an iterator. Either the code raises on `.all()` iteration because of the SQL error OR because of the sync-API call; both land in the silent-swallow branch.
**Missing proof:** No test of `get_member_risk_trajectory` against Postgres. No fail-fast when the cost query errors.
**Recommendation:** Use `func.to_char(Claim.service_date, 'YYYY-MM')` for Postgres (or `func.date_trunc('month', ...)` then format). Remove the bare except — raise on DB error so callers notice. Add a unit test that runs against the configured Postgres URL and asserts `cost > 0` for a seeded member.

### [IMPORTANT] Retry button in `MemberDetail` fires the wrong action after a dismiss panel is cancelled
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:250-256`
**Claim:** The new row-level retry lets a user recover from a failed capture or dismiss without refreshing.
**Evidence:**
```tsx
<button
  onClick={() => (dismissingId === s.id ? handleDismiss(s.id) : handleCapture(s.id))}
  ...
>Retry</button>
```
Scenario: user opens dismiss panel on suspect 42, types a reason, clicks Dismiss, network fails, error shows. User then clicks "Cancel" on the dismiss panel (which sets `dismissingId = null` and clears `dismissReason`) — the error banner with Retry is still visible. Clicking Retry now executes `handleCapture(42)`. A clinician who meant to dismiss a suspect silently marks it captured — the exact opposite action, and an auditable coding event in a chart-review workflow. Alternate scenario: user clears the reason but keeps the dismiss panel open; retry calls `handleDismiss` which no-ops at `if (!dismissReason.trim()) return;`, silently absorbing the click while the error remains.
**Missing proof:** No test exercises retry after cancel.
**Recommendation:** Snapshot the intended action when the error is set (`setErrorByRow({ ...prev, [id]: { message, action: "capture" | "dismiss", reason } })`) and dispatch from that record. Don't derive action from transient UI state that can change before retry is clicked.

### [IMPORTANT] `days_since_visit: 999` and `risk_tier: "low"` defaults fabricate UI signals for never-seen members
**Location:** `backend/app/services/member_service.py:282-284`
**Claim:** The null-to-default coercions make the frontend contract strict and avoid runtime undefined errors.
**Evidence:**
```python
"risk_tier": row.risk_tier or "low",
"days_since_visit": int(row.days_since_visit) if row.days_since_visit is not None else 999,
```
`daysColor(days)` (`components/members/MemberTable.tsx:39`) returns `tokens.red` for `days > 180`. Every member with no visit history now renders a scary red "999d ago" cell. `risk_tier` is nullable (`models/member.py:46`); coalescing null → "low" invents a classification. It also breaks filter parity: the cohort query `Member.risk_tier == "low"` (`cohort_service.py:75`) will NOT match these rows (DB still null), while the UI shows them as "low." A user filtering the members list for "low risk" sees a different count than the cohort service computes.
**Missing proof:** No test exercises the null→default path with downstream filter queries.
**Recommendation:** Either (a) return `"risk_tier": row.risk_tier` (null/missing displayed as "Unscored") and `"days_since_visit": null` with UI showing "--", or (b) backfill the DB columns so they're never null. Don't invent values silently.

### [IMPORTANT] `normalizeUploadResponse.row_count` reports sample size, not total rows
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:55,64`
**Evidence:** `row_count: rows.length` where `rows = resp.sample_rows` (at most ~5 rows in the mock). The real backend (`ingestion.py:80` UploadResponse) does NOT include a total-rows field — only `sample_rows`. So `UploadResult.row_count` is the sample length, typically 5, not the file's real row count. Any UI that shows "N rows detected" from this field lies by 3-4 orders of magnitude on a real 10k-row claims file.
**Missing proof:** No UI assertion that the shown row count matches the file.
**Recommendation:** Either add `total_rows` to the backend `UploadResponse` and plumb it through, or drop `row_count` from the normalized shape and compute it after confirm-mapping runs.

### [IMPORTANT] `normalizeUploadResponse` silently drops column data on duplicate/missing headers
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:50-56`
**Evidence:**
```ts
const headers = Array.isArray(resp.headers) ? resp.headers : [];
const rows = Array.isArray(resp.sample_rows) ? resp.sample_rows : [];
headers.forEach((h, i) => {
  sample_data[h] = rows.map((r) => (r && r[i] != null ? String(r[i]) : ""));
});
```
Real-world CSVs often have duplicate headers (e.g. two `diagnosis` columns, or empty-string headers from blank extra columns). `sample_data[""]` overwrites on every empty header; `sample_data["diagnosis"]` picks only the last duplicate's column index. If `resp.headers` is missing entirely (backend omits it or sends null), `sample_data = {}`, and ColumnMapper has nothing to show — the normalized result passes the `Object.keys(mapping).length > 0` check because `proposed_mapping` is still populated from a different field. The user sees columns in the mapping UI but no sample values.
**Missing proof:** No edge-case test with duplicate or empty headers.
**Recommendation:** De-duplicate headers before pivoting (e.g. `diagnosis__1`, `diagnosis__2`). Validate headers-present invariant: if `headers.length === 0` but `sample_rows.length > 0`, synthesize `col_0..col_N`.

### [IMPORTANT] `JobHistory` polls forever on unknown non-terminal states
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:7,13,60`
**Evidence:** `TERMINAL_STATUSES = new Set(["completed", "failed"])`, and `Job.status` is typed as `"pending" | "processing" | "completed" | "failed"`. The backend ingestion worker (`backend/app/workers/ingestion_worker.py`) emits `validating`, `mapping`, and `processing` — none are in `TERMINAL_STATUSES`, so polling continues (correct). But if the worker ever emits `cancelled`, `paused`, `retrying`, or any terminal state other than the two whitelisted, `JobHistory` polls at 5s indefinitely, costing user bandwidth and server QPS. The TS `Job.status` union also excludes `validating`/`mapping`/`pending` which the backend already returns — the compiled type lies about runtime shape.
**Missing proof:** No contract test enforces the TS union matches the Python enum values.
**Recommendation:** Invert the test — `const IN_PROGRESS_STATUSES = new Set(["pending", "validating", "mapping", "processing"])`, poll iff `jobs.some(j => IN_PROGRESS_STATUSES.has(j.status))`. Anything else (known or unknown terminal) stops polling. Widen the TS `Job.status` type to `string` or generate it from the backend schema.

### [IMPORTANT] AskBar Retry can fire concurrent requests with no cancellation
**Location:** `frontend/src/components/query/AskBar.tsx:48-80, 184-189`
**Evidence:** `handleAsk` has no AbortController and no guard against re-entry while `loading` is true. The new Retry button (`onClick={() => lastAskedQuestion && handleAsk(lastAskedQuestion)}`) shows up only when `errorMessage` is set, but if the first call is slow and error fires late (e.g., 504 at the end of a 10s window), a user can click Retry multiple times while the original request is still in flight. Each `handleAsk` call does `setLoading(true); setAnswer(null); setErrorMessage(null); await api.post(...)` — the last-resolving request wins and can clobber a later Retry with stale data. Also, `setQuestion(text)` inside `handleAsk(lastAskedQuestion)` silently overwrites the input box with an old question after the user may have typed a new one.
**Missing proof:** No test simulates concurrent clicks.
**Recommendation:** Short-circuit `if (loading) return;` at top of `handleAsk`. Or use AbortController on the previous axios call before firing the retry. Don't call `setQuestion(text)` when `text` comes from retry — leave the input alone.

### [IMPORTANT] `mockApi` confirm-mapping returns `status: "completed"`; real backend returns `"validating"`
**Location:** `frontend/src/lib/mockApi.ts:1086-1088` vs `backend/app/routers/ingestion.py:475-479`
**Evidence:** Mock:
```ts
mockResponse = { job_id: jobId, status: "completed", message: "Processed in demo mode." };
```
Backend:
```python
return ConfirmMappingResponse(job_id=job_id, status="validating", message=message)
```
Any UI code that branches on `res.data.status === "completed"` to skip polling will behave one way in demo and another against real backend. Memory note 11 flags demo adapter swap as intentional, but silently diverging contracts mean the demo tells a misleading story about how the real flow behaves.
**Missing proof:** No contract test against the mock shape.
**Recommendation:** Return `"validating"` from the mock to mirror the backend. Have ColumnMapper/JobHistory poll in demo too so the demo matches real UX.

### [IMPORTANT] `list_journey_members` search branch drops order_by and keeps redundant `.lower()`
**Location:** `backend/app/routers/journey.py:96-108`
**Evidence:**
```python
stmt = select(Member).order_by(Member.current_raf.desc().nullslast()).limit(limit)
if search:
    like = f"%{search.lower()}%"
    stmt = select(Member).where(
        (Member.first_name.ilike(like))
        | (Member.last_name.ilike(like))
        | (Member.member_id.ilike(like))
    ).limit(limit)
```
(1) `ilike` is case-insensitive already; applying `.lower()` to the pattern is dead work. (2) The `search` branch rebuilds `stmt` from scratch without `.order_by(...)` — search results come back in database-insertion order rather than RAF-desc. The non-search case's top-RAF-first UX is silently absent when the user types anything. (3) If the user pastes a leading/trailing space, it's not stripped from `search`.
**Missing proof:** No test covers search-ordering expectation.
**Recommendation:** Build the where-clause conditionally and apply `.order_by(...)` and `.limit(...)` once. Trim `search` before use.

### [IMPORTANT] `runStep` / `runRealPipeline` duplicate logic, diverge on `errorText` null/undefined
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:138-165` vs `167-206`
**Evidence:** The two branches duplicate ~25 lines of near-identical code. `runStep` sets `errorText: null` on the running/success transitions; `runRealPipeline` sets `errorText: undefined`. The step's TS shape (`PipelineStep.errorText?: string | null`) accepts both, but React rendering checks `step.status === "error" && (step.errorText || onRetry)` — with `undefined` the falsy path hides the error text even if the API returned an error detail but the step eventually succeeded. Also, `API_STEPS` is recreated on every render (declared inside the component body, not `useMemo` or module-scope), which means the `useCallback(runStep, [])` closes over the first-render array while the JSX retry handler `API_STEPS.find(...)` uses the current-render array — accidentally equivalent only because the values are hard-coded constants.
**Missing proof:** No tests exercise the retry/rerun path.
**Recommendation:** Hoist `API_STEPS` to module scope. Extract a single `updateStep(key, patch)` helper, have both `runStep` and `runRealPipeline` call the same inner function. Standardize on `errorText: string | null`.

### [IMPORTANT] `dashboard/summary` open_gaps count leaks across archived measures
**Location:** `backend/app/routers/dashboard.py:149-162`
**Evidence:** The new inline query is:
```python
open_gaps_q = await db.execute(
    select(func.count(MemberGap.id)).where(MemberGap.status == GapStatus.open.value)
)
```
No join to `GapMeasure`, so counts include gaps for archived/retired measures (if `GapMeasure.active` exists and is used elsewhere), and — more importantly — no tenant filter at the query level beyond what the tenant-scoped session provides. It's correct only if `get_tenant_db` schema-isolates the query. The inline import `from app.models.care_gap import MemberGap, GapStatus` duplicates imports that should live at module level; this pattern is only justified for circular-import avoidance and there is no such cycle here (`dashboard.py` already imports from `app.services.dashboard_service`, which imports MemberGap). The inline-import smell suggests this was pasted from another file without normalizing.
**Missing proof:** No test verifies that `dashboard/summary.care_gaps` equals the same count shown on the Care Gaps page.
**Recommendation:** Move imports to module top. Join `GapMeasure` and restrict to active measures to match `care_gap_service.get_care_gap_summary`. Add a test that asserts `summary.care_gaps` equals `care_gaps/summary` on the same seeded tenant.

### [MINOR] `MemberSummary` breaking change: nullable fields silently became required defaults
**Location:** `backend/app/routers/journey.py:60-67`
**Evidence:** The Pydantic model changed from `total_spend_12m: float | None = None`, `open_suspects: int | None = None`, `open_gaps: int | None = None` to hard defaults of `0.0` / `0` and added a new required `conditions: list[str] = []`. Any existing client expecting `null` now gets `0`, which conflates "we don't know" with "there are none." A dashboard that special-cases "show dash when null" will now show `0` for unmeasured members.
**Recommendation:** Document the wire-format change in the release notes, or keep the nullable typing and let the frontend default in the view layer.

### [MINOR] `journey_service` inline import of `func` defeats module-level import hygiene
**Location:** `backend/app/services/journey_service.py:262`
**Evidence:** `from sqlalchemy import func` inside `get_member_risk_trajectory` duplicates the module-level `from sqlalchemy import select, and_`. No circular import justifies it.
**Recommendation:** Move to the top of the file.

### [MINOR] `fhir_service.get_capability_statement` sort order inconsistency
**Location:** `backend/app/services/fhir_service.py:117,133`
**Evidence:** `active = sorted(rt for rt, handler in RESOURCE_HANDLERS.items() if handler is not None)` computes a sorted list of active resource types, then the comprehension iterates `for rt in active` — but the comprehension was previously `for rt in sorted(RESOURCE_HANDLERS)`, which included inactive types sorted across the full set. If a future caller relied on sorted-including-inactive (e.g., a diff tool), the change in set identity is silent. Minor, because the caller is public FHIR conformance tooling that shouldn't care.
**Recommendation:** None. Note only.

### [MINOR] `list_journey_members` returns empty-string `dob` — same pattern as the coerce-to-empty issue
**Location:** `backend/app/routers/journey.py:113`
**Evidence:** `dob=m.date_of_birth.isoformat() if m.date_of_birth else ""`. Same anti-pattern as `member_service.py`: members with no DOB show blank rather than a clear missing-data indicator. MemberSummary frontend component renders `DOB: {member.dob}` verbatim, producing "DOB: " as a label.
**Recommendation:** Render "DOB: --" client-side when the string is empty, or pass `null` and let the view layer default.

---

## VERDICT

**NEEDS WORK.** The session's UX-polish work landed cleanly on the surface but introduces a classic reporting-silently-zero bug in `journey_service` (SQLite `strftime` called against a Postgres DB, inside a bare-except swallow) that repeats the exact pattern flagged round-1. The `MemberDetail` retry-after-cancel issue is a correctness hazard in a clinical workflow — wrong button fires when a clinician recovers from a failed dismiss. The null-to-default coercions in `member_service` trade runtime safety for false-positive red "999d ago" cells and fabricated "low" risk tiers that disagree with the filter layer. Fix the Postgres query, make the retry action explicit rather than state-derived, and either stop inventing defaults or surface them as "unscored / unknown."
