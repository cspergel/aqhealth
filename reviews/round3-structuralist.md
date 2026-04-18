# Structuralist Review — Round 3

**Agent:** The Structuralist
**Tier:** MEDIUM (unchanged)
**Scope:** Shape of the round-3 delta — `MemberDetail.tsx`, `JobHistory.tsx`, `WizardStep5Processing.tsx`, `MemberTable.tsx`, `FileUpload.tsx`, `journey_service.py`, `member_service.py` / `members.py` days-since-visit nullability, `mockApi.ts` reshape.

---

## ROUND-2 STRUCTURAL ISSUES ADDRESSED

None. Per brief, this round fixed regressions and delivered small UX improvements. Every architectural finding from rounds 1 and 2 remains open.

---

## STILL OPEN (cumulative — not re-scored)

**From round 1 (15 items open):**
1. Business logic + raw SQL in routers
2. 73 service modules with ingestion overlap
3. "All microservices" framing mismatch
4. Alembic empty / `create_all` at startup / `ensure_schema` ALTER drift
5. Tenant session discipline + `_demo_session` bypass
6. Tuva contract via `.replace("main_...")` fallback
7. Duplicated `_safe_float` / `_pct` / `_fmt_dollar` helpers across 23 files
8. Frontend eager page loading (no `React.lazy`)
9. `mockData.ts` 7,272-line monolith
10. 57 routers registered individually in `main.py`
11. Service-style drift (3 Tuva classes vs 70 function modules)
12. Global filter state via `localStorage` interceptor
13. 3 worker containers for one queue
14. 5+ demo-mode activation paths
15. `common_column_aliases.py` static-data-as-code

**From round 2 (8 items open):**
16. `normalizeUploadResponse` lives in the consuming component (no `lib/api-contracts/`)
17. `dashboard.py /summary` inline imports + router-layer business logic
18. `/api/journey/members` duplicates `/api/members`
19. `MemberSearchResult` hand-synced backend/frontend
20. `get_member_risk_trajectory` cross-domain fat function
21. `WizardStep5` `runStep` vs inline loop body duplication
22. `mockApi.ts` growth without sharding
23. `/api/tuva/member/:id` null-is-a-signal demo protocol

---

## NEW FINDINGS

### [IMPORTANT] `MemberDetail.tsx` accumulates six per-row state Records — crossed the threshold where a single `rowState` (reducer or Map) would be simpler
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:52-61`
**Structural issue:** Component state shape is growing linearly with per-row concerns. What started as one map has become six parallel maps keyed by the same `suspect_id`:
```tsx
const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
const [dismissingId, setDismissingId] = useState<number | null>(null);  // singleton
const [dismissReason, setDismissReason] = useState("");                  // singleton
const [localStatuses, setLocalStatuses] = useState<Record<number, string>>({});
const [errorByRow, setErrorByRow] = useState<Record<number, string>>({});
const [lastFailedAction, setLastFailedAction] = useState<
  Record<number, { type: "capture" } | { type: "dismiss"; reason: string }>
