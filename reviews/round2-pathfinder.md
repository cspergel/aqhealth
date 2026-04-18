# The Pathfinder — Round 2 Review

**Project:** AQSoft Health Platform
**Date:** 2026-04-17
**Scope:** Verify round-1 fixes end-to-end on the changed files listed in the brief.

---

## CLOSED (round-1 fixes verified end-to-end)

- **[CRITICAL] HCC suspect capture/dismiss silent fail** — `MemberDetail.tsx` now has `errorByRow` state, `extractErrorMessage()` branching on 403/409/Network, inline error row with a Retry button, and optimistic `localStatuses` that is NOT set on failure (so the UI stays in its pre-click state). Verified lines 56-127, 247-258.
- **[CRITICAL] AskBar "something went wrong"** — `AskBar.tsx` now branches status codes 429/504/408/400/401/403/network → actionable messages, renders a dedicated error panel with a Retry button that replays `lastAskedQuestion`. `lastAskedQuestion` is preserved across `collapse()`, so re-opening the bar and clicking Retry still replays the last question. Verified lines 32-84, 179-191.
- **[CRITICAL] TuvaPage raw `fetch()`** — all five `fetch()` calls have been replaced with `api.get()`/`api.post()`, including `Demo1kTab`. `triggerPipeline` now uses `api.post` and null-coalesces `res.data?.message`. No `fetch(`, `baseUrl`, `VITE_API_URL`, or `import.meta.env` references remain in `TuvaPage.tsx`.
- **[MINOR] DataQualityPage NaN guard** — line 197 AND line 198 both now branch `latest.total_rows > 0 ? ... : "0"`. Also `reports[] === []` → `latest = null` → early return with "No quality reports yet." message. Both Valid and Quarantined are covered.
- **[IMPORTANT] JobHistory never polls** — `JobHistory.tsx` now polls when any job is non-terminal, cleans up on unmount via `isMountedRef` and `pollTimerRef`, and stops polling when all jobs reach terminal states. (But see NEW FINDING below on silent-failure dead-end.)
- **[IMPORTANT] WizardStep5 celebration even on failure** — now guarded by `!steps.some(s => s.status === "error")`. Error summary box renders with "Some steps didn't complete" message. Each errored row exposes a per-row Retry button (line 267-272) that re-invokes `runStep(key, skillName)`. Verified that `runStep` updates the row status back to "running" → "complete"/"error" correctly. (See NEW FINDING below on celebration not re-appearing after successful retry.)
- **[IMPORTANT] FileUpload robust error handling** — now branches 413/415/504/408/Network-error with specific copy; normalizes backend `UploadResponse` to the flat shape the rest of the flow expects; guards against empty mapping.

---

## STILL OPEN (user parked; not scored)

- No onboarding redirect for new tenants landing on empty Dashboard.
- Dashboard / Members / CareGaps retry on load failure (empty-state dead ends).
- ColumnMapper polling has no cancel/timeout and still leaks on unmount (uses raw `setInterval` local, no `useRef` cleanup).
- FileUpload no size cap or progress bar.
- Token-refresh `returnTo` not preserved across forced logout.
- ClinicalExchange actions still `console.error` only.
- Reports synchronous generation (no polling model).
- Auth/login/RBAC and DEMO_MODE security (parked by user).
- MINORs: LoginPage collapses all errors, no "Forgot password" or "Try demo" link, ProtectedRoute loop risk, unsaved-changes guard, Sidebar "Setup Wizard" visible post-onboarding, OrgDiscoveryReview skip with no confirmation.

---

## NEW FINDINGS

