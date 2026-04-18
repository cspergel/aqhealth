# The Pathfinder — Round 3 Review

**Project:** AQSoft Health Platform
**Date:** 2026-04-17
**Scope:** Verify round-2 fixes end-to-end, walk every flow, surface regressions.

---

## ROUND-2 CLOSED (verified end-to-end)

- **[CRITICAL] OrgDiscoveryReview demo crash** — `mockApi.ts:1087-1123` now emits a full `DiscoveryResult`: `{groups: [{tin, name, is_existing, relationship_type, providers: [...]}], unmatched_count}`. `OrgDiscoveryReview.tsx:59` spreads each group (`res.data.groups.map((g) => ({...g}))`) so `providers` carries through. Expanded render at `:244` reads `group.providers.length` — no longer undefined. `key={group.tin}` is unique per group. Confirm POST sends the TIN that the mock round-trips cleanly. Flow: upload CSV → Step 3 Structure renders 3 groups (Pinellas / Clearwater / Palm Harbor) → expand shows provider tables → Confirm or Skip both advance. **No white-screen.**

- **[CRITICAL] TuvaPage Overview crash** — `mockApi.ts:2203-2210` now returns the full `RafSummary` (`total_baselines: 247, discrepancies: 12, agreement_rate: 95.1, avg_discrepancy_raf: 0.089`). At `TuvaPage.tsx:375`, `compSummary?.total_members.toLocaleString() ?? summary.total_baselines.toLocaleString()` — the `?.` chain short-circuits cleanly to `summary.total_baselines.toLocaleString()` = `"247"`. `:402` `summary.discrepancies.toString()` = `"12"`. `:408` `summary.agreement_rate` = `95.1`. All four other metric cards guard with `?? "—"`. **No TypeError.**

- **[CRITICAL] TuvaPage Comparison block** — line 491 is gated `{summary && (...)}` and `compSummary` is null in demo, so the block simply doesn't render. The comparisons table below renders the empty-state row ("Run the Tuva pipeline to see the 3-tier comparison"). Clean empty state, no crash.

- **[IMPORTANT] WizardStep5 onComplete gate** — `WizardStep5Processing.tsx:251-256` now: `if (!allDone) return; const anyFailed = steps.some((s) => s.status === "error"); if (anyFailed) return; onComplete?.();`. Parent `OnboardingPage.tsx:163` keeps `nextDisabled` true until `step5Complete` is set, which requires no errors. User can no longer Finish onboarding with all steps errored. `handleFinish` (line 66) and `localStorage.onboarding_complete = "true"` cannot fire until pipeline is clean.

- **[IMPORTANT] JobHistory resilient polling** — `JobHistory.tsx:54-73` switched from setTimeout-chain to single `setInterval(..., 5000)` that reads `jobsRef.current` each tick. A single `fetchJobs` failure sets nothing but leaves `jobsRef.current` intact, so the next tick still fires `fetchJobs()` again. `IN_FLIGHT_STATUSES` widened to `{pending, processing, validating, mapping, queued}` so new backend statuses (cancelled, skipped) correctly short-circuit the poll to terminal. Cleanup via `isMountedRef` + `clearInterval(interval)` on unmount. Transient fetch failures no longer permanently dead-end the poller.

- **[IMPORTANT] MemberDetail `lastFailedAction` retry** — `MemberDetail.tsx:59-61, 106-114, 132-141, 143-151`. Every failed capture stores `{type: "capture"}`, every failed dismiss stores `{type: "dismiss", reason}`. `retryFailed` dispatches based on stored action, not current `dismissingId`. Scenario walk: user clicks Dismiss (opens input) → clicks Capture → capture fails → clicks Retry → `retryFailed` reads `{type:"capture"}` → calls `handleCapture`. Second scenario: user types reason, clicks OK, dismiss fails (input stays open because reset is in try-branch only) → Retry → `handleDismiss(id, last.reason)` → `overrideReason` wins over current `dismissReason` even if cleared. The inline button label ("Retry capture" vs "Retry dismiss") at `:280` correctly reflects which action will re-run — good UX signal.

---

## STILL OPEN (explicitly parked by user this round)

- **[IMPORTANT, carry-over from Round 2]** WizardStep5 successful retry: after a single step error, user retries, step flips to "complete", `anyFailed` becomes false, `allDone` is still true, `metrics` IS populated (round-2 trace was slightly off — `runRealPipeline` DOES reach the `/api/dashboard/summary` fetch at line 210 because each per-step `catch` continues the loop), so the celebration screen SHOULD appear. BUT: `findings` and `metrics` reflect the state AT pipeline-end (with errored steps), not the post-retry state. After a successful retry, dashboard may now have the newly-loaded data that wasn't there when `metrics` was first fetched, so the summary cards are stale. This is the user's acknowledged carry-over.
- All Round-1 and Round-2 IMPORTANTs/MINORs the user parked (onboarding empty-Dashboard redirect, Dashboard retry, ColumnMapper timeout/cancel, FileUpload size-cap/progress, token-refresh returnTo, ClinicalExchange toasts, Reports async, LoginPage error-collapse, Sidebar post-onboarding, OrgDiscoveryReview Skip confirm, unsaved-changes guard).

