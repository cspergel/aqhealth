# The Pathfinder — User Journey Review

**Project:** AQSoft Health Platform
**Scope:** Full codebase — frontend flows, onboarding, error surfaces, demo mode, cross-component journeys
**Date:** 2026-04-17

---

## Findings

### [CRITICAL] Demo-mode ingestion/onboarding upload flow is silently broken
**Flow:** Demo user (aqhealth.ai) → Ingestion page OR Onboarding Wizard Step 2 → Drop CSV → "Upload and analyze"
**Location:** `frontend/src/lib/mockApi.ts` (no handlers for `/api/ingestion/upload`, `/api/ingestion/{id}/confirm-mapping`, `/api/ingestion/jobs/{id}`, `/api/onboarding/discover-structure`, `/api/onboarding/confirm-structure`); `frontend/src/components/ingestion/FileUpload.tsx:113`
**Evidence:** `mockApi.ts` final fallback is `const data = mockResponse !== null ? mockResponse : null;` returning `{ data: null, status: 200 }` for unmatched URLs. `FileUpload.handleUpload` then does `setIdentification(res.data)` — identification becomes `null`, the `{identification && ...}` block never renders, and the button returns to its pre-upload state with no error shown. Same pattern breaks every subsequent step (column mapper polling, org discovery). Grep confirms zero `/api/ingestion/` or `/api/onboarding/discover` or `/confirm-structure` keys in `mockApi.ts`.
**User impact:** A prospective partner on the public demo clicks "Upload and analyze" on a CSV → nothing happens → assumes the product is broken. The demo's entire data-loading story (the central differentiator of the platform) is non-functional.
**Recommendation:** Either (a) add mock handlers in `mockApi.ts` that return a fake `{job_id, proposed_mapping, sample_data, detected_type}` and simulate a `processing → completed` lifecycle, or (b) detect `isDemo` in `FileUpload` and short-circuit to a scripted demo experience. Either way, never silently return `data: null` — return a 501 in demo mode for unmocked routes so the UI can surface "Demo data only, upload disabled on the public demo."
**CROSS:** Structuralist (mock-surface coverage)

---

### [CRITICAL] TuvaPage uses raw `fetch()` bypassing demo-mode adapter
**Flow:** Demo user → Navigate to `/tuva` → All five `fetch()` calls hit real backend URL
**Location:** `frontend/src/pages/TuvaPage.tsx:196-200, 228, 918-920`
**Evidence:**
```ts
const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8090";
const [summaryRes, rafRes, pmpmRes, compRes] = await Promise.all([
  fetch(`${baseUrl}/api/tuva/raf-baselines/summary`).then(r => r.json()),
  ...
]);
```
`api.defaults.adapter = ...` in `mockApi.ts:298` only intercepts axios. The browser's `fetch` is never overridden. On the production demo (`aqhealth.ai`), `VITE_API_URL` is unset at build time, so these requests go to `http://localhost:8090` — which fails cross-origin/unreachable, triggering the fallback to `DEMO_SUMMARY` constants. That fallback does render eventually, but the network tab shows five failed CORS errors on every page load, and `triggerPipeline()` on the Pipeline tab uses `api.post("/api/tuva/run")` which IS intercepted and returns `data: null` — `setPipelineResult(res.data.message)` throws because `null.message`, user sees nothing or triggers the global ErrorBoundary.
**User impact:** Console full of errors on the production demo. Pipeline trigger button silently does nothing (or crashes the page to the "Something went wrong" fallback).
**Recommendation:** Replace `fetch()` with `api.get()` throughout TuvaPage so demo-mode adapter picks it up, and add `/api/tuva/*` mock handlers in `mockApi.ts`. Add a null-check or try/catch around `setPipelineResult(res.data?.message ?? "Triggered")`.

---

