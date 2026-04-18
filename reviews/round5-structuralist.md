# Structuralist Review — Round 5

**Agent:** The Structuralist
**Tier:** MEDIUM (unchanged)
**Scope:** Round-5 delta after the round-4 "retirement freeze" ultimatum. User declined to retire any cumulative item as a whole, but landed a coordinated `risk_tier`-null-policy alignment across 4 files (service, router, table, mock), extracted a shared `pipelineSucceeded` predicate, moved RAF-trajectory monthly bucketing from SQL to Python, widened `days_not_seen` to include null, and added a `hasFetchedOkRef` poll-deadlock fix.

---

## DID THEY RETIRE ANYTHING? (answer directly, be fair)

**Half of one item — and it's the right half.** The round-4 null-drift finding listed four conventions: (1) numeric null-as-unknown, (2) numeric null-as-trigger (skip), (3) string null-as-empty, (4) domain-meaning-null-as-default (`risk_tier or "low"`). Round 5 retired convention (4) at its primary site and codified a rule: `risk_tier` is `str | None` end-to-end through `member_service.get_member_list` → `MemberRow` Pydantic model → `MockMember` TS type → `tierTag()` which now returns a `"unknown"` label for null.

That is a **genuine cross-layer policy decision**, not a point fix. It touches:
- `backend/app/services/member_service.py:294, 409` — emit `row.risk_tier` directly (was `or "low"`)
- `backend/app/routers/members.py:41` — `risk_tier: str | None = None` (was `"low"`)
- `backend/app/routers/members.py:43` — `days_since_visit: int | None = None` (was `999`)
- `frontend/src/components/members/MemberTable.tsx:45, 60-66` — `tierTag` returns `label: "unknown"` for null input, `daysColor`/`daysAgoLabel` accept `number | null`
- `frontend/src/lib/mockData.ts:3083, 3085` — `MockMember.risk_tier: "low" | "rising" | "high" | "complex" | null`, `days_since_visit: number | null`
- `frontend/src/pages/MembersPage.tsx:156` — CSV export uses `m.days_since_visit ?? ""`

Comments in `member_service.py:287-291` state the policy ("Emit null for unknown tier rather than 'low' — misclassifying an unknown-risk member as low-risk is a clinical sentinel bug"). Round 4's finding called that out specifically; it is now fixed with a rationale in code.

