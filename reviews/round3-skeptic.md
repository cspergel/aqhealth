# The Skeptic — Round 3 Review

**Reviewer:** review-skeptic (forgeplan)
**Date:** 2026-04-17
**Default stance:** NEEDS WORK. Verify round-2 fixes are real, not cosmetic; surface new edge cases.
**Scope:** `git diff HEAD` (19 files, +712/-110) plus touched-adjacent code the fixes didn't update.

---

## ROUND-2 CLOSED

- **CRITICAL `journey_service` SQLite strftime against Postgres.** Closed. `func.to_char(Claim.service_date, "YYYY-MM")` is Postgres-native; the tests run against Postgres (`conftest.py:38` points at `aqsoft_health_test`, no SQLite/aiosqlite anywhere in the backend). The `try/except` swallow remains, but the happy path now succeeds.
- **IMPORTANT `MemberDetail` retry fires wrong action after cancel.** Closed. `lastFailedAction` is set at the failure site (`MemberDetail.tsx:111,137`) and `retryFailed` dispatches from that record regardless of transient UI state. Retry label correctly reads "Retry capture" vs "Retry dismiss" (line 280).
- **IMPORTANT `JobHistory` polling death spiral on unknown terminal states.** Closed. `IN_FLIGHT_STATUSES` is now an allowlist (`JobHistory.tsx:10`) and the long-lived `setInterval` continues even when one `fetchJobs()` fails.
- **IMPORTANT `WizardStep5` onComplete fires on partial failure.** Partially closed. `useEffect` now gates on `!anyFailed` (line 253-254). See new finding below: "warning" (not_implemented) still passes the gate.

---

## STILL OPEN (flagged this round, not fixed)

- **IMPORTANT `normalizeUploadResponse` duplicate/empty-header pivot collision** (round-2). Unchanged — `headers.forEach((h, i) => { sample_data[h] = ... })` still overwrites on duplicates.
- **IMPORTANT AskBar retry can fire concurrent requests** (round-2). Input is `disabled={loading}` but the Retry button (line 184-190) isn't — a user can still double-click it during an in-flight request.
- **IMPORTANT `mockApi` confirm-mapping status drift** (round-2). `mockApi.ts:1084` still returns `status: "completed"` vs backend's `"validating"`.
- **IMPORTANT `list_journey_members` search branch drops `order_by` and leading/trailing whitespace** (round-2). `journey.py:105-111` unchanged — search results still return insertion-order.
- **IMPORTANT `runStep` / `runRealPipeline` duplication, `errorText: undefined` vs `null`** (round-2). `WizardStep5Processing.tsx:138-206` still has both code paths; `runStep` writes `errorText: null`, `runRealPipeline` writes `errorText: undefined`.
- **IMPORTANT `dashboard/summary` inline imports + cross-measure leak** (round-2). `dashboard.py:149-158` unchanged.
- **MINOR `MemberSummary` breaking change null→default** (round-2). `journey.py:62-65` still coerces to `0.0 / 0 / []`.

---

## DEFERRED (list only — user parked)

Alembic, hardcoded confidence, recapture-from-suspects, llm_guard whitelist, icd10 regex confidence, N+1 analyze_member, RafHistory unique, `_local_raf_calculation` zeros demographic, skill stubs, unauth `/api/tuva/process-note`, demo adapter no-restore, filter_service no-op, lenient test quality, `analyze_population` commit-out-of-try, `date.today()` TZ, PMPM benchmarks unsourced, Tuva e2e unverified, Metriport skeleton registered, `_demo_session` bare except, SuspectStatus str/enum mismatch, CMS_PMPM_BASE.

---

## NEW FINDINGS

### [CRITICAL] `days_since_visit` null-coercion fix is cosmetic — SQL column still hard-codes 9999