### [CRITICAL] HCC suspect capture/dismiss silently fails on real backend errors
**Flow:** User → Suspects page → Click on a member → "Capture" or "Dismiss" a suspect
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:74-76, 94-96`
**Evidence:**
```ts
} catch {
  // silently fail -- user will see no change
}
```
The comment is self-incriminating. The button spinner stops, but no toast, no error text, no status update. The user clicks, nothing happens, so they click again, and again.
**User impact:** This is the primary value-delivery action of the platform — confirming HCC suspects for RAF capture. If the backend errors (permissions, stale data, race with another coder), the coder gets zero feedback and may walk away thinking the capture succeeded, losing real revenue.
**Recommendation:** Surface the error inline on the suspect row: `setErrorByRow({[suspectId]: err.response?.data?.detail || "Could not save. Retry?"})` and display a retry button. Optimistically revert `localStatuses` on failure.

---

### [CRITICAL] AskBar shows literal "Something went wrong" with no recovery
**Flow:** User → Any page → Type question in Ask bar → Press Enter
**Location:** `frontend/src/components/query/AskBar.tsx:65-72`
**Evidence:**
```ts
} catch {
  setAnswer({
    answer: "Sorry, something went wrong. Please try again.",
    data_points: [], related_members: [], recommended_actions: [], follow_up_questions: [],
  });
}
```
Ground-rule violation: "Something went wrong" is always at least IMPORTANT per the Pathfinder brief, and this is the centerpiece conversational-AI feature. No distinction between network error, rate limit, LLM timeout, or bad input. No retry button — user has to retype the whole question.
**User impact:** The marquee "Ask about your data" feature looks broken every time the Claude API hiccups. No way to retry without retyping.
**Recommendation:** Capture `err.response?.status` and render actionable messages (`429 → "Rate limit — try again in a minute"`, `504 → "AI is slow — retry"`, network fail → "Check connection — retry"). Add a "Retry" button that re-posts the same `question + page_context`.

---

### [IMPORTANT] New tenant lands on empty Dashboard with no onboarding nudge
**Flow:** First-run real user → login → `/` Dashboard → all metrics are 0/null → "Loading dashboard..." → "No data available" or zeroed cards
**Location:** `frontend/src/pages/DashboardPage.tsx:170-176`; `frontend/src/components/layout/AppShell.tsx:151`; `frontend/src/App.tsx:134-156`
**Evidence:** `ProtectedRoute` redirects unauthenticated users to `/login`, but after login the default route is `<DashboardPage />`. Nothing checks tenant onboarding state or data presence. `DashboardPage` catches errors with just `<div>{error || "No data available"}</div>` — no "Start setup wizard" CTA, no link to `/onboarding`.
**User impact:** The first thing a new MSO admin sees is a broken-looking dashboard with zero numbers and a dead-end error. They have to know to navigate to "Setup Wizard" in the sidebar themselves.
**Recommendation:** In `App.tsx` or `DashboardPage`, check `localStorage.getItem("onboarding_complete")` OR a `/api/tenants/me` flag, and auto-redirect to `/onboarding` if false. On the empty-data state of Dashboard, render a centered card: "No data loaded yet. [Start Setup Wizard] or [Upload data]."

---

### [IMPORTANT] Dashboard and many list pages have no retry on load failure
**Flow:** User → Dashboard (or Members, Suspects, CareGaps, ClinicalExchange) → Network blip → Stuck error state
**Location:** `frontend/src/pages/DashboardPage.tsx:170-176`; `frontend/src/pages/CareGapsPage.tsx:115-120`; `frontend/src/pages/MembersPage.tsx:96-98` (worse — silent); `frontend/src/pages/ClinicalExchangePage.tsx:89`
**Evidence:** Dashboard error branch: `<div className="text-sm" style={{ color: tokens.red }}>{error || "No data available"}</div>` — no button. CareGapsPage: `<div className="text-sm" style={{ color: tokens.red }}>{error}</div>` — no retry. MembersPage swallows all errors into `setMembers([])` with no user signal at all. ClinicalExchangePage just `.catch((err) => console.error("Failed to load exchange data:", err))` — user sees empty tables with no indication anything went wrong.
**User impact:** Transient failure (token refresh race, deploy in progress, network flap) leaves the user with no way out except F5. On pages that swallow errors, they see empty data and assume "no results."
**Recommendation:** Every list/data page needs a consistent pattern: on catch, `setError("...")` AND render a `<button onClick={retry}>Retry</button>`. Create a shared `<ErrorState onRetry={...} />` component and use it everywhere.

---

### [IMPORTANT] Column-mapping processing poll has no timeout or cancel
**Flow:** Ingestion → confirm mapping → `pollStatus()` polls every 2s indefinitely
**Location:** `frontend/src/components/ingestion/ColumnMapper.tsx:120-136`
**Evidence:**
```ts
const pollStatus = () => {
  const interval = setInterval(async () => {
    try {
      const res = await api.get(`/api/ingestion/jobs/${jobId}`);
      const s = res.data.status as ProcessingStatus;
      setStatus(s);
      if (s === "completed" || s === "failed") { clearInterval(interval); ... }
    } catch {
      clearInterval(interval);
      setError("Lost connection while checking status.");
    }
  }, 2000);
};
```
No max-duration cap, no cancel button. If the backend job stalls in "processing" forever (common in async work-queues), the user watches an amber "Processing..." tag indefinitely with no way to cancel, kill, or start fresh. Also, `pollStatus` is a closure that keeps firing even if the component unmounts — classic memory leak since the interval is never cleaned up on unmount.
**User impact:** User stuck staring at "Processing..." for an hour. No way to cancel, no way to re-run. Navigating away continues the poll in the background (leaking).
**Recommendation:** (1) Store `intervalRef` in `useRef` and clear it in `useEffect` cleanup. (2) Add a 10-minute soft timeout that transitions to a "Still processing? [Check Job History] | [Cancel]" state. (3) Add a `POST /api/ingestion/jobs/{id}/cancel` endpoint and a "Cancel" button on the Processing UI.

---

### [IMPORTANT] JobHistory never polls — pending/processing jobs look stale forever
**Flow:** Ingestion → History tab → See a "processing" job → Wait
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:30-43`
**Evidence:** `useEffect(() => { fetchJobs(); }, [])` — fetches once on mount and never again. A job stuck in "processing" displays as "processing" forever unless user reloads. `fetchJobs` also silently swallows errors (`catch { /* silent */ }`), so if the API is down the user sees an indefinite spinner on mount.
**User impact:** User uploads file, switches to History to watch progress — the row stays "processing" forever even after it completes. They reload, see "completed." Confusing UX that undermines trust.
**Recommendation:** Poll `fetchJobs()` every 5s while any visible job has status `pending|processing`. Auto-stop when all jobs reach terminal states. Show a toast when a watched job completes.

