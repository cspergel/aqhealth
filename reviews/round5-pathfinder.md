# The Pathfinder — Round 5 Review

**Project:** AQSoft Health Platform
**Date:** 2026-04-17
**Scope:** Verify round-4 fixes end-to-end; walk every user flow the brief called out.

**Note on method:** Bash was denied this round, so I could not run `git diff HEAD` directly. Review is based on reading the changed files end-to-end against the brief's claim list (`WizardStep5Processing.tsx`, `member_service.py`, `journey_service.py`, `MemberTable.tsx`, `OnboardingPage.tsx`, `mockApi.ts`) plus their callers and consumers.

---

## ROUND-4 CLOSED (verified end-to-end)

- **[IMPORTANT] WizardStep5 all-warning celebration mismatch** — `WizardStep5Processing.tsx:255-268, 300-320, 344-345`. The fix is clean: `pipelineSucceeded = allDone && allTerminalOk && hasRealCompletion` is a shared predicate used by *both* the celebration render (`:345`) and the `onComplete` gate (`:265-268`). I walked the scenarios:
  - **All-warning:** every step `"warning"` → `hasRealCompletion=false` → `pipelineSucceeded=false` → celebration suppressed. New amber "No pipeline steps ran" card renders at `:300-320` with accurate copy ("backend skills aren't wired up yet, so your dashboard will be empty"). `onComplete` never fires; no contradictory "ready" screen. Closed.
  - **Mixed warning + complete:** at least one `"complete"` → `hasRealCompletion=true`, no error → celebration shows, `onComplete` fires, `step5Complete=true`. Closed.
  - **Edge: render-gate exclusivity** — the amber card's predicate `allDone && !anyFailed && !hasRealCompletion && allTerminalOk` and the celebration's `pipelineSucceeded` are mutually exclusive (amber fires only when `hasRealCompletion=false`, celebration only when `hasRealCompletion=true`). No double-rendering. Clean.

---

## STILL OPEN (carry-overs, explicitly parked by user)

- `JobHistory` cross-tab staleness + error-banner wording — `JobHistory.tsx:70-76` predicate still skips poll when nothing's in flight.
- `WizardStep5` error banner still reads "re-run later from the Ingestion page" (`:339`) — actual re-run lives behind `/api/skills/execute-by-name`, not in IngestionPage.
- Round-3/4 carry-overs: TuvaPage `useDemo` badge, OrgDiscoveryReview confirm-structure 422, ColumnMapper flash/timeout, WizardStep5 demo-mode error path, Dashboard/Members retry on load failure, FileUpload size cap, Reports synchronous, token-refresh `returnTo`, ClinicalExchange console.error-only handlers.

---

## NEW FINDINGS

### [IMPORTANT] WizardStep5 all-warning: user is trapped in the wizard with no way forward
**Flow:** Real-backend onboarding on a fresh tenant with no skills wired → Step 5 runs → all 5 return `status: "stub"` → every row becomes `warning` → `pipelineSucceeded=false` → `onComplete` never fires → `step5Complete` stays `false` in `OnboardingPage.tsx:100-102` → `nextDisabled = (currentStep === 4 && !step5Complete) = true` (`OnboardingPage.tsx:161-163`).
**Location:** `frontend/src/pages/OnboardingPage.tsx:161-163` × `frontend/src/components/onboarding/WizardStep5Processing.tsx:300-320`
**Evidence:** The amber card now correctly says "Continue to finish setup and check back once the skills are enabled" — but there's no *way* to continue. The Finish button ("Go to Dashboard") is disabled because `nextDisabled=true`. The only escape is "Exit Wizard" (top-right, `OnboardingPage.tsx:188-208`), which navigates home but does **not** set `localStorage.setItem("onboarding_complete", "true")` — so on next reload, `OnboardingPage.tsx:56-60` will redirect the user back into the same wizard. They're in a loop.
**User impact:** Tenant admin on a sandbox/stub environment sees an amber "no steps ran" card that tells them to "continue to finish setup," but the button is greyed out. Their only escape (Exit Wizard) dumps them right back into the wizard on next login. Round 4's fix addressed the *contradictory* UI (success + disabled button), but the underlying dead-end is still there.
**Recommendation:** When the pipeline all-warned, enable the Finish button anyway — the amber card's copy already explains what the user is acknowledging. Either widen the enable-gate (`nextDisabled = (currentStep === 4 && !step5Complete && !allWarningAcknowledged)`) and add an explicit "Continue anyway" handler that calls `handleFinish`, or — simpler — let `WizardStep5Processing` also call `onComplete?.()` in the all-warning case (with a flag like `onComplete({ stub: true })`) so the parent can mark onboarding "complete-with-caveats" and persist `onboarding_complete=true`. Otherwise the amber card is a polite apology that leads to an infinite loop.

---

