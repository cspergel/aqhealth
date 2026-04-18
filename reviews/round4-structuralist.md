# Structuralist Review — Round 4

**Agent:** The Structuralist
**Tier:** MEDIUM (unchanged)
**Scope:** Round-4 delta — `member_service.py` coalesce removal, `alert_rules_service.py` continue-on-null, `MemberSummary.tsx` `genderLabel()`, `WizardStep5Processing.tsx` sticky-notify ref + widened success gate, `MemberDetail.tsx` `retryFailed`, `JobHistory.tsx` `hasFetchedOkRef`.

---

## WAS ANY CUMULATIVE ITEM RETIRED?

**No.** Round 3's closing line — "pick one cumulative item and actually retire it before round 4" — was not acted on. Every round-4 change is an in-place point fix at the exact location round 3 flagged. Three of them *sharpen* the very patterns I called out:

- `MemberDetail.tsx` gained `errorByRow` + `lastFailedAction` + the `retryFailed` 3-way branch — round 3's "6 per-row state maps" finding is now **6 maps + a 3-way reader that closes over 3 of them**.
- `WizardStep5Processing.tsx` added `hasNotifiedCompleteRef` + a widened success gate with `steps.every(terminal)` + `steps.some(s => s.status === "complete")` — round 3 flagged three in-place derivations of "pipeline succeeded"; round 4 made it **five**.
- `mockApi.ts` grew 2,251 → 2,408 lines (+157). Round 1 flagged at 2,094; round 3 flagged at 2,251 with "next time you add a mock, shard *that handler*." The round-4 additions are inline. None are sharded.

Zero cumulative retirements across four rounds. That is the finding.

---

## STRUCTURAL ITEMS ADDRESSED THIS ROUND

None.

Round-4 fixes are unit-level and correct at the unit level:
- `member_service.py`: removing the `coalesce(..., 9999)` sentinel and letting `days_since_visit` remain `NULL` is the *right* null-semantics fix.
- `alert_rules_service.py`: `continue` instead of `value = 9999` is the right fix for "every new tenant trips the alert."
- `MemberSummary.tsx` `genderLabel()` collapses a two-branch ternary into a helper with explicit unknown handling.
- `WizardStep5Processing.tsx` `hasNotifiedCompleteRef` stops duplicate `onComplete?.()` fire on re-render.
- `MemberDetail.tsx` `retryFailed` correctly reads live input for dismiss reason (the comment about clinical audit trail is spot-on).
- `JobHistory.tsx` `hasFetchedOkRef` stops the poll-deadlock when first fetch fails.

Every one is a good fix. None of them touched the boundaries round 3 identified. That is the accumulation problem, compounding.

---

## STILL OPEN (cumulative)

**From round 1 (15):** router-layer SQL; 73-service sprawl; microservices-framing mismatch; Alembic empty; tenant-session discipline; Tuva string-replace contract; `_safe_float`/`_pct`/`_fmt_dollar` helpers across 23 files; no `React.lazy`; `mockData.ts` 7,272 lines; 57-name router import line; Tuva class vs function-module drift; localStorage filter interceptor; 3 worker containers; 5+ demo-mode paths; `common_column_aliases.py` static-data-as-code.

**From round 2 (8):** `normalizeUploadResponse` in consuming component (no `lib/api-contracts/`); `dashboard.py /summary` inline imports + router business logic; `/api/journey/members` duplicates `/api/members`; `MemberSearchResult` hand-synced; `get_member_risk_trajectory` cross-domain fat function; `WizardStep5` `runStep` vs loop body duplication; `mockApi.ts` growth without sharding; `/api/tuva/member/:id` null-is-a-signal protocol.

**From round 3 (6):** `MemberDetail.tsx` 6-map state sprawl; `journey_service.py` Postgres-only `to_char` + bare-except; `JobHistory.tsx` ref-shadow pattern; `MemberTable.tsx` `daysColor`/`daysAgoLabel` per-field null handling (no `<DaysSince>`); `WizardStep5` 3x `steps.some(...)` derivation; `mockApi.ts` 2,251-line trajectory.

**Total carried forward: 29 structural items.** Zero retired in four rounds.

---

