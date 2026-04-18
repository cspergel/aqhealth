# The Skeptic — Round 5 Review

**Reviewer:** review-skeptic (forgeplan)
**Date:** 2026-04-17
**Default stance:** NEEDS WORK. Verify the 4-round `to_char` CRITICAL actually closes this time. Surface drift between member_service list and stats filters.
**Scope:** `git diff HEAD` on the files enumerated by the user.

---

## ROUND-4 CLOSED (verified)

- **CRITICAL `to_char` Postgres-only — my 4-round carry-over.** Closed. `journey_service.py:274-283` drops SQL-side formatting entirely. It now `SELECT Claim.service_date, Claim.paid_amount`, iterates the result set in Python, and buckets via `service_date.strftime("%Y-%m")`. `service_date` is declared `Mapped[date] = mapped_column(Date, ...)` (non-nullable) in `claim.py:27`, so `strftime` is safe; the `if not service_date: continue` guard is defensive for the rare NULL edge (e.g., raw SQL inserts bypassing the ORM). `paid_amount` is `Decimal | None`, and `float(paid_amount or 0)` correctly handles both cases. No dialect coupling, no bare `except`, no wrong comment. **Accept.**
- **IMPORTANT JobHistory stale-data-on-API-death (my round-4 #3).** Closed. `JobHistory.tsx:52-57` flips `hasFetchedOkRef.current = false` in the catch block, so the `!hasFetchedOkRef || hasInFlight` predicate in the interval (`:75`) keeps polling after any fetch failure. Transient outages self-heal.
- **IMPORTANT `days_not_seen` filter OR IS NULL.** Closed — at least for the list path. `member_service.py:232-235` now correctly unions `(days_since_visit >= threshold) | (days_since_visit IS NULL)` so never-seen members appear in "overdue for a visit" queries.
- **IMPORTANT `risk_tier` null through the stack.** Closed. Router `MemberRow.risk_tier: str | None` (`members.py:41`), service emits `row.risk_tier` raw (member_service.py:294, 415), frontend `MemberFilters.tsx:12` types it as `string | null`, and the filter dict in `members.py:155-173` drops `None` values via `if v is not None` comprehension, so a cleared filter never reaches `get_member_list` as `risk_tier == None` in SQL. **Verified end-to-end.**
- **IMPORTANT `WizardStep5` render gate mirrored + amber warning card.** Closed. Success UI (`:345`) and onComplete gate (`:264-268`) both key on `pipelineSucceeded = allDone && allTerminalOk && hasRealCompletion`. Amber "No pipeline steps ran" banner (`:300-320`) fires when every step ended `warning`. Parent's `handleStep5Complete` (`OnboardingPage.tsx:100-102`) is `useCallback(…, [])` — reference-stable — so the `[pipelineSucceeded, onComplete]` effect dep on the child doesn't re-fire on every parent render.

---

## STILL OPEN (carry-overs — not touched this round)

- `get_member_journey` still emits `age: 0` and `dob: ""` for unknown DOB (`journey_service.py:132-135`) — deferred schema change.
- `list_journey_members` search branch (`journey.py:105-111`): drops `order_by(Member.current_raf.desc().nullslast())`, has a dead `.lower()` on an `ilike` pattern (ilike is case-insensitive by definition), no `.strip()` on search input, no pagination, no total count.
- `API_STEPS` declared inside `WizardStep5Processing` component body (`:135-141`) with `useCallback(runStep, [])` — latent stale-closure if a future edit references mutable state.
- `IN_FLIGHT_STATUSES` includes `"queued"` (`JobHistory.tsx:10`) — not in the TS `Job.status` union (`:16`). Contract lies both directions.
- `jobsRef.current` micro-race during unmount (round-3 minor).
- `confirm-structure` mock hardcodes `groups_saved: 3, providers_saved: 6` regardless of POST body.
- `dashboard.py /summary` still counts open `MemberGap` rows without joining `GapMeasure.is_active` (`:156`). Cross-measure leak vs `care_gap_service.get_care_gap_summary` which correctly filters `is_active.is_(True)`. **Three rounds unresolved.**

---

## DEFERRED

Same big list. Not re-enumerating.

---

## RECONSIDERATION: `alert_rules_service.continue` on null `last_visit`

**Location:** `backend/app/services/alert_rules_service.py:211-215`

**My round-4 claim:** "The `continue` blanket-excludes never-seen members — on a rule like `days_since_visit < 7` (outreach / care-gap nudging), a never-seen member SHOULD fire."

**Reconsidering it honestly:**

The user's pushback is correct. I was wrong. Three reasons:

1. **SQL 3-valued logic alignment.** Every other rule in `alert_rules_service.py` (and in `member_service.py`'s list path) handles NULL via SQL's standard 3-valued logic: `NULL > N` is NULL → excluded, `NULL < N` is also NULL → excluded. The `continue` matches this semantic. A user who wants "never-seen members" has a different query ("IS NULL") — not a comparison against a numeric threshold. My proposed "treat null as infinity for `lt`/`lte`" would make `days_since_visit` comparisons behave differently from the raw SQL column elsewhere in the same codebase, breaking the principle of least surprise.

2. **The `lt`/`lte` use case I invented doesn't hold up.** I posited "flag members with `days_since_visit < 7` for a follow-up nudge." But the clinical intent of such a rule is "we just saw them, schedule a follow-up call" — which presupposes a visit. A member with no visit record has nothing to follow up on. The real outreach rule for never-seen members is "members with zero visits ever" — a different metric (`never_seen` or `coverage_start < N and last_visit IS NULL`), not `days_since_visit < 7`.

3. **`eq 0` same logic.** A rule for "seen today" presupposes a visit today. Null doesn't satisfy.

**Residual concern (minor):** The `days_since_visit` metric has no documented null-handling semantic — a UI that ships a `days_since_visit < 7` preset will silently omit never-seen members. That's probably fine for the single existing preset ("Member not seen", `gt 180`), but if someone adds an inverse preset later they should know never-seen members are excluded. A one-line comment on the `continue` branch explaining the SQL-3VL alignment would help — the current comment only explains the `gt` direction ("sentinel 9999 would fire > 180 on fresh tenants") and doesn't acknowledge that `lt`/`lte` are also intentionally excluded.

**My round-4 finding stands RETRACTED.** The `continue` is correct.

**Recommendation:** Expand the comment at `:213-214` to:
```
# No visit data -> not a trigger for any operator. SQL 3-valued logic
# excludes NULL from all <, >, =, <=, >= comparisons; we match that here.
# If you want "members never seen", use a dedicated metric — not a
# days_since_visit threshold.
```

---

## NEW FINDINGS

### [IMPORTANT] `get_member_stats` ignores the same filters `get_member_list` applies — stat/list drift

**Location:** `backend/app/services/member_service.py:434-516` vs `:227-243`

**Claim:** The stats endpoint should return aggregates over the same filtered population the list shows (classic "you see 47 members, avg RAF 1.3" pattern — both numbers must reflect the same WHERE clause).

**Evidence:** The router accepts every filter for both endpoints:
```python
# members.py:78-87 (stats)
days_not_seen: Optional[int] = Query(None),
...
has_suspects: Optional[bool] = Query(None),
has_gaps: Optional[bool] = Query(None),
min_er_visits: Optional[int] = Query(None),
min_admissions: Optional[int] = Query(None),
```
…and passes them into the `filters` dict. But `get_member_stats` (`member_service.py:474-498`) only applies `raf_min`, `raf_max`, `risk_tier`, `provider_id`, `group_id`, `plan`, `search` — the same subset that `get_member_list` applies as direct column conditions. The computed-column filters (`days_not_seen`, `has_suspects`, `has_gaps`, `min_er_visits`, `min_admissions`) are silently dropped at the stats layer. No subquery wrapping, no HAVING — none of the aggregate-filter logic from `:222-243` is mirrored.

**Concrete break:** user sets "Not seen 180+ days" filter. List shows 47 members. Stats panel shows `count: 1,240, avg_raf: 0.92` (entire population). User stares at mismatched numbers and either distrusts the UI or makes a clinical decision on the wrong denominator.

**Missing proof:** No test exercises stats with any of the dropped filters. The comment `# Apply same direct filters` on `:473` is honest but contradicts what the router hands in.

**Recommendation:** Either (a) wrap the stats query in the same subquery-and-HAVING pattern as the list path and apply all filters, or (b) explicitly whitelist the filter subset in the router so stats only accepts what it actually applies (and document the divergence). Option (a) is the correct fix; (b) is the defensive one. The round-3 fix to emit NULL for missing visits (closed) is largely undone at the aggregate layer — null-preservation in one query + silent filter-drop in the sibling aggregate is worse than the 9999 sentinel would have been, because at least the sentinel would have produced consistent wrong numbers across list and stats.

### [IMPORTANT] `get_member_risk_trajectory` pulls unbounded claims history into Python

**Location:** `backend/app/services/journey_service.py:275-283` and `routers/journey.py:146-154`

**Claim:** The round-5 fix "pulls `(service_date, paid_amount)` rows and buckets by month in Python" — portable, correct.

**Evidence:** The claims query is `select(Claim.service_date, Claim.paid_amount).where(Claim.member_id == member_id)` — no date window, no LIMIT. Compare to `get_member_journey` which bounds claims by `cutoff = date.today() - timedelta(days=months * 30)` (`journey_service.py:106, 147`). `get_member_risk_trajectory` has no such bound: it pulls **every claim ever recorded for that member**. For a long-tenured complex member in Medicare Advantage (5+ years × 50-100 claims/year from labs, imaging, pharmacy fills), that's 500-1000 rows per trajectory request — still not catastrophic, but:
- A patient with a long pharmacy history (weekly insulin fills, monthly maintenance meds) can easily hit 2-3k claim rows.
- The trajectory endpoint runs on every Journey page load.
- Postgres returns all rows over the wire (roughly 16 bytes/row for two columns); the Python-side dict aggregation is O(n).
- No `response_model` cap on trajectory length either — it just returns all RafHistory rows.

The feature works. The concern is (a) per-request latency grows linearly with member tenure, and (b) there's no defensive cap to catch a pathological/dirty member (someone whose member_id was reused, collapsing two patients into one claim stream with 10k rows).

**Missing proof:** No test for a member with >1000 claims. No SQL-side aggregation to push the sum down to the DB.

**Recommendation:** Bound the query to a `months` parameter (mirror `get_member_journey`'s 24-month default, and expose a `months` query param on `/trajectory`), OR push the aggregation to SQL via `func.date_trunc('month', service_date)` + `func.sum(paid_amount)` + `group_by` (works on Postgres natively; for SQLite use `func.strftime('%Y-%m-01', service_date)`). Dialect-switch at the session level or via a helper, not in the query. The round-5 "just bucket in Python" fix was the right call to get portable behavior, but it shipped without a row cap.

### [MINOR] `event_by_month.setdefault` silently masks ordering nondeterminism when a captured HCC and a closed gap land in the same month

**Location:** `backend/app/services/journey_service.py:296-312`

**Evidence:** The captured-HCC loop runs first, writing `"HCC captured"` into `event_by_month[ym]`. The closed-gap loop uses `setdefault` so it doesn't overwrite. This is deterministic by code order — captured always wins — but the comment just says "Don't overwrite." The implicit precedence rule (captured > closed) isn't surfaced anywhere on the UI; a user seeing a trajectory point marked "HCC captured" has no way to know a gap also closed that month.

**Recommendation:** Either (a) store a list of events per month and render a stacked marker, or (b) document the precedence and drop the `setdefault` in favor of an explicit `if ym not in event_by_month`.

### [MINOR] Round-4 `WizardStep5` "4-of-5 warning celebrates success" — only partially closed

**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:260, 345`

**Evidence:** The round-5 fix added `hasRealCompletion = steps.some((s) => s.status === "complete")` and gated the green success panel behind `pipelineSucceeded = allDone && allTerminalOk && hasRealCompletion`. That fixes the all-warning case (amber banner fires instead). But my round-4 finding was about the **1-complete, 4-warning** case: `hasRealCompletion` is true (the one step that ran succeeded), `allTerminalOk` is true (warning is terminal), `pipelineSucceeded` is true, and the full "Your dashboard is ready!" celebration fires with metric cards and findings — even though 4 of 5 stages didn't do anything. The amber "No pipeline steps ran" banner at `:300` also doesn't fire, because `!hasRealCompletion` is false (one step did run). Net: a pipeline where `data_load` completes but HCC/scorecards/gaps/insights all warn shows the green success screen.

**Missing proof:** No test for the mixed-status path with a mix of `complete` and `warning`.

**Recommendation:** Tighten `hasRealCompletion` to require a majority (`steps.filter(s => s.status === "complete").length >= steps.length - 1`), OR render a yellow "Some features limited" banner alongside the celebration when any step is `warning`. The all-warning edge is covered; the 1-of-5 edge is the realistic production state given the deferred skill stubs, and it still celebrates as full success.

---

## VERDICT

**NEEDS WORK** (one hard stop, two should-fixes).

The 4-round `to_char` CRITICAL finally closes cleanly — this is the first round where I can endorse the fix without qualification. `JobHistory` stale-data recovery is correctly wired. I retract my round-4 alert_rules `continue` finding — the user's "seen recently semantics don't apply to never-seen members" argument matches SQL 3-valued logic and clinical intent; my proposed fix would have broken the principle of least surprise.

The hard stop is new: `get_member_stats` silently ignores five filters the router accepts and `get_member_list` applies. Users will see the list show 47 filtered members while the stats card reports aggregates over the full 1,240-member population. Worse than the round-3 sentinel would have been, because the drift is now invisible (no 9999 to flag), and the code path is cleanly correct in isolation — just misaligned across endpoints. Fix `get_member_stats` to mirror the list's subquery-and-HAVING pattern, add a regression test that calls both endpoints with `days_not_seen=180` and asserts `stats.count == len(list.items)` up to pagination. Also: bound `get_member_risk_trajectory`'s claims query to a `months` window (and/or push-down to SQL aggregation), and tighten the WizardStep5 success gate against the 1-complete-4-warning path.
