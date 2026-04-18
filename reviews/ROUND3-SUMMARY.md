# Round 3 Review — Cross-Agent Summary

| Agent | New findings | Verdict | Round-2 closures verified |
|---|---|---|---|
| Adversary | 9 (0C/4I/5M) | APPROVE w/ 2 IMPORTANT follow-ups | 2 of 2 |
| Contractualist | 6 (1C/3I/2M) | REQUEST CHANGES | 4 of 4 |
| Pathfinder | 7 (0C/3I/4M) | **APPROVE** | all 5 |
| Skeptic | 9 (1C/6I/2M) | REQUEST CHANGES | 3 verified |
| Structuralist | 6 (0C/2I/4M) | REQUEST CHANGES (trajectory) | 0 |

**Net:** Pathfinder approved end-to-end. Adversary approved with follow-ups. The two remaining REQUEST CHANGES both cite the same back-end regression — my `days_since_visit` fix is **cosmetic**, not real.

## The round-3 regression (Adversary + Skeptic cross-confirmed CRITICAL)

**`days_since_visit` alert flood is NOT fixed.** I changed the Python fallback to `None`, but:

- `backend/app/services/member_service.py:132-135` still has `func.coalesce(..., 9999)` in the SQL column. `row.days_since_visit` is **never** `None` at the Python level — my fallback is dead code.
- `backend/app/services/alert_rules_service.py:215` has an independent hardcoded `value = 9999`.
- The seed rule "Member not seen > 180" at `alert_rules_service.py:869` still fires for every no-visit member on day 1.

I only fixed the API surface. The alert engine still sees 9999 and fires. **Fix: remove the SQL coalesce, fix the alert service, re-seed the rule.**

## The other round-3 regression (Contractualist CRITICAL)

**`MemberSummary.tsx:63` gender ternary is binary.**

```tsx
{member.gender === "F" ? "Female" : "Male"}
```

My null-coercion round-2 fix emits `gender: ""` when the DB is missing it. The ternary's "else" branch renders every unknown-gender member as **"Male"**. I traded a 500 for a silently-wrong clinical label on every affected record. Fix: three-way branch (F / M / Unknown) and handle `""` / `"U"` explicitly.

## Multi-agent IMPORTANTs

- **`WizardStep5` onComplete fires mid-retry** (Adversary). When user clicks Retry, `runStep` sets the failed step to `"running"` and clears `errorText`. The `useEffect` has `steps` in deps — briefly `anyFailed === false`, `onComplete()` fires, wizard advances before retry resolves. Fix: also require the step be in a terminal non-error state, or track `completedCleanly` as a sticky boolean.
- **`MemberDetail` Retry uses frozen `lastFailedAction.reason`** (Adversary + Skeptic + Contractualist). If a user edits the dismiss-reason input between failure and Retry, the server records the *old* reason. For HCC audit trails this is integrity-grade. Fix: re-read current `dismissReason` when Retry clicks; or disable editing after failure.
- **`JobHistory` first-mount fetch failure deadlocks the poller** (Pathfinder). Round-2 `jobsRef` pattern: first fetch fails → ref stays `[]` → `some((j) => IN_FLIGHT)` is false → interval ticks do nothing. Fix: either keep a `shouldPoll` state independent of jobs, or always retry for the first N mounts.
- **`WizardStep5` treats `"warning"` (not_implemented stubs) as success** (Skeptic). A pipeline where all 5 steps return `{"status": "not_implemented"}` celebrates "Your dashboard is ready!". Fix: widen the success check to require at least one `"complete"` status.
- **`age: 0` and `dob: ""` are semantically wrong** (Contractualist + Skeptic). `age=0` can't be disambiguated from a real infant. Consider making these `Optional` in `MemberSummary` and updating the TS types.
- **Mock onboarding discover-structure shape matches frontend, neither matches real backend** (Contractualist + Pathfinder). Real backend emits `{proposed_groups, existing_groups, routing_summary, ...}`. First real-backend call will 422 or render empty. Fix when wiring to real backend.
- **TuvaPage `useDemo` "DEMO DATA" badge no longer shows in demo** (Pathfinder). My fix made the mock succeed, so the catch-branch fallback that set `useDemo=true` never runs. Minor but could confuse sales.

## Structural observations (non-blocking but cumulative)

- `MemberDetail.tsx` now has 6 parallel per-row Records (Structuralist). Threshold for `useReducer` or single `rowState`.
- `journey_service` swapped SQLite-coupled `strftime` for Postgres-coupled `to_char`. My comment claiming SQLAlchemy maps `to_char` → `strftime` is wrong (Adversary + Structuralist). If local dev runs SQLite, the trajectory silently returns zero cost.
- `mockApi.ts` trajectory: 2,094 → 2,226 → 2,251. Still no plan to shard.
- Structuralist's verdict line: "pick one cumulative item and actually retire it before round 4."

## What's closed

- 2 Adversary round-2 items (strftime regression, days_since_visit UI)
- All 4 Contractualist round-2 items (journey null coerce, onboarding mock, tuva mock, row_count drop)
- All 5 Pathfinder round-2 items (end-to-end walked)
- 3 Skeptic round-2 items

## Highest-leverage fixes next

1. **Fix `days_since_visit` for real** — remove SQL `coalesce(..., 9999)` in `member_service.py:132-135`; fix `alert_rules_service.py:215`; re-seed the `>180` rule. Multi-hour not multi-day.
2. **Fix `MemberSummary.tsx` gender ternary** — 5-line change.
3. **Fix `WizardStep5 onComplete` retry race** — gate on sticky success flag, not transient step state.
4. **Fix `MemberDetail` Retry dismiss-reason integrity** — re-read current input or disable editing post-failure.
5. **Fix `JobHistory` first-mount failure deadlock** — poll-on-mount regardless of state, or set a `shouldPoll` flag.

## Per-agent detail
- `reviews/round3-adversary.md`
- `reviews/round3-contractualist.md`
- `reviews/round3-pathfinder.md`
- `reviews/round3-skeptic.md`
- `reviews/round3-structuralist.md`