**Location:** `backend/app/services/member_service.py:132-135` and `226`
**Claim (scope):** "member_service days_since_visit null instead of 999 sentinel (alert flood prevented)"
**Evidence:** The Python coalesce at line 286 reads `int(row.days_since_visit) if row.days_since_visit is not None else None`, but the SQL column three lines up (line 132-135) is:
```python
days_since_visit_col = func.coalesce(
    func.floor(func.extract("epoch", func.current_date() - last_visit_sq.c.last_visit_date) / 86400),
    9999
).label("days_since_visit")
```
`row.days_since_visit` is NEVER `None` from the DB — the SQL `coalesce` replaces NULL with `9999`. The "null if None" branch is unreachable; the API still returns `9999` on the wire for a never-seen member. Two concrete downstream consequences, both reopening the alert-flood that round 2 claimed to close:
1. **Filter leaks:** line 226 — `outer.where(sq.c.days_since_visit >= having_filters["days_not_seen"])`. A user filtering `days_not_seen=180` will pull every never-seen member (because `9999 >= 180`). The API now labels them `null` in the response, but they're in the result set.
2. **Alert engine still floods:** `alert_rules_service.py:215` independently uses the exact same `9999` sentinel for no-visit members, so any `days_since_visit > 180` rule still fires on every no-visit member — precisely the "alert flood" the scope says is prevented.
**Missing proof:** No test passes a filter of `days_not_seen=180` against a member with zero claims and asserts the member is excluded. No test verifies `alert_rules_service` does not trigger on a never-seen member.
**Recommendation:** Change the SQL to return NULL (`func.coalesce(..., None)` — or just drop the coalesce and let it be NULL). Handle NULL at the filter layer (`WHERE (last_visit IS NOT NULL AND days_since_visit >= :t)`). Apply the same nullable treatment in `alert_rules_service.py:212-215` — skip members with `row.last_visit is None` instead of fabricating 9999. Then add a regression test.
**CROSS:** Structuralist (contract inconsistency between API shape, SQL column, and alert service).

### [IMPORTANT] `risk_tier: row.risk_tier or "low"` fabrication remains; API contract + filter layer disagree

**Location:** `backend/app/services/member_service.py:282` and `backend/app/routers/members.py:41`
**Claim:** Round-2 flagged that coalescing `risk_tier` null→"low" invents a classification. Round 3 did not touch this.
**Evidence:** Service returns `"risk_tier": row.risk_tier or "low"`, and the Pydantic model default is `risk_tier: str = "low"` (`members.py:41`). Downstream cohort filter (`cohort_service.py`) compares `Member.risk_tier == "low"` against the DB — returning a DIFFERENT member count than the members-list API, which labels all null rows as "low." User filters "low risk" in the table, sees 200 members; cohort builder shows 140. Both are "correct" per their own lens; neither is documented.
**Missing proof:** No test asserts that the members list "low" count equals the cohort service "low" count on seeded data.
**Recommendation:** Return `risk_tier: str | None = None` at the Pydantic layer. Render "Unscored" in the UI for nulls. Or backfill the column at ingestion so it is never null in the DB.

### [IMPORTANT] `WizardStep5Processing` onComplete gate treats "warning" as success — not_implemented skills silently finish onboarding

**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:250-256`
**Claim (scope):** "WizardStep5 onComplete now gated on `!anyFailed`"
**Evidence:**
```tsx
useEffect(() => {
  if (!allDone) return;
  const anyFailed = steps.some((s) => s.status === "error");
  if (anyFailed) return;
  onComplete?.();
}, [allDone, steps, onComplete]);
```
`runRealPipeline` maps `status: "not_implemented"` → `status: "warning"` (line 186), not `"error"`. Per the round-1 review, the shipped skill templates chain `refresh_dashboard`, `calculate_stars`, `generate_report`, `send_notification` — all six are stubs returning `not_implemented`. End-to-end: every step becomes "warning," `anyFailed` is `false`, `onComplete` fires, onboarding reports success, user lands on a dashboard built from zero-data skills. The success banner "Your dashboard is ready!" renders (line 355) because the render gate is also only `!steps.some(s => s.status === "error")` — warnings pass through.
**Missing proof:** No test exercises the all-warning branch. The round-1 finding on skill stubs was deferred, but deferring the root cause while claiming the gate is fixed creates a false-success path that's worse than the original.
**Recommendation:** Treat `warning` as "did not succeed" for onComplete / celebration purposes. Show a yellow "Data loaded but some analytics aren't active yet — contact us" state instead of "Your dashboard is ready!" when any step is `warning`. OR fire `onComplete(partial=true)` so the caller can show a degraded UX.

### [IMPORTANT] `list_journey_members` normalizes search input incorrectly — `.lower()` on an `ilike` pattern and no trim

**Location:** `backend/app/routers/journey.py:105-111`
**Claim:** New `search` parameter. (Round-2 flagged the dropped `order_by`; same code this round.)
**Evidence:**
```python
if search:
    like = f"%{search.lower()}%"
    stmt = select(Member).where(
        (Member.first_name.ilike(like))
        | (Member.last_name.ilike(like))
        | (Member.member_id.ilike(like))
    ).limit(limit)
