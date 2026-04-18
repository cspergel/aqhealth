# Adversarial Security Review — AQSoft Health Platform (Round 4)

**Reviewer:** The Adversary
**Date:** 2026-04-17
**Scope:** Diff since round 3 — focus on the three round-3 IMPORTANTs the user fixed (`days_since_visit` alert flood, WizardStep5 onComplete race, MemberDetail retry dismiss-reason integrity), plus the user-picked `JobHistory hasFetchedOkRef` and the `MemberSummary.genderLabel` helper.

---

## ROUND-3 CLOSED (verified)

- **IMPORTANT — `days_since_visit` fix was cosmetic; SQL still coalesced to 9999 and alert engine hardcoded 9999.** Closed: `member_service.py:135-137` now produces a nullable `days_since_visit` column (the `func.coalesce(..., 9999)` wrapper is gone; the comment at lines 132-134 explicitly documents that a sentinel would trip every "days not seen >= N" alert rule). `alert_rules_service.py:212-215` now `continue`s the loop when `row.last_visit` is falsy rather than substituting 9999. A fresh tenant with zero claim history will no longer produce a flood of "Member not seen > 180 days" triggers. The per-row filter path (`having_filters["days_not_seen"]` at line 228, `sq.c.days_since_visit >= N`) now evaluates to NULL (not true) for no-visit members — see NEW finding below for the semantic trade-off this introduces, but the flood is genuinely stopped.

- **IMPORTANT — WizardStep5 retry fires `onComplete()` during retry's "running" window.** Closed: `WizardStep5Processing.tsx:102, 255-268` adds a sticky `hasNotifiedCompleteRef` so `onComplete` fires exactly once per mount, and widens the gate to require `steps.every(s => s.status === "complete" || s.status === "warning")` AND `steps.some(s => s.status === "complete")`. A retry flipping a step back to `running` no longer re-satisfies the gate (a `running` step fails the "every terminal" check). The `hasRealCompletion` clause blocks all-stub pipelines from advancing. The `WizardShell` renders `current.component` conditionally by `currentStep` index, so a user who leaves step 5 and returns remounts the component and gets a fresh ref — legitimate re-runs are not locked out.

- **IMPORTANT — MemberDetail retry dismiss-reason integrity.** Closed: `MemberDetail.tsx:143-159`. `retryFailed` now reads `dismissReason.trim()` live and uses it when `dismissingId === suspectId && currentReason` is truthy; falls back to `last.reason` snapshot only when the panel is closed or empty. Synchronous-click call site means the closure is fresh at click time. Audit trail integrity for `dismissed_reason` is preserved.

- **MINOR — JobHistory first-mount deadlock.** Closed: `JobHistory.tsx:42, 71` adds `hasFetchedOkRef` and changes the poll predicate to `!hasFetchedOkRef.current || hasInFlight`. A transient first-mount 500 no longer strands an empty `jobsRef` forever. See NEW finding for the opposite failure mode (token expiry leaves the ref stuck at `true`).

- **CROSS — `MemberSummary.tsx` genderLabel helper.** Functionally closed for Contractualist: the ternary-chain gender rendering is replaced with a `genderLabel()` helper that normalizes `M`/`F`/`MALE`/`FEMALE` and treats empty/unknown explicitly. XSS-safe (React escapes output). See NEW finding for unusual-input handling.

---

## STILL OPEN (in-scope round-3 items NOT fixed)

- **IMPORTANT — `to_char` docstring claim is false** (journey_service.py:271-273). Unchanged. SQLAlchemy does not auto-translate `func.to_char` to SQLite `strftime`. Tests running under aiosqlite will silently zero out cost data via the broad `except Exception`.
- **IMPORTANT — `dashboard.py:/summary` unbounded `count(MemberGap)` query with no index hint or cache** (dashboard.py:155-158). Unchanged. Scalability cliff at real data volume.
- **MINOR — `normalizeUploadResponse` `String(resp.job_id)` without validation** (FileUpload.tsx:43-71). Unchanged. `String(null) === "null"` still slips through; the downstream `/api/ingestion/null/confirm-mapping` POST produces a generic 422 with no root-cause hint.
- **MINOR — `lastFailedAction` not reset on `[memberId]` prop change** (MemberDetail.tsx). Unchanged. Long-lived mount with `memberId` prop transition leaks per-row state into the new member's view if suspect IDs happen to collide.
- **MINOR — Onboarding mock bakes Pinellas sales geography into public demo bundle** (mockApi.ts:1087-1122). Unchanged — accepted risk per round 3.

