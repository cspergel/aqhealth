# The Contractualist — Round 4 Review

**Scope:** Verify round-3 fixes landed on BOTH producer and consumer sides, catch new drift introduced by the round-4 changes. Cumulative round-1/2/3 items still-open re-listed once, not re-analyzed. Auth/security items deferred per user.

---

## ROUND-3 CLOSED (verified both sides)

### [CRITICAL] `MemberSummary.tsx` gender ternary — CLOSED
Consumer `frontend/src/components/journey/MemberSummary.tsx:32-39` introduces `genderLabel()` that handles case-insensitive `F/FEMALE`, `M/MALE`, `U/UNKNOWN`, `""`, `null`, `undefined`. The render site (line 71-74) now calls `genderLabel(member.gender)` and conditionally renders `${member.age}yo` only when `member.age` is truthy (else `"age unknown"`), and `DOB: {member.dob || "—"}` so the empty-string producer never leaks into the UI. Against the producer `journey_service.py:136 "gender": member.gender or ""` — all five shapes backend can emit (`"M"`, `"F"`, `"U"`, `""`, `None`) now render correctly. The round-3 "every unknown-gender member renders as Male" regression is real-fixed. Note: `genderLabel` also accepts strings the backend can't currently emit (e.g. `"X"`, `"Other"`) and falls through to a raw passthrough, which is defensible forward-compat.

### [IMPORTANT] `days_since_visit` sentinel removed on producer side — CLOSED
Producer `backend/app/services/member_service.py:132-137` no longer coalesces to 9999 in SQL; `member_service.py:288` emits `None` when `row.days_since_visit` is null. Router `backend/app/routers/members.py:43 days_since_visit: int | None = None` accepts null. Alert-rules producer `backend/app/services/alert_rules_service.py:212-215` now uses `continue` when `last_visit` is null instead of treating as 9999 — the "fires on every fresh tenant" bug is real-fixed. Frontend consumer `MemberTable.tsx:39-40,61-62` adds `days == null` guards on `daysColor` and `daysAgoLabel`. `mockData.ts:3085` widens the type to `number | null`. `MembersPage.tsx:156` CSV export uses `m.days_since_visit ?? ""`. Backend sort `member_service.py:251,253` explicitly `.nullslast()` so Postgres-vs-SQLite null ordering dialect drift can't bite. All six touchpoints agree.

---

## STILL OPEN (cumulative — rounds 1+2+3 items NOT fixed this round)

1. **`conditions=` query param dropped** — `MembersPage.tsx:66` still sends `params.conditions`; `members.py:134-152` still declares no such Query param. Advanced filter builder still demo-only.
2. **`MemberRow.snf_days_12mo` ghost** — `members.py:52` still has TODO comment; `member_service.py:276-295` still never emits the key.
3. **`MemberRow.group_id` unpopulated** — `member_service.py:276-295` still no `"group_id"` in item dict even though `PracticeGroup.id` is available.
4. **`sort_order` vs `order` naming** — `hcc.py:158` still `sort_order`; `members.py:148` + `providers.py` still `order`.
5. **`ProviderRow` vs `ProviderListItem` two shapes** — `dashboard.py:73-79` vs `providers.py:44`.
6. **`SuspectRow` / `Suspect` TS duplication** — `ChaseList.tsx` + `MemberDetail.tsx`.
7. **DuckDB schema-prefix string-replace hack** — `tuva_data_service.py:59` + bypass at line 330.
8. **Mock `avg_v24_risk_score` spurious** — `mockApi.ts` still emits V24 field real backend removed.
9. **`"(unmapped)"` sentinel string** — `FileUpload.tsx:47` still posts literal `"(unmapped)"`.
10. **`job_id` string-vs-int drift** — `FileUpload.tsx:59` still stringifies; `UploadResult.job_id: string`.
11. **Journey search mock ignores `search` param** — `mockApi.ts:1413-1422` still only filters by `providerIds`.
12. **`confirm-mapping` status drift** — mock returns `"completed"`, real returns `"validating"`.
13. **Round-3 #2 `age: 0` + `dob: ""` semantic wrongness** — `journey_service.py:133-135` still coerces to `0` / `""`; `journey.py:54-55 age: int, dob: str` still required. Covered by `MemberSummary.tsx` render fix but schema-level ambiguity remains.
14. **Round-3 #4 mock `discover-structure` vs REAL backend shape** — mock `{groups, unmatched_count}` vs real backend `{proposed_groups, existing_groups, routing_summary}`. First real-backend call still breaks.
15. **Round-3 #5 mock sort comparator null handling** — `mockApi.ts:1600-1604` sort comparator `av - bv` with no null guard; `null - X` coerces to `-X` silently.
16. **Round-3 #6 `journey_service` mixed null-coerce convention** — `dob`/`age`/`gender` coerced, `health_plan`/`pcp`/`risk_tier` still nullable.

