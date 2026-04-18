# Round 5 Review — Cross-Agent Summary

| Agent | New findings | Verdict | Round-4 closures |
|---|---|---|---|
| Adversary | 5 (0C/2I/3M) | APPROVE w/ 1 IMPORTANT | both closed |
| Contractualist | 6 (0C/2I/4M) | APPROVE w/ small fixes | both closed |
| Pathfinder | 4 (0C/2I/2M) | REQUEST CHANGES | round-4 IMPORTANT closed |
| Skeptic | 4 (0C/2I/2M) | NEEDS WORK | all round-4 closed + **retracted** one |
| Structuralist | 4 (0C/3I/1M) | APPROVE WITH NOTES | **first retirement in 5 rounds** |

**Net:** No CRITICALs. 3 APPROVE-tier verdicts, 2 REQUEST CHANGES / NEEDS WORK on specific non-critical issues. The 4-round `to_char` CRITICAL is finally, verifiably closed. Skeptic retracted their round-4 alert_rules finding (my pushback held up).

## The big pattern this round

**I fixed `risk_tier` clinical sentinel in `MemberTable.tsx` and missed the same bug in `MemberSummary.tsx` on the journey page.** Cross-confirmed by Adversary + Contractualist.

```tsx
// MemberSummary.tsx:48
const palette = tierColors[member.risk_tier || "low"];  // unknown → "low" (green)
```

The label says "unknown" but the colors are green (low). Care managers look deepest at the journey page. **Same clinical sentinel bug, different file.** One-line fix.

## Two other IMPORTANTs I shipped

**`get_member_stats` ignores 5 filters that `get_member_list` applies.** Router accepts `days_not_seen`, `has_suspects`, `has_gaps`, `min_er_visits`, `min_admissions`; service silently drops them. **List and stats show different totals for the same filter set** — classic dashboard-lie bug. I should have caught this when I widened `days_not_seen` in round 4. (Skeptic)

**All-warning wizard deadlock.** My round-5 render-gate fix removed the "celebration + disabled Finish" contradiction, but the all-warning case now has no way forward: the amber card says "continue to finish setup" while the Finish button is still disabled. `localStorage.onboarding_complete` never gets set → user redirected back into the same wizard next load. (Pathfinder)

## Half-fixes

- **`days_not_seen` filter now *lies in the UI*** (Pathfinder). Backend widened to `OR IS NULL` — correct semantics — but the filter chip still says "Not Seen 180+ days," and never-seen members (no visit date) render identical muted "--" to legitimate short-gap members. Care managers building outreach lists can't distinguish.
- **Age nullability is half-fixed** (Contractualist). `/api/members/{id}` emits `None` for missing DOB (aligned round 4). But `/api/journey/{id}` still emits `0` because `journey.py:55 age: int` stayed required. **The endpoint with a schema kept the wrong convention; the one without got fixed.** Ironic.
- **WizardStep5 "1 complete + 4 warning" still celebrates** (Skeptic). My round-5 fix only handled the pure all-warning case. Mixed partial-stub pipelines still trigger the "ready!" card.
- **`MemberRow` Pydantic now mixes two null conventions** (Contractualist). `risk_tier: str | None` (honest) vs `dob: str` with `""` (coerced). Two conventions in the same model.

## Latent / edge

- **`get_member_risk_trajectory` unbounded claim pull** (Adversary + Skeptic). My round-5 Python-bucketing fix is portable but has no date cutoff, no LIMIT. Compare `get_member_journey` which uses a 24-month window. DoS risk on data-rich members once Pinellas data lands.
- **`MemberTable.tsx` "rising" tier amber vs `MemberSummary.tsx` "rising" blue** (Contractualist). Pre-existing color drift across screens for the same tier. Surfaced while verifying the nullable-tier fix.
- **No mockApi handler for `/api/members/{id}`** (Pathfinder). My null-convention changes in `get_member_detail` are unshipped to demo — no current frontend consumer hits this route, but it's a gap.
- Minor: `runStep` has no abort/isMounted guard (Adversary); `days_not_seen=0` matches everything via new `OR IS NULL` (Adversary); JobHistory 200-with-empty-items treated as success.

## Structural — the first real retirement

**Structuralist credits half of the null-drift cumulative item retired.** The `risk_tier` + `days_since_visit` nullable alignment across `member_service.py` → `routers/members.py` → `MemberTable.tsx` → `mockData.ts` → `MembersPage.tsx` is the first genuine cross-layer policy decision in 5 rounds. **0/29 → 0.5/29.**

Downgraded: new `pipelineSucceeded` is named, not extracted (component still 783 lines, up from 664). `runStep` was extracted but `runRealPipeline` doesn't use it → two divergent copies of the same state-transition logic. **New duplicate endpoint** `/api/journey/members` added this round + a third `MemberSearchResult` Pydantic shape (regression of the "/api/journey duplicates /api/members" finding). **Net: -1.5 retired + 2 added = +0.5 structural items.** Curve finally not monotonically increasing.

## Closed this round

- **4-round CRITICAL:** `to_char` SQLite regression in `journey_service` — verified portable, correct bucketing on `datetime.date` + `Decimal` inputs (Skeptic).
- Round-4 Adversary IMPORTANT: `days_not_seen` over/under-inclusion → widened filter.
- Round-4 Adversary MINOR: JobHistory `hasFetchedOkRef` recovery.
- Round-4 Contractualist CRITICAL (`to_char`) + IMPORTANT (`get_member_detail` null convention) — both sides verified.
- Round-4 Pathfinder IMPORTANT: WizardStep5 render/onComplete mismatch.
- **Skeptic retracted round-4 `alert_rules.continue` finding** — SQL 3-valued logic makes the `continue` correct; my pushback was right.

## Highest-leverage fixes next

1. **Fix `MemberSummary.tsx` risk_tier** (Adversary + Contractualist cross-confirmed) — 1-line use of the same helper pattern.
2. **Fix `get_member_stats` filter drift** (Skeptic) — apply the same filter predicates. Scope-contained.
3. **Fix WizardStep5 all-warning deadlock** (Pathfinder) — enable Finish with a warning flag, or mark `onboarding_complete` in the amber path.
4. **Fix `days_not_seen` filter UI honesty** (Pathfinder) — visually distinguish "never seen" from "long gap" in the list.
5. **Fix age nullability on `/api/journey/{id}`** (Contractualist) — `age: int | None` in the schema.
6. **Bound `get_member_risk_trajectory`** (Adversary + Skeptic) — add a months parameter matching `get_member_journey`.
7. **Fix mixed 1-complete + 4-warning WizardStep5 celebration** (Skeptic) — require a higher success ratio or make the amber card the default for non-clean runs.

## Per-agent detail

- `reviews/round5-adversary.md`
- `reviews/round5-contractualist.md`
- `reviews/round5-pathfinder.md`
- `reviews/round5-skeptic.md`
- `reviews/round5-structuralist.md`
