# Structuralist Review — Round 2

**Agent:** The Structuralist
**Tier:** MEDIUM (unchanged)
**Scope:** Delta since round 1 — specifically the Journey feature, FileUpload normalization, Wizard step 5, TuvaPage fetch→api migration, dashboard/summary, and the new mock handlers.

---

## CLOSED (fixes verified structurally sound)

- **`fhir_service` capability statement simplification** (acknowledged by user). Not re-examined.
- **Wizard step 5 real-pipeline path now has status-aware branching + retry** (`WizardStep5Processing.tsx:138-165`). The new `runStep` helper gives retry-per-step a single callsite — that's a real structural win over "rerun the whole pipeline." Closes a latent "all-or-nothing" UX seam, even though the code duplication it introduced is now its own finding (see below).

---

## DEFERRED BY USER (list only — not re-scored)

1. Business logic + raw SQL in routers (~120 `select(...)` in router files)
2. 73 service modules with ingestion overlap
3. Monolith framed as "microservices" in docs/memory
4. Alembic empty / `create_all` at startup / `ensure_schema` ALTER drift
5. Tenant session discipline + `_demo_session` bypass
6. Tuva contract via `.replace("main_...")` fallback
7. Duplicated `_safe_float` / `_pct` / `_fmt_dollar` helpers across 23 files
8. Frontend eager page loading (no `React.lazy`)
9. `mockData.ts` still 7,272 lines
10. 57 routers registered individually in `main.py`
11. Service-style drift (3 Tuva classes vs 70 function modules)
12. Global filter state via `localStorage` interceptor
13. 3 worker containers for one queue
14. 5+ demo-mode activation paths

---

## NEW FINDINGS

### [IMPORTANT] Backend→frontend shape adapter lives in the consuming component — destined for multiple reinventions
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:43-67` (`normalizeUploadResponse`)
**Structural issue:** Boundary/layering — the function that flattens nested `proposed_mapping: Record<source, {platform_field, confidence, transform}>` to the frontend's `Record<source, target>` and pivots `sample_rows` (row-major) → `sample_data` (column-major) is a contract-adapter, not a view concern. There is no `lib/api-contracts.ts` or similar — I checked (glob returned nothing).
**Evidence:**
- `FileUpload.tsx` owns two type declarations (`UploadResponse`, `UploadResult`) and the mapper between them. The downstream `ColumnMapper` and `IngestionPage` only ever see the flattened `UploadResult`.
- `mockApi.ts:1053-1079` independently constructs the backend `UploadResponse` shape (nested mapping, row-major samples). If `FileUpload`'s normalizer changes, the mock doesn't know. If the backend changes, `FileUpload` is where someone would need to remember to update.
- The same pattern — inline response coercion — appears in `JourneyPage.tsx`, `TuvaPage.tsx`, `WizardStep5Processing.tsx`. None reuse types, none share the adapter boundary.
**Why it matters:** The minute a second component needs to consume `/api/ingestion/upload` (e.g., a bulk re-upload flow, a retry queue, a template-driven ingest), the normalizer gets either copy-pasted or re-derived. This is how contract drift begins — exactly what round 1 warned about for `mockData.ts` ↔ backend. Adding `normalizeUploadResponse` in the component codifies "the view layer owns the adapter." That's backwards for a multi-page app that talks to 55+ endpoints.
**Recommendation:** Create `frontend/src/lib/api-contracts/ingestion.ts` exporting `UploadResponse` (backend), `UploadResult` (frontend), and `normalizeUploadResponse`. Do the same for Journey, Tuva member, dashboard summary. Rule: **no component defines a `*Response` interface that it also transforms** — if transformation is needed, both shapes and the mapper live in `api-contracts/`.

---

### [IMPORTANT] `dashboard.py /summary` uses inline imports — a circular-import smell that silently shapes the router boundary
**Location:** `backend/app/routers/dashboard.py:149-150`
**Structural issue:** Hidden boundary problem — `from sqlalchemy import func, select` and `from app.models.care_gap import MemberGap, GapStatus` inside the function body. All other endpoints in the same file import cleanly at the top.
**Evidence:**
```python
@router.get("/summary")
async def get_dashboard_summary(...):
    from sqlalchemy import func, select
    from app.models.care_gap import MemberGap, GapStatus
    ...
    open_gaps_q = await db.execute(
        select(func.count(MemberGap.id)).where(MemberGap.status == GapStatus.open.value)
    )