## NEW FINDINGS

### [IMPORTANT] `MemberDetail.tsx` — per-row state is now 6 maps + 2 singletons + a cross-map retry reader (`retryFailed`); a `useReducer(rowState)` would eliminate every current bug class
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:50-159, 228-296`
**Structural issue:** The round-3 threshold (6 parallel row-maps) has been crossed *in a specific direction* — round 4 added a reader (`retryFailed`) that must consult `lastFailedAction[id]`, `dismissingId`, and `dismissReason` together to decide the action + payload for one row. That is, the maps are no longer parallel write-sites; they now **require a coordinated read**, which means they are no longer decomposable without breaking the read site.
**Evidence:**
- Round 3 state count: `actionLoading`, `dismissingId`, `dismissReason`, `localStatuses`, `errorByRow`, `lastFailedAction` (6 slots; `errorByRow` and `lastFailedAction` added this cycle — `lastFailedAction` is a 2-variant discriminated union: `{type:"capture"} | {type:"dismiss"; reason}`).
- Round 4 added `retryFailed(id)` (lines 143-159). Its body:
  ```tsx
  const last = lastFailedAction[suspectId];    // map 1
  if (!last) return;
  if (last.type === "capture") handleCapture(suspectId);  // re-writes maps: actionLoading, errorByRow, lastFailedAction, localStatuses
  else {
    const currentReason = dismissReason.trim();          // singleton 1
    const reason = dismissingId === suspectId && currentReason    // singleton 2
                     ? currentReason : last.reason;
    handleDismiss(suspectId, reason);                    // re-writes 4 maps + 2 singletons
  }
  ```
  That is a **3-source read for one action decision**, and the action path `handleDismiss` internally writes to 4 maps + 2 singletons. Cyclomatic complexity of the retry path alone is now 4 (null-check, type discriminant, `dismissingId === id`, `currentReason` truthy).
- The `clearRowError` helper (lines 83-96) exists because round 4 needed to delete from both `errorByRow` and `lastFailedAction` in sync. That is the "two maps must be equal modulo nullity" invariant round 3 warned would appear.
**Why it matters:** (1) The invariant "`errorByRow[id]` set ⇔ `lastFailedAction[id]` set" is held by every mutator manually. A future mutator that forgets one (e.g., a "dismiss suspect — no retry offered" path) is a silent bug. (2) Testing `retryFailed` now requires building a fixture with consistent values across `lastFailedAction`, `dismissingId`, `dismissReason`, `actionLoading`, and `localStatuses`. (3) The round-3 recommendation (single `RowState` record or `useReducer`) would have collapsed the round-4 diff from ~80 lines to ~20 because error/retry metadata would live inside the row's state slot — and the sync invariant would be structurally impossible to violate.
**Recommendation:** Same as round 3, now strictly more urgent:
```tsx
type RowState = {
  loading: boolean;
  status?: "captured" | "dismissed";
  error?: { message: string; retry: { type: "capture" } | { type: "dismiss"; reason: string } };
};
const [rowState, dispatch] = useReducer(rowReducer, {});
// retryFailed becomes: dispatch({ type: "retry", id, liveReason: dismissReason })
```
The reducer owns the 3-source read; the component owns render. This is a ~40-line refactor and retires one round-3 item *and* prevents the round-5 state-map addition that the current trajectory guarantees.

---

### [IMPORTANT] `WizardStep5Processing.tsx` — success gate is now a 5-way in-place derivation; the component is an orchestration blob that should own a `usePipelineCompletion` hook
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:95-106, 252-265, 280-322`
**Structural issue:** Round 3 flagged 3 inline `steps.some(s => s.status === "error")` derivations. Round 4 added:
- `hasNotifiedCompleteRef` (line 100) — mutable ref to guard re-entry
- A new widened `onComplete` effect (lines 253-265) with *two* derived predicates:
  ```tsx
  const terminal = (s) => s.status === "complete" || s.status === "warning";
  const allTerminalOk = steps.every(terminal);
  const hasRealCompletion = steps.some((s) => s.status === "complete");
  ```