---

### [IMPORTANT] WizardStep5Processing marks "all done" even when steps errored
**Flow:** Onboarding → Step 5 → One or more pipeline steps fail → Still advances to "Your dashboard is ready!"
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:164-175, 204, 220-222`
**Evidence:**
```ts
} catch (err: any) {
  setSteps(...status: "error"...);
  // Don't stop — continue to next step
}
...
setAllDone(true);
```
Then:
```ts
useEffect(() => { if (allDone) onComplete?.(); }, [allDone, onComplete]);
```
If every pipeline step errors, the wizard still shows the celebration screen with "Your dashboard is ready!" and enables the "Go to Dashboard" button. No retry for failed steps.
**User impact:** The MSO admin finishes the wizard believing the system ingested their data, clicks Dashboard, and sees empty/zero data. They have no idea which step failed or that they need to retry.
**Recommendation:** Track `anyFailed = steps.some(s => s.status === "error")`. If failed, replace the celebration block with: "Some steps didn't complete. [Retry failed steps] | [Continue anyway]" — and render each failed step's error text inline with a per-step "Retry" link that re-calls `api.post("/api/skills/execute-by-name", ...)` for just that step.

---

### [IMPORTANT] No file-size or file-type robustness on upload
**Flow:** User → Ingestion → Drop 500MB file OR a corrupt .csv
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:60-74, 102-119`
**Evidence:** `isValidFile` checks only the extension, not the MIME type. No size cap. `handleUpload` sends the entire file in a single `multipart/form-data` POST with no progress indication beyond "Uploading and analyzing..." and no `onUploadProgress` handler. Error surface is `err.response?.data?.detail || "Upload failed. Please try again."` — no distinction between 413 (too big), 415 (wrong type), 504 (timeout), or 500.
**User impact:** User drops a 1GB file → browser tab stalls for minutes → eventually generic "Upload failed." No way to know the file is too large. No progress bar during a legitimate large upload, so user assumes it's frozen.
**Recommendation:** Reject files >100MB client-side with a clear message ("Files over 100MB must be split — see [docs]"). Add `axios.onUploadProgress` to render a real progress bar. Map common HTTP status codes to specific user messages.

