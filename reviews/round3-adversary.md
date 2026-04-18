# Adversarial Security Review — AQSoft Health Platform (Round 3)

**Reviewer:** The Adversary
**Date:** 2026-04-17
**Scope:** Diff since round 2 — focus on the two round-2 regressions the user chose to fix (`func.strftime` → `func.to_char`, `days_since_visit = 999` → `None`) plus the adjacent frontend plumbing (`JobHistory` poller, `MemberDetail` retry, `WizardStep5Processing` onComplete gate, `FileUpload` normalize).

---

## ROUND-2 CLOSED (verified)

- **CRITICAL — `get_member_risk_trajectory` used SQLite-only `func.strftime` on Postgres.** Closed: `journey_service.py:278` now calls `func.to_char(Claim.service_date, "YYYY-MM")`. The `try` block (line 275) now wraps the `await db.execute(...)` call, so an `UndefinedFunctionError` on an unexpected dialect degrades gracefully to an empty `cost_by_month` instead of 500ing the whole endpoint. The `to_char` format string is a Python literal — no user input reaches the format argument, so no format-string injection.

- **IMPORTANT — `days_since_visit = 999` sentinel fired every stale-member alert for tenants with no visit data.** Partially closed at the API edge: `member_service.py:289` now emits `None` when visit data is absent, `members.py:43` types it `int | None`, and the frontend `MemberTable.daysColor` / `daysAgoLabel` (MemberTable.tsx:39-40, 62-63) + CSV export (MembersPage.tsx:156) handle null as "--". The user-visible flood is stopped. See NEW findings below — the server-side fix is cosmetic only; the DB query still coalesces to `9999` and the alert rules engine still hardcodes `9999`, so care-manager alert floods are unchanged.

---

## STILL OPEN (round-2 items NOT fixed)

All seven round-2 Adversary findings not touched this session remain open:

- **IMPORTANT — `/api/journey/members` has no `min_length`/`max_length` on `search` and does not escape `%`/`_`** — journey.py:96-123 unchanged. DoS + pattern-probing vector still live.
- **IMPORTANT — `/api/skills/execute-by-name` 400 leaks the full action catalog** — skills.py:125-130 unchanged.
- **IMPORTANT — `_execute_step` spreads `str(e)` into the JSON response** — skill_service.py:329-376 + skills.py:133-139 unchanged. Every authenticated user can surface SQL fragments / parameter values via a failing retry.
- **MINOR — `/api/journey/members` loses `ORDER BY` when `search` is supplied** — unchanged.
- **MINOR — `JobHistory` poll has no max-attempts / exponential backoff** — see the "rewritten but not hardened" finding below. Unmount race is fixed, but runaway polling on a stuck backend is unchanged.
- **MINOR — FileUpload's 413/415 branches unreachable because backend emits 400** — ingestion.py:201-214 still returns 400; FileUpload.tsx:163-168 still has the 413/415 branches. Same state as round 2.
- **MINOR — mockApi demo mode ingests real canonical field schema** — mockApi.ts:1053-1079 unchanged (and now expanded — see new demo-surface finding).
- **MINOR — `_build_claim_event` trust-boundary note on diagnosis_codes** — unchanged.

Plus every round-1 still-open item (path traversal in uploads, read-into-memory size check, payer_api.py traceback leak, pool_recycle, ADT webhook fallback secret, passlib startup-warn, CSP, OAuth `state`, ALLOW_DEFAULT_SECRET, global exception handler, `fhir_id` fallback, CORS wildcard) remains.

---

## DEFERRED BY USER (not re-flagged)

Payer OAuth base64 "encryption", frontend-only RBAC / missing `require_role`, `DEMO_MODE=true` auth bypass on Tuva router, JWTs in localStorage, no login rate limiting, no PHI audit log, `admin@aqsoft.ai/admin123` + `demo@aqsoft.ai/demo123` seeds, stored prompt injection via `corrected_answer`, clinical-note prompt injection, Dockerfile-runs-as-root, path traversal in ingestion.py:218, Alembic migrations.