---

## NEW FINDINGS

### [IMPORTANT] JobHistory `setLoading(false)` in `fetchJobs` `finally` means a first-mount fetch that throws permanently ends the poll before it ever starts
**Flow:** User opens Ingestion > History tab while backend is temporarily down → sees "Loading jobs..." flip to "No upload jobs yet." → polling begins → 5 s later, still no backend → still "No upload jobs yet."
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:40-52, 54-73`
**Evidence:** On first mount, `fetchJobs()` throws → `catch { /* silent */ }` → `setJobs` never called → `jobsRef.current` stays `[]` → `finally { setLoading(false) }` flips to empty-state. The `setInterval` starts and fires every 5s, but at each tick `jobsRef.current.some(IN_FLIGHT_STATUSES.has)` is `false` (empty array) → `fetchJobs()` is NEVER called again. So after the very first failure, the poll is a no-op loop. If the backend comes back up, the user never sees their jobs until they manually refresh the page or navigate away and back.
**User impact:** On a flaky first connection (token race, server restart), user sees "No upload jobs yet." — they assume their upload was lost. Reload shows the job. Same UX bug as Round 1, just moved.
**Recommendation:** Unconditionally call `fetchJobs()` each tick (every 5 s) if `jobs.length === 0` OR any in-flight, so an initial-fetch failure recovers. Alternative: seed `jobsRef.current` with a sentinel `[{id:-1, status:"pending"}]` so the polling condition is true until the first successful fetch. Also stop swallowing errors silently — `console.warn` at minimum.

---

### [IMPORTANT] MemberDetail Retry button disappears the moment retry is clicked (clearRowError is called at the START of handleCapture/handleDismiss)
**Flow:** Capture fails → error row + "Retry capture" shows → user clicks Retry → retry itself fails → user wants to click Retry again
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:98-115, 117-141, 83-96`
**Evidence:** `handleCapture` begins with `clearRowError(suspectId)` which deletes both `errorByRow[suspectId]` AND `lastFailedAction[suspectId]`. On the re-try, this wipes the error+action tracker synchronously on re-entry, then the action fires. If the second attempt fails, it re-populates them and the row reappears. **Net effect is fine in the happy path**, but there's a narrow window where a fast retry that fails synchronously or the loading spinner may look inconsistent. More importantly: the message re-populated in the catch branch might differ from the original (different 429 vs 500), which is actually correct, but the "Retry capture" label is computed from the current `lastFailedAction` — which is now the SECOND failure's action, still `capture` — so the label is correct.

Upon careful trace: **this is actually correct behavior**, not a bug. Flagging it only because future authors may be tempted to add "recent retries counter" state here — without centralizing the clear-at-start pattern, that state would be wiped on every retry. Skip unless refactor happens.

**Recommendation:** None now. If a retries-remaining counter is added later, move `clearRowError` to the success branch (after `await`) so failure-counter state survives re-entry. MINOR actually; downgrading.

---