```
Three readings, all bad: (a) it's laziness — then it should be moved to top-of-file; (b) it's dodging a circular import — then there is a structural cycle that the author worked around instead of fixing; (c) it's a proxy for "this belongs in the service layer" — `dashboard_service` already owns `get_dashboard_metrics` and already imports `MemberGap, GapStatus` at module top (`dashboard_service.py:19`). Either way the router is now doing business work (counting open gaps) that the service was built to encapsulate.
**Why it matters:** Every deferred-round-1 finding about "routers doing service work" gets reinforced by this new endpoint. The wizard's `runRealPipeline` in `WizardStep5Processing.tsx:210` consumes this exact endpoint — so the contract between the onboarding wizard and the backend is now held in two routers, inline-imported, with no service function backing it.
**Recommendation:** Add `async def get_dashboard_summary(db) -> dict` to `dashboard_service.py` (returns `{total_members, hcc_suspects, dollar_opportunity, care_gaps}`). Router becomes one `await` + one pass-through return. Move the imports to the top. If a circular import blocks the top-level move, that circular is itself the finding — fix it.

---

### [IMPORTANT] `/api/journey/members` duplicates `/api/members` with a different projection — one endpoint should serve both
**Location:** `backend/app/routers/journey.py:96-123` (new) vs `backend/app/routers/members.py:133-177` (existing)
**Structural issue:** Endpoint proliferation by shape rather than by resource. Journey picker wants `{id, member_id, name, dob, current_raf}`. Members list wants more (provider, plan, risk_tier, gap/suspect counts, pagination). These are the **same resource with different projections**, not two resources.
**Evidence:**
- `journey.py:104-111` does a `select(Member).order_by(current_raf.desc())` with an optional ilike search — a stripped-down version of the members query.
- `members.py:133-176` already accepts `search`, orders by configurable fields, paginates — it is the more capable cousin.
- The frontend `JourneyPage.tsx:89-96` GETs `/api/journey/members` unconditionally, then does *client-side* filtering in `filteredMembers` (line 142-148) — so the backend `search` param is redundant anyway.
- `mockApi.ts:1387-1396` adds a *third* place this list is shaped (returns `mockJourneyMembers` which has different fields than the real `Member` model — already contract drift).
**Why it matters:** Every new page that needs "a list of members with a different shape" is now precedented to add a new endpoint (`/api/stars/members`, `/api/tcm/members`, `/api/radv/members`). That is 57 routers becoming 80. The fix for round 1's "too many named things" starts here — with a discipline that **a list of a resource is the resource's endpoint, not the consuming feature's.**
**Recommendation:** Delete `/api/journey/members`. Have `JourneyPage` call `/api/members?page_size=250&sort_by=raf&order=desc` and either accept the richer shape or add a `?projection=picker` param to `/api/members` that returns the minimal fields. The backend `MemberSearchResult` Pydantic model can live in `schemas/member.py` and be shared.

---

### [IMPORTANT] `MemberSearchResult` type is hand-synced between backend Pydantic and frontend TypeScript — exactly the drift round 1 flagged for mocks
**Location:** `backend/app/routers/journey.py:68-74` + `frontend/src/pages/JourneyPage.tsx:13-19`
**Structural issue:** Two independent definitions of the same contract. Grep confirmed `MemberSearchResult` exists in three places: the backend router, the frontend page, and the contractualist review doc.
**Evidence:**
```python
# backend
class MemberSearchResult(BaseModel):
    id: int
    member_id: str
    name: str
    dob: str
    current_raf: float
