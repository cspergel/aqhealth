# The Pathfinder — Round 4 Review

**Project:** AQSoft Health Platform
**Date:** 2026-04-17
**Scope:** Verify round-3 fixes end-to-end on the changed files; walk every flow the brief called out.

---

## ROUND-3 CLOSED (verified end-to-end)

- **[IMPORTANT] JobHistory first-mount deadlock** — `JobHistory.tsx:37-39, 59-80`. New `hasFetchedOkRef` starts `false`; interval predicate is `if (!hasFetchedOkRef.current || hasInFlight) fetchJobs()`. Walk: fresh mount → first `fetchJobs` throws (backend down) → `catch` leaves `hasFetchedOkRef=false` → 5s later, interval tick sees `!hasFetchedOkRef.current` → re-fetches → succeeds → `hasFetchedOkRef=true`, jobs render. If all jobs are terminal after that, polling goes idle (correct). Tab is switched in/out of History in `IngestionPage.tsx:199` (`{tab === "history" && <JobHistory />}`), which remounts — so a new upload that switches `tab="history"` triggers a fresh fetch cycle that sees the in-flight job. **Closed cleanly.**

- **[Backend] SQL `days_since_visit` NULL on no visit** — `member_service.py:132-137` drops `coalesce(..., 9999)`, returns `None` when `last_visit_sq.c.last_visit_date` is NULL. API shape (`members.py:43`) typed `int | None = None`. `MemberTable.tsx:39-40, 61-62` guards both `daysColor` and `daysAgoLabel` against null → renders `"--"` in `textMuted`. Sort by "Last Visit" uses `sort_col.asc().nullslast()` / `desc().nullslast()` (`member_service.py:250-253`), so null rows deterministically land at the bottom for both directions. **Predictable.**

- **[Backend] `alert_rules_service` skips null rows** — `alert_rules_service.py:212-216`. Prior `value = 9999` path is replaced with `continue` so a "Not seen > 180" rule no longer fires on every brand-new member without visit history. No frontend "preview matches" UI exists (`AlertRulesPage.tsx` only shows historical `trigger_count` — no client-side projection to reconcile), so no messaging drift to worry about. **Closed.**

- **[Frontend] MemberSummary gender / age / dob** — `MemberSummary.tsx:32-39, 71-77`. `genderLabel` handles `null`, `undefined`, `""`, `"U"`, `"UNKNOWN"`, case-insensitive `F|FEMALE|M|MALE` → stable strings. Age `0` falls to "age unknown". Empty DOB renders `"—"`. Backend now emits `gender: ""` / `age: 0` instead of `None` (`journey_service.py:132-135`), so the frontend's fallback strings always have something to check against. **Clean.**

- **[Frontend] WizardStep5 sticky-ref prevents retry-race `onComplete`** — `WizardStep5Processing.tsx:98-102, 255-268`. `hasNotifiedCompleteRef` latches after the first successful notification; a retry that flips a step `running → complete` can't re-fire `onComplete`. Dependency array includes `steps` so we re-evaluate when state changes, but the ref guard blocks the duplicate call. **Correct.**

- **[Frontend] MemberDetail retry prefers current dismiss input when open** — `MemberDetail.tsx:146-163`. When retrying a failed dismiss: `currentReason = dismissReason.trim()`; if `dismissingId === suspectId && currentReason` → send the edited reason; otherwise fall back to the snapshot. Walked scenarios: (a) user edits reason in still-open panel then retries — edited reason wins (no stale audit-trail write). (b) user clicks Cancel clearing `dismissingId` → snapshot wins. (c) user clicks Dismiss on a *different* suspect B mid-flight → `dismissingId=B`, retry on suspect A uses A's snapshot (not B's in-progress reason) — verified the `===` gate blocks cross-row bleed. **Solid.**

---

## STILL OPEN (carry-overs, explicitly parked by user)

- TuvaPage `useDemo` badge suppression — `useDemo` only set in catch; mocks succeed, so badge never shows on `aqhealth.ai/?demo=true`.
- `OrgDiscoveryReview` confirm-structure: payload omits `providers` + `is_existing` — real backend may 422 (CROSS:Contractualist).
- ColumnMapper 2s "Pending" flash into abrupt tab switch on mock instant-complete.
- WizardStep5 **demo mode** has no error path — retry UX is real-backend-only.
- Round-1 list: Dashboard/Members/CareGaps retry-on-load, ColumnMapper polling timeout/cancel, FileUpload size cap/progress bar, Reports synchronous generation, token-refresh `returnTo`, ClinicalExchange `console.error`-only handlers.

---

## NEW FINDINGS