>({});
```
**Evidence:** Every mutator now has to spread-update one map and often clean up a sibling:
- `clearRowError` has to `delete` from both `errorByRow` *and* `lastFailedAction` (lines 83-96).
- `handleCapture` writes to `actionLoading`, `localStatuses`, `errorByRow`, `lastFailedAction` (4 of the 6 maps) in a single flow (lines 99-115).
- `handleDismiss` writes to the same 4 + mutates the two singletons (`dismissingId`, `dismissReason`).
- The "add another per-row concern" pattern is what produced `lastFailedAction` this round; the next concern (e.g., a per-row toast, a timestamp for retry backoff, a sticky-error-dismiss flag) will produce a 7th and then an 8th map.
**Why it matters:** (1) Every per-row update requires N lookups and N spreads, and drift between the maps is an invisible class of bug (e.g., `localStatuses` says "captured" but `lastFailedAction` is stale because a success forgot to clear it). (2) A new engineer touching this component has to mentally build the row's "effective state" from 6 sources. (3) Testing a single row's behavior means constructing 6 initial-state shapes. This is the component-scope version of round 1's "helpers have no home" — the concern ("what's this row's UI state?") has no home *here*.
**Recommendation:** Either of:
```tsx
type RowState = {
  loading: boolean;
  status?: "captured" | "dismissed";
  error?: string;
  lastFailed?: { type: "capture" } | { type: "dismiss"; reason: string };
};
const [rowState, setRowState] = useState<Record<number, RowState>>({});
// OR: const [rowState, dispatch] = useReducer(reducer, {});
```
Row mutations become `setRowState(r => ({ ...r, [id]: { ...r[id], loading: true, error: undefined } }))` — one write, one place that knows what "this row" means. Keep `dismissingId` / `dismissReason` as the two genuine singletons. That's 3 state slots instead of 6.

---

### [IMPORTANT] `journey_service.get_member_risk_trajectory` swapped a SQLite-only idiom for a Postgres-only idiom — points at a missing dialect-portability discipline
**Location:** `backend/app/services/journey_service.py:271-288`
**Structural issue:** The round-2 finding was "this `strftime` is dialect-coupled." The round-3 fix replaced it with `func.to_char(...)`, which is *also* dialect-coupled — just to the opposite dialect. The code comment even acknowledges the split:
```python
# Use to_char (Postgres; SQLAlchemy maps this to strftime on SQLite) rather
# than SQLite-only func.strftime, which was silently 500ing on Postgres.
cost_q = await db.execute(
    select(
        func.to_char(Claim.service_date, "YYYY-MM").label("ym"),
        ...
```
**Evidence:** (a) `to_char` is a Postgres function name. SQLAlchemy's `func.to_char` is not a generic — it emits `to_char` literally. On SQLite it will raise `no such function: to_char`. The comment's claim that "SQLAlchemy maps this to strftime on SQLite" is incorrect; SQLAlchemy has no such mapping for `func.to_char`. (b) The `try/except Exception` at line 287-288 still silently swallows the failure and returns `{}` — so any SQLite test run against this endpoint now gets empty costs with no error. (c) The *shape* of this fix (swap one dialect's function name for another's, keep the bare-except safety net) says the project has no convention for writing portable time-grouping. Other services have the same class of code (e.g., anything that groups-by-month across `Claim.service_date`).
**Why it matters:** (1) The bare-except hides the dialect bug from tests. This is the exact "string-replace fallback" anti-pattern from round 1's Tuva finding, now entrenched in a service. (2) Round 1's deferred item "Alembic wired up but unused" meant schema is Postgres-targeted in production but tests run against SQLite. Every time-bucketing query is a latent production-vs-test divergence. (3) The fix was for a Skeptic-domain bug, but the shape of the fix is structural: the service layer is writing raw dialect-specific time functions directly. That's a seam that should be owned by a helper, not scattered across services.
**Recommendation:** Two layers:
- **Portable now:** use `func.date_trunc('month', Claim.service_date)` (works on Postgres and DuckDB; SQLAlchemy does emulate `date_trunc` on SQLite via `strftime`) or compute the bucket in Python after `select(Claim.service_date, Claim.paid_amount).where(...)`. Delete the bare-except.
- **Structural:** add `app/utils/sql_time.py` with `month_bucket(col) -> ColumnElement` that returns a dialect-neutral expression. Any service that groups-by-month imports it. This is the same utils-discipline finding as round 1's `_safe_float`, at the SQL-expression level.
**CROSS:** Skeptic (latent bug + bare-except), Contractualist (silent contract: the endpoint may return `cost: 0` meaning "no claims" or "dialect error" with no way to tell).

---

### [MINOR] `JobHistory.tsx` duplicates `jobs` into a ref to dodge stale closures — a pattern smell, not a bug
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:38, 45, 63`
**Structural issue:** The round-3 fix swapped a setTimeout-chain poller for a setInterval that mirrors state into a ref:
```tsx
const [jobs, setJobs] = useState<Job[]>([]);
const jobsRef = useRef<Job[]>([]);
...
jobsRef.current = items;
setJobs(items);
...
const hasInFlight = jobsRef.current.some(...);
```
The ref exists solely because the `setInterval` callback in `useEffect(..., [])` would otherwise see a stale `jobs`. Two copies of the same data are maintained in sync by hand.
**Evidence:** Every `fetchJobs` call now performs two writes (`jobsRef.current = items; setJobs(items);`). There's no invariant enforcing they stay equal — a future edit that adds `setJobs(sortBy(items))` or similar will drift the two.
**Why it matters:** (1) This is a well-known React anti-pattern ("sync state to ref"); it works but it's fragile. Two established alternatives avoid it: (a) make the in-flight check pure of state — fetch unconditionally and let the server return whatever it returns; the overhead of a 5s poll when idle is trivial, and removes the need for the ref entirely; (b) use a `useEvent`-style stable callback that closes over the latest `jobs` via a functional `setJobs(prev => ...)` check. (2) The same stale-closure problem will reappear the moment another interval callback needs any other piece of state. Without a team convention ("we use `useInterval` with functional access" or "we don't read state in intervals"), each component solves this differently.
**Recommendation:** Simplest fix: drop the `hasInFlight` gate and poll every 5s unconditionally while the component is mounted (the endpoint is cheap). If the gate must stay, add a `frontend/src/lib/hooks/useInterval.ts` that closes over a ref internally and exposes `useInterval(callback, delayMs)` — so the pattern lives in one place, not per-component.

---

### [MINOR] `MemberTable.tsx` handles `days_since_visit | null` in two sibling helpers — a `<DaysSinceVisit>` presentational component would own the rule
**Location:** `frontend/src/components/members/MemberTable.tsx:39-44, 61-66, 232-241`
**Structural issue:** Per-field nullable-handling scattered across two helpers:
```tsx
function daysColor(days: number | null): string {
  if (days == null) return tokens.textMuted;
  ...
}
function daysAgoLabel(days: number | null): string {
  if (days == null) return "--";
  ...
}
```
Both functions encode the same "null means no-visit-data" semantics with different fallbacks (muted color, "--" label). The three-line JSX that uses them (lines 232-241) is the only caller and won't be the only caller for long — the member detail page, the outreach list, the panel-management grid will all show this field.
**Evidence:** This is the very first feature (beyond RAF tiers) that propagates a nullable numeric from the backend all the way to a color + label. The round-3 `days_since_visit: number | null` change in `members.py:43` + `member_service.py:286` is the backend commitment. There's nothing that owns the *presentation* commitment.
**Why it matters:** The next nullable numeric ("days_since_last_a1c", "days_since_last_awv") will get its own `xxxColor` + `xxxAgoLabel` helper, or — worse — someone will copy these two and tweak the thresholds. Round 1 flagged duplicated numeric helpers on the backend; the same drift pattern is starting on the frontend, at the component level.
**Recommendation:** Extract `<DaysSince value={m.days_since_visit} thresholds={{ warn: 90, danger: 180 }} />` in `frontend/src/components/ui/DaysSince.tsx`. One component owns the null fallback, color ramp, label formatting, and a default `"--"` for null. `MemberTable` then renders `<DaysSince value={m.days_since_visit} />` for one cell. Next feature that needs days-since-X uses the same component. Kills `daysColor` + `daysAgoLabel` and scales.

---

### [MINOR] `WizardStep5Processing` `onComplete` effect couples "step state" to "notify parent" — and now has a subtle bug where failing-then-retrying never notifies
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:250-256`
**Structural issue:** The onComplete gate was added this round as:
```tsx
useEffect(() => {
  if (!allDone) return;
  const anyFailed = steps.some((s) => s.status === "error");
  if (anyFailed) return;
  onComplete?.();
}, [allDone, steps, onComplete]);
```
`allDone` is set *once* at the end of `runRealPipeline`. If a step failed and then the user retried via `runStep` and it succeeded, the steps array now has no "error" status — the effect re-runs (deps include `steps`) and fires `onComplete`. That's actually the correct behavior, but:
- If `onComplete` is not memoized by the parent (it isn't: `WizardStep5ProcessingProps.onComplete?: () => void`, and the parent most likely passes a fresh closure), the effect fires on *every* render after `allDone` where no step is in error. That's a burst of `onComplete` calls, not just one.
- The effect is also gating on the derived value `steps.some(s => s.status === "error")` — the "is this pipeline done successfully" concern is computed inline, twice (here and at line 288 for the error banner, and line 310 for the success metrics).
**Evidence:** `steps.some((s) => s.status === "error")` appears three times: lines 253, 288, 310. The "is success" concept has no home — it's re-derived at every usage.
**Why it matters:** (1) The onComplete side-channel and the "render the success banner" side-channel are now coupled through the same derived state + a `useEffect` that lacks idempotency. (2) As the wizard grows (round 2 added the wizard; round 3 added this gate; round 4 will add something), each new concern will add another `steps.some(...)` + another `useEffect` with `[allDone, steps, ...]` deps.
**Recommendation:** Extract a `usePipelineCompletion(steps)` hook that returns `{ isDone, succeeded, failedCount }` — computed once, memoized. The effect becomes:
```tsx
const { isDone, succeeded } = usePipelineCompletion(steps);
useEffect(() => { if (isDone && succeeded) onComplete?.(); }, [isDone, succeeded]);
```
Banner and metrics guards read from the same `succeeded` flag. Three copies collapse to one source of truth. Hoist `API_STEPS` (still declared inside the component at line 130) to module scope while you're there.

---

### [MINOR] `mockApi.ts` trajectory: 2,094 → 2,226 → 2,251 lines in three rounds with no structural response
**Location:** `frontend/src/lib/mockApi.ts` (2,251 LOC)
**Structural issue:** Round 1 flagged this file at 2,094 lines with a "shard by domain" recommendation. Round 2 flagged it again at 2,226 lines. Round 3 is 2,251 lines and the reshape work (onboarding discover-structure reshape, tuva summary reshape — legitimate fixes for round 2's contract-drift findings) happened inside the existing `else if (url.includes(...))` chain. The onboarding discover-structure handler alone (lines 1087-1123) is 36 lines of inline demo fixtures.
**Evidence:** Grep for the onboarding discover-structure shape shows two copies of this "groups with providers" structure existed simultaneously pre-round-3 — the fix collapsed to one shape in the mock. That's a real correctness win. But the shape now lives inline in `mockApi.ts`, not in `mockData.ts`, and not in a shared type with the consuming component (`OrgDiscoveryReview.tsx`). So: round 3 fixed a shape bug, and introduced a 4th place where the `DiscoveredGroup` shape exists (backend, frontend component, mock, and now an inline const in mockApi).
**Why it matters:** File size growth is not the core issue — the issue is that every "fix a shape drift" action *adds* to the file without evicting anything. The file is becoming the authoritative place where demo-shape contracts live, because the other places (components, mockData.ts) can't claim that role without an `api-contracts/` layer that doesn't exist. Round-1 recommendation ("shard by feature") is now round-3 more urgent because the file has started to calcify in a new way — as the de facto contract source.
**Recommendation:** The next time a mock handler changes (not now — no big-bang), move *that handler's* fixture into `mockData/<domain>.ts` and move the handler into `mockApi/<domain>.ts`. Add a top-level `mockApi.ts` that imports handlers from sub-files and dispatches. Three rounds of this and the file is sharded. Pair with `lib/api-contracts/<domain>.ts` so the mock imports its shape from the same place the component does.

---

## Trajectory note — NOT a new finding, but worth saying plainly

Three rounds in, the structural-debt curve is flat. Round-3 fixes were regression-picks: good for product quality, neutral-to-mild-negative for architecture (each reinforced patterns round 1 and round 2 flagged). The specific shape of round-3 is instructive:

- The `MemberDetail.tsx` fix **added** a 6th per-row state map.
- The `journey_service.py` fix **swapped** a dialect-coupling problem for a different dialect-coupling problem.
- The `mockApi.ts` fix **moved** shape-reshape work into the already-overgrown mock router.
- The `JobHistory.tsx` fix **added** a ref-shadow of component state to dodge stale closures.
- The `WizardStep5Processing.tsx` fix **added** a 3rd in-place derivation of "pipeline succeeded."

Each of these is a correct fix *at the level it was written*. The pattern is that no fix reached into the layer where a structural simplification would actually retire the problem. That's the same observation as round 2; round 3 extends it by one more data point.

---

## VERDICT: REQUEST CHANGES

Round 3 closed zero structural items from rounds 1 or 2, and the new fixes — all competent at the unit level — each added one more instance of the patterns those rounds flagged (per-row state sprawl, dialect-coupled SQL in services, mock-shape contract drift, stale-closure ref shadowing, repeated derivation of a "done" concept). Before round 4, pick **one** structural item from the cumulative list and actually retire it; the shape of round 3's deltas says the team can refactor cleanly, it just hasn't chosen to aim at architecture yet.