All round-2 items not touched in round 3 (`/api/journey/members` unbounded search, `/api/skills/execute-by-name` catalog leak, `_execute_step` `str(e)` spread, journey ORDER BY loss on search, JobHistory no backoff, FileUpload 413/415 unreachable, mockApi demo schema exposure, `_build_claim_event` trust boundary), and all round-1 unfixed items (path traversal in uploads, read-into-memory size check, payer_api.py traceback leak, pool_recycle, ADT webhook fallback secret, passlib startup-warn, CSP, OAuth `state`, ALLOW_DEFAULT_SECRET, global exception handler, `fhir_id` fallback, CORS wildcard) remain open.

---

## DEFERRED BY USER (not re-flagged)

All auth/PHI/RBAC/OAuth/rate-limit/audit-log items, `admin123` seeds, DEMO_MODE Tuva bypass, clinical-note prompt injection, path traversal in `ingestion.py:218`, Dockerfile-runs-as-root, Alembic migrations.

---

## NEW FINDINGS (round-4 fixes introduced these)

### [IMPORTANT] `days_not_seen` server-side filter silently excludes no-visit members — inverted inclusion semantics relative to the UI
**Location:** `backend/app/services/member_service.py:227-228`
**Evidence:**
```python
if having_filters.get("days_not_seen") is not None:
    outer = outer.where(sq.c.days_since_visit >= having_filters["days_not_seen"])
```
Round 3 made `days_since_visit` nullable. Postgres `NULL >= 180` evaluates to NULL, which `WHERE` treats as false → those rows are excluded. Before the fix, the 9999 coalesce meant `days_not_seen >= 180` over-matched (included every no-visit member); the fix flipped that to under-matching (excludes them). A care manager who applies the "Days not seen >= 180" filter on the Members page to find patients to outreach will now see zero results for a fresh tenant, the same population the UI used to over-flag. The UI presents this as "no stale members" when the reality is "we have no claim data to judge." No visible indicator distinguishes the two states. The same null-elides-row effect also applies to `sort_by=last_visit desc` — the `.nullslast()` call is correct, but the filter path has no equivalent "include nulls when the user asks for stale members" opt-in.
**Risk:** Operational integrity in the opposite direction from round 3 — care managers miss members who genuinely should be surfaced because the backend can't distinguish "no visit" from "no data". Compounds when a tenant has partial claims coverage (some providers feed claims, others don't) — those panels show spurious "all current" filter results.
**Recommendation:** Treat the filter's null semantics as a product decision, not an accident. Either (a) surface an explicit "include members with no visit data" checkbox next to the filter in the UI, backed by an additional `include_no_visit_data: bool` query param that translates to `or_(sq.c.days_since_visit >= N, sq.c.days_since_visit.is_(None))`; or (b) pick one inclusion rule ("no visit data counts as overdue") and document it, matching the alert engine's opposite choice explicitly. Whichever path, add a regression test that pins the behavior: one fresh tenant (no claims), one mixed tenant, and one fully-claimed tenant, asserting the expected `days_not_seen >= 180` result counts for each.

---