---

### [IMPORTANT] Token-refresh failure hard-reloads to login with no context
**Flow:** User idle → token expires → Makes any API request → Refresh fails → `window.location.href = "/login"`
**Location:** `frontend/src/lib/api.ts:62-66`
**Evidence:**
```ts
} catch {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  window.location.href = "/login";
}
```
User loses their current context (unsaved filter state, draft annotation, in-progress cohort build). Login page gives no "Your session expired, please sign back in" signal, and after login they go to `/` not the page they were on.
**User impact:** Editing a saved filter, typing a long annotation, or building a cohort → session expires → wiped to empty login screen. Work lost.
**Recommendation:** Before redirect, save `returnTo: window.location.pathname + window.location.search` to `sessionStorage`. On LoginPage, read it and on successful login `navigate(returnTo ?? "/")`. Also show "Your session expired — please sign back in" banner on LoginPage when returning from a forced redirect.

---

### [IMPORTANT] ClinicalExchange actions fail silently with only console.error
**Flow:** Clinical Exchange page → "Auto-respond" button OR "Generate Evidence"
**Location:** `frontend/src/pages/ClinicalExchangePage.tsx:109, 116, 125`
**Evidence:** Every handler ends with `.catch((err) => console.error("Auto-respond failed:", err))` — no toast, no inline message. User clicks "Auto-respond" → nothing happens → no clue whether it worked.
**User impact:** A compliance/coding user preparing a payer response cannot tell whether the evidence package generated. They might email an empty response or, worse, assume success.
**Recommendation:** Wire each handler into a toast/snackbar system. Disable the button with "Generating..." while in-flight. Show error inline on the row with a retry link.

---

### [IMPORTANT] Reports generation has no async/polling model
**Flow:** Reports → Click "Generate Report"
**Location:** `frontend/src/pages/ReportsPage.tsx:84-97`
**Evidence:** Single `api.post("/api/reports/generate")` blocks until the backend returns. For a 20-section AI-narrative report this can be 30-90s, during which the button shows "Generating..." and the user has no signal of progress, no cancel option. If the request times out at the proxy layer (nginx default 60s), user sees a network error but the job may have succeeded server-side.
**User impact:** Ambiguous state — did it generate or not? User clicks again, triggering a duplicate.
**Recommendation:** Convert to async job pattern: POST returns `{job_id}`, then poll `/api/reports/jobs/{id}` every 2s. Show indeterminate progress + cancel button. Check JobHistory for completed reports before re-generating.

---

### [MINOR] DataQualityPage divides by zero when total_rows is 0
**Flow:** DataQuality → Overview tab with an empty report
**Location:** `frontend/src/pages/DataQualityPage.tsx:197-199`
**Evidence:**
```tsx
trend={`${((latest.valid_rows / latest.total_rows) * 100).toFixed(1)}%`}
```
If `total_rows === 0`, this yields `NaN%`.
**User impact:** First quality report or an empty batch renders "NaN%" in metric cards — looks broken.
**Recommendation:** `latest.total_rows > 0 ? ((latest.valid_rows / latest.total_rows) * 100).toFixed(1) : "0"`.

---

### [MINOR] LoginPage collapses all errors to "Invalid email or password"
**Flow:** User → Login → Network down / server 500 / rate-limited
**Location:** `frontend/src/pages/LoginPage.tsx:13-22`
**Evidence:**
```ts
try { await login(email, password); navigate("/"); }
catch { setError("Invalid email or password"); }
```
A 500, CORS error, or dropped connection all show "Invalid email or password," misleading users into resetting a perfectly good password.
**User impact:** Users in a network outage spam password-reset emails; support tickets pile up.
**Recommendation:** Branch on `err.response?.status`: 401/403 → "Invalid email or password"; 429 → "Too many attempts. Try again in a minute."; other/network → "Can't reach the server. Check your connection."

---