### [CRITICAL] Demo ingestion → Org Discovery crashes on response-shape mismatch
**Flow:** Demo user (`?demo=true`) → Ingestion → drop CSV → "Upload and analyze" succeeds → page advances to Step 2 "Org Discovery" → **white screen / ErrorBoundary**
**Location:** `frontend/src/lib/mockApi.ts:1087-1097` (mock) vs `frontend/src/components/onboarding/OrgDiscoveryReview.tsx:15-27, 201-246` (consumer)
**Evidence:** Mock returns:
```ts
{
  groups: [{ id: "g1", name: "...", provider_count: 12, relationship_type: "owned" }, ...],
  unassigned_providers: [],
  total_groups: 3, total_providers: 26, total_unassigned: 0,
}
```
But the consumer types the response as `DiscoveryResult = { groups: DiscoveredGroup[]; unmatched_count }` where each `DiscoveredGroup` has `tin`, `is_existing`, `relationship_type`, **`providers: DiscoveredProvider[]`**. At render, line 244:
```tsx
{group.providers.length} provider{group.providers.length !== 1 ? "s" : ""}
```
`group.providers` is `undefined` → throws `Cannot read properties of undefined (reading 'length')`. Additionally `key={group.tin}` collides (all undefined) and `TIN: {group.tin}` renders blank.
**User impact:** The flagship demo flow ("upload a CSV and watch AI detect your org structure") hard-crashes the second the mock response arrives. A partner on the public demo sees a blank page — the most important impression moment of the entire product.
**Recommendation:** Change the mock at line 1087-1096 to match the `DiscoveryResult` interface exactly:
```ts
{
  groups: [
    { tin: "12-3456789", name: "Pinellas Primary Care", is_existing: false, relationship_type: "owned",
      providers: [{ npi: "1234567890", name: "Dr. James Rivera", specialty: "Family Medicine" }, ...] },
    ...
  ],
  unmatched_count: 3,
}
```

---

### [CRITICAL] Demo TuvaPage Overview tab crashes on `summary.total_baselines.toLocaleString()`
**Flow:** Demo user → `/tuva` → Overview tab (default landing)
**Location:** `frontend/src/lib/mockApi.ts:2177-2184, 2192-2193` vs `frontend/src/pages/TuvaPage.tsx:375, 408`
**Evidence:** Mock for `/api/tuva/raf-baselines/summary` returns:
```ts
{ total_members: 1000, raf_range_p25: 0.78, ..., discrepancies: 42, version: "2026.1" }
```
with **no `total_baselines` and no `agreement_rate`**. Mock for `/api/tuva/comparison` returns `{items:[], summary: null}` so `compSummary` is `null`. In `OverviewTab`:
```tsx
<MetricCard label="Members Scored"
  value={compSummary?.total_members.toLocaleString() ?? summary.total_baselines.toLocaleString()} />
```
`compSummary` is null → falls through to `summary.total_baselines.toLocaleString()` → `undefined.toLocaleString()` → **TypeError**. Line 408 renders `` `${undefined}%` `` → "undefined%".
**User impact:** Tuva page — one of the main differentiators shown to prospects — crashes on load in demo mode. The `loadData` try/catch would normally fall back to `DEMO_SUMMARY`, but the mock returns a 200 with *bad* shape, so the try succeeds and the crash happens at render time where there's no boundary.
**Recommendation:** Either (a) make the mock return the full `RafSummary` shape (`total_baselines`, `discrepancies`, `agreement_rate`, `avg_discrepancy_raf`) AND a non-null `ComparisonSummary`, or (b) make the TuvaPage page-level fallback fire when the response shape is missing required fields, OR (c) simplest — have the mock return `null` (so the `catch` falls through to `DEMO_SUMMARY` which has the right shape). Today's mock gives the worst of both worlds.

---

### [IMPORTANT] HCC Retry button calls wrong action when dismiss input is open + capture failed
**Flow:** Suspects → Member → click "Dismiss" (opens reason input), type partial reason → click "Capture" instead → capture fails → click "Retry"
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:250-256`
**Evidence:**
```tsx
<button onClick={() => (dismissingId === s.id ? handleDismiss(s.id) : handleCapture(s.id))}>
  Retry