### [MINOR] `JobHistory hasFetchedOkRef` never resets — token expiry mid-session leaves the poller in "silently failing forever" state
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:42, 50, 71`
**Evidence:**
```js
const hasFetchedOkRef = useRef(false);
...
const fetchJobs = async () => {
  try {
    const res = await api.get("/api/ingestion/jobs");
    ...
    hasFetchedOkRef.current = true;   // <-- set once, never reset
    setJobs(items);
  } catch {
    // Transient error — keep polling; next tick may succeed.
  } finally { ... }
};
...
if (!hasFetchedOkRef.current || hasInFlight) fetchJobs();
```
Once the first fetch succeeds, `hasFetchedOkRef.current = true` forever. If the access token expires mid-session and every subsequent `api.get('/api/ingestion/jobs')` returns 401, the catch block silently swallows and the poll only continues if `jobsRef` shows any in-flight job. Scenario: user uploads a file at t=0, `jobsRef` now has a `"processing"` row → in-flight → poll continues → 401 → catch swallows → jobs state never updates → UI shows "processing" stuck indefinitely with no hint that auth expired. The user sees a frozen row; the 401 signal is invisible. Secondary concern: a backend that permanently returns stale `"queued"` jobs keeps the poll hitting `/api/ingestion/jobs` every 5s forever (no max-attempts / backoff — also an open round-2 item). The `hasFetchedOkRef` pattern also doesn't help if the FIRST fetch ever fails and the user then navigates away and comes back without remounting (e.g., if a parent keeps JobHistory mounted across tabs) — the ref stays at its previous value.
**Risk:** Silent failure of the ingestion monitor under realistic auth-token expiry. Blast radius: ingestion page users see permanently stuck rows with no recovery path short of a page reload.
**Recommendation:** On repeated fetch failures (3+ consecutive catches), surface a "Lost connection — refresh to continue" banner and stop polling. In the catch block, increment a consecutive-failure counter and clear it on success; once it hits 3, render an inline warning. Alternatively, distinguish 401 specifically in the catch (`if (e?.response?.status === 401)` → hard-stop poll and trigger the app's auth refresh flow). The cheapest fix that preserves today's behavior: `catch (e) { if (e?.response?.status === 401) hasFetchedOkRef.current = false; }` — this at least ensures the recovery path re-triggers once the token refreshes.

---

### [MINOR] `MemberSummary.genderLabel` leaks raw untrusted string for any value outside the M/F/UNKNOWN whitelist — no length bound
**Location:** `frontend/src/components/journey/MemberSummary.tsx:32-39, 73`
**Evidence:**
```tsx
function genderLabel(g: string | null | undefined): string {
  if (!g) return "gender unknown";
  const upper = g.trim().toUpperCase();
  if (upper === "F" || upper === "FEMALE") return "Female";
  if (upper === "M" || upper === "MALE") return "Male";
  if (upper === "U" || upper === "UNKNOWN" || upper === "") return "gender unknown";
  return g;                  // <-- raw untrusted fallback
}
```
The fallback `return g` passes through any value that doesn't match the whitelist. Backend sources for `member.gender` include ingestion (normalized to M/F/U — safe), and FHIR/Humana/eCW payer adapters (`payer_api_service.py:638` defaults to `"U"`, but `fhir_service.py:202` and `payer_adapters/ecw.py:863` accept whatever the upstream FHIR server sends without normalization). FHIR valid `administrative-gender` values include `other` and implementation-specific extensions, and a non-conformant adapter could emit anything — `"NB"`, `"Non-binary"`, `"O"`, or on malformed data `"<script>alert(1)</script>"`. React auto-escapes, so stored XSS is blocked, but:
(1) A 500-char free-text value ("attack did not work") blows out the inline layout (the label sits inside `flex items-center gap-3` with sibling spans — no truncation / max-width);
(2) Anything containing CR/LF renders as a single-line with literal whitespace collapsing — visually chaotic but not harmful;
(3) A benign but unexpected value like FHIR `"other"` renders as `other` (lowercase, not normalized) which looks sloppy next to the case-normalized `Female`/`Male`.
**Risk:** UI breakage / inconsistency when a non-whitelisted value arrives from any upstream. No security impact thanks to React's escaping, but confidence in the display degrades as more payer adapters are added.
**Recommendation:** Tighten the fallback: truncate to 20 chars, then title-case: `return g.slice(0, 20).replace(/^./, c => c.toUpperCase());`. Or return `"gender unknown"` for anything outside the whitelist (fail-closed for display consistency). Defense-in-depth: normalize gender at the API boundary (member_service.py:404) so the frontend never sees raw FHIR-variant strings.

---

### [MINOR] `WizardStep5Processing` retry of the LAST failed step can re-fire `onComplete` after the retry succeeds, but the parent state `step5Complete` is already true — benign latch, but worth noting for idempotency
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:256-268`, `frontend/src/pages/OnboardingPage.tsx:100-102`
**Evidence:**
```tsx
// OnboardingPage.tsx
const handleStep5Complete = useCallback(() => {
  setStep5Complete(true);
}, []);
```
The sticky `hasNotifiedCompleteRef` fires `onComplete` exactly once per mount. But if the user navigates back to step 4, edits something, returns to step 5, the WizardShell unmounts/remounts the step component (WizardShell renders `current.component` which is re-built on each `currentStep` change), so the ref resets and `onComplete` fires again on the new pipeline run. That's fine — idempotent setter. However, if the user retries a failing step successfully AFTER `onComplete` already fired (because the gate was satisfied by `warning` terminal state plus at least one `complete`), the retry's `complete` transition re-passes the gate, but `hasNotifiedCompleteRef.current === true` blocks re-fire. Good. The benign concern: if the parent has imperative work in `handleStep5Complete` (API call, tenant status patch), making that work non-idempotent would be a footgun when WizardStep5Processing remounts across step navigation. Today `handleStep5Complete` only sets a React state boolean, which is idempotent. Flag for when the callback grows.
**Risk:** Low / future-proofing. If a future change has `handleStep5Complete` POST to the backend (e.g., to mark onboarding complete server-side), step-navigation remount will re-POST on each completed pipeline run.
**Recommendation:** Guard the parent callback with its own latch (`if (step5Complete) return;` at the top of `handleStep5Complete`), or document on `WizardStep5Processing` that `onComplete` fires once per mount and the parent is expected to be idempotent.

---