### [IMPORTANT] "Not seen in 180 days" filter label is now a lie — never-seen members are silently bundled in
**Flow:** User opens `/members`, applies the "Not Seen 6+ Mo" preset (or "180+ days" dropdown) → backend `member_service.py:227-235` now ORs `(days_since_visit >= 180) | (days_since_visit IS NULL)` → frontend table shows a mixed set: genuinely-overdue members (red "231d ago") AND fresh-enroll / no-visit-history members (empty last-visit cell + muted "--").
**Location:** `backend/app/services/member_service.py:227-235` (widened filter) × `frontend/src/components/members/MemberTable.tsx:230-242` (two rendering modes with no label distinction) × `frontend/src/components/members/MemberFilters.tsx:80-87` (label says "Not Seen In: 180+ days")
**Evidence:** `MemberTable.tsx:232` just renders `m.last_visit_date` (empty string for never-seen), and `MemberTable.tsx:240` shows `"--"`. There's no badge, tooltip, or row color signaling "this member has no visit history ever." A care manager filters to "Not Seen 180+ days" expecting a followup list and gets a population they can't distinguish without scanning the rightmost muted cell on each row. The stats bar at `MembersPage.tsx:248-251` also tallies them as "Members" without breaking out "no-visit" vs "overdue."
**User impact:** A pre-Pinellas care manager using this filter to build an outreach list can't tell which members are overdue (chart available, recent problem list, known PCP) vs which are newly-enrolled with no data (need a new-member welcome workflow, not an overdue-visit nudge). Two operationally different populations get the same filter treatment with no visual distinction.
**Recommendation:** Either (a) split the backend filter into two query params (`days_not_seen=180` excludes nulls; `include_never_visited=true` adds them) and surface as separate filter chips ("180+ days overdue" + "Never seen"), or (b) keep the ORed semantics but add a "No visit history" muted chip/badge to the Last Visit cell in `MemberTable` when `last_visit_date` is empty — so the row self-identifies. Minimum fix: update the MemberFilters label from "Not Seen In" to "Not Seen In (incl. never-seen)" so the UI doesn't lie.

---

### [MINOR] Mock API has no `/api/members/{id}` detail handler — real backend contract change is unshipped to demo mode
**Flow:** Round-4 aligned `get_member_detail`'s null convention (dob/pcp/plan coerce to `""`, risk_tier stays null). mockApi.ts has a handler for `/api/hcc/suspects/{memberId}` (`mockApi.ts:1234-1238`) but **no handler** for `/api/members/{member_id}`.
**Location:** `frontend/src/lib/mockApi.ts` (grep for `/api/members` returns only the list + stats handlers at `:1538, :1571`)
**Evidence:** In demo mode, any component that calls `api.get('/api/members/M1001')` will miss all mock branches and either fall through to live axios (which fails on `aqhealth.ai`) or return undefined depending on the mockApi's fall-through branch. Live inspection shows **no frontend component actually calls this endpoint** (`/api/members/{id}` is consumed by zero callers), which is why this hasn't been noticed — but the backend endpoint change the brief claims to have shipped is entirely untested through the demo-mode pipeline.
**User impact:** Low at demo time (nothing calls it). But if a future feature adds member-detail fetching (the `members.py:116-126` endpoint clearly exists for a reason), demo mode will silently fail. Contract drift between mock and real accumulates.
**Recommendation:** Either (a) add a mock handler for `/api/members/{id}` that returns a shape matching the new backend — dob/pcp/plan coerced to `""`, risk_tier null for mock members whose tier is null — or (b) delete the unused `@router.get("/{member_id}")` route if no consumer is planned. Don't leave an endpoint hanging that's already diverging from its mock.

---

### [MINOR] Members list risk_tier "unknown" pill renders as surfaceAlt/textMuted — when null is universal it's a dull gray wall
**Flow:** Fresh tenant with no RAF calculation run yet → every member's `risk_tier` is null → `MemberTable.tsx:161` calls `tierTag(null)` → `MemberTable.tsx:52` returns `{ bg: tokens.surfaceAlt, text: tokens.textMuted, label: "unknown" }` → 25 identical gray "unknown" pills stacked down the Risk column.
**Location:** `frontend/src/components/members/MemberTable.tsx:46-54, 212-228`
**Evidence:** The same muted gray tokens are used for other "no data" states across the table (ER count of 0, admits of 0, gaps of 0), so on a zero-data tenant the Risk column becomes visually indistinguishable from the rest of the table — no signal that *this* column is systemically missing data vs just being zero. Compare to Suspects/Gaps where 0 is legitimately 0, vs risk_tier where "unknown" means "analytics not run." The meaning is different but the styling treats them the same.
**User impact:** On a fresh tenant pre-pipeline, the Members page looks uniformly empty — tenant admin can't tell at a glance that the RAF engine hasn't produced tiers yet vs that all members happen to be low-population-risk. Cosmetic, not blocking. Once the pipeline runs, tiers populate and the issue vanishes.
**Recommendation:** Give the "unknown" pill a distinctive non-color styling — dashed border with `tokens.border`, or an em-dash "—" character instead of the word "unknown", or a tooltip ("Risk tier not yet computed"). Minimum: swap the label from "unknown" to "—" so it's clearly "data absent," not a new tier category.

---

## VERDICT: REQUEST CHANGES

The Round-4 IMPORTANT (all-warning celebration vs onComplete mismatch) is properly closed — shared `pipelineSucceeded` gate + explanatory amber card. But the underlying **user dead-end still exists**: on an all-stub pipeline the Finish button is disabled with no escape that persists (Exit Wizard loops back on reload). Given the brief explicitly asks "should Finish still be enabled so the user can exit the wizard?", the answer is yes — a polite amber card that tells the user to "continue" while greying out the continue button is worse than no fix.

The second IMPORTANT is a collateral from the `days_not_seen` NULL-widening: the filter now silently unions two operationally different populations (overdue vs no-history) with no UI distinction. Pre-Pinellas fix — care managers will build wrong outreach lists.

Two MINORs: the new `get_member_detail` backend shape has no mock counterpart and no frontend consumer (dead code unless someone adds a call), and the risk_tier "unknown" pill is visually indistinct from a zero-data tenant. Neither is demo-blocking.

Net: the contradictory-UI symptom is fixed but the wizard-deadlock root cause isn't — recommend one more round to enable Finish when the pipeline is all-warning-acknowledged.