</button>
```
The retry dispatch is based on *current* `dismissingId`, not which action actually failed. If the dismiss input happens to be open when the user clicks Capture and it fails, Retry will call `handleDismiss` (which early-returns silently on empty reason via line 106 `if (!dismissReason.trim()) return;`) — user clicks Retry, nothing happens, no feedback.
**User impact:** Dead-click on Retry with no feedback when the user had both action UIs in scope. Subtle but confusing.
**Recommendation:** Track which action failed in `errorByRow` as `{[id]: {message, action: "capture" | "dismiss"}}` and dispatch based on stored action, not current UI state.

---

### [IMPORTANT] WizardStep5 successful retry never shows the celebration screen
**Flow:** Onboarding → Step 5 → all 5 steps run → step 3 "scorecards" fails → "Some steps didn't complete" error box appears → user clicks Retry on row 3 → it succeeds → **but celebration screen never appears**
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:285-307, 138-165`
**Evidence:** The celebration is gated by `allDone && metrics && !steps.some(s => s.status === "error")`. When retry succeeds, `steps[2].status` becomes `"complete"` so the "some error" check flips to false, BUT `metrics` was never set (the fetch at line 209-221 only runs at the end of the initial `runRealPipeline` loop). `runStep` (line 138-165) updates a single step but doesn't fetch `/api/dashboard/summary`, doesn't fetch `/api/insights`, doesn't re-evaluate `setMetrics`/`setFindings`. So after a successful retry, `steps` looks clean, the red error summary disappears, but the page is just empty below the step rows — no celebration, no "Your dashboard is ready!", no Top 3 Findings.
**User impact:** User retries the failed step, it works, and the UI silently degrades to a blank post-pipeline state. They don't know if the wizard is done or not.
**Recommendation:** After a successful retry in `runStep`, check whether ALL steps are now non-error, and if so call a shared "finalize" function that fetches metrics + findings and sets them. Equivalently: wrap the tail of `runRealPipeline` (lines 209-235) into a `finalizePipeline()` callback and invoke it both at end-of-loop AND from `runStep` when it transitions the last failing step to complete.

---

### [IMPORTANT] WizardStep5 parent receives `onComplete` signal even when every step failed
**Flow:** Onboarding → Step 5 → every step errors → error summary shows → user sees the "Next" / "Finish" button become enabled
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:251-253`; `frontend/src/pages/OnboardingPage.tsx:100-102, 161-163`
**Evidence:**
```tsx
useEffect(() => { if (allDone) onComplete?.(); }, [allDone, onComplete]);
```
`allDone` fires at the end of `runRealPipeline` regardless of error state. OnboardingPage then sets `step5Complete = true` unconditionally, and `nextDisabled` flips to false at line 163. The user can now click "Finish" → `handleFinish` sets `localStorage.onboarding_complete = "true"` and navigates to `/`. They've "completed" onboarding with zero data loaded.
**User impact:** A tenant admin whose pipeline failed on every step can still click Finish, gets sent to an empty Dashboard, and the system marks them as onboarded — they never see the wizard again unless they manually clear localStorage.
**Recommendation:** Only fire `onComplete` when the pipeline ended in a fully-clean state, OR pass a `hasErrors` flag to the parent so OnboardingPage can keep `nextDisabled=true` until the user either retries everything or explicitly acknowledges "Continue anyway."

---

### [IMPORTANT] JobHistory poll stops permanently on a single transient fetch failure
**Flow:** Ingestion → History tab → upload shows as "processing" → one poll tick hits a 502 or dropped socket → polling stops, job row stays "processing" forever
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:35-45, 59-76`
**Evidence:** `fetchJobs` catches all errors silently (line 40-42, `// silent`). If the fetch throws, `setJobs` is not called, so `jobs` identity doesn't change, so the `useEffect` on `[jobs]` does NOT re-run. The `setTimeout` is one-shot and already fired. **No new timer is scheduled.** A single transient failure stops polling for the rest of the session.
**User impact:** User watches an "Uploading" row that never transitions. Reload is the only escape. More insidious than the old "never polls" bug because the UI looks alive.
**Recommendation:** Either (1) on fetch failure, re-schedule a retry timer (with backoff), or (2) set `jobs` via functional update so the effect re-fires even without real changes, or (3) move to `setInterval` with a separate `retriesRemaining` counter. Also: log errors at least to console.warn (silent eat on a polling loop is always a finding).

---

### [IMPORTANT] ColumnMapper processing stage shows no text/explanation if mock completes instantly
**Flow:** Demo → Ingestion → upload CSV → go through Org Discovery (once fixed) → Column Mapper → click "Confirm mapping and process"
**Location:** `frontend/src/lib/mockApi.ts:1082-1085`; `frontend/src/components/ingestion/ColumnMapper.tsx:103-136`
**Evidence:** Mock returns `{status: "completed"}` immediately on confirm. ColumnMapper sets `status="pending"` then calls `pollStatus()` which first fires after 2s. The first poll gets `"completed"`, clears interval, fires `onComplete?.()` which in IngestionPage resets `uploadResult` and switches the tab to "history". **So the user sees 2 seconds of amber "Pending" tag with no feedback, then the whole page snaps to a jobs table where their new job is row 1 at the top with status "completed."** Compared to the previous "clicks do nothing" bug this is a net win, but the 2-second pause feels like nothing happened, and the instant tab switch on completion is jarring — they lose context of which upload/mapping they just did.
**User impact:** Demo moment feels abrupt and disconnected. Partner doesn't get the "aha — AI just mapped my columns and ingested 14,000 rows" payoff.
**Recommendation:** Add a brief processing animation (or have the mock simulate `pending → processing → completed` across 2-3 poll ticks) and render a success toast "Processed 14,188 rows into Claims" for a second before switching tabs. The demo story is the story; don't swallow the "it worked" beat.