---

## NEW FINDINGS (introduced by round-4 changes or uncovered while verifying them)

### [CRITICAL] `journey_service.get_member_risk_trajectory` uses Postgres-only `func.to_char` with misleading comment — cost overlay silently zero on SQLite
**Producer:** `backend/app/services/journey_service.py:271-288` — comment claims `"Use to_char (Postgres; SQLAlchemy maps this to strftime on SQLite)"`. This is factually incorrect. SQLAlchemy does NOT auto-translate `func.to_char` to SQLite's `strftime`; it emits the literal SQL `to_char(service_date, 'YYYY-MM')`. SQLite returns a syntax error, the `except Exception:` swallows it (line 287-288), `cost_by_month = {}`, and every trajectory point gets `cost: 0.0`.
**Consumer:** Router `backend/app/routers/journey.py:85 cost: float = 0.0` (default satisfies Pydantic when producer emits nothing). Frontend `JourneyPage.tsx:59 cost: number` (required) — receives `0.0` for every month. `RiskTrajectory.tsx` overlays render a flat-zero cost line.
**Drift:** The try/except converts a SQLite dialect incompatibility into silently-wrong data with no log, no sentinel, no warning. Pydantic validation passes because `cost: float = 0.0` is the default. The `hcc_count` and `event` fields in the same response depend on nothing SQLite-incompatible, so the UI renders a partial trajectory that looks intentional.
**Evidence:**
```python
# producer (journey_service.py:271-288)
# "maps this to strftime on SQLite" -- this is NOT true; to_char has no SQLite equivalent in SQLAlchemy core
try:
    cost_q = await db.execute(
        select(func.to_char(Claim.service_date, "YYYY-MM").label("ym"), ...)
    )
    ...
except Exception:
    cost_by_month = {}
```
```ts
// consumer (JourneyPage.tsx:59) — typed required
interface TrajectoryPoint { ...; cost: number; ... }
```
**Recommendation:** Either (a) compute monthly spend in Python by iterating claim rows and grouping in memory, or (b) use a dialect-aware expression: `case((db.bind.dialect.name == "postgresql", func.to_char(...)), else_=func.strftime("%Y-%m", ...))`. At minimum drop the false comment and narrow the except to `DatabaseError` with a logger warning so the silent-zeros mode is observable. **CROSS: [Skeptic]** — this is also a correctness finding, not purely a contract finding.

### [IMPORTANT] `get_member_detail` is NOT aligned with the round-3/4 null-coerce convention — parallel endpoint still emits `None` for required-looking fields
**Producer:** `backend/app/services/member_service.py:392-412` — still emits:
```python
"dob": str(member.date_of_birth) if member.date_of_birth else None,     # line 395
"pcp": pcp_name,                                                          # line 396 — None when unassigned
"risk_tier": member.risk_tier,                                            # line 400 — None until HCC engine runs
"plan": member.health_plan,                                               # line 401 — None for members without plan
"demographics": {"age": age, "gender": member.gender, "zip_code": ...}    # line 402-406 — gender can be None
```
None of these have a `response_model`, so Pydantic doesn't validate them, but the round-3/4 fix to `get_member_list` coerced all four of `dob`/`pcp`/`risk_tier`/`plan` to `""` / `"low"`. The **same service file** has two inconsistent null-coerce conventions for the same fields.
**Consumer:** No frontend caller hits `/api/members/{id}` today (confirmed via grep of `api.get.*members`). But `mockApi.ts:1565-1568` returns the flat list-row shape (`member || {error: "Not found"}`) with `dob: ""` (per round-3 mock changes). The real backend returns `{demographics: {age, gender, zip_code}, suspects: [], gaps: [], recent_claims: []}` with `dob: None`. If any component ever starts hydrating from this endpoint, it will hit three separate shape mismatches at once: (a) `null` vs `""`, (b) flat vs nested `demographics`, (c) totally different field set. Currently latent; would be a crash-on-first-integration.
**Drift:** The round-3/4 fixes landed half the null-coerce work. The other endpoint reading from the same `Member` model still returns the pre-fix shape. Convention drift between two functions in the same service file.
**Evidence:**
```python
# list endpoint (member_service.py:279-290) — coerces to ""/"low"
"dob": str(row.date_of_birth) if row.date_of_birth else "",
"risk_tier": row.risk_tier or "low",
"plan": row.health_plan or "",
# detail endpoint (member_service.py:395-401) — emits None
"dob": str(member.date_of_birth) if member.date_of_birth else None,
"risk_tier": member.risk_tier,
"plan": member.health_plan,
```
**Recommendation:** Apply the same coercion to `get_member_detail`, AND add a `MemberDetailOut` Pydantic response_model on `/api/members/{member_id}` (currently at `members.py:116` with no `response_model=`). Also emit `days_since_visit` in detail so the two endpoints agree on what they publish about visit history. Otherwise pick an Optional-fields-render-with-dash convention and flip the list endpoint back to emit `None`.

