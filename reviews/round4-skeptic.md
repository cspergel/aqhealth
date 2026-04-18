# The Skeptic — Round 4 Review

**Reviewer:** review-skeptic (forgeplan)
**Date:** 2026-04-17
**Default stance:** NEEDS WORK. Verify the round-3 CRITICAL actually landed (not another cosmetic pass), and surface edge cases in newly-changed code.
**Scope:** `git diff HEAD` (20 files, ~+500/-120). Focus on `member_service.py`, `alert_rules_service.py`, `WizardStep5Processing.tsx`, `MemberDetail.tsx`, `JobHistory.tsx`, `MemberSummary.tsx`, and the new `journey_service` cost-and-events code.

---

## ROUND-3 CLOSED

- **CRITICAL `days_since_visit` SQL-coalesce-to-9999.** Closed. `member_service.py:135-137` now uses `func.floor(...)` with no outer coalesce, and line 288 guards `int(None)` with `is not None else None`. Pydantic `MemberRow.days_since_visit: int | None = None` (`members.py:43`). Confirmed: for a member with no `last_visit_date`, the subquery's `last_visit_date` is NULL, `current_date - NULL = NULL`, `extract/floor` of NULL = NULL, Python sees None and emits null. The `days_not_seen` filter at `member_service.py:228` works too: Postgres treats `NULL >= 180` as NULL (falsy), so never-seen members are excluded from the filter. Sort `.desc().nullslast()` correctly pushes them to the end.
- **CRITICAL `alert_rules_service` sentinel 9999.** Closed. `alert_rules_service.py:212-215` now `continue`s on null `last_visit`. No more flood on fresh tenants.
- **IMPORTANT `WizardStep5` onComplete "warning counts as success".** Partially closed. Gate now requires `every(terminal) && some(complete)`, so all-warning pipelines are blocked. But see NEW FINDING #1 — mixed complete+warning still celebrates.
- **IMPORTANT `WizardStep5` sticky ref.** Closed. `hasNotifiedCompleteRef` prevents re-fire; `useRef(false)` resets on unmount/remount so fresh runs work.
- **IMPORTANT `MemberDetail` retry uses live dismiss reason when panel open.** Closed. `retryFailed` (line 143-159) prefers `dismissReason` when `dismissingId === suspectId`, otherwise snapshot. Prevents snapshot-on-stale-input.
- **CROSS (Contractualist) `MemberSummary.gender` null-safe `genderLabel` helper.** Closed. Handles "", null, F/M/U/FEMALE/MALE/UNKNOWN. Non-standard strings (e.g., "Non-binary") render raw — acceptable.
- **IMPORTANT `JobHistory` first-mount fetch-failed deadlock.** Partially closed — `hasFetchedOkRef` prevents initial deadlock, but introduces a DIFFERENT deadlock (see NEW FINDING #3).

---

## STILL OPEN (carry-overs — flagged in earlier rounds, not touched this pass)

- **`to_char` is Postgres-only — `get_member_risk_trajectory` still breaks on SQLite** (`journey_service.py:278`). Comment claims "SQLAlchemy maps this to strftime on SQLite" — it does NOT. `to_char` is passed through verbatim; SQLite raises "no such function: to_char". Local dev regresses.
- **`journey_service.get_member_journey` still returns `age: 0` and `dob: ""`** (line 132-135). Pydantic type enforces `int`/`str`; can't distinguish "missing" from 0-year-old. `MemberSummary.tsx:72` compensates with `member.age ? ... : "age unknown"`, hiding the lie by coincidence of 0 being falsy.
- **`list_journey_members` search branch** (`journey.py:105-111`): still drops `order_by(current_raf.desc().nullslast())`, still has dead `.lower()` on ilike pattern, still no `.strip()` on search input.
- **`get_member_risk_trajectory` bare `except` with no `logger`.** `journey_service.py:287-288`. Schema drift or column rename silently reports every month at $0. No logger imported in this module.
- **`API_STEPS` declared inside `WizardStep5Processing` component body with `useCallback(runStep, [])`.** Latent stale-closure footgun.
- **`IN_FLIGHT_STATUSES` includes `"queued"` — TS `Job.status` union doesn't.** Contract lies both directions.
- **`jobsRef.current` micro-race** (round-3 MINOR).
- **`mockApi` confirm-mapping returns `status: "completed"` vs backend `"validating"`.** Still `mockApi.ts:1095`.
- **`confirm-structure` mock hardcodes `groups_saved: 3, providers_saved: 6`** regardless of POST body.
- **`runStep`/`runRealPipeline` code duplication + `errorText: null` vs `undefined` drift** (`WizardStep5Processing.tsx:158` vs `:195`).
- **`dashboard.py /summary` does not join `GapMeasure.is_active`.** Cross-measure leak of inactive-measure gaps vs `care_gap_service.get_care_gap_summary` (which filters `.is_active.is_(True)`). Round-2 flag unresolved.
- **`MemberSummary.tsx` renders `genderLabel(member.gender)` even when age is unknown** — produces "age unknown Female" rather than a tighter "Female, age unknown" label. Cosmetic.

---

## DEFERRED (list only — user parked)

Alembic, hardcoded confidence, recapture-from-suspects, llm_guard whitelist, icd10 regex confidence, N+1 analyze_member, RafHistory unique, `_local_raf_calculation` zeros demographic, skill stubs, unauth `/api/tuva/process-note`, demo adapter no-restore, filter_service no-op, lenient test quality, `analyze_population` commit-out-of-try, `date.today()` TZ, PMPM benchmarks unsourced, Tuva e2e unverified, Metriport skeleton registered, `_demo_session` bare except, SuspectStatus str/enum mismatch, CMS_PMPM_BASE.

---

## NEW FINDINGS

### [IMPORTANT] WizardStep5 celebrates "Your dashboard is ready!" when 4 of 5 steps are stubs
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:255-268, 293-296`
**Claim:** Gate now requires "every step must be in a terminal non-error state AND at least one must have actually completed work" — the comment claims all-warning is not a success.
**Evidence:** The gate fires `onComplete` when `every(terminal) && some(complete)`. Given round-1's skill stubs (four of the five shipped skill templates — `provider_scorecards`, `care_gap_detection`, `ai_insights`, `data_load` downstream — hit `not_implemented` code paths per `skill_service.py:378-400`), the realistic production state is: step 1 `complete`, steps 2-5 `warning`. Gate passes. The celebration panel renders: `{allDone && metrics && !steps.some(s => s.status === "error") && ... "Your dashboard is ready!"}` (line 295) — warnings pass through. The yellow "Some steps didn't complete" banner (line 280) only shows on `status === "error"`, not `warning`. Net: user sees a green success screen on a pipeline that did 1 of 5 things.
**Missing proof:** No test exercises the 1-complete-4-warning path. The round-1 finding on skill stubs is "deferred," but the onComplete gate tolerates exactly that path.
**Recommendation:** Tighten `hasRealCompletion` to require a majority (`steps.filter(s => s.status === "complete").length >= steps.length - 1`), OR render the yellow warning banner when ANY step is `warning`, not just on `error`. The current gate is only one step short of the round-3 finding it was supposed to close.

### [IMPORTANT] `alert_rules_service` continue-on-null breaks `lt`/`lte` rule semantics
**Location:** `backend/app/services/alert_rules_service.py:211-224`
**Claim:** `continue` on null `last_visit` prevents alert flood.
**Evidence:** Correct for the overwhelmingly common case (`gt`/`gte 180`). But the operator map (`_compare`, line 83-97) also accepts `lt` and `lte`. A rule "flag members with `days_since_visit < 7` for callback nudging" is legitimate — and on that rule, a never-seen member SHOULD fire (you haven't seen them recently). The `continue` blanket-excludes them. Equivalent for `eq 0`. Net: the bugfix trades one class of false positives (never-seen firing `>180` rules) for a class of false negatives on every inverse-polarity rule.
**Missing proof:** No test covers `lt` / `lte` / `eq` against a null-visit member.
**Recommendation:** Gate the `continue` on operator polarity — for `lt`/`lte`/`eq` with small thresholds, treat null as "infinity" or as "unbounded"; only skip for `gt`/`gte`. Or better: branch the query itself — `SELECT members WHERE last_visit IS NULL OR days_since_last >= :threshold` for `gt`, and `WHERE last_visit IS NOT NULL AND days_since_last < :threshold` for `lt`. Today every rule metric that uses `days_since_visit` relies on a Python-side operator check; a correct SQL-level filter is the durable fix.

### [IMPORTANT] `JobHistory` stops polling permanently after stale "all complete" snapshot + API outage
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:38-56, 66-72`
**Claim:** "Has at least one fetch succeeded? If not, keep polling — otherwise a transient first-mount failure leaves jobsRef empty forever and the poller deadlocks."
**Evidence:** The fix prevents the *first-mount* deadlock, but opens a *runtime* deadlock. Scenario: user loads page, first fetch succeeds and returns all jobs `completed` (`jobsRef.current` snapshot has no in-flight), `hasFetchedOkRef.current = true`. Now backend/auth goes down. Interval predicate: `!hasFetchedOkRef (false) || hasInFlight (false)` → **false** — polling stops. The user stares at a stale "Jobs (2) completed" list with no indication the API died. When they upload a new job via `FileUpload`, it appears in local state but `JobHistory` never refetches because the predicate still evaluates false (new job isn't in `jobsRef`). Silent data freshness bug. Worse, a `catch{}` on `fetchJobs` swallows the failure — no user-visible signal.
**Missing proof:** No test simulates "first fetch OK → subsequent failures." No health/staleness badge on the list.
**Recommendation:** Either (a) track `lastSuccessfulFetchAt` and show a "Last updated 3m ago — reconnecting…" badge when a fetch fails after success, and keep polling indefinitely; or (b) invert the predicate to `always poll if page is visible and the list is mounted, back off on repeated failures` (exponential backoff with a ceiling). A success flag that disarms the poller forever is wrong.

### [IMPORTANT] `list_journey_members` return shape drops PCP, risk_tier, spend — picker can't show metadata
**Location:** `backend/app/routers/journey.py:68-73, 113-123`
**Claim:** New endpoint returns "a lightweight member list for the Journey page picker."
**Evidence:** The response model `MemberSearchResult` only has `id, member_id, name, dob, current_raf`. The Journey page (not shown here) presumably renders a picker; if it wants to show PCP name or risk tier in the dropdown (standard pattern for clinician UIs), it has to fetch `/api/journey/{id}` per-row, which is an N+1. Also: `limit=250` is high for a dropdown but low for a full list view — there's no `page` parameter and no total count, so the UI cannot paginate or say "247 of 1200 matching members." A user searching "Smith" for a plan with 400 Smiths sees the first 250 with no hint that more exist.
**Missing proof:** No consumer of this endpoint is in the diff. No test.
**Recommendation:** Either return a paginated response (`{items, total, page, page_size}`) so the UI can page, or add `pcp_name`, `risk_tier`, `open_suspects` to the row so the picker is genuinely useful in one request.

### [IMPORTANT] `get_member_risk_trajectory` silently emits $0 cost for new cost-column code
**Location:** `backend/app/services/journey_service.py:271-288, 326`
**Claim:** The "cost" overlay is a new feature — monthly spend alongside RAF.
**Evidence:** The trajectory now includes `cost: cost_by_month.get(ym, 0.0)` — but the `cost_by_month` dict is keyed on `YYYY-MM` derived from the DB `to_char` call, while `ym` on the trajectory side is derived from `r.calculation_date.strftime("%Y-%m")`. Whenever `RafHistory.calculation_date` and `Claim.service_date` differ in year/month (a calculation done on the 1st of a month for claims in the prior month, or a calc run retroactively), the join-by-string-month misses. Net: a member with cost data every month still shows `cost=0` on the RAF snapshots from days that didn't align to the month. This isn't a database bug — the join-by-month-string is too coarse/brittle for real calculation schedules. Separately, if `to_char` raises on SQLite (local dev), the bare `except` zeros every month silently, and line 326 renders 0.0 without any "cost unavailable" marker.
**Missing proof:** No test. No calibration against a member with known spend.
**Recommendation:** Key cost by `date_trunc('month', Claim.service_date)` and return a structured trajectory with `cost_available: bool` per point. Log the exception inside the bare except. Stop claiming a dollar amount the system can't actually compute.

### [MINOR] `WizardStep5Processing` onComplete gate can fire before `setAllDone(true)` commits
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:202-241, 255-268`
**Evidence:** `runRealPipeline` sets each step's state in the for-loop via `setSteps(...)`, then after the loop fetches `/api/dashboard/summary` and `/api/insights` (line 213-239), then calls `setAllDone(true)`. The `useEffect` gate depends on `[allDone, steps, onComplete]`. The final `setSteps` in the loop (last step → complete) and `setAllDone(true)` are separate async state updates. Between them, the gate sees `allDone=false` and skips. After `setAllDone(true)` commits, React re-runs the effect with `steps` snapshotted from the most recent `setSteps`. In practice React batches, and the gate fires exactly once. But the ordering is implicit — an editor who reorders the dashboard-summary fetch before `setAllDone(true)` (or inserts another awaitable there) could change timing. Add a comment or merge the state into one `setProgress({ allDone, steps })`.
**Recommendation:** Optional. Document the ordering in a comment, or use `flushSync`.

### [MINOR] `clearRowError` in `MemberDetail` runs unconditionally at the start of `handleCapture`/`handleDismiss` — user loses the old error context during optimistic action
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:97-100, 115-119`
**Evidence:** When a user clicks Retry on a failed capture, `handleCapture` first calls `clearRowError(suspectId)`, which removes the error banner AND deletes `lastFailedAction[suspectId]`. If the retry also fails, the catch branch sets new state — fine. But there's a user-perception issue: the error text disappears for the ~200ms of the network call, giving visual feedback that the error "went away" before it re-appears. Clinicians may interpret that flash as "it worked." Consider keeping the error visible with a "retrying…" overlay rather than clearing immediately.
**Recommendation:** Defer the clear to the success branch, or show a loading-and-error-together state.

---

## VERDICT

**REQUEST CHANGES** (no blockers landed that aren't deferred, but two IMPORTANT items need attention before shipping).

The round-3 SQL coalesce-to-9999 is really fixed this time — the subquery emits NULL, Python preserves it, the filter layer respects NULL semantics, and the Pydantic shape is correctly typed as `int | None`. Alert service correctly `continue`s on null. That's genuine progress. However: (1) the WizardStep5 onComplete gate still celebrates "Your dashboard is ready!" on the realistic production state of 1 complete + 4 warning stubs — one step short of the round-3 finding it was claimed to close; (2) the JobHistory first-mount fix opens a symmetric runtime-deadlock (once a snapshot is all-complete and the API subsequently fails, polling stops forever and the user sees stale data with no indication); (3) `alert_rules_service.continue` blanket-excludes null-visit members from `lt`/`lte` rules, silently breaking inverse-polarity alert semantics. Fix 1 and 3, and either add a staleness badge to JobHistory or keep polling on failure.