---

## NEW FINDINGS (round-3 fixes introduced these)

### [IMPORTANT] `days_since_visit` round-2 "fix" is cosmetic — the 9999 sentinel still lives in the DB query and the alert engine, so care-manager alert floods are NOT actually stopped
**Location:** `backend/app/services/member_service.py:132-135`, `backend/app/services/alert_rules_service.py:211-216`
**Evidence:**
```python
# member_service.py — still coalesces to 9999 at SQL time
days_since_visit_col = func.coalesce(
    func.floor(func.extract("epoch", func.current_date() - last_visit_sq.c.last_visit_date) / 86400),
    9999
).label("days_since_visit")
```
```python
# alert_rules_service.py — alert engine still uses 9999 for "no visit"
for row in result.all():
    if row.last_visit:
        value = (today - row.last_visit).days
    else:
        value = 9999
    if _compare(value, rule.operator, threshold):
        triggers.append(...)
```
The round-2 fix changed `member_service.get_member_list` to emit `None` in the JSON response (line 289). But the **SQL query that produces the data still coalesces missing visits to 9999** (line 134), and the default seed rule `"Member not seen" days_since_visit > 180` (alert_rules_service.py:869) is evaluated against `value = 9999` for every member with no last_visit row. The frontend no longer renders "999 days", but the alerts table, every count of "stale members," `/api/alert-rules/evaluate`, and the `sort_by=last_visit` ordering still behave as though every no-visit member is massively overdue. The user-visible card reads "--" while the care-manager inbox is still flooded.
**Risk:** Operational integrity — the fix claims "alert flood" is resolved, but the alert pipeline is unchanged. A brand-new tenant still gets a full 180-day-overdue fire on every member the first time the alert engine runs.
**Recommendation:** (1) Change the SQL coalesce to `None` (drop the `9999` default; let the column be nullable). (2) In `alert_rules_service._rule_days_since_visit`, skip rows where `row.last_visit is None` rather than substituting 9999. Add a regression test: `evaluate("Member not seen")` against a panel with zero claims must produce zero triggers. (3) Same treatment for the `having_filters["days_not_seen"]` branch in `member_service.py:226` — a filter like `days_not_seen >= 1` currently matches every no-visit member.

---