```
Three independent bugs in the fix that shipped this round:
1. `ilike` already handles case insensitivity — `.lower()` is dead work.
2. `stmt` is rebuilt from scratch, losing the `.order_by(Member.current_raf.desc().nullslast())` — search results come back in insertion order, non-search results come back RAF-desc. Round-2 flagged this; not fixed.
3. `search` is not stripped. A user pasting `" Smith "` gets no results.
**Missing proof:** No test exercises search ordering or whitespace input.
**Recommendation:** Build a where-clause conditionally, chain `.order_by(...).limit(...)` once. Drop `.lower()`. `search = search.strip()` at the top.

### [IMPORTANT] `journey_service.get_member_journey` fabricates `age: 0` and `dob: ""` for members with no DOB

**Location:** `backend/app/services/journey_service.py:132-135`
**Claim:** Null coercions to make the Pydantic shape strict.
**Evidence:**
```python
"dob": member.date_of_birth.isoformat() if member.date_of_birth else "",
"age": (date.today().year - member.date_of_birth.year - (...)) if member.date_of_birth else 0,
```
A 0-year-old Medicare member is semantically impossible. The Pydantic `MemberSummary.age: int` enforces a number, but `0` is a lie, not missing. A clinician seeing "Age: 0" on the Journey page reasonably assumes a data bug (it is), but the UI has no way to distinguish "missing" from "we have age 0 for this patient." Similarly, `dob: ""` renders as "DOB: " verbatim on the frontend.
**Missing proof:** No test exercises the null-DOB path.
**Recommendation:** Change the schema to `age: int | None = None` and `dob: str | None = None`. Render "--" in the view layer. The fix costs one field-type change and matches the pattern you used for `risk_tier: str | None`.

### [IMPORTANT] `journey_service.get_member_risk_trajectory` bare-except silently zeros cost when the query errors

**Location:** `backend/app/services/journey_service.py:275-288`
**Claim:** The fix moves `await db.execute()` inside the `try` — graceful degrade.
**Evidence:** Graceful degrade is fine for a transient Postgres error, but this specific path is also the one that breaks if `Claim.service_date` column is renamed, if `Claim.paid_amount` changes type, if a tenant schema missing the `claim` table is queried, etc. The except catches all of those and silently returns `cost_by_month = {}` — every `cost` in the trajectory comes back `0.0`. A schema-drift bug looks indistinguishable from a cost-free patient. No log line is emitted; `logger` isn't imported in this module.
**Missing proof:** No log, no metric, no test proves that a broken cost query is detectable.
**Recommendation:** `logger.warning("cost trajectory query failed for member %s: %s", member_id, e)` inside the except. Emit a structured flag like `trajectory_cost_available: False` on the response so the UI can show a "cost data unavailable" note instead of a plausible-looking $0.

### [IMPORTANT] `runStep` closure captures stale `API_STEPS` — retry button can call a missing step

**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:130-136, 270-274`
**Claim:** Retry button uses `API_STEPS.find(...)` to look up the skill name for a failed step.
**Evidence:** `API_STEPS` is declared inside the component body (not `useMemo` or module-scope), so it's a new array every render. `runStep` is wrapped in `useCallback(..., [])` with empty deps, so it closes over the first-render value. If a future edit adds a step key (say `"tuva"`) to `API_STEPS`, the retry handler `API_STEPS.find(a => a.key === step.key)` uses the current render's array — which matches — but `runStep` closed over the old one. Today this is accidentally harmless because values are string literals and match — the bug only shows up if `API_STEPS` becomes dynamic. But declaring it inside the component and memoizing `runStep` with `[]` is a latent footgun that future refactors will trip over.
**Missing proof:** No test covers dynamic step lists.
**Recommendation:** Hoist `API_STEPS` to module scope — it's static data. Also deduplicate `runStep` and `runRealPipeline` into a single inner helper (round-2 flag), standardize on `errorText: string | null`.

### [IMPORTANT] `JobHistory` IN_FLIGHT_STATUSES list includes `"queued"` but backend never emits it