```
```typescript
// frontend
interface MemberSearchResult {
  id: number;
  member_id: string;
  name: string;
  dob: string;
  current_raf: number;
}
```
They agree today. They will not stay agreeing. Round 1 flagged this same pattern for mocks; this adds another pair, at the exact moment the problem was supposed to be getting smaller.
**Why it matters:** Every new endpoint ships two hand-written copies of the same shape. Multiply by 55 routers → ~110 hand-aligned types the team holds by convention. OpenAPI codegen was already a round-1 recommendation; this finding is the **cost of not doing it** showing up in new code.
**Recommendation:** This is the same finding as round 1's "OpenAPI codegen for frontend types," just with new evidence. Either adopt `openapi-typescript` now and regen types for the whole API, or at minimum create `frontend/src/lib/api-contracts/` and colocate the TypeScript twin of every backend schema *in one place* — not per page.
**CROSS:** Contractualist.

---

### [IMPORTANT] `journey_service.get_member_risk_trajectory` is a fat cross-data assembly that reads like three service calls welded together
**Location:** `backend/app/services/journey_service.py:255-331`
**Structural issue:** Single-function cohesion failure. The function:
1. Loads `RafHistory` (risk-history concern),
2. Builds `cost_by_month` from `Claim` via `func.strftime` (financial concern, DuckDB-only SQL),
3. Builds `event_by_month` from `HccSuspect.captured_date` (HCC concern) and `MemberGap.closed_date` (care-gap concern),
4. Joins all three month-keyed maps into a trajectory list.
**Evidence:**
- 76 lines, 4 separate `db.execute(...)` calls, 4 distinct models touched, one database-dialect-specific function (`func.strftime("%Y-%m", ...)` — works in DuckDB/SQLite, **not in PostgreSQL**, where you'd use `to_char` or `date_trunc`).
- Silently-swallowed `try/except Exception: cost_by_month = {}` at lines 281-286 is doing contract-smoothing because the author knows `strftime` can fail. That's the same "string-replace fallback" anti-pattern from round 1's Tuva finding, at a smaller scale.
- The `_build_claim_event` style adjacent to it (function-based, in the same service) is the project's established shape; this new function breaks from it by doing cross-resource SQL rather than composition.
**Why it matters:** (1) The dialect-coupled `strftime` is a latent production bug — if the platform ever runs against Postgres (which the models are written for), this endpoint returns empty costs silently. (2) "Trajectory" is a distinct view over risk + financial + intervention data; stuffing it into `journey_service` means the next feature that needs any subset of that data (e.g., the existing `financial_service`) either duplicates the month-keying or imports across service boundaries.
**Recommendation:** (a) Either keep it in `journey_service` and name it `build_member_trajectory` with three explicit helpers (`_monthly_cost`, `_monthly_events`), each of which could live in its respective service (`financial_service.monthly_spend_by_member`, `hcc_engine.captured_events_for`, `care_gap_service.closed_events_for`). (b) Replace `func.strftime` with `func.to_char(Claim.service_date, 'YYYY-MM')` (Postgres) or `func.date_trunc('month', ...)` — something that matches the actual deployment target. (c) Delete the bare-except.
**CROSS:** Skeptic (bare except + dialect bug).

---

### [IMPORTANT] `WizardStep5Processing` has two near-identical per-step handlers — `runStep` (new) and the loop body in `runRealPipeline` (retained)
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:138-236`
**Structural issue:** Code duplication introduced by a half-finished refactor. The new `runStep(key, skillName)` at line 138 does exactly what the inline loop body at 170-205 does — same `setSteps`, same status parsing, same error shape. The only difference: `runStep` sets `errorText: null` before running (a useful reset); `runRealPipeline` doesn't. That's a subtle UX drift.
**Evidence:** The two bodies are ~28 lines each. Both call `POST /api/skills/execute-by-name` with `{action: skillName}`, both parse `result.status === "stub" | "not_implemented" | "failed" | "error"`, both project into the same `{status, resultText, errorText}` shape. There is no comment explaining why both exist.
**Why it matters:** `runRealPipeline` runs at mount; `runStep` runs at retry. Future changes to the status-parsing rules must be made in two places. This is a small instance of the round-1 "helpers duplicated across 23 files" pattern appearing at component scope.
**Recommendation:** Have `runRealPipeline` iterate and `await runStep(step.key, step.skillName)` for each. One body, retry uses the same code path as initial run. While you're there: `API_STEPS` (line 130-136) is module-level-constant shaped but declared inside the component — hoist it above the function. Free win.

---