### [IMPORTANT] WizardStep5 retry fires `onComplete()` during the retry's "running" window — onboarding advances before the retry actually resolves
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:138-165, 250-256`
**Evidence:**
```jsx
const runStep = useCallback(async (key: string, skillName: string) => {
  setSteps((prev) =>
    prev.map((s) => (s.key === key ? { ...s, status: "running", errorText: null } : s)),
  );
  try { ... } catch (err: any) { ... }
}, []);
...
useEffect(() => {
  if (!allDone) return;
  const anyFailed = steps.some((s) => s.status === "error");
  if (anyFailed) return;
  onComplete?.();
}, [allDone, steps, onComplete]);
```
Flow: all five pipeline steps finish, one in `error` state → `allDone` flips to true → user clicks Retry on the failing step → `runStep` synchronously sets that step's status to `"running"` and clears `errorText` → React re-renders → the gate effect runs with `allDone === true` and `anyFailed === false` (no step has `"error"` anymore) → `onComplete?.()` fires → wizard advances to the post-processing screen. The retry's actual `api.post` is still in flight; when it resolves (success or failure) the user is already off the screen. If it fails a second time, the error is invisible.
**Risk:** UX + data integrity. Onboarding marks a tenant "complete" before the retried ingestion/insights step is actually done. Downstream screens display zero/stale data; the user thinks the pipeline succeeded.
**Recommendation:** Track a `retryingCount` or check `steps.some(s => s.status === "running")` in the gate: `if (steps.some(s => s.status === "running" || s.status === "error")) return;`. Or gate `onComplete` on "every step is `complete` or `warning`" rather than the negative "none are error."

---

### [IMPORTANT] `MemberDetail` retry re-uses the ORIGINAL dismiss `reason`, silently discarding whatever the user just typed into the visible Reason input
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:117-151, 233-269`
**Evidence:**
```jsx
setLastFailedAction((prev) => ({ ...prev, [suspectId]: { type: "dismiss", reason } }));
...
const retryFailed = (suspectId: number) => {
  const last = lastFailedAction[suspectId];
  if (!last) return;
  if (last.type === "capture") handleCapture(suspectId);
  else handleDismiss(suspectId, last.reason);  // <-- frozen reason
};
```
The fix from round 2 correctly binds retry to the LAST FAILED action type (no longer silently flips dismiss → capture — nice). But it freezes the dismiss `reason` at the moment of failure. Meanwhile, the dismiss reason input (`<input value={dismissReason}>` at line 238) is still live and editable on the same row (`dismissingId === s.id` stays set because it's only cleared on success). A care manager sees their error, edits the Reason field to something more informative ("clinically not supported — see note from PCP on 4/15"), clicks Retry dismiss — and the server receives the old reason. The audit record shows a reason the user did not intend.
**Risk:** Medical-record integrity — the `dismissed_reason` persisted on `HccSuspect` is a HIPAA-adjacent audit field that justifies removing a diagnosis from the RAF submission. If it records a different string than the user authored at the time of the action, a RADV audit reconstructing "why was HCC X dismissed" gets a misleading answer.
**Recommendation:** On retry, re-read the current `dismissReason` state if `dismissingId === suspectId` (the dismiss UI is still open): `handleDismiss(suspectId, dismissingId === suspectId ? dismissReason.trim() : last.reason);`. Or clear `lastFailedAction[suspectId]` when `setDismissReason` changes, forcing the user to click the main Dismiss button rather than Retry, so the current input is used.

---

### [IMPORTANT] `to_char` docstring claim is false — "SQLAlchemy maps this to strftime on SQLite" is not a feature of SQLAlchemy, so any test/dev use against SQLite will still 500
**Location:** `backend/app/services/journey_service.py:271-273`
**Evidence:**
```python
# Monthly claim spend, keyed by YYYY-MM. Use to_char (Postgres; SQLAlchemy
# maps this to strftime on SQLite) rather than SQLite-only func.strftime,
# which was silently 500ing on Postgres.
```
SQLAlchemy does **not** auto-translate `func.to_char(...)` to SQLite's `strftime`. `func.to_char(col, 'YYYY-MM')` compiles to literal `to_char(col, 'YYYY-MM')` SQL on any dialect; SQLite has no such function, so running the trajectory test suite under the sqlite fallback — which the codebase does (`pytest` fixtures sometimes use `aiosqlite`) — will raise `sqlite3.OperationalError: no such function: to_char`. The surrounding `try/except Exception` (line 287) swallows it and returns an empty `cost_by_month`, so tests pass silently without exercising the feature. The exception broad-catch hides a dialect bug that will re-surface the moment anyone runs without `try/except` wrapping.
**Risk:** Future-maintenance trap — the docstring misleads the next engineer, and the broad `except Exception` mutes the test-harness signal that would reveal sqlite incompatibility. Also, on Postgres the `except Exception` now hides real DB errors (network drop, permission error, schema missing) — the trajectory silently zeros all cost data instead of surfacing the actual problem.
**Recommendation:** (1) Delete the false comment. (2) Either support both dialects explicitly (`func.to_char` in a dialect-dispatch helper, or compute `ym` in Python by iterating rows — the query is already bounded by `member_id`, so the row count is small) or mark the endpoint Postgres-only and assert at startup. (3) Narrow the `except`: catch only `sqlalchemy.exc.ProgrammingError` / `sqlalchemy.exc.DBAPIError`, let everything else bubble.

---

### [MINOR] `JobHistory` polling: the unmount-race fix is correct, but a thrown error inside the interval callback is not caught — will kill the timer silently
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:61-65`
**Evidence:**
```js
const interval = setInterval(() => {
  if (!isMountedRef.current) return;
  const hasInFlight = jobsRef.current.some((j) => IN_FLIGHT_STATUSES.has(j.status));
  if (hasInFlight) fetchJobs();
}, POLL_INTERVAL_MS);
```
Good news: the setInterval is long-lived, the `jobsRef` trick avoids re-creating timers on every jobs change, and `fetchJobs` catches its own errors. Bad news: `jobsRef.current.some` could throw if `jobsRef.current` gets set to a non-iterable (e.g., if a future `setJobs(<something>)` bypasses the `Array.isArray` guard, or React dev-tools coerces the ref). A thrown error inside a `setInterval` callback does NOT kill the timer on most browsers (it logs and continues), but combined with the absence of any max-retry / backoff, if `hasInFlight` is somehow always true (e.g., backend returns a stuck job with status "queued" for a week) the client hammers `/api/ingestion/jobs` every 5 seconds forever with no circuit breaker.
**Risk:** Client-driven load on a permanently stuck backend; same DoS-adjacent concern as round 2, now with a better poll shape but no backoff. Low severity because authenticated and bounded to a single endpoint.
**Recommendation:** Wrap the interval body in `try { ... } catch { logger.warn(...) }`. Add exponential backoff: after 10 consecutive polls with the same in-flight job IDs, flip the interval to 30s, then 60s, then require a manual refresh. Also add a "last updated" footer so the user can see the polling is alive.

---

### [MINOR] `normalizeUploadResponse` propagates `detected_type: null` and `job_id: null` without validation — the follow-on `confirm-mapping` request becomes `/api/ingestion/null/confirm-mapping`
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:43-71`
**Evidence:**
```js
return {
  job_id: String(resp.job_id),     // String(null) === "null"
  proposed_mapping: flatMapping,
  sample_data,
  detected_type: resp.detected_type,  // undefined/null passes through
  ...
};
```
`String(resp.job_id)` produces `"null"` or `"undefined"` if the backend ever returns those (contract drift, misconfigured test fixture, proxy rewriting body, or a malicious intermediate). The subsequent confirm step will POST to `/api/ingestion/null/confirm-mapping`, which FastAPI will reject as 422 Path Parse (not the catalog 404), but the UI treats this as a generic "Upload failed" without hinting at the real cause. Similarly, `detected_type: null` reaches the ColumnMapper as a falsy value.
**Risk:** Low — the round-2 error-UI catches this as a generic server error. But the round-3 empty-mapping check (`Object.keys(normalized.proposed_mapping).length === 0`) will NOT catch this case (mapping is fine; job_id is corrupt), so the user sees a surprising downstream 422 instead of a clean upfront "invalid server response" error.
**Recommendation:** Validate the response before returning the normalized object:
```js
if (typeof resp.job_id !== "number" || !resp.detected_type) {
  throw new Error("Invalid upload response (missing job_id or detected_type)");
}
```
Wrap the `normalizeUploadResponse(res.data)` call in a try/catch that surfaces the throw as a clean error state (`setError(...)`). Today, if `normalizeUploadResponse` throws (e.g., if `resp.proposed_mapping` is `null` and `Object.entries(null)` explodes), the `handleUpload` try/catch does catch the throw, but falls into the 400-vs-network-error branch logic that assumes `err.response` exists — producing the wrong message.

---

### [MINOR] `MemberDetail` `lastFailedAction` holds the user's `reason` string in memory for the lifetime of the component, with no redact/clear hook
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:59-61, 132-140`
**Evidence:** `lastFailedAction[suspectId].reason` is set to the raw user input and cleared only on successful retry or via `clearRowError` (which runs at the start of the next `handleCapture`/`handleDismiss`). If the user navigates to a different member by URL, the MemberDetail is re-mounted and state resets — but if the same component stays mounted while `memberId` prop changes (common with React key reuse), the stale `lastFailedAction` from member A leaks into the UI for member B. The reason text itself is user-authored ("clinical note mentions X, ruled out") and can contain quasi-PHI.
**Risk:** Cross-member state leak in a long session. Minor because the suspect list is keyed to `memberId` and the component's `suspects` prop changes would force React to re-render, but the state objects keyed by numeric `s.id` could collide if two members have overlapping suspect IDs (they shouldn't, but the key isn't tenant-qualified).
**Recommendation:** Clear `errorByRow` and `lastFailedAction` in a `useEffect(() => { setErrorByRow({}); setLastFailedAction({}); }, [memberId]);`. Keeps the state local to a single member view.

---

### [MINOR] Onboarding discover-structure mock bakes the live sales-target geography ("Pinellas", "Clearwater", "Palm Harbor") + plausible MD names into the public demo bundle
**Location:** `frontend/src/lib/mockApi.ts:1087-1122`
**Evidence:** Mock returns three groups tied to Pinellas County, FL — which is the documented first-client target per the project memory index (`project_first_clients.md`: "Pinellas (5-star), Pasco, Miami-Dade FL"). The group names ("Pinellas Medical Associates", "Clearwater Family Medicine", "Palm Harbor Specialists") do not match any real entity I can verify, but they credibly telegraph the region and mix of "owned vs affiliated" relationships a real Pinellas MSO would pitch. The TIN prefixes are `XX-XX####` (masked), the NPIs are obvious sequential fakes (`1234567890`, `1234567891`) — those are fine. The concern is signal to sales competitors: a screenshot of the demo shows "these are our imagined pilot entities in our target market."
**Risk:** Low — Pinellas is already in the existing demo bundle (mockData.ts) and was referenced in a prior commit. This mock extends the same information surface, not creates it.
**Recommendation:** If concerned, swap the group names to clearly-synthetic placeholders (`Demo PCP Group A / B / C`) before any customer-facing demo at an industry event. Accepting the current pattern for closed-door partner demos is reasonable — flag as accepted risk.

---

### [MINOR] `dashboard.py:/summary` now issues an additional unbounded `count(MemberGap)` query; no cache, no index hint
**Location:** `backend/app/routers/dashboard.py:155-158`
**Evidence:** The round-3 fix to make `/summary` return real `care_gaps` added a direct `SELECT COUNT(*) FROM member_gaps WHERE status = 'open'` scan. No index is specified on `member_gaps.status` (I didn't verify the model, but this is a common miss). On a tenant with a few hundred thousand gap records (plausible for a 50k-member MSO with many quality measures per member), every `/summary` call does a table scan. The onboarding wizard hits this endpoint on completion; the admin dashboard may hit it frequently.
**Risk:** Latency cliff under real data volume. Not a security issue but a scalability one.
**Recommendation:** Either cache the count (5-minute TTL in Redis keyed by tenant) or add `Index("ix_member_gaps_status", MemberGap.status)`. Also consider computing this in `get_dashboard_metrics` once, rather than a second round-trip.

---

## VERDICT: APPROVE with two IMPORTANT follow-ups

The two round-2 regressions the user targeted are addressed — the Postgres trajectory endpoint no longer 500s, the UI no longer renders "999 days" on new tenants, and the MemberDetail retry no longer silently flips dismiss into capture (the round-2 CRITICAL finding). The bleeding from round 2 is stopped. However, the `days_since_visit` round-2 IMPORTANT is only cosmetically fixed — the 9999 sentinel is still in the SQL `coalesce` and the alert engine, so care-manager alert floods on a freshly-onboarded tenant are NOT actually prevented (finding #1 above). And the WizardStep5 retry prematurely fires `onComplete()` during the retry's running window (finding #2), so onboarding can close before the retry actually succeeds. Both should be fixed before the next customer touch. The other NEW findings are minor or previously-accepted risk.