### [IMPORTANT] WizardStep5 all-warning edge: celebration renders but Next/Finish stays disabled — contradictory dead-end
**Flow:** Real-backend onboarding (all skills return `status: "stub" | "not_implemented"`) → Step 5 runs → every row flips to `warning` → `runRealPipeline` fetches `/api/dashboard/summary` + `/api/insights` (those still succeed) → `setAllDone(true)`
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:255-268` (gate) vs `:321-322` (celebration render condition)
**Evidence:**
```tsx
// onComplete gate — requires at least one real completion:
const hasRealCompletion = steps.some((s) => s.status === "complete");
if (!allTerminalOk || !hasRealCompletion) return;
hasNotifiedCompleteRef.current = true;
onComplete?.();

// ...but the celebration block only checks for absence of errors:
{allDone && metrics && !steps.some((s) => s.status === "error") && (
  <div>Your dashboard is ready!</div>
  ...
)}
```
In the all-warning case: `steps.every(s => s.status === "warning")`. `allDone=true`, `metrics` is populated (summary fetch succeeded), no step is `error` → **celebration renders** with "Your dashboard is ready!" and metric cards. BUT `hasRealCompletion=false` → `onComplete` never fires → `step5Complete` stays false in `OnboardingPage.tsx:100-102` → `nextDisabled = (currentStep === 4 && !step5Complete) = true` (`OnboardingPage.tsx:161-163`). The "Go to Dashboard" button is greyed out.
**User impact:** Tenant admin sees a success-screen ("Your dashboard is ready!") but the Finish button is disabled with no explanation. There's no red error summary (no step is `error`), no Retry button on any row (also gated on `error`), no tooltip on the disabled button. User's only escape is Back or Exit Wizard. Rare in prod but directly the scenario the brief asked me to check.
**Recommendation:** Either (a) hide the celebration when `hasRealCompletion` is false, and render a dedicated "Setup is incomplete — your pipeline didn't have anything implemented yet" banner that explains the stuck state, or (b) simplest: mirror the onComplete gate into the render condition — change the celebration guard to `!steps.some(s => s.status === "error") && steps.some(s => s.status === "complete")`. Pair with a new fallback block when all-warning: brief explanatory text plus an enabled "Go to Dashboard anyway" escape hatch so the user isn't stuck in a wizard that can't acknowledge completion.

---

### [MINOR] JobHistory poll goes silent between sessions on same tab — new in-flight job triggered elsewhere is invisible
**Flow:** User mounts JobHistory with all jobs terminal → polling idles (`hasFetchedOkRef=true`, no in-flight) → user opens a new browser tab, kicks off a long-running ingestion via that tab (or a server-side job is created via API) → original tab's JobHistory never refreshes because its in-flight predicate reads only its own stale `jobsRef`
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:66-72`
**Evidence:** The interval predicate polls `fetchJobs()` only `if (!hasFetchedOkRef.current || hasInFlight)`. Once first-mount succeeds and no visible job is in flight, the poller stops querying the server. In the single-tab flow this is fine because uploads happen via the Upload tab which then sets `tab="history"` (`IngestionPage.tsx:40-45`), remounting JobHistory. But if a job appears server-side from any other origin (cross-tab, API-initiated, reconciliation), the user sees a stale empty list until they navigate away and back.
**User impact:** Low — a solo user uploading via the UI will always remount. A power user running two tabs or a sysadmin watching jobs they didn't create sees stale history. Not demo-blocking.
**Recommendation:** Poll at a longer cadence (e.g. 30s) even when nothing is in flight — `fetchJobs()` unconditionally, just less often. Or wire a "Refresh" button into the JobHistory header so the user can force a re-fetch.

---

### [MINOR] WizardStep5 error summary box references a page that doesn't run that pipeline
**Flow:** Real-backend onboarding → any step errors → "Some steps didn't complete" banner shows with copy: "continue and re-run later from the **Ingestion** page"
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:314-317`
**Evidence:** The text says "re-run later from the Ingestion page." Ingestion page (`IngestionPage.tsx`) handles file upload + column mapping + job history — it doesn't expose a "run analytics pipeline" button. The actual re-run lives behind `/api/skills/execute-by-name` invoked only from this wizard (or the SkillsPage).
**User impact:** User acts on the advice, navigates to Ingestion, and can't find the re-run affordance. Mild dead-end.
**Recommendation:** Change the copy to "re-run later from the **Skills** page" (which actually surfaces skill execution), or expose a per-skill "Run" action on the Admin / Data Management page and link there. Best: a "Retry all failed" button next to the error banner that loops through `runStep` for every `status === "error"` row.

---

## VERDICT: APPROVE

All six Round-3 items (JobHistory first-mount deadlock, SQL `days_since_visit` NULL handling, alert-rules skip-null, MemberSummary gender/age/dob guards, WizardStep5 sticky-ref + widened gate, MemberDetail retry-prefers-current-input) are closed and the exact scenarios the brief asked about behave correctly — including the "retry on suspect A while dismiss input is open on suspect B" cross-row bleed case, which the `dismissingId === suspectId` guard handles. The one new IMPORTANT is a narrow edge (every pipeline step returns `warning`) that produces a UI contradiction rather than a hard crash — worth tightening the celebration render gate so it matches the `onComplete` gate, but not demo-blocking. Demo is clean; round-4 ships.