---

### [MINOR] AskBar collapse() clears `errorMessage` but not `lastAskedQuestion` — intentional for retry, but confusing if user asks a new question and errors after a prior error
**Flow:** Ask "What's my total RAF?" → errors → collapse → expand → ask "Show me diabetes patients" → errors
**Location:** `frontend/src/components/query/AskBar.tsx:44-52, 95-100`
**Evidence:** `handleAsk` correctly updates `setLastAskedQuestion(text)` on every ask, so the retry button will replay the *most recent* question. This is correct. HOWEVER: if the user types a new question and it errors, then collapses, `lastAskedQuestion` persists. If they re-expand without typing a new question and hit Retry, it replays the last failed question — which is the expected behavior. **No actual bug here** — but worth noting that `errorMessage` is cleared on `collapse()` (line 99) which means re-opening after error hides the error UI entirely. That's a design choice but it does mean the Retry button is not reachable from a re-opened bar, only from the session where the error just occurred. If the user wants to replay a failed question after closing/reopening, they'd have to type it again — losing the value of preserving `lastAskedQuestion`.
**User impact:** Minor — the preserved `lastAskedQuestion` state is essentially dead state if the user closes the bar.
**Recommendation:** Either clear `lastAskedQuestion` on collapse (matching `errorMessage`), OR keep `errorMessage` and expose a "Retry last question: …" affordance when the bar re-opens.

---

### [MINOR] TuvaPage loses "DEMO DATA" badge in demo mode
**Flow:** Demo user on `aqhealth.ai?demo=true` → `/tuva` → expected "DEMO DATA" badge next to title
**Location:** `frontend/src/pages/TuvaPage.tsx:188-219, 284-298`
**Evidence:** `useDemo` is set to `true` only in the `catch` branch of `loadData()` (line 208). But in demo mode, the axios mock adapter returns a successful 200 response (just with bad shape — see NEW FINDING #2), so the `try` branch succeeds, `setUseDemo(false)` runs (line 205), and the `{useDemo && <DEMO DATA badge>}` never renders. The page looks like live data.
**User impact:** Once the crashing-shape is fixed, the page will render as if the data is live backend data — potentially misleading partners during the demo.
**Recommendation:** Replace `useDemo` detection-via-catch with a direct `useAuth().isDemo` check, so the badge is authoritative about demo mode regardless of fetch outcome.

---

### [MINOR] FileUpload clearFile button click also triggers drop-zone click
**Flow:** Drop CSV → see file chip + "Remove" → click Remove
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:199-210, 238-244`
**Evidence:** The outer drop zone div has `onClick={() => !selectedFile && inputRef.current?.click()}` (line 203). The Remove button has `onClick={(e) => { e.stopPropagation(); clearFile(); }}` (line 239) — good, uses `stopPropagation`. However, since the guard is `!selectedFile`, the outer click is effectively neutered while a file is selected. Works by luck of short-circuit, but the stacked handlers are a fragility — any future change that removes the `!selectedFile` guard reintroduces a double-fire.
**User impact:** None today — but warrants a comment explaining the stopPropagation guard.
**Recommendation:** Move file-browser trigger to a dedicated inner button/link; don't nest a button inside a clickable div.

---

## VERDICT: REQUEST CHANGES

The four round-1 CRITICALs are properly closed at the fix site, but two NEW CRITICALs broke through while the team was adding demo mocks: `/api/onboarding/discover-structure` and `/api/tuva/raf-baselines/summary` both return shapes that don't match the consumer types, causing hard runtime crashes in the two highest-value demo flows (ingestion wizard and Tuva comparison page). Fix those two mock response shapes and round-2 goes to APPROVE. The IMPORTANTs around WizardStep5 retry-completion and JobHistory silent-poll-death are real gaps that leave users stuck in "done but not really" states and should be cleaned up before the next partner demo.