### [IMPORTANT] `/api/skills/execute-by-name` response contract is not documented and WizardStep5 depends on implicit string values
**Producer:** `backend/app/routers/skills.py:134-139` returns an untyped dict — `{"action": body.action, "resolved_action": action, "summary": ..., **result}` where `result` is whatever `_execute_step` returned. `_execute_step` emits `{"status": "completed" | "failed" | "not_implemented", ...}` (per `skill_service.py:328, 331, 337, 340, 346, 349, 355, 358, 364, 367, 373, 376, 380, 384, 388, 392, 396, 400, 406, 409, 415`). There is NO response_model, NO Pydantic schema, NO API doc — the string enum is implicit.
**Consumer:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:150-151, 184-185` checks:
```ts
const isStub = result.status === "stub" || result.status === "not_implemented";
const isFailed = result.status === "failed" || result.status === "error";
```
Backend never emits `"stub"` or `"error"` (grep `skill_service.py` confirms). These branches are dead code. The happy path is: any backend response NOT matching `"failed"` or `"not_implemented"` falls through to the frontend's own `"complete"` state — including a future `"partial"`, `"degraded"`, `"skipped"`, etc. that the backend could legitimately return.
**Drift:** Implicit string-enum contract across two codebases with two different vocabularies (backend: `completed/failed/not_implemented`; frontend: `complete/warning/error` + extra checks for `stub/error`). Any future status the backend adds will be silently misclassified as "complete" by the wizard's gate logic at line 262-265 (`s.status === "complete" || s.status === "warning"`), advancing a potentially-broken pipeline.
**Evidence:** see snippets above.
**Recommendation:** Make the contract explicit. Define a `SkillExecutionResult` Pydantic schema on `skills.py` with `status: Literal["completed", "failed", "not_implemented"]`. Update WizardStep5 to match those exact values (`result.status === "completed"` → `"complete"`; `result.status === "failed"` → `"error"`; `result.status === "not_implemented"` → `"warning"`). Remove the dead `"stub"`/`"error"` checks on the frontend so any future backend string gets a loud type error, not a silent "this counts as success."

### [IMPORTANT] New `GET /api/journey/members` and existing `mockJourneyMembers` both use `current_raf` as primary sort/ranking key but mock list is NOT sorted
**Producer (real backend):** `backend/app/routers/journey.py:104` — `select(Member).order_by(Member.current_raf.desc().nullslast()).limit(limit)`. Returns highest-RAF first, null-RAF last.
**Producer (mock):** `frontend/src/lib/mockApi.ts:1413-1422` returns `mockJourneyMembers` verbatim without sorting. `mockData.ts:1779-1785` seed order is `[1.847, 1.234, 2.456, 0.800, 1.100]` — not sorted.
**Consumer:** `JourneyPage.tsx:80` stores them into `members: MemberSearchResult[]` and renders whatever order arrives. No client-side re-sort.
**Drift:** Demo mode shows a scrambled list; real backend shows sorted-by-RAF. A partner watching the demo learns a different UX than what the product ships.
**Evidence:**
```python
# real backend
select(Member).order_by(Member.current_raf.desc().nullslast()).limit(limit)
```
```ts
// mock — no sort
mockResponse = mockJourneyMembers;  // [1.847, 1.234, 2.456, 0.800, 1.100]
```
**Recommendation:** Sort the mock response to match real-backend order, OR have the frontend sort client-side regardless of source (more robust). Prefer the latter — relying on server ordering is brittle when demo and real sources differ.

### [MINOR] `MemberSearchResult.dob` emit format diverges between list and detail producers in the same module
**Producer A:** `backend/app/routers/journey.py:119` uses `m.date_of_birth.isoformat()` → `"1953-08-14"` (ISO 8601).
**Producer B:** `backend/app/services/journey_service.py:132` uses `member.date_of_birth.isoformat()` → `"1953-08-14"`.
**Producer C (member list):** `backend/app/services/member_service.py:279` uses `str(row.date_of_birth)` → `"1953-08-14"` in CPython for a `date` object. Same output but different call path — `str()` is a fragile contract (breaks if `date_of_birth` ever becomes `datetime`, which would emit `"1953-08-14 00:00:00"`).
**Consumer:** `frontend/src/pages/JourneyPage.tsx:17 dob: string` — format not validated.
**Drift:** Three callers of the same field use three different serialization patterns. Correct today, brittle against schema migrations.
**Evidence:** three patterns across one module for one field.
**Recommendation:** Consistently use `.isoformat()` with a null-guard in all three spots. `str(date)` is an implementation detail of Python's stdlib, not a contract.

### [MINOR] `WizardStep5Processing` retries by skill name but doesn't re-verify error status on `_execute_step`'s `"not_implemented"` path
**Producer (action list):** `skill_service.py:380-400` — `data_load → run_quality_checks`, `ai_insights → generate_insights`, `provider_scorecards → refresh_provider_scorecards`, `care_gap_detection → detect_care_gaps` are all real. `hcc_analysis → run_hcc_engine` is real. BUT `skill_service.py:380-400` also has several `return {"status": "not_implemented"}` for `claim_ingestion`, `train_models`, etc. — actions WizardStep5 doesn't call but which share the endpoint.
**Consumer:** `WizardStep5Processing.tsx:282-287 onRetry` — `API_STEPS.find((a) => a.key === step.key)` retries by the SAME skill name. A persistent `"not_implemented"` status on retry yields a persistent `"warning"` state, and the gate at `WizardStep5Processing.tsx:263-265` considers `"warning"` a successful terminal state, so the retry loop provably cannot escape.
**Drift:** The retry UI is only rendered for `status === "error"` (line 282), not for `status === "warning"`. So the design IS self-consistent — `"not_implemented"` is treated as an acceptable terminal outcome. This is a product-decision drift, not a contract drift. Flag for visibility.
**Recommendation:** None required if the product decision is "stubs are acceptable wizard outcomes". If the product decision changes to "stubs are errors that block onboarding," flip the gate to require `every(s => s.status === "complete")` and add retry to `warning` rows. Document the decision in `WizardStep5Processing.tsx` module header.

---

## VERDICT: REQUEST CHANGES

The two round-3 items explicitly flagged for this round both closed cleanly on both sides: `MemberSummary.tsx` handles every gender value the backend can currently emit, and the `days_since_visit` sentinel is gone from both SQL and alert-rules (with `nullslast()` ordering already in place so the Postgres-vs-SQLite dialect concern is moot). But one CRITICAL new issue landed with the new trajectory-cost feature — `func.to_char` is NOT auto-translated by SQLAlchemy to SQLite's `strftime` (the code comment is factually wrong), so on SQLite the `except Exception:` silently zeroes every cost point in the trajectory response. And three IMPORTANT drifts remain at seams that were partially modernized but not fully: `get_member_detail` kept the pre-fix null shape while `get_member_list` moved on; `/api/skills/execute-by-name` has no documented schema and the frontend checks for enum values the backend has never emitted; and the new `/api/journey/members` endpoint is sorted by RAF on the real backend but the mock returns seed order. None of the rounds-1/2/3 cumulative items were addressed this round. Fix the `to_char` fallback (or narrow the except + add a log) this round; the rest can batch into a "schema + null-convention alignment" pass.