### [MINOR] `alert_rules_service.days_since_visit` rule evaluation silently skips no-visit rows — an attacker who can delete a member's claims rows (insider/DBA/compromised ingestion worker) can suppress the "not seen in >180 days" alert for that member
**Location:** `backend/app/services/alert_rules_service.py:212-215`
**Evidence:**
```python
for row in result.all():
    if not row.last_visit:
        # No visit data -> not a trigger. A sentinel like 9999 would
        # fire "member not seen > 180" on every fresh tenant.
        continue
    value = (today - row.last_visit).days
    if _compare(value, rule.operator, threshold):
        triggers.append(...)
```
The rule engine treats "no last_visit" as "don't alert" rather than "alert that we have no data on this member." This is the correct choice for a fresh tenant (the whole point of round 3). But it's also the configuration an insider would exploit to hide a specific member from care-management outreach: delete the member's claim rows (via a DBA-level DELETE, a compromised ingestion worker, or a future admin-only "purge member data" route) → `last_visit` becomes NULL → member disappears from the alert queue. The old 9999 sentinel happened to fail closed for this specific threat; the new nullable version fails open. The `data_lineage` table logs writes but typically not deletes (and the memory notes confirm there's no PHI audit log). Detection is hard.
The exploitability is bounded by "who can null last_visit?" — no current user-facing route does this; it requires DB access or a future path. The current-user threat model is low. Flagged because the fix's directional choice (null = benign, not null = attention) inverts the failure mode, and similar choices downstream (expenditure, scorecards) will compound if they adopt the same pattern without thinking through the suppression angle.
**Risk:** Low today (no exploit path for authenticated user-level adversary); moderate if a future route adds bulk-delete or if ingestion gets a "remove claims for member" endpoint.
**Recommendation:** Add a complementary "data completeness" rule class: `DataCompletenessRule` that fires when a member has zero claims older than 30 days and is still enrolled. This separates the two concerns (overdue visit vs. missing data) cleanly. In the short term, add a test that seeds a member with claims, then deletes the claims, then asserts the member appears in a daily "missing-data" report. That's cheaper than full audit logging and catches the scenario.

---

### [MINOR] `runStep`'s retry path does not clear `errorText` on the NEXT error — error state can accumulate confusingly across retry attempts
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:143-169`
**Evidence:**
```tsx
const runStep = useCallback(async (key: string, skillName: string) => {
  setSteps((prev) =>
    prev.map((s) => (s.key === key ? { ...s, status: "running", errorText: null } : s)),
  );
  try {
    const res = await api.post("/api/skills/execute-by-name", { action: skillName });
    const result = res.data;
    const isStub = result.status === "stub" || result.status === "not_implemented";
    const isFailed = result.status === "failed" || result.status === "error";
    setSteps((prev) =>
      prev.map((s) =>
        s.key === key
          ? {
              ...s,
              status: isFailed ? "error" : isStub ? "warning" : "complete",
              resultText: isStub ? "Not yet implemented" : result.summary || result.message || "Done",
              errorText: isFailed ? (result.message || "Step failed") : null,
            }
          : s,
      ),
    );
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err.message || "Failed";
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, status: "error", errorText: msg } : s)),
    );
  }
}, []);
```
The retry's initial state update clears `errorText: null` (good) but does not clear `resultText`. If the previous attempt produced a `result.message` (e.g., a stub-warning variant that ran the step to `"warning"` with a descriptive resultText) and the retry now transitions to `"error"`, the error row renders the error text but the PipelineStepRow only shows `resultText` for `complete` status (line 533), so this is fine by render guard. The concern is in the reverse direction: if a retry succeeds (transitions to `"complete"`), the step's `resultText` now reflects the retry's success, overwriting any prior failure context. No audit trail of "this step failed once then succeeded" survives. For onboarding, that's OK. For a future "pipeline health" dashboard reading the same data structure, the step-history loss is a trap.
**Risk:** Low / forward-looking. Not a security or availability issue.
**Recommendation:** Add a `history: Array<{status, timestamp, message}>` per step instead of overwriting `status/resultText/errorText` in place. Cheap, makes retries observable, and the data is ready when a pipeline-audit view gets built.

---

## VERDICT: APPROVE

The three round-3 IMPORTANT findings are genuinely closed this time — the `days_since_visit` SQL and alert engine now both respect NULL, the WizardStep5 onComplete race is gated by a sticky ref plus a correctness-strengthened gate, and the MemberDetail retry reads the live dismiss reason from the input rather than the stale snapshot. The user-picked JobHistory `hasFetchedOkRef` fix closes the round-3 MINOR first-mount deadlock. The new findings are calibrated: one IMPORTANT (filter semantics inverted — care managers need an explicit inclusion toggle to avoid missing no-data members), and four MINORs that are either forward-looking (future-attack-surface, idempotency latch, retry history) or edge-case (token-expiry silent polling, raw gender fallback). None of the round-4 changes introduced a regression worth blocking on. Ship this session; address the `days_not_seen` filter semantics before the first Pinellas pilot touches real claims data with gaps.