- An error banner guard: `allDone && steps.some((s) => s.status === "error")` (line 296)
- A success-metrics guard: `allDone && metrics && !steps.some((s) => s.status === "error")` (line 321)
- A retry predicate inline per row: `!demoMode && step.status === "error"` (line 282)

That is now **5 in-place derivations** of three concepts (is-terminal, is-success, is-error), each hand-coded at its use-site, guarded by a ref to compensate for re-entry.
**Evidence:** 664 lines (round-3 HEAD) → 760 lines (round-4 working tree), +96 lines. The component now owns:
1. `API_STEPS` (still inside component; round 3 asked to hoist — not done)
2. `runStep` (round 2 duplication; round 3 did not collapse — still duplicated with loop body)
3. `runRealPipeline` (the loop that calls `runStep`-equivalent inline — *still not refactored to iterate `runStep`*)
4. `runDemoPipeline`
5. The completion effect with ref-guard
6. Per-row retry binding
7. Render of error banner, success metrics, step list, retry button
**Why it matters:** (1) The comment at line 96-99 ("once we've successfully notified the parent, don't re-fire if transient step state changes e.g. a retry flips a step back to 'running'") is a *structural* observation that the component's state shape doesn't distinguish "in-flight retry after initial completion" from "still running first pass." The ref is papering over that. (2) The success predicate is spread across 5 sites; any new status (e.g., "skipped", "partial") requires touching 5 places. (3) `runStep` and `runRealPipeline` still contain the same step-update body — round 2 finding, untouched.
**Recommendation:** Extract:
```tsx
// hooks/usePipelineCompletion.ts
export function usePipelineCompletion(steps: PipelineStep[]) {
  return useMemo(() => {
    const allTerminal = steps.every(s => s.status === "complete" || s.status === "warning" || s.status === "error");
    const hasError = steps.some(s => s.status === "error");
    const hasRealCompletion = steps.some(s => s.status === "complete");
    return { allTerminal, hasError, hasRealCompletion, succeeded: allTerminal && !hasError && hasRealCompletion };
  }, [steps]);
}
```
Then `runRealPipeline` iterates `await runStep(...)` for each (kills round 2's duplication). The effect becomes one-liner. The banner/metrics/retry read from `{ hasError, succeeded }`. Hoist `API_STEPS` to module scope. Net diff: subtract ~60 lines, retire 2 cumulative items (round-2 `runStep` duplication + round-3 derivation repetition).

---

### [IMPORTANT] Null-policy has drifted into three inconsistent conventions across the round-4 delta — the codebase has no stated nullability rule
**Location:** `backend/app/services/member_service.py:275-298`, `backend/app/services/alert_rules_service.py:209-220`, `backend/app/services/journey_service.py:131-137`, `backend/app/routers/members.py:43`
**Structural issue:** Three incompatible null conventions now coexist in service/router code, chosen per-field rather than by rule:

| Field kind | Convention | Example |
|---|---|---|
| Numeric null-as-unknown | Keep `null`, let downstream handle | `days_since_visit: int \| None = None` (`members.py:43`, `member_service.py:298`) |
| Numeric null-as-trigger | Skip row entirely (`continue`) | `alert_rules_service.py:212` ("No visit data -> not a trigger") |
| String null-as-unknown | Coerce to empty string `""` | `member_service.py:278-296` (`dob=""`, `pcp=""`, `group=""`, `last_visit_date=""`, `plan=""`), `journey_service.py:132-136` (`dob=""`, `age=0`, `gender=""`) |

Meanwhile `current_raf` uses `float(row.current_raf or 0.0)`, and the response Pydantic models switched some fields from `float \| None` to `float = 0.0` (`journey.py:62-65`) — yet another convention (**null-as-zero at the schema boundary**).
**Evidence:**
- `member_service.py:278`: `"dob": str(row.date_of_birth) if row.date_of_birth else ""` (was `None`).
- `member_service.py:285`: `"risk_tier": row.risk_tier or "low"` — null-as-default-value-with-domain-meaning (4th convention).
- `journey_service.py:134-136`: `"age": 0 if no DOB`, `"gender": member.gender or ""`.
- `alert_rules_service.py:212`: `if not row.last_visit: continue` (skip semantics).
- `routers/members.py:43`: `days_since_visit: int | None = None` (keep null).
- `routers/journey.py:62-65`: Pydantic `total_spend_12m: float = 0.0` with no `| None` — rejects null at serialization.

The reason this drift occurred: every round-1 "duplicated helper" finding predicts exactly this. There is no `utils/nullable.py` or equivalent policy — each fix-site decides locally.
**Why it matters:** (1) Frontend code cannot write `if (m.dob)` because some endpoints emit `""` and some emit `null` and some will emit `undefined` if the field is optional in TS. The `<DaysSince>` round-3 recommendation is blocked until the policy stabilizes. (2) `"risk_tier": row.risk_tier or "low"` silently misclassifies an unknown-tier member as `low` — a clinical-meaning value that will feed the tier-based alert rules and stratification. That is the same class of bug as the round-3 `days_since_visit = 9999` sentinel, just with a different sentinel ("low"). (3) Alert-rule semantics diverge: `days_since_visit == null` is "skip" in `alert_rules_service`, but the same `null` in `member_service` flows to the frontend which renders `--` — the two services *agree on nullability* but *disagree on meaning*, and nothing in the code says so.
**Recommendation:** Write one policy and enforce it (docstring in `backend/app/services/__init__.py` is fine):
- **Numeric fields with domain meaning** (raf, days_since_x, spend, counts): `None` means "unknown/no data"; **never** coerce to 0 or to a sentinel at the service layer. Pydantic response models type as `float | None` / `int | None`. Let the frontend render "—".
- **String display fields** (name, dob-as-string, plan, group): coerce to `""` at the service boundary so the frontend can always render, but **not** domain-meaning strings (`risk_tier`, `status`) — those stay typed.
- **Enum/category fields**: typed `Literal[...] | None`; never default to a valid value.
- **Alert rules**: `None` in a numeric metric is always `continue` (never fire). Codify as a helper: `_compare_nullable(value, op, threshold)` returning `False` on None.

Then do one pass through the round-4 diff: revert `"risk_tier": row.risk_tier or "low"` to `row.risk_tier`, keep `dob=""` only if Pydantic requires it (prefer `dob: str | None = None`), and delete every numeric `or 0`/`or 0.0` coercion in services. This retires round-1's "`_safe_float` / `_pct` / `_fmt_dollar` helpers across 23 files" finding by making most of them unnecessary.

---

### [IMPORTANT] `member_service.get_member_list` is now ~300 lines of SQL + 40 lines of row-to-dict assembly — round 1's "business logic in routers" has relocated to "business logic in one giant service function," not dissolved
**Location:** `backend/app/services/member_service.py:50-299` (entire `get_member_list`), round-4 edits at lines 129-134 and 275-296
**Structural issue:** Round 1's CRITICAL finding was "routers do service work." The response has been to move SQL *into* services, but not to compose the services. `get_member_list` now owns:
1. Subquery 1: last_visit_date per member (lines 73-82)
2. Subquery 2: total_spend_12mo per member (lines 84-93)
3. Subquery 3: er_visits_12mo per member (lines 95-107)
4. Subquery 4: admissions_12mo per member (lines 109-121)
5. Subquery 5: gap_count per member
6. Subquery 6: suspect_count per member
7. Days-since-visit epoch-math column (lines 129-134, touched this round)
8. Outer join assembly + dynamic WHERE from 8 filter keys
9. Dynamic ORDER BY from a `sort_by` parameter
10. Pagination
11. PCP-name post-fetch (N+1 avoidance in a second query)
12. Group-name post-fetch
13. Row → dict projection with 17 fields (lines 275-296, touched this round)

This is **six distinct analytic queries** (visits, spend, ER, admissions, gaps, suspects) composed into one mega-query plus a projector. Each of those six has a plausible home in its own domain service (`utilization_service.er_visits_12m_by_member`, `financial_service.spend_12m_by_member`, `care_gap_service.open_gaps_by_member`, etc.) — and round 1 already flagged that *those services exist* but don't own this query.
**Evidence:**
- The round-4 edit at line 129 (`days_since_visit_col = func.floor(...)` without coalesce) is a one-line correctness fix inside a 300-line function. It's correct. It also illustrates the problem: the reviewer cannot see in one screen what the surrounding SQL does, and cannot unit-test the days-since-visit decision independently from the rest of the query.
- The row-projection block (275-296) is the natural home of round-2's `MemberSearchResult` duplication problem — if this function returned structured Python dicts with a shared shape, the Pydantic model at `members.py:33-58` could be a derivation, not a hand-sync.
**Why it matters:** This is the round-1 "routers are doing service work" problem solved by **moving the problem, not dissolving it**. A MEDIUM-tier project with one mega-service-function per heavy endpoint is isomorphic to one mega-router-function per heavy endpoint. Tests are still integration-weight. Changes still require holding 300 lines in your head.
**Recommendation:** Split once, by column-source:
```python
# services/member_service.py
async def get_member_list(db, filters) -> dict:
    base = await _list_members_base(db, filters)          # member table + PCP + group (CTE or single query)
    stats = await _member_stats_batch(db, ids=base.ids)   # returns per-member visits/spend/er/admits/gaps/suspects
    return _assemble_member_rows(base, stats)             # pure function — unit-testable

async def _member_stats_batch(db, ids):
    return {
        "visits": await utilization_service.last_visit_and_days_since(db, ids),
        "spend":  await financial_service.spend_12m_by_member(db, ids),
        "er":     await utilization_service.er_visits_12m_by_member(db, ids),
        ...
    }
```
Now each sub-service owns its own columns. `get_member_list` is composition. This also makes `MemberRow` a derivable shape (round-2 hand-sync finding) and makes round-1's "business logic in routers" finding genuinely retirable — because the services it points to are now cohesive enough to absorb any remaining router SQL.

---

### [MINOR] `genderLabel()` in `MemberSummary.tsx` is the third "helper with no home" to appear in a presentational component in four rounds
**Location:** `frontend/src/components/journey/MemberSummary.tsx:32-39`
**Structural issue:** Round 3 flagged `daysColor()` and `daysAgoLabel()` in `MemberTable.tsx` as component-scoped helpers that should be a `<DaysSince>` component (per-field null handling). Round 4 adds `genderLabel()` in `MemberSummary.tsx` with the exact same shape: null check → known-value mapping → fallback. Three helpers in three components, zero extraction to `components/ui/` or `lib/format/`.
**Evidence:**
- `daysColor(days: number | null): string` at `MemberTable.tsx:39-44` — null returns `tokens.textMuted`.
- `daysAgoLabel(days: number | null): string` at `MemberTable.tsx:62-66` — null returns `"--"`.
- `genderLabel(g: string | null | undefined): string` at `MemberSummary.tsx:32-39` — null/empty/"U" returns `"gender unknown"`.
- Grep of `frontend/src/lib/format/` or `frontend/src/components/ui/format*` returns nothing.

Each helper is trivial in isolation. The pattern is that **no frontend file owns "display formatters for nullable domain values."** So every component invents its own. Multiply by (member age, member DOB, member plan, member PCP, provider specialty, claim paid_amount, gap measure...) and the round-1 backend `_safe_float` finding has a frontend twin that's 4 rounds of additions along.
**Why it matters:** The null-policy drift finding above is now a round-4 fact on the backend. The frontend formatter drift is its mirror image — the team is absorbing backend inconsistency by coding display fallbacks per component. When the backend policy is fixed (above finding), the frontend formatters become wrong/redundant in a distributed way; they'd ideally already live in one place.
**Recommendation:** `frontend/src/lib/format.ts` with `formatGender`, `formatDob`, `formatDaysSince`, `formatCurrency` (already duplicated in `MemberSummary.tsx:40` and elsewhere — grep for `formatCurrency` returns 8+ hits). Import from the one place. Pair with `<DaysSince value={...} />` for the presentational variant. This is a 30-minute mechanical PR and retires one round-3 finding.

---

### [MINOR] `mockApi.ts` is now 2,408 lines (+157 this round, +314 since round 1); round-4 adds *both* a new POST handler block and a new GET handler block without any sharding — this file has graduated from sprawl to load-bearing
**Location:** `frontend/src/lib/mockApi.ts:1053-1132` (new POST handlers), `:2160-2240` (new GET handlers)
**Structural issue:** Round 1 flagged the file at 2,094 with "shard by feature." Rounds 2 and 3 flagged growth. Round 4 adds two substantial inline blocks: a POST `/api/ingestion/upload` handler with an inline 5-column fixture + proposed-mapping dict (36 lines), a POST `/api/onboarding/discover-structure` handler with 3 groups × 2-3 providers inline (38 lines), and a GET block adding 8 Tuva/ingestion mock responses (lines 2160-2240, ~80 lines). The `else if` chain continues to grow, still ordering by line number.
**Evidence:**
- File size: 2,094 → 2,226 → 2,251 → 2,408. Each round has added, none has evicted.
- The `/api/ingestion/upload` POST mock (round 4) constructs the backend `UploadResponse` shape inline with a `proposed_mapping: Record<string, {platform_field, confidence, transform}>` dict. The real-code equivalent lives in `FileUpload.tsx`'s new `normalizeUploadResponse` helper. **Both define the `UploadResponse` shape independently** — round-2 finding ("shape defined in component, component owns the adapter") now has its third location: backend, component, mock.
- The `/api/onboarding/discover-structure` round-4 mock repeats the round-3 shape fix for `DiscoveredGroup`. That shape is now in 4 places: backend (`org_discovery_service.py`), frontend (`OrgDiscoveryReview.tsx`), mock (this file), and — per round 3 — an inline const elsewhere in `mockApi.ts`.
**Why it matters:** The file is now the *de facto* source of demo-shape truth. When a component change requires matching a shape, developers reach for `mockApi.ts` to see the shape, because `lib/api-contracts/` still doesn't exist. That is the worst possible role for a file this size — it should be passive fixtures, not the contract reference.
**Recommendation:** Unchanged from round 3 but more urgent — **the next mock change goes into `mockApi/<domain>.ts`**, not this file. Pair with round-2's `lib/api-contracts/<domain>.ts`. The round-4 ingestion/onboarding additions are the ideal first split: both have existing component + backend types that could be imported rather than redeclared.

---

## Trajectory note (fourth data point)

Each round has a characteristic shape. Round 4's is:

- **Null-policy** landed in one service and diverged across three others in the same diff.
- **State-map count** for `MemberDetail.tsx` crossed from "parallel maps" to "maps that must be read together" — a structural phase change, not just more of the same.
- **Pipeline completion** went from 3 in-place derivations to 5, now wrapped in a ref-guarded effect.
- **Mock file** added two handler blocks without sharding.
- **`get_member_list`** received a correctness edit at line 129 inside a 300-line function that everyone agrees is too big and no one has touched structurally.

Every round-4 fix is *correct*. None touched a boundary. The curve is flat for the fourth time.

---

## VERDICT: REQUEST CHANGES — retirement freeze

Round 4 closed zero cumulative items and added three new structural findings whose evidence is the round-4 diff itself. The team can ship point-fixes cleanly — that is demonstrated — but four consecutive rounds of "the architectural debt compounded at the exact rate of new work" means the curve will not bend on its own.

**Recommended discipline for round 5: feature freeze on the architecture surface.** No new endpoints, no new per-row state slots, no new `else if` in `mockApi.ts`, no new null-coercion helpers. Instead, pick exactly **one** of these four and retire it:

1. **`MemberDetail.tsx` reducer** — 40-line refactor, retires round-3 state-sprawl finding, prevents round-5 7th-map addition.
2. **`frontend/src/lib/format.ts` + `<DaysSince>`** — 30-minute mechanical PR, retires round-3 null-handling-helpers finding and round-4 `genderLabel` finding in one move.
3. **Null-policy doc + `risk_tier or "low"` revert pass** — 1-hour PR, retires round-4 null-drift finding, establishes a standing rule.
4. **Shard `mockApi.ts` ingestion block → `mockApi/ingestion.ts` + `lib/api-contracts/ingestion.ts`** — 2-hour PR, retires round-1 mock sprawl, round-2 `normalizeUploadResponse` location, round-2 `UploadResponse` shape drift, and round-4 mock-grown-without-sharding in a single surgical action.

Item 4 has the highest retirement-per-hour. That's where I'd aim round 5.