### [IMPORTANT] JobHistory polls forever when any job is stuck in a non-terminal status the backend never exits
**Flow:** Upload file → backend worker crashes mid-process → job row stays in `processing` forever → `setInterval` fires `fetchJobs` every 5 s in perpetuity
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:54-73`
**Evidence:** There's no max-duration cap, no "stall detection," no user-initiated cancel. A permanently-stuck `processing` job will pin this interval on every visit to the History tab and drain battery / quota on the backend. Unmount clears the interval so it's not cross-navigation, but a user who camps on this tab gets an endless 12 req/min.
**User impact:** Low-visibility — user sees a "processing" row that never resolves, has no way to cancel or kill it, and no way to silence the poll. Network tab fills up.
**Recommendation:** Add a per-job `age` check: if a job has been `processing` > 10 minutes, flip the row to a "Stalled — contact support" state and stop including it in the in-flight set (so the poll naturally terminates). Also expose a "Cancel job" button via `POST /api/ingestion/jobs/{id}/cancel`. (Carry-over from Round 1 list.)

---

### [MINOR] TuvaPage `useDemo` flag no longer reflects demo-mode truthfully
**Flow:** Demo user (`?demo=true`) → `/tuva` → loadData mocks all succeed → `setUseDemo(false)` runs → the "DEMO DATA" badge (`TuvaPage.tsx:284-298`) never renders even though every number on the page is mocked
**Location:** `frontend/src/pages/TuvaPage.tsx:192-219`
**Evidence:** `useDemo` is set `true` only in the `catch` branch at line 208. Now that the mocks cleanly succeed (round-2 fix), the `try` branch always wins in demo mode, `setUseDemo(false)` runs, and the badge is suppressed. Prospects viewing the Tuva page in demo mode see numbers that look live (247 baselines, 95.1% agreement, etc.) with no indication they're demo data. Same finding was raised Round 2 — now demonstrably triggered by the fix.
**User impact:** Prospective partner can't tell demo from live. If they cross-reference "247 baselines" against their own data later and find mismatch, trust erodes.
**Recommendation:** Replace catch-driven `useDemo` with `const { isDemo } = useAuth();` (or read `searchParams.get("demo") === "true"`) so the badge is authoritative regardless of fetch outcome. One-line change.

---

### [MINOR] OrgDiscoveryReview confirm POSTs `relationship_type` but not the full group; returning real backend may reject rows
**Flow:** Demo user edits group name → clicks Confirm → POST succeeds → advances. Real-backend user does the same → backend may return 422 if it expects `providers[]` or `is_existing` on confirm
**Location:** `frontend/src/components/onboarding/OrgDiscoveryReview.tsx:86-104`
**Evidence:** Confirm body sent is `{job_id, groups: [{tin, name, relationship_type}]}` only. If the backend's confirm-structure endpoint validates against `DiscoveredGroup` (which has `is_existing` and `providers` required), the request will 422 and the error surface shows only `err.response?.data?.detail || "Failed to confirm structure."` — the user sees a generic "Failed" banner with no path to self-resolve. CROSS:Contractualist for the actual schema.
**User impact:** Demo works (mock accepts anything). Real backend may reject — user sees "Failed to confirm structure" with no way to proceed except Skip.
**Recommendation:** Either (a) send the full group object through, or (b) confirm the backend contract only requires `{tin, name, relationship_type}`. Also add a specific error-branch for 422 that lists missing fields.
**CROSS:** Contractualist

---

### [MINOR] ColumnMapper "pending" flash after mock completes instantly — unchanged from Round 2
**Flow:** Demo → ingestion → confirm mapping → 2 s of amber "Pending" → abrupt switch to History tab with the just-completed row as #1
**Location:** `frontend/src/lib/mockApi.ts:1082-1085`; `frontend/src/components/ingestion/ColumnMapper.tsx:103-136`
**Evidence:** Confirm-mapping mock returns `status: "completed"` immediately. ColumnMapper's `pollStatus` first tick is at 2 s after `setInterval` → user sees "Pending" for 2 s. On completion, `onComplete?.()` in `IngestionPage.handleProcessingComplete` resets `uploadResult` and flips tab to History. Jarring context-loss.
**User impact:** Demo payoff moment feels abrupt — "did it work?" followed by sudden page swap.
**Recommendation:** Have the mock simulate `pending (tick1) → processing (tick2) → completed (tick3)` so the user sees live progress. Add a brief success banner "Processed N rows" before the tab switch. Better yet: show the completed row highlighted with a fade-in on the History tab so user sees what they just did. (Unchanged from Round 2 — deferring is fine; not demo-blocking now.)

---

### [MINOR] WizardStep5 demo mode has no error path — retry button is never reachable, so the IMPORTANT fix is effectively demo-invisible
**Flow:** Demo user → wizard Step 5 → `runDemoPipeline()` simulates all 5 steps always succeeding → celebration
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:100-127, 243-248`
**Evidence:** `runDemoPipeline` has no error branch. Every step deterministically completes. So the "Some steps didn't complete" error summary, per-row Retry buttons, and `!anyFailed` gate are all real-backend-only code paths. Partners walking through the wizard on the demo will never see this error-recovery UX. If the wizard is shown to partners as proof of the product's robustness, the demo doesn't show what happens when things go wrong.
**User impact:** Partners see only the happy path, then hit real-world edge cases in production. Also a missed opportunity to showcase "the product recovers gracefully" during the sales demo.
**Recommendation:** Consider a demo mode that randomly errors one step (maybe `scorecards` since it's the middle) with a click-to-retry affordance. Show the celebration screen only after the user demonstrates the retry. Even simpler: add a hidden `?demo_failure=scorecards` flag so you can stage the error story for a high-value demo.

---

## VERDICT: APPROVE (with one IMPORTANT to watch)

Both Round-2 CRITICALs (OrgDiscoveryReview shape mismatch, TuvaPage `total_baselines` TypeError) are closed at the mock site with the correct `DiscoveryResult` and `RafSummary` shapes; the onboarding-wizard and Tuva demo flows both render cleanly end-to-end in demo mode. The Round-2 IMPORTANTs for WizardStep5 completion gating, JobHistory resilient polling, and MemberDetail `lastFailedAction` retry are genuinely fixed — I walked the exact error-recovery scenarios called out in the brief and the code does the right thing. The one IMPORTANT new finding (JobHistory first-mount-fail dead-ends the poller) is a narrow edge case introduced by the ref-based poll loop and warrants a one-line change before the next partner demo; everything else is MINOR or carry-over. The demo is no longer showstopper-broken.