### [MINOR] LoginPage has no "Forgot password," no demo-mode link, no help
**Flow:** First-time visitor to `aqhealth.ai` without `?demo=true` → Login screen
**Location:** `frontend/src/pages/LoginPage.tsx:37-76`
**Evidence:** The login form has only email + password + "Sign in." No "Forgot password" link, no "Try the demo" link, no support email, no tenant-selection affordance.
**User impact:** A partner who lands on `aqhealth.ai` without the `?demo=true` parameter sees a barren login screen with no path forward.
**Recommendation:** Add a "Try the demo" link that pushes `?demo=true` to the URL and reloads. Add "Forgot password" link (even if it just mailtos support). Add small text: "Contact your MSO admin for access."

---

### [MINOR] ProtectedRoute "Access Denied" only offers "Go to Dashboard"
**Flow:** User with role `provider` tries to visit `/financial` → Access Denied
**Location:** `frontend/src/App.tsx:87-122`
**Evidence:** The denied state has one button: "Go to Dashboard." If the user's role actually has no Dashboard access (e.g. the `auditor` role excludes the overview section check), this button could loop them back into another access-denied. Also, there's no "Request access" link or admin-email hint.
**User impact:** User confused about why they can't access a page and has no way to request access.
**Recommendation:** Show the user's role + allowed sections, and include a `mailto:admin@tenant.com` (pulled from tenant config) with prefilled subject "Requesting access to {page}."

---

### [MINOR] No unsaved-changes guard on ColumnMapper or filter builder
**Flow:** User → Ingestion → Confirm 50 column mappings → Accidentally clicks sidebar nav → All work lost
**Location:** `frontend/src/components/ingestion/ColumnMapper.tsx` (no `beforeunload` or route-leave guard); same pattern in `UniversalFilterBuilder`
**Evidence:** No `useBlocker` from react-router or `window.addEventListener("beforeunload")`. Navigating away mid-edit discards the mapping silently.
**User impact:** 5 minutes of manual column-mapping lost to a stray click.
**Recommendation:** Track `isDirty` state, install `useBlocker` from react-router v6.4+ to prompt "You have unsaved mapping changes. Leave anyway?"

---

### [MINOR] Sidebar "Setup Wizard" entry always visible, even post-onboarding
**Flow:** User who completed onboarding → Still sees "Setup Wizard" in sidebar → Clicks it → Gets redirected to `/` immediately
**Location:** `frontend/src/components/layout/Sidebar.tsx:135`; `frontend/src/pages/OnboardingPage.tsx:56-60`
**Evidence:** Wizard's `useEffect` redirects to `/` if `onboarding_complete` is set, but the sidebar link still appears. Clicking it flashes the wizard chrome briefly before redirecting — jarring.
**User impact:** Confusing dead end. Also, returning MSO admins who want to re-run the wizard (new payer data) have no clear path since it silently redirects.
**Recommendation:** Hide "Setup Wizard" from the sidebar when `onboarding_complete === "true"` OR rename to "Re-run Setup" and remove the auto-redirect. Add a "Reset and re-run" action on the DataManagement page.

---

### [MINOR] OrgDiscoveryReview "Skip" button silently advances without confirmation
**Flow:** Ingestion step 2 → Discovery shows 47 providers across 3 groups → User clicks "Skip"
**Location:** `frontend/src/pages/IngestionPage.tsx:35-38`; `OrgDiscoveryReview` skip handler
**Evidence:** `handleOrgSkip = () => setStep("columnMapper")` with no confirmation. User who accidentally clicks skip loses the discovered structure and has no way to rediscover short of re-uploading.
**User impact:** Accidental skip wastes an upload cycle.
**Recommendation:** Confirm skip: "Skip group assignment? You can re-run discovery later under Providers > Groups." Keep the discovered data in state so "Back" restores it.

---

## VERDICT: REQUEST CHANGES

The platform's core authenticated flows for data loading, HCC capture, and AI querying have consistent patterns of silent failure and non-actionable errors, and the public demo at aqhealth.ai has two showstopper gaps — unmocked ingestion endpoints and raw `fetch()` bypassing the demo adapter on the flagship Tuva page — that make the demo look broken to prospective partners. Onboarding's "success" screen fires even when pipeline steps fail, and long-running jobs (ingestion processing, report generation) lack cancel/retry/resume surfaces. Fixing the four CRITICAL findings and the pipeline-status polling pattern would take the experience from "demo-broken" to "demo-credible."