### [MINOR] `mockApi.ts` grew by ~130 lines (ingestion + onboarding + Tuva demo + journey/members) — the file was already flagged at 2,094, now 2,226
**Location:** `frontend/src/lib/mockApi.ts` (2,226 LOC)
**Structural issue:** The round-1 finding was "shard this by domain before it rots." Round 2 response: added more. `mockData.ts` is still 7,272 (unchanged), and `mockApi.ts` has grown, not shrunk.
**Evidence:** New handlers (lines 1053-1107, 1387-1396, 2177-2213) are flat `else if (url.includes(...))` branches nested inside the already-huge method-dispatch tree. The `GET` chain alone is now ~1,100 lines of `else if` — one of which (`/api/tuva/demo/summary`) I had to search for because ordering matters and it's 2,200 lines into the file.
**Why it matters:** The file is now past the "mock data sprawl" threshold the round-1 review warned about, and the sprawl pattern is establishing itself: add a new endpoint → add an `else if` at whichever indentation level feels right. Order-dependence (the `/api/tuva/member/` handler at line 2195 must come before any more-generic `/api/tuva/` handler) is enforced only by line number.
**Recommendation:** The recommendation is unchanged from round 1: shard by feature (`mockApi/ingestion.ts`, `mockApi/tuva.ts`, `mockApi/journey.ts`). A per-domain handler map (`Record<string, (config) => mockResponse>`) also kills the else-if chain. Do this *next time you need to add a mock*, not as a big-bang.

---

### [MINOR] `/api/tuva/member/:id` mock returns `null` with `status: 200`, relying on the page's own null-check to fall back to demo data
**Location:** `mockApi.ts:2195-2197` + `TuvaPage.tsx:225-230`
**Structural issue:** Cross-layer protocol — the mock and the page together implement a convention of "null response means use in-component fallback." Nothing names this convention, nothing types it.
**Evidence:**
```typescript
// mockApi.ts
else if (/\/api\/tuva\/member\//.test(url)) {
  mockResponse = null; // triggers the page's own demo-fallback path
}

// TuvaPage.tsx
const res = await api.get(`/api/tuva/member/${memberId}`);
if (res.data) {
  setMemberDetail(res.data);
} else {
  throw new Error("API unavailable");
}
```
The comment is honest — it says the mock relies on the page. That's fragile coupling expressed as a comment, not a type.
**Why it matters:** (1) Any page that gets a `null` for a different reason (a real backend bug returning `null`) now silently activates the demo fallback, potentially in production if the `DEMO_MODE` safety net slips. (2) If someone adds a new Tuva-member consumer without reading this comment, their page will see `null` and not know what to do.
**Recommendation:** Pick one of two patterns, not both:
- Mock returns the full demo object (the existing `_buildDemoMemberDetail` logic gets a data twin in `mockData.ts`). Page has no fallback.
- Mock throws / returns 404. Page's existing `catch` branch handles it uniformly with "real backend unavailable."
  The current null-is-a-signal pattern is the worst of both worlds.
**CROSS:** Contractualist (demo/real protocol drift).

---

### [MINOR] `_build_claim_event` in `journey_service.py` reinvents claim-to-UI mapping that other services also do
**Location:** `backend/app/services/journey_service.py:52-89`
**Structural issue:** The ladder of `if event_type == "rx_fill": ... elif event_type == "admission": ...` building human-readable titles is a presentation concern living in a service. The round-1 finding about 73 services with overlapping responsibility predicted this — journey_service is now the fifth service that touches Claims to produce human strings (alongside dashboard, hcc_engine, financial_service, utilization_service).
**Evidence:** The title formatting logic (lines 63-77) is pure string templating that needs to be consistent across every page that shows a claim. There's no shared `format_claim_title(claim) -> str` helper. The next page that shows a claim will either import from `journey_service` (wrong boundary) or duplicate (wrong scale).
**Why it matters:** This is the classic symptom of "helpers have no home" that round 1 flagged for `_safe_float`. New evidence: the same dynamic now applies at the domain level — claim formatting.
**Recommendation:** Add `utils/claim_presentation.py` with `format_claim_title(claim_row) -> str` and `classify_claim_event(claim_row) -> str`. Journey service calls those. When the next page needs a claim title (TuvaPage member-detail, Stars, TCM), they import from the same place.

---

## VERDICT: REQUEST CHANGES

Round 2 closed one deferred item (fhir_service) and added the Journey feature and several quality-of-life fixes (wizard retry, normalized upload response). The structural shape of the codebase **did not improve** — it added one more hand-synced backend/frontend type pair, one more "new endpoint for a feature-specific shape" pattern, one more service function that stitches across three domains with a dialect-coupled SQL function, and ~130 more lines of `else if` in `mockApi.ts`. The fixes themselves are competent; the problem is that every new feature is being built with the exact patterns round 1 flagged as the *evolution hazards*. The architectural debt is compounding at the rate of new work, which is the worst possible ratio. Before the first real customer tenant lands, **stop adding endpoints that mirror features, stop writing contract pairs by hand, and pick one mock-fallback protocol.** Those three disciplines alone would bend the curve.