**This counts.** Credit where due. It does not fully retire the null-drift item (see NEW FINDINGS §1 — `hcc.py`, `fhir_service.py`, and `journey.py`'s own Pydantic defaults still ship three other conventions), but it is the first cumulative-structural-item needle-movement across five rounds.

**Updated cumulative retirement count: 0.5 / 29.**

---

## STRUCTURAL IMPROVEMENTS THIS ROUND

1. **`journey_service.get_member_risk_trajectory` — SQL→Python monthly bucketing.** The round-3 Postgres-only `func.to_char` is gone (lines 269-283). Now uses `service_date.strftime("%Y-%m")` in Python. Portable, testable, and the comment explicitly calls out the SQLAlchemy dialect-translation gap. Net: +50 lines in this function, but three new features (monthly cost, HCC-captured event marker, gap-closed event marker) ride on the same bucketing logic. **This does not retire the round-3 "cross-domain fat function" finding** — the function now touches 4 tables (RafHistory, Claim, HccSuspect, MemberGap) instead of 1 — but the dialect-coupling sub-finding *is* retired.

2. **`pipelineSucceeded` centralization in `WizardStep5Processing`** (lines 256-261). The round-3 finding ("3× inline `steps.some(...)` derivations") and round-4 finding ("5 in-place derivations") are now consolidated into one named predicate plus three component-level names: `anyFailed`, `allTerminalOk`, `hasRealCompletion`. `pipelineSucceeded` is read from two sites: the `onComplete` effect and the success-metrics render gate. That is a real improvement over rounds 3 and 4. **It is not the `usePipelineCompletion` hook I suggested** (see NEW FINDINGS §2 — the component still owns the logic, it's just named now), and three in-component derivations still exist (`allDone`, `anyFailed`, `allTerminalOk`) where the hook would collapse them to one memoized record. But one variable name beats five copies.

3. **`members.get_member_list` — null-as-"also overdue"** (lines 228-234). The `days_not_seen` filter now `(days_since_visit >= threshold) OR days_since_visit IS NULL`. That is the correct semantics (a never-seen member is *more* overdue than a 181-days-overdue one) and it is documented in a comment. Retires a silent-false-negative bug class.

4. **`get_member_detail` null convention aligned to `get_member_list`** (lines 402-421). The same four coercion decisions made in the list endpoint are now made in the detail endpoint, with a comment explicitly cross-referencing the two. Before this round, the same field was null-as-empty in one endpoint and null-as-literal in the other. Round 2's "null-is-a-signal protocol" finding has its first site-to-site consistency enforcement.

5. **`JobHistory.hasFetchedOkRef` — poll-recovery after transient fetch failure** (lines 43-49, 67-70). Addresses the round-3 ref-shadow correctness issue. The comment explicitly describes the stale-snapshot + API-outage deadlock that this prevents. Unit-level, but structurally it upgrades the poll loop from "trust last snapshot" to "distinguish 'no work' from 'never succeeded'," which is the right invariant for the single-long-lived-`setInterval` pattern.

6. **`fhir_service.get_capability_statement` — only advertise active handlers** (lines 111-115). A small but correct structural fix: the FHIR contract no longer claims resources it silently skips. Retires a half-line of contract drift (round-1 Tuva string-replace is not affected; that was a different finding).

---

## STILL OPEN (cumulative, with updated count)

**From round 1 (15 → 15):** router-layer SQL not dissolved, 73-service sprawl, microservices-framing mismatch, Alembic empty, tenant-session discipline (partial progress elsewhere), Tuva string-replace contract, `_safe_float`/`_pct`/`_fmt_dollar` sprawl across 23 files, no `React.lazy`, `mockData.ts` 7,272 lines, 57-name router import line, Tuva class vs function-module drift, localStorage filter interceptor, 3 worker containers, 5+ demo-mode paths, `common_column_aliases.py` static-data-as-code.

**From round 2 (8 → 7):** `normalizeUploadResponse` still in `FileUpload.tsx` (no `lib/api-contracts/`); `dashboard.py /summary` inline imports + router business logic (round 5 *added* inline import in the summary handler — lines 149-150); ~~`/api/journey/members` duplicates `/api/members`~~ — **round 5 made this worse**, not better: the endpoint is now defined in `routers/journey.py:120-147` with its own `MemberSearchResult` Pydantic shape that partially overlaps `MemberRow` (see NEW §3); `MemberSearchResult` is now a second hand-synced shape; `get_member_risk_trajectory` cross-domain fat function (rewrote, didn't split); `WizardStep5` `runStep` vs loop body — **round 5 extracted `runStep`** but the loop body in `runRealPipeline` still inlines the identical state-transition logic rather than calling `runStep` (see NEW §4); `mockApi.ts` growth without sharding; `/api/tuva/member/:id` null-is-a-signal protocol.

**From round 3 (6 → 5):** `MemberDetail.tsx` 6-map state sprawl (unchanged, 6 maps + retry reader still in place); ~~`journey_service.py` Postgres-only `to_char`~~ **retired**; `JobHistory.tsx` ref-shadow (improved but still 4 refs: `pollTimerRef`, `isMountedRef`, `jobsRef`, `hasFetchedOkRef`); `MemberTable.tsx` per-field null helpers (still scattered — `genderLabel` now joined the party in `MemberSummary`, plus `tierTag`/`daysColor`/`daysAgoLabel`); `WizardStep5` 3× derivation (**named not extracted** — half-retired); `mockApi.ts` trajectory (actual working-tree is 2,251, not my round-4 claim of 2,408; still +157 this round).

**From round 4 (3 → 2.5):** `MemberDetail.tsx` reducer still not extracted (+6 maps, +retry reader); **null-policy half-retired** via `risk_tier`/`days_since_visit` alignment; `genderLabel` no-home helper still in place.

**Total carried forward: ~26.5 structural items.** First non-zero retirement progress in five rounds. The user's assertion that "sharding mockApi is a separate PR" is a defensible scoping call — but sharding would still retire three items with one move, and no round has chosen that target.

---

## NEW FINDINGS

### [IMPORTANT] Null-policy is half-aligned — `hcc.py`, `fhir_service` ingest path, and `journey.py` Pydantic defaults still ship three older conventions

**Location:** `backend/app/routers/hcc.py:594`, `backend/app/routers/journey.py:62-65, 85-89`, `backend/app/routers/members.py:41` (reference)
**Structural issue:** Round 5 codified `risk_tier: str | None = None` in `MemberRow` and the frontend `MockMember`. Good. But `routers/hcc.py:594` still emits `"risk_tier": row.risk_tier if row.risk_tier else ""` in its chase-list JSON response — the same field is nullable in one endpoint and empty-string in another, for the same underlying column. Meanwhile `routers/journey.py:82-89` added a new Pydantic model (`TrajectoryPoint`) that chose convention (5): **"null-as-typed-zero-with-no-Optional"** — `cost: float = 0.0`, `disease_raf: float = 0.0`, `hcc_count: int = 0`, no `| None`. That means the frontend trajectory chart can never render "missing month" vs "month with real $0 spend" — they collapse to the same value. Claims of $0 in a month where the member had no claims are operationally different from "we don't have claim data for this month yet" and the schema forbids expressing that.
**Evidence:**
- `member_service.py:294, 409`: `"risk_tier": row.risk_tier` (round 5 alignment, emits null)
- `hcc.py:594`: `"risk_tier": row.risk_tier if row.risk_tier else ""` (unchanged, emits empty string)
- `members.py:41`: `risk_tier: str | None = None` (round 5, matches service)
- `journey.py:62-65`: `total_spend_12m: float = 0.0; open_suspects: int = 0; open_gaps: int = 0` — optionality removed this round (was `| None`)
- `journey.py:85-89`: `TrajectoryPoint.disease_raf: float = 0.0; demographic_raf: float = 0.0; hcc_count: int = 0; cost: float = 0.0` — same; only `event` kept `str | None`
- `journey_service.py:132, 136`: `"dob": "" if no dob; "age": 0 if no dob; "gender": ... or ""` — string-null-as-empty convention, does not match `member_service.py:406` which emits `"age": age if member.date_of_birth else None`

So the same two services disagree on `age` nullability: `journey_service` says "0 = unknown," `member_service` says "null = unknown." Both are in the round-5 diff. Both are internally coherent. They cannot both be right.
**Why it matters:** (1) The half-alignment is worse than the full drift for one reason: callers *now have a rule* (null = unknown) for some fields, which makes the non-null-or-zero endpoints look like real-data-zero. A frontend that writes `if (point.cost > 0)` to filter "real" months will silently drop actual $0 months. (2) The round-5 `risk_tier` sentinel-bug fix is exactly right at the site where it was made and exactly wrong everywhere else the same field is emitted. (3) Without a `backend/app/schemas/` package that owns the canonical shape for Member/Trajectory, each endpoint will continue to make this decision locally.
**Recommendation:** Pick this up next round as a finishing pass — it's maybe 40 lines:
```python
# hcc.py:594
"risk_tier": row.risk_tier,   # not `or ""`
# journey.py:62-65 — restore Optional where meaning diverges from zero
total_spend_12m: float | None = None
open_suspects: int | None = None
# TrajectoryPoint — same treatment for cost
cost: float | None = None   # None = no data; 0 = real zero
```
Then a one-paragraph docstring in `backend/app/schemas/__init__.py` (or `services/__init__.py`) stating the rule. This retires the round-4 null-drift finding in full and hardens the round-5 alignment.

---

### [IMPORTANT] `pipelineSucceeded` is named but not a hook — the component still owns the state machine

**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:255-265, 300, 323`
**Structural issue:** Round 4 recommended extracting `usePipelineCompletion(steps)` returning `{ allTerminal, hasError, hasRealCompletion, succeeded }`. Round 5 instead created four local variables (`anyFailed`, `allTerminalOk`, `hasRealCompletion`, `pipelineSucceeded`) at the top of the component body. The component dropped from "five in-place derivations" to "one derivation at one site, read from three places" — that is a real improvement, but the component is now **783 lines** (664 → 783, +119 this round), up from 664 before round 4, and it still owns:
1. `API_STEPS` (still inline; round 3 asked to hoist — still not done)
2. `runStep` (extracted this round — good)
3. `runRealPipeline` — **still duplicates the state-transition body from `runStep`** at lines 142-172, does not iterate `await runStep(...)`
4. `runDemoPipeline`
5. The completion effect with `hasNotifiedCompleteRef` guard
6. Per-row retry binding (new this round at lines 282-297 — inline closure over `API_STEPS.find`)
7. Two summary banners (warning + error, new this round)
8. Success metrics gate
9. `PipelineStepRow` sub-component
**Evidence:** The round-5 `runStep` extraction (lines 141-168) is correct but unused by `runRealPipeline`: lines 173-220 still contain a hand-copy of the same `setSteps(... running ...) → await api.post(...) → setSteps(... complete/warning/error ...)` shape. So `runStep` is defined and called **only by the retry path** (line 285). That is worse than either (a) not extracting or (b) extracting and using: it creates two divergent copies of the step-transition logic that will drift the first time the backend result shape changes.
**Why it matters:** (1) If `runStep` changes (e.g., new "timeout" status) and `runRealPipeline` is not updated, first-run and retry will produce different terminal statuses for the same error. (2) The ref-guarded effect (`hasNotifiedCompleteRef`) exists because a retry flips a step back to "running" then "complete," which re-satisfies `pipelineSucceeded` and re-fires `onComplete`. A hook that exposed `{ succeeded, hasNotified }` with the ref *inside* the hook would let the component be declarative. (3) The two new summary banners (lines 300-343) each re-read 3 of the 4 predicates; adding a 4th banner (e.g., "partially complete") would require touching 4 call-sites again.
**Recommendation:**
```tsx
// hooks/usePipelineRun.ts  (~60 lines total)
export function usePipelineRun(steps, { demoMode, onComplete }) {
  const { allTerminal, hasError, hasRealCompletion, succeeded } = useMemo(
    () => derive(steps), [steps]
  );
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (succeeded && !notifiedRef.current) { notifiedRef.current = true; onComplete?.(); }
  }, [succeeded, onComplete]);
  return { allTerminal, hasError, hasRealCompletion, succeeded };
}
```
Then `runRealPipeline` becomes `for (const step of API_STEPS) await runStep(...)` — `runStep` has one caller, the duplication is gone, and the ref lives with the predicate it guards. Net diff: subtract 80 lines, retire round-2 `runStep` duplication, round-3 3×-derivation, round-4 5×-derivation + ref-guard in one move.

---

### [IMPORTANT] Round 5 *added* a new router duplicate: `/api/journey/members` + `MemberSearchResult` — the round-2 "two member list endpoints" finding is now permanent

**Location:** `backend/app/routers/journey.py:68-74, 97-126`
**Structural issue:** Round 2 flagged `/api/journey/members` as a duplicate of `/api/members`. Round 5 *built* that endpoint, inline, with its own Pydantic model (`MemberSearchResult`) whose fields (`id`, `member_id`, `name`, `dob`, `current_raf`) are a strict subset of `MemberRow`. Two concerns:

1. There are now **three `MemberX` response shapes** for what is operationally "a member": `MemberRow` (`routers/members.py:33`), `MemberSummary` (`routers/journey.py:50`), and `MemberSearchResult` (`routers/journey.py:68`). Each hand-picks a field subset. None are derivable from the others.
2. The endpoint uses its own inline query (`select(Member).order_by(...).limit(...)`, then a whole second `select(Member).where(...)` if `search`). The first branch uses `nullslast()`; the second does not. The pagination contract is different from `GET /api/members` (no `total`, no `page`, no `items` envelope — it returns a bare list).
**Evidence:**
- Lines 68-74 define `MemberSearchResult(BaseModel)` with 5 fields.
- Lines 97-126 define `list_journey_members` with inline SQLAlchemy, two code paths (`if search:` re-executes the stmt creation), and returns `list[MemberSearchResult]`.
- `routers/members.py:33-58` defines `MemberRow` with 20 fields; `members.py:80-108` returns `{items, total, page, page_size}` envelope.
- `MemberSearchResult.dob: str` (not `str | None`) — violates the round-5 null alignment rule just codified in the same PR.
**Why it matters:** (1) Round 2 was "pick one of these two endpoints and have the other delegate." Round 5 solidified both. (2) The wire contract for "member picker" is now independent of the contract for "member list" — any member-shape change (pcp object, plan object, tier badge) has to be coordinated across three routers. (3) `MemberSearchResult.dob: str` emits empty string for missing dob per round-5 convention, but `MemberRow.dob: str = ""` does the same — so the two shapes happen to agree today, but the dissociation is already encoded. A future frontend that refactors to use `member.dob ?? "—"` will work for one endpoint and not the other.
**Recommendation:** Either
```python
# journey.py — delegate to member_service
@router.get("/members")
async def list_journey_members(limit=250, search=None, db=..., user=...):
    res = await member_service.get_member_list(db, {"search": search, "page_size": limit, "page": 1})
    return [{"id": r["id"], "member_id": r["member_id"], "name": r["name"],
             "dob": r["dob"], "current_raf": r["current_raf"]} for r in res["items"]]
```
or hoist `MemberSearchResult` to a shared `schemas/member.py` and make both routers import it — and give `MemberRow` a `.to_search_result()` projection. The inline SQLAlchemy in the router (round-1 finding) is also present here; delegating to the service retires that sub-finding at this site.

---

### [MINOR] `MemberDetail.tsx` retry error-extraction helper (`extractErrorMessage`) is the fourth in-component status→message mapper in the diff — candidate for `lib/apiError.ts`

**Location:** `frontend/src/components/suspects/MemberDetail.tsx:62-70`, `frontend/src/components/query/AskBar.tsx:70-80`, `frontend/src/components/ingestion/FileUpload.tsx:168-175`, (round-4 `JobHistory.tsx` inline)
**Structural issue:** Four files in the round-5 diff contain a near-identical function that maps `err?.response?.status` + `err?.response?.data?.detail` + `err?.message` to a user-facing string. The mappings overlap but diverge in small ways:
- `MemberDetail.extractErrorMessage`: handles 403, 409, Network Error
- `AskBar` inline `catch`: handles 429, 504/408, 400, 401/403, Network Error
- `FileUpload` inline `catch`: handles 413, 415, 504/408, Network Error
- `JobHistory` inline: silent catch only

403 means "you don't have permission" in `MemberDetail` and "you don't have access to this query" in `AskBar`. 504 means "Server took too long" in `FileUpload` and "The AI is taking too long" in `AskBar`. Per-site copy is fine; per-site **structure** is not.
**Evidence:** `MemberDetail.tsx:62-70` (new this round), `AskBar.tsx:70-80` (new this round), `FileUpload.tsx:168-175` (new this round). Three new copies landed in one round; the frontend `lib/` contains no `apiError.ts`.
**Why it matters:** When the backend adds a new status mapping (e.g., 402 for quota), three files need edits and will almost certainly drift. The error-handling structure matches the round-1 `_safe_float`/`_pct`/`_fmt_dollar` finding on the backend and the round-3 `daysColor`/`daysAgoLabel` finding on the frontend — per-site helpers for the same concern.
**Recommendation:**
```ts
// frontend/src/lib/apiError.ts
export function apiErrorMessage(err: unknown, fallback: string, overrides?: Partial<Record<number, string>>) { ... }
```
Each site passes its own copy for the few statuses where wording matters (`{ 429: "AI is busy — try again" }`); the rest fall through to shared defaults. Retires the round-1 "helpers duplicated across N files" pattern on the frontend in one 20-line file.

---

## Trajectory note (fifth data point)

Round 5's shape is the first inflection I've seen:
- **Null-policy** got its first real cross-layer alignment (`risk_tier`, `days_since_visit`) — half-retired.
- **`steps.some(...)` derivation** collapsed from 5 copies to 1 named predicate — half-retired (no hook).
- **`runStep` extraction** landed (round-2 ask) but wasn't wired into the main loop — *partial*.
- **`journey_service`** dialect-coupling sub-finding retired cleanly.
- **`JobHistory`** went from "works-if-first-fetch-succeeds" to "works-always," within the same ref-pattern envelope.

But the round-5 diff also *added* two new structural items: a duplicate `/api/journey/members` endpoint with a third hand-synced `MemberX` Pydantic shape, and three new in-component API-error formatters. Net change in items: **−1.5 retired, +2 added = +0.5 structural items this round**, despite the first real progress. The inflection is real but small.

---

## VERDICT: APPROVE WITH NOTES — first non-zero retirement progress in five rounds

Round 5 is the first round that touches an architectural surface instead of a point. The `risk_tier` null alignment across 4 files is a genuine cross-layer policy decision with a documented rationale, and the `pipelineSucceeded` consolidation is a real step down from the round-4 5× derivation. Credit both.

The retirement is half-complete at each site and two new items were added alongside (`/api/journey/members` duplicate + `MemberSearchResult` third shape, three more inline API-error helpers). Net structural debt is roughly flat — but the curve is finally not monotonically increasing. That matters.

**Recommended discipline for round 6 (one concrete target, finish-what-you-started):**

1. **Null-policy finish pass** (1 hour): revert `hcc.py:594` to `row.risk_tier`, reintroduce `Optional` on `TrajectoryPoint.cost` and `MemberSummary.total_spend_12m`/`open_suspects`/`open_gaps` in `routers/journey.py`, align `journey_service.py` `age`/`gender` with `member_service`. Writes the policy comment in one place. **Retires the round-4 null-drift finding in full** on top of the round-5 half-step.

2. **`usePipelineRun` hook** (1 hour): move `runStep` + `pipelineSucceeded` + `hasNotifiedCompleteRef` + the effect into `frontend/src/hooks/usePipelineRun.ts`. Have `runRealPipeline` iterate `await runStep(...)` instead of reimplementing the state-transition. **Retires round-2 `runStep` duplication + round-3 3×-derivation + round-4 5×-derivation simultaneously.**

Either one is ~1 hour and retires 2-3 items. That is a better ratio than anything round 5 attempted, and the round-5 foundation (named `pipelineSucceeded`, extracted `runStep`) makes both cheap.

Do not merge the `/api/journey/members` duplicate without at least hoisting `MemberSearchResult` to a shared schemas module — that is the one regression I'd flag as a merge blocker.
