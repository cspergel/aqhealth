# Adversarial Security Review — AQSoft Health Platform (Round 5)

**Reviewer:** The Adversary
**Date:** 2026-04-17
**Scope:** Diff since round 4 — `days_not_seen` filter now includes nulls, `JobHistory.hasFetchedOkRef` reset on fetch error, `journey_service` Python-side bucketing, `risk_tier` nullable through frontend, `WizardStep5` render gate mirrors onComplete gate, `get_member_detail` null convention aligned with list.

---

## ROUND-4 CLOSED

- **IMPORTANT — `days_not_seen` filter under-inclusion (round-4 #1).** Closed. `member_service.py:227-235` now explicitly ORs in `sq.c.days_since_visit.is_(None)`, so no-visit members appear in the "overdue" cohort alongside threshold-exceeded members. The docstring comment at lines 228-231 documents the semantic choice ("never seen at all is also operationally overdue"). The round-4 directional flaw (fresh tenant shows zero overdue) is resolved.

- **MINOR — `JobHistory.hasFetchedOkRef` never resets (round-4 #2).** Closed. `JobHistory.tsx:52-57` now flips the ref back to `false` in the `catch`. A post-first-success outage (token expiry, network drop) is recovered on the next 5s tick once the API is reachable again. The previously-identified "silently frozen poll" scenario no longer strands the UI.

- **MINOR — `to_char` docstring inversion via Python bucketing (round-4 STILL-OPEN).** Closed. `journey_service.py:269-283` pulls `(service_date, paid_amount)` tuples and buckets via `strftime("%Y-%m")` in Python. Both Postgres and SQLite paths now return correct monthly cost aggregates. No more silent-zero behavior under aiosqlite. See NEW FINDING below on the unbounded query this introduces.

- **FIX — `risk_tier` nullable through frontend.** Closed for `MemberTable.tsx:46-54`: `tierTag`'s `default` branch returns the literal string `"unknown"` and the muted colors, so unknown-tier members no longer render as "low" in the table. `MemberTable` is safe. See NEW FINDING — `MemberSummary.tsx:48` is NOT fixed; it still coerces null-tier members to low-tier colors.

- **FIX — `WizardStep5` render gate mirrors onComplete gate.** Closed. The `pipelineSucceeded` boolean at `WizardStep5Processing.tsx:256-261` is computed once per render from `(allDone && allTerminalOk && hasRealCompletion)` and used in both `useEffect` (notify parent) and the results-section JSX gate (`{pipelineSucceeded && metrics && ...}`). Celebration UI and parent-notify are consistent — a retry-in-progress no longer shows "Your dashboard is ready!" while also firing `onComplete`.

- **FIX — `get_member_detail` null convention aligned with list.** Closed. `member_service.py:402-427` documents the convention and returns `risk_tier` as-is (nullable), keeping the anti-sentinel stance. Strings are empty-string-coerced for display.

---

## STILL OPEN (unchanged from round 4)

All items in round-4 STILL OPEN remain:
- `dashboard.py:/summary` unbounded `count(MemberGap)` (scalability cliff)
- `FileUpload.tsx` `normalizeUploadResponse` `String(resp.job_id)` validation
- `MemberDetail.tsx` `lastFailedAction` not reset on `[memberId]` prop change
- Onboarding mock geography (Pinellas sales data in public bundle)
- All round-2 items (`/api/journey/members` unbounded search, `/api/skills/execute-by-name` catalog leak, `_execute_step` `str(e)` spread, journey ORDER BY loss on search, JobHistory no backoff, FileUpload 413/415, mockApi demo schema, `_build_claim_event` trust boundary)
- All round-1 unfixed items (path traversal uploads, read-into-memory size check, payer_api traceback leak, pool_recycle, ADT webhook fallback secret, passlib startup-warn, CSP, OAuth `state`, ALLOW_DEFAULT_SECRET, global exception handler, `fhir_id` fallback, CORS wildcard)

---

## DEFERRED (user-accepted, not re-flagged)

All auth/PHI/RBAC/OAuth/rate-limit/audit-log, path traversal in `ingestion.py:218`, Dockerfile-runs-as-root, prompt-injection in clinical notes, `admin123` seeds, Alembic, `to_char` docstring (now moot — see closure), onboarding mock geography, `String(resp.job_id)` validation, `lastFailedAction` reset, dashboard/summary count-no-index.

---

## NEW FINDINGS

### [IMPORTANT] `get_member_risk_trajectory` pulls every claim for a member with no date cutoff and no row limit — single-request DoS for any member with historical data
**Location:** `backend/app/services/journey_service.py:275-283`, exposed via `backend/app/routers/journey.py:146-154`
**Evidence:**
```python
claims_q = await db.execute(
    select(Claim.service_date, Claim.paid_amount)
    .where(Claim.member_id == member_id)
)
for service_date, paid_amount in claims_q.all():
    if not service_date:
        continue
    ym = service_date.strftime("%Y-%m")
    cost_by_month[ym] = cost_by_month.get(ym, 0.0) + float(paid_amount or 0)
```
The round-4→5 portability fix (replacing `func.to_char` with Python bucketing) is correct, but the SELECT has **no date cutoff**, **no LIMIT**, and **no pagination**. Compare `get_member_journey` at line 145-148, which correctly applies a 24-month `cutoff`. A production member with a long enrollment history or, more adversarially, a member whose claims table was inflated by a buggy ingestion (duplicated claim rows — AQTracker feeds are known to double-emit under retry) can have 50k+ rows. Each trajectory GET:
  1. Materializes every row into Python (`claims_q.all()` loads the full result set — no streaming),
  2. Iterates in a tight Python loop,
  3. Returns a per-month aggregate that's naturally sparse regardless of row count.
An attacker with a valid session can script `GET /api/journey/{member_id}/trajectory` across a cohort, each request doing full-table scan + full-row-materialization per member. Because the SQLAlchemy AsyncSession holds the connection for the entire loop, this also pins a DB connection per in-flight request. With the current pool_size (no `pool_recycle` per round-1 STILL OPEN) + app-server async worker limits, a dozen concurrent trajectory requests for "heavy" members can starve the connection pool.
The PRE-fix code via `func.to_char` would have grouped in SQL with the same I/O profile (still reading all rows), so the DoS surface isn't new — but the Python fix made it explicit and the loop more visible. Worth patching in the same PR.
**Risk:** Availability cliff for tenants with data-rich members. Blast radius: DB connection pool exhaustion affects the whole tenant, not just the trajectory endpoint.
**Recommendation:** Mirror `get_member_journey`'s cutoff: accept a `months: int = 24` parameter, filter `.where(Claim.service_date >= cutoff)`. Add `.order_by(Claim.service_date.desc()).limit(50000)` as a hard ceiling regardless of window — a legitimate member should never have >50k claims in 24 months; anything above is a data-quality bug that shouldn't fan out to a DoS. If you want trajectory over a longer window, do the bucketing in SQL via a subquery with `GROUP BY` on a portable `extract('year', service_date) * 100 + extract('month', service_date)` expression (works on both Postgres and SQLite) — then the transport size is O(months), not O(claims).

---

### [IMPORTANT] `MemberSummary.tsx` still coerces null `risk_tier` to "low" tier colors — fail-open remains on the journey page
**Location:** `frontend/src/components/journey/MemberSummary.tsx:48, 102`
**Evidence:**
```tsx
const tier = tierColors[member.risk_tier || "low"] || tierColors.low;
...
<div style={{ background: tier.bg, color: tier.text, borderColor: tier.border }}>
  {member.risk_tier || "unknown"}
</div>
```
The round-5 note claims "`risk_tier` nullable through frontend" was fixed, and `MemberTable` is indeed fixed (its `tierTag` default returns muted-gray/"unknown" colors — line 52). But `MemberSummary.tsx` (the header badge on the member journey page) was missed: line 48 uses `member.risk_tier || "low"` as the lookup key, which means a null-tier member gets the LOW-tier color palette (green/accent), and only the label text at line 102 shows "unknown". Visually, an unknown-risk member on the journey page is indistinguishable from a low-risk member — green badge, same border color. This is exactly the clinical-sentinel fail-open mode the backend comments at `member_service.py:292-294` explicitly call out as "a clinical sentinel bug". The page where a care manager looks deepest at one patient is the one with the broken visual signal.
Additionally, line 102 renders `{member.risk_tier || "unknown"}` — the raw DB value passes through. React escapes XSS, but a crafted-from-adapter value ("low_risk_verified_by_ai" or any long string) blows out the fixed-size badge layout. Not a security issue, but a layout/consistency concern that compounds as more payer adapters (FHIR, Humana, eCW) feed `risk_tier`.
**Risk:** Operational — care managers reviewing a member with missing tier data see a "safe/low" badge on the most clinically-detailed page. Same class of risk as the round-3 `days_since_visit` alert flood, but inverted: a false negative ("this patient looks fine") is worse than a false positive.
**Recommendation:** Copy `MemberTable.tierTag`'s shape into `MemberSummary`:
```tsx
const tier = member.risk_tier && tierColors[member.risk_tier]
  ? tierColors[member.risk_tier]
  : { bg: tokens.surfaceAlt, text: tokens.textMuted, border: tokens.border };
```
And replace line 102 with an explicit whitelist check so raw values can't escape: `{tier === tierColors.low ? "low" : tier === tierColors.rising ? "rising" : ...}` or extract a shared `tierMeta()` helper used by both `MemberTable` and `MemberSummary`. Shared helper is cleaner and closes a whole class of future drift.

---

### [MINOR] `JobHistory` treats 200-with-empty-items the same as legitimate "no jobs yet" — a misbehaving backend that drops in-flight jobs silently stalls the poller
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:44-61, 70-75`
**Evidence:**
```js
const res = await api.get("/api/ingestion/jobs");
const items = Array.isArray(res.data?.items) ? res.data.items : [];
jobsRef.current = items;
hasFetchedOkRef.current = true;
setJobs(items);
...
const hasInFlight = jobsRef.current.some((j) => IN_FLIGHT_STATUSES.has(j.status));
if (!hasFetchedOkRef.current || hasInFlight) fetchJobs();
```
The round-4→5 `hasFetchedOkRef` reset on catch is correct for the "API unavailable" case. But a 200 response with `{ "items": [] }` is treated as success: `hasFetchedOkRef.current = true`, `jobsRef.current = []`, `hasInFlight = false` → poller idles.
Attack/failure scenario: a backend bug or a tenant-scope regression causes `/api/ingestion/jobs` to return an empty list even when a job is actively processing (e.g., tenant_id filter mismatch during a mid-ingestion session-migration, or a subtle cache-key collision in a future caching layer). The user who just uploaded a file sees "No upload jobs yet" and the poll stops. From the user's perspective, their upload silently vanished. There's no mechanism to recover short of a hard page reload.
Adversarial exploit: if an attacker can influence which jobs are returned (e.g., via a crafted filename that triggers a filter edge case in a future query), they could mute ingestion feedback for specific victim jobs — the upload happens, the job shows "processing" briefly, then disappears, and the user thinks the upload never took. Current code has no such filter-influenced path, so this is bounded by future-surface risk.
A cheaper nit: the post-upload UI flow has no "job count expected ≥ 1 after successful upload" sanity check — if a user just uploaded a file and the list returns empty, there's no banner warning the user to refresh.
**Risk:** Low today (no concrete exploit path); medium-forward (any future caching/filter layer on `/api/ingestion/jobs` can silently stall the UI).
**Recommendation:** Separate "we successfully fetched and got data" from "we successfully fetched an empty list". Track the timestamp of the last successful fetch in a ref. If the user was within 60 seconds of a completed upload (the `FileUpload.tsx` success handler could bump a "recent upload" timestamp in shared state/context), show a "Processing — refresh if this takes too long" hint when the list is unexpectedly empty. Cheap-minimal fix: in `fetchJobs`, if `items.length === 0` and `jobsRef.current.length > 0` (jobs disappeared between ticks), log to Sentry or surface a warning — the transition from non-empty to empty is the genuine signal.

---

### [MINOR] `days_not_seen` filter has no lower-bound validation — `days_not_seen=0` combined with the new `IS NULL` OR branch matches every member, making the "overdue" cohort meaningless
**Location:** `backend/app/routers/members.py:78, 137`, `backend/app/services/member_service.py:227-235`
**Evidence:**
```python
# router
days_not_seen: Optional[int] = Query(None),
```
```python
# service
threshold = having_filters["days_not_seen"]
outer = outer.where(
    (sq.c.days_since_visit >= threshold) | (sq.c.days_since_visit.is_(None))
)
```
`days_not_seen` has no `ge`/`le` query validator. With the new `IS NULL` OR branch, calling `GET /api/members?days_not_seen=0` matches every member (any non-null value is >= 0 OR the value is null). Same for negative values (`days_not_seen=-1` → every non-null days_since_visit >= -1 is true). The user-facing filter UI likely prevents this, but the endpoint is reachable directly by any authenticated caller. A care manager who miskeys the filter to 0 thinks "everyone is overdue" — a false signal that would trigger outreach prioritization errors. More concerning: a scripted caller can enumerate every member via the `days_not_seen=0` path without tripping any row-count threshold detection that might flag the literal `GET /api/members` call (since the legitimate filter is expected to return a large subset anyway).
Also worth noting: this is the opposite failure mode to round-3 (when a tenant had zero-data members, the old sentinel returned everyone). The new code handles zero-data correctly but now an attacker can force the "everyone" set explicitly.
**Risk:** UX correctness + enumeration. No PHI leak beyond what any valid filter permits. Enumeration already accessible via `GET /api/members` with no filters, so the marginal adversarial value is low.
**Recommendation:** Add `ge=1` (or `ge=0` with an explicit "0 means `IS NULL`-only" semantics — pick one and document): `days_not_seen: Optional[int] = Query(None, ge=1, le=3650)`. The upper bound prevents `days_not_seen=2**31-1` from being a cheap "match nothing" probe. Add a unit test pinning `ge=1` behavior.

---

### [MINOR] `WizardStep5Processing.runStep` has no `isMountedRef` / abort guard — a stale retry resolving after unmount calls `setSteps` on a dead component
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:143-169`
**Evidence:**
```tsx
const runStep = useCallback(async (key: string, skillName: string) => {
  setSteps((prev) => prev.map(...));
  try {
    const res = await api.post("/api/skills/execute-by-name", { action: skillName });
    ...
    setSteps((prev) => prev.map(...));     // <-- fires even after unmount
  } catch (err: any) {
    setSteps((prev) => prev.map(...));     // <-- same
  }
}, []);
```
No `AbortController` on the POST, no `isMountedRef` check before `setSteps`. React's behavior on setState-after-unmount is a warning in dev and a no-op in prod — not a correctness bug. But combined with `runDemoPipeline`/`runRealPipeline` (which also have the same pattern — see the `await delay(2000 + ...)` loop at line 108-127), a user who triggers a retry then immediately navigates away generates console warnings that may mask real issues in the logs. More subtly, the in-flight POST continues server-side regardless, so a retry-then-navigate-back-to-step-5 scenario has a race: the old `runStep` may still be in flight when the new mount starts a fresh `runRealPipeline`. Two concurrent POSTs for the same skill hit the backend; the backend has no idempotency key per round-2 deferred items. A rapid user (click Retry, back, forward, Retry again) can enqueue multiple concurrent executions of the same skill. The ones that win update dashboard state twice.
**Risk:** Low — bounded by the rate at which a user can navigate. Backend-side: potentially duplicate skill execution (e.g., `hcc_analysis` runs twice, the second overwriting the first's results). Not an attack, just a timing mess.
**Recommendation:** Add an `AbortController` per `runStep`/`runRealPipeline` invocation, store the controller in a ref, abort in the cleanup of the main `useEffect` at line 244-253. Guard `setSteps` calls with `if (!isMountedRef.current) return;` (introducing an `isMountedRef` like `JobHistory` already has). Backend-side: add an `idempotency_key` parameter to `/api/skills/execute-by-name` — hash of `(user_id, skill_name, minute_bucket)` — and deduplicate server-side. This also closes the round-2 deferred "repeated skill execution" concern when it comes off the deferred list.

---

## VERDICT: APPROVE with 1 IMPORTANT to address next round

Round-4's IMPORTANT (`days_not_seen` under-inclusion) is genuinely closed by the `OR IS NULL` branch. The MINOR JobHistory recovery path works. The remaining round-5 delta (`to_char` → Python bucketing, risk_tier null-through, WizardStep5 gate unification, get_member_detail null alignment) is net-correct with two issues worth flagging:

The `MemberSummary.tsx` risk_tier fix was **not fully applied** — the journey page header still shows null-tier as green/low. That's the same class of clinical-sentinel fail-open the backend explicitly guarded against, on the page where it matters most. Pair with a shared `tierMeta()` helper to prevent future drift.

The `get_member_risk_trajectory` unbounded query isn't new behavior, but the round-5 Python bucketing makes the O(claims) exposure explicit. Add a cutoff + hard row ceiling before a data-rich tenant discovers it.

The three MINORs (JobHistory empty-items stall, `days_not_seen` input validation, WizardStep5 abort guard) are forward-looking — they don't block this session but should be tracked. Nothing introduced in round 5 constitutes a regression from round 4.
