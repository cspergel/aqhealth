# Round 4 Review — Cross-Agent Summary

| Agent | New findings | Verdict | Round-3 closures verified |
|---|---|---|---|
| Adversary | 6 (0C/1I/5M) | **APPROVE** | all 4 |
| Contractualist | 6 (1C/3I/2M) | REQUEST CHANGES | 2 of 2 |
| Pathfinder | 3 (0C/1I/2M) | **APPROVE** | all 6 |
| Skeptic | 8 (0C/6I/2M) | REQUEST CHANGES | all 5 |
| Structuralist | 5 (0C/4I/1M) | REQUEST CHANGES (retirement-freeze) | N/A |

**Net:** Adversary + Pathfinder approved. All round-3 regressions verified closed by every agent that tracked them. 2 REQUEST CHANGES from Contractualist/Skeptic cite the same unfixed-across-4-rounds CRITICAL. Structuralist delivers a "retirement freeze" ultimatum.

## The one still-open CRITICAL (4 rounds running, 3-agent flagged)

**`journey_service.get_member_risk_trajectory` SQLite regression.** My round-2 `to_char` fix works on Postgres but silently zeros every cost point on SQLite. The bare `except Exception: cost_by_month = {}` swallows the error with no log. The code comment claiming "SQLAlchemy maps this to strftime on SQLite" is factually wrong. **If local dev, tests, or the SQLite-backed tuva_demo_data path hits this code, cost trajectory is always $0 and nobody knows.**

Fix: case on DB dialect, or use `extract(year from …) * 100 + extract(month from …)` (portable), or use a dialect-portable SQLAlchemy construct.

## New IMPORTANTs

**Demo / user-flow:**
- **`WizardStep5` all-warning celebration mismatch** (Pathfinder + Skeptic). My render gate (`!anyFailed`) still shows the celebration card when all 5 steps return `"warning"` (stub pipeline) — but the widened `onComplete` gate (requires ≥1 `complete`) correctly blocks advancement. Result: user sees "Your dashboard is ready!" but the Finish button is disabled. Contradictory UI state.

**Correctness regressions I introduced:**
- **`days_not_seen` filter now silently EXCLUDES no-visit members** (Adversary). Removing `coalesce(…, 9999)` flipped over-inclusion into under-inclusion. `NULL >= 180` is NULL, treated as false. Care managers filtering on fresh/partial-coverage tenants see zero results where the UI should probably say "N members excluded due to missing visit data." Pre-Pinellas pilot fix.
- **`alert_rules_service.continue` breaks `lt`/`lte`/`eq` rule semantics** (Skeptic). The blanket `continue` was correct for "not seen > 180" (my fix) but a "seen recently" rule (`days_since_visit < 7`) now *excludes* never-seen members from matching, which is the opposite of what the rule writer intended for a targeted outreach campaign.
- **`JobHistory` deadlock re-opened in a different form** (Skeptic + Adversary). `hasFetchedOkRef` once set never resets. Scenario: successful first fetch → all jobs complete → polling idles. Then API dies (token expires, network drops). Next navigation back to History sees the stale "all complete" snapshot with no indication of the outage. Fix: reset the flag on any subsequent fetch error, or add a "last updated" timestamp.

**Contract drift / null-policy:**
- **`get_member_detail` emits None while `get_member_list` coerces** (Contractualist + Structuralist). Same file, same fields (`dob`, `pcp`, `risk_tier`, `plan`), opposite null conventions. Self-inconsistency within the same service.
- **`/api/skills/execute-by-name` has no response schema** (Contractualist). WizardStep5 checks for `"stub"` / `"error"` strings the backend never documents it will emit. Silent-success hole for any future status name.
- **`list_journey_members` thin return shape** (Skeptic). Drops PCP, risk_tier, spend; `limit=250` silently truncates; mock sorts differently than real.

## Structural — Structuralist's ultimatum

**Zero of 29 cumulative architectural items retired across 4 rounds.** Headline findings:

- **`MemberDetail.tsx` crossed a phase change.** 6 parallel per-row Records + `retryFailed` now reads 3 of them in coordination (`lastFailedAction`, `dismissingId`, `dismissReason`). Maps can no longer be decomposed without breaking the reader. Reducer is required, not optional.
- **Null-policy drift codified in-diff.** Four incompatible conventions now live in the round-4 diff: keep-null (member_service), skip-row (alert_rules), coerce-to-empty-string (journey_service), null-as-zero-via-schema-default (members.py). Notable: `"risk_tier": row.risk_tier or "low"` in `member_service.py` **silently misclassifies every unknown-tier member as low-risk** — a clinical-meaning sentinel.
- **`mockApi.ts` trajectory: 2,094 → 2,251 → 2,408 lines.** Still no shard.
- **`get_member_list` is ~300 lines doing 6 analytic queries.** Round-1's "business logic in routers" relocated to "business logic in one giant service function" — the problem moved, not dissolved.
- **`genderLabel` is the third null-handling helper with no home** (after `daysColor`/`daysAgoLabel`).

**Structuralist's top retirement target:** shard the `mockApi.ts` ingestion section + create `lib/api-contracts/ingestion.ts`. Retires 4 cumulative items in one surgical PR.

## Round-3 closures (confirmed)

- `days_since_visit` SQL + alert flood — real-fixed this time (all agents verified)
- `WizardStep5` retry race + widened gate
- `MemberDetail` live dismiss-reason
- `JobHistory` first-mount deadlock (partial; see above re-opening)
- `MemberSummary.tsx` gender label

## Highest-leverage fixes next

1. **Fix `to_char` SQLite regression** — portable SQLAlchemy or dialect branch; stop catching silently
2. **Fix `risk_tier or 'low'` clinical sentinel** in `member_service.py` — emit null, map to "unknown" tier on frontend
3. **Widen WizardStep5 render gate** — use same `hasRealCompletion` check for celebration card
4. **Fix `days_not_seen` filter UX** — include nulls with a "N members excluded" hint, or add `include_never_visited=true` param
5. **Fix `alert_rules_service` null-skip per-operator** — continue only for `gt/gte/eq-threshold`; for `lt/lte`, treat null as "matches"
6. **Fix `JobHistory` stale-data-on-API-death** — reset `hasFetchedOkRef` on fetch error, add visible "stale" indicator
7. **Retire ONE structural item** — Structuralist's retirement-freeze carries weight. `mockApi.ts` ingestion shard is the most surgical.

## Per-agent detail

- `reviews/round4-adversary.md`
- `reviews/round4-contractualist.md`
- `reviews/round4-pathfinder.md`
- `reviews/round4-skeptic.md`
- `reviews/round4-structuralist.md`