**Location:** `frontend/src/components/ingestion/JobHistory.tsx:10`
**Evidence:**
```ts
const IN_FLIGHT_STATUSES = new Set(["pending", "processing", "validating", "mapping", "queued"]);
```
`Job.status` TS union (line 16) is `"pending" | "processing" | "completed" | "failed"` — doesn't include `"queued"`, `"validating"`, or `"mapping"`. So the TS type lies both ways: it rejects `"queued"` from backend responses (at compile-time runtime casts bypass it) and the runtime set accepts a state that nothing emits. There's no contract test between frontend TS types and backend status values; the round-2 fix picked an allowlist without resolving the underlying contract mismatch.
**Missing proof:** No generated shared schema.
**Recommendation:** Widen `Job.status: string` and source the IN_FLIGHT list from a constant shared with the backend (or a generated TypeScript client). At minimum, comment which status each backend service emits so the next editor knows where the truth lives.

### [MINOR] `JobHistory` `jobsRef.current` has a micro-race — interval can fire with stale state

**Location:** `frontend/src/components/ingestion/JobHistory.tsx:45-46, 61-65`
**Evidence:**
```ts
jobsRef.current = items;
setJobs(items);
```
Then:
```ts
const interval = setInterval(() => {
  ...
  const hasInFlight = jobsRef.current.some((j) => IN_FLIGHT_STATUSES.has(j.status));
  if (hasInFlight) fetchJobs();
}, POLL_INTERVAL_MS);
```
The ref is updated synchronously in `fetchJobs` — good — but if the interval fires between `setJobs(items)` queueing a render and the next `fetchJobs` starting, it can see a ref pointed at either the old OR new array depending on whether the previous `fetchJobs` completed. Benign in practice (at most one extra / one skipped poll cycle), but documents a subtle ordering dependency.
**Recommendation:** Assign to the ref FIRST (line 45 before 46 — already correct). Add a line-comment noting ordering matters. No fix needed if the ordering is deliberate.

### [MINOR] `MemberDetail` retry of dismiss uses snapshot reason, but input may be edited between failure and retry

**Location:** `frontend/src/components/suspects/MemberDetail.tsx:117-140, 143-151`
**Evidence:** `setLastFailedAction(... { type: "dismiss", reason })` snapshots the reason at failure. If the user opens the dismiss panel, types "patient deceased," fails, then edits `dismissReason` to "admin error" before clicking Retry, Retry dispatches the OLD reason. This is defensible (retry = replay original intent) and prevents the round-2 "wrong action" bug, but is invisible to the user — no UI cue shows which reason will actually send. A user thinking they corrected the reason will be surprised when "patient deceased" reaches the server.
**Missing proof:** No UI test for this scenario.
**Recommendation:** Either (a) show the snapshot reason next to the Retry button ("Retry dismiss: patient deceased"), or (b) re-read `dismissReason` if the dismiss panel is still open, else fall back to the snapshot.

### [MINOR] `mockApi.ts` onboarding mocks use hardcoded TINs and NPIs — OK for demos, but `confirm-structure` mock claims `groups_saved: 3, providers_saved: 6`

**Location:** `frontend/src/lib/mockApi.ts:1087-1126`
**Evidence:** `discover-structure` returns 3 groups with 2+3+1 = 6 providers. `confirm-structure` hard-codes `groups_saved: 3, providers_saved: 6`. If a user edits the groups in the review step (e.g., removes a group), the "saved" counts stay 3/6 regardless. The UI will say "Saved 3 groups and 6 providers" even if the user confirmed only 2 groups. Cosmetic but a demo-consistency lie.
**Recommendation:** Compute the counts from the POST body: `groups_saved: config.data?.groups?.length ?? 3`.

---

## VERDICT

**REQUEST CHANGES (no blockers, but one lies-in-SQL issue needs immediate attention).**

The main bleeding is stopped: the Postgres `strftime` bug is really fixed, the retry-after-cancel hazard is closed, and the JobHistory polling spiral can't happen anymore. However the `days_since_visit` "null instead of 999" fix only changed the Python wire layer — the SQL column still `coalesce`s to `9999`, and two downstream consumers (the `days_not_seen` filter in the same service, and the entire `alert_rules_service.days_since_visit` branch) still treat never-seen members as 9999-days-overdue. That's a claim-vs-code divergence, and it's worse than not fixing it because a code-reviewer reading `member_service.py:286` will reasonably assume the alert flood is prevented. The onComplete gate is also a hair short: `warning` (not_implemented skill) still counts as success, so onboarding with all-stub skills still rolls to a "Your dashboard is ready!" celebration.

Pull the CRITICAL above, address the warning-as-success gate, and the Round 3 pass is clean.
