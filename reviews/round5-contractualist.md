# The Contractualist — Round 5 Review

**Scope:** Verify round-4 fixes landed on BOTH producer and consumer sides, catch new drift introduced by the round-5 changes. Cumulative round-1/2/3/4 items still-open re-listed once, not re-analyzed.

---

## ROUND-4 CLOSED (verified both sides)

### [CRITICAL] `journey_service.get_member_risk_trajectory` `to_char` Postgres-only → silently-zero cost on SQLite — CLOSED
Producer `backend/app/services/journey_service.py:269-283` drops `func.to_char` entirely. It now pulls `(Claim.service_date, Claim.paid_amount)` and buckets in Python with `service_date.strftime("%Y-%m")`. No dialect branch, no blanket `except Exception`, no silent zeros. HCC captures (line 287-298) and gap closures (line 300-312) also moved to Python `strftime`. The code comment (line 269-273) now correctly documents _why_ the bucketing is Python-side — because neither `func.strftime` nor `func.to_char` is dialect-portable. Backend `TrajectoryPoint` (`backend/app/routers/journey.py:82-89`) still exposes `cost: float = 0.0, event: str | None = None`; frontend `TrajectoryPoint` (`frontend/src/pages/JourneyPage.tsx:56-64`) matches shape field-for-field, and the `event` overlay in `RiskTrajectory.tsx:51-100, 108-240` correctly reads `point.event` as nullable. Contract agreement is tight on both sides.

### [IMPORTANT] `get_member_detail` null-coerce convention — CLOSED (at producer; consumer still latent)
Producer `backend/app/services/member_service.py:407-427` now matches `get_member_list`: `dob`, `pcp`, `plan`, `demographics.gender`, `demographics.zip_code` all coerce to `""`; `risk_tier` kept nullable; `age` moved to `int | None` (emits `None` when no DOB). The round-4 convention-drift between the two endpoints in the same service is resolved **on the producer side**. Note: `GET /api/members/{member_id}` still has no `response_model` (`backend/app/routers/members.py:116-126`), so Pydantic can't catch future drift here — flagging as latent below rather than re-closing.

---

## STILL OPEN (cumulative — rounds 1-4 items NOT fixed this round)

1. `conditions=` query param dropped — `MembersPage.tsx:66` still posts; `members.py:134-152` still doesn't accept.
2. `MemberRow.snf_days_12mo` ghost — `members.py:52` still has TODO; `member_service.py:283-307` still never emits.
3. `MemberRow.group_id` unpopulated — service still doesn't return it.
4. `sort_order` vs `order` naming drift across HCC/members/providers routers.
5. `ProviderRow` vs `ProviderListItem` two shapes.
6. `SuspectRow` / `Suspect` TS duplication.
7. DuckDB schema-prefix string-replace hack.
8. Mock `avg_v24_risk_score` spurious.
9. `"(unmapped)"` sentinel string from FileUpload.
10. `job_id` string-vs-int drift.
11. Journey search mock ignores `search` param.
12. `confirm-mapping` status drift.
13. `discover-structure` mock shape ≠ real backend shape.
14. `age: 0` + `dob: ""` semantic wrongness — **partially addressed this round for `/api/members/{id}` only**; `/api/journey/{id}` still coerces age to `0` (see NEW findings #2).
15. `/api/skills/execute-by-name` no response schema.
16. `list_journey_members` mock sort ≠ real backend order-by-RAF.
17. dob `str()` vs `.isoformat()` serialization inconsistency.
18. Mock sort comparator `av - bv` no null guard.
19. `/api/members/{id}` detail endpoint has no `response_model`.
20. WizardStep5 retry can't escape persistent `not_implemented`.

---

## NEW FINDINGS

### [IMPORTANT] `MemberSummary` color palette picks `low` (green) for null-tier members — visual lie
**Producer:** `backend/app/services/journey_service.py:141` — `"risk_tier": member.risk_tier if member.risk_tier else None`. Null-coerces unknown to `None`, which is correct.
**Consumer:** `frontend/src/components/journey/MemberSummary.tsx:48` — `const tier = tierColors[member.risk_tier || "low"] || tierColors.low;`. When `risk_tier` is `null`, `null || "low"` → `"low"`, so `tier` resolves to the **green "low" palette** (bg: accentSoft, text: accentText, border: accent). Line 102 correctly prints the label `"unknown"`, but lines 94-103 render the pill in the `tier.bg/text/border` green colors of "low" — label-color mismatch.
**Drift:** This is the same clinical-sentinel concern that motivated the null-tier convention in the first place: do not misclassify unknown-risk as low-risk. The service now preserves `null` on the wire, but the journey badge consumer silently remaps it to the visual identity of "low". The table consumer `MemberTable.tsx:46-54` handles null correctly (`default: ...label: "unknown"`), so the drift is isolated to this one card.
**Evidence:**
```ts
// producer (journey_service.py:141) — emits null
"risk_tier": member.risk_tier if member.risk_tier else None,
```
```ts
// consumer (MemberSummary.tsx:48) — coerces null to "low" color palette
const tier = tierColors[member.risk_tier || "low"] || tierColors.low;
//                                       ^^^^^                ^^^^^
// fallback path 1                          fallback path 2 — both are green "low"
...
// line 94-103 — pill renders tier.bg/text/border even though label says "unknown"
<div style={{ background: tier.bg, color: tier.text, borderColor: tier.border }}>
  {member.risk_tier || "unknown"}
</div>
```
**Recommendation:** Add an explicit `unknown` entry to `tierColors` (neutral gray — matches `MemberTable`'s `tokens.surfaceAlt` + `tokens.textMuted`) and key on `member.risk_tier ?? "unknown"`. One-line fix that makes the two components agree on what "null tier" looks like.

### [IMPORTANT] `age` nullability split between `/api/members/{id}` and `/api/journey/{id}` — same underlying Member, two conventions
**Producer A:** `backend/app/services/member_service.py:418` — `"age": age if member.date_of_birth else None`. Round-5 moved detail endpoint to nullable.
**Producer B:** `backend/app/services/journey_service.py:133-135` — `"age": (... year math ...) if member.date_of_birth else 0`. Still coerces to zero.
**Consumer:** `backend/app/routers/journey.py:55 age: int` (required) — Pydantic rejects `None`, so Producer B **must** keep emitting `0`. Frontend `JourneyPage.tsx:26 age: number` matches. So the schema and emit agree on `0`, but now `get_member_detail` emits `None` while `get_member_journey` emits `0` for the identical "no DOB" case on the identical Member record.
**Drift:** Round-5 partially applied the round-3/4 nullable-age recommendation — it moved the hidden-no-schema endpoint (`/api/members/{id}`) to `None` but left the schema-validated endpoint (`/api/journey/{id}`) at `0`. The endpoint with a contract stayed wrong; the endpoint without a contract was fixed. Two callers of the same `_age_from_dob` computation emit two different sentinels for "missing DOB".
**Evidence:**
```python
# member_service.py:418 — now emits None
"age": age if member.date_of_birth else None,
# journey_service.py:133-135 — still emits 0
"age": (date.today().year - member.date_of_birth.year - (...)) if member.date_of_birth else 0,
```
```python
# journey.py:55 — schema still requires int, so Producer B can't emit None
age: int
```
**Recommendation:** Flip `MemberSummary.age` in `journey.py:55` to `int | None = None`, then change `journey_service.py:133-135` to emit `None` when no DOB. Frontend `MemberSummary.tsx:72` already handles this path via `member.age ? "${member.age}yo" : "age unknown"` — the ternary treats `0` and `null` the same way, so a null-rollout doesn't change rendering. This is a one-line schema change plus a one-line service change that aligns the two endpoints.

### [MINOR] Mock `/api/members` `days_not_seen` filter does NOT match real backend's widened semantics
**Producer (real):** `backend/app/services/member_service.py:227-235` — `(days_since_visit >= threshold) | (days_since_visit IS NULL)`. Treats never-seen members as overdue.
**Producer (mock):** `frontend/src/lib/mockApi.ts:1547, 1585` — `if (params.days_not_seen) filtered = filtered.filter((m) => m.days_since_visit >= parseInt(params.days_not_seen));`. `null >= N` in JS is `false` (`null` coerces to `0`, `0 >= 30` is `false`), so mock would silently drop null-days members from the result set, whereas real backend would include them.
**Consumer:** `MembersPage.tsx` uses the UniversalFilterBuilder and trusts whatever the server returns; no client-side re-verification. The drift is invisible to the user but breaks parity between demo and real modes for tenants with members who have no visit history.
**Drift:** Mock seed (`mockData.ts:3098+`) gives every member a non-null `days_since_visit`, so this latent drift doesn't manifest in demo today. It becomes a bug the moment anyone seeds a null `days_since_visit` for testing the widened semantics.
**Evidence:**
```python
# real backend — includes null
outer = outer.where(
    (sq.c.days_since_visit >= threshold) | (sq.c.days_since_visit.is_(None))
)
```
```ts
// mock — drops null
if (params.days_not_seen) filtered = filtered.filter((m) => m.days_since_visit >= parseInt(params.days_not_seen));
```
**Recommendation:** Mirror the real semantics in mock: `filtered.filter((m) => m.days_since_visit == null || m.days_since_visit >= parseInt(params.days_not_seen));`. Same change needed in both `/api/members/stats` (line 1547) and `/api/members` list (line 1585).

### [MINOR] `MemberRow.dob: str` required contract vs mock `days_since_visit >= null` comparator leaves nullable members invisible to frontend type system
**Producer:** `member_service.py:286` — `"dob": str(row.date_of_birth) if row.date_of_birth else ""`. Empty-string when null.
**Consumer schema:** `members.py:35 dob: str` (required, non-Optional). Schema says "always a string"; producer honors it via `""`.
**Consumer (frontend type):** `mockData.ts:3074+ MockMember.dob: string` (non-nullable). Matches.
**Drift:** None today — the `""` coerce keeps Pydantic happy and the frontend type consistent. Noting for completeness: the new round-5 `risk_tier: str | None = None` on the same `MemberRow` proves Pydantic CAN express nullability, so the continued use of `dob: str` + `""` is now a visible convention inconsistency _within the same Pydantic model_. `risk_tier` is honestly-optional; `dob` is lying-optional (empty-string sentinel).
**Evidence:**
```python
# members.py:32-52 — two null conventions in one model
class MemberRow(BaseModel):
    dob: str              # lying-optional: "" means null
    risk_tier: str | None = None   # honestly-optional: None means null
    days_since_visit: int | None = None  # honestly-optional
```
**Recommendation:** Pick one. Preferred: flip `dob`, `pcp`, `plan`, `group` to `str | None = None`; update list/detail/journey services to emit `None`; update consumers to render `"—"` for null. This matches the round-5 direction for `risk_tier`/`age`. Alternative: revert `risk_tier`/`age` to empty-string sentinels for consistency with `dob`/`pcp`. The current mixed convention is the worst of both worlds.

### [MINOR] WizardStep5 shared `pipelineSucceeded` predicate — closed, but backend still emits `status` strings the frontend doesn't recognize (round-4 #15 still open)
**Producer:** `backend/app/routers/skills.py:109` — `@router.post("/execute-by-name")` still has no `response_model`, `skill_service._execute_step` emits `"completed" | "failed" | "not_implemented"`.
**Consumer:** `WizardStep5Processing.tsx:150-151, 184-185` — checks for `"stub" | "not_implemented"` and `"failed" | "error"`. Backend doesn't emit `"stub"` or `"error"` — those branches are dead. Backend `"completed"` is not in either branch, so it falls through to the happy path via the default `"complete"` status mapping. Today that works because `completed` ≠ any check and isFailed/isStub are both false; tomorrow if backend adds `"partial"` / `"degraded"` the wizard silently marks it `"complete"` and advances.
**Drift:** Round-5 added the shared `pipelineSucceeded` predicate and "No pipeline steps ran" warning card (lines 261, 300-320), which is a real render-gate improvement — the all-warnings pipeline now shows a clear yellow banner instead of the green celebration. That closes the gate-mismatch from round-4. But the underlying string-enum mismatch between backend (`"completed/failed/not_implemented"`) and frontend (`"stub/error" + unknowns→complete`) is UNCHANGED. Round-4 #15 explicitly called this out; round-5 context confirms it's "not yet fixed" and I'm re-surfacing to keep it visible because the render-gate fix made the silent-success path _narrower_ but did not close it.
**Recommendation:** Unchanged from round-4: `SkillExecutionResult` Pydantic model with `status: Literal["completed", "failed", "not_implemented"]`; frontend checks the exact literal values; remove dead `"stub"`/`"error"` branches.

### [MINOR] `MemberSummary` `tierColors` missing `complex` / mismatch between journey badge and table
**Producer:** All endpoints emit `risk_tier ∈ {"low", "rising", "high", "complex", null}`.
**Consumer A:** `MemberTable.tsx:46-54` — handles all 5 including `complex` (bg `#f3e8ff`, text `#7c3aed`).
**Consumer B:** `MemberSummary.tsx:25-30` — `tierColors` has `low`, `rising`, `high`, `complex`. Checked; 4 of 5 covered. BUT the `rising` color here (blueSoft/blue) differs from `MemberTable.tsx:49` (amberSoft/amber) and `MemberFilters.tsx:340` (amberSoft/amber). Three places, two palettes for "rising".
**Drift:** Same token mislabeled across three components. Clinically a "rising" patient is the amber tier in the table and filter, but the journey card shows them in blue. Color-coding as a cognitive channel is broken when the same tier means different things on different screens.
**Evidence:**
```ts
// MemberTable.tsx:49
case "rising": return { bg: tokens.amberSoft, text: tokens.amber, ... };
// MemberSummary.tsx:27
rising: { bg: tokens.blueSoft, text: tokens.blue, border: tokens.blue },
// MemberFilters.tsx:340
rising: { bg: tokens.amberSoft, text: tokens.amber, activeBg: tokens.amber },
```
**Recommendation:** Extract a single `riskTierPalette` helper in `lib/tokens.ts` or `lib/riskTiers.ts` and use it in all three components. Pre-existing drift (not round-5-introduced), but surfaced while verifying the round-5 nullable-tier change — fixing the `unknown` palette (finding #1 above) is the natural moment to unify all four.

---

## VERDICT: APPROVE WITH SMALL FIXES

The two round-4 items flagged for this round closed cleanly on the producer side. The Python-bucketed `get_member_risk_trajectory` is dialect-portable, narrow-except-free, and matches the frontend's `TrajectoryPoint` shape field-for-field including the nullable `event` overlay; the `to_char` silent-zero path is gone. `get_member_detail` now uses the same null-coerce convention as `get_member_list` for the string-y display fields (`dob`/`pcp`/`plan`/`gender`/`zip`) while keeping `risk_tier` and `age` honestly nullable. The `pipelineSucceeded` predicate is now shared between the render gate and the onComplete gate, and the "No pipeline steps ran" warning card is a clear upgrade over the round-4 silent-green-on-all-stubs path.

The new issues are small and clustered around null-handling consistency: (1) the `MemberSummary` journey badge paints null-tier in "low" (green) colors while labeling it "unknown" — a one-line palette addition fixes it and removes the clinical-sentinel risk that motivated the whole nullable-tier work; (2) `age` nullability was applied to `/api/members/{id}` (no Pydantic contract) but not to `/api/journey/{id}` (which has one), so the fixed endpoint is the one without a schema and the constrained one still emits `0`; (3) the mock `days_not_seen` filter doesn't mirror the backend's new `OR IS NULL` widening, latent until someone seeds null visits. None are blockers. The cumulative round-1-4 backlog (20 items) is largely unchanged — primarily the journey-members sort, the `/api/skills/execute-by-name` response schema, and the `discover-structure` mock drift. Fix finding #1 this round; the rest batch cleanly into a null-convention-alignment pass alongside the cumulative schema work.
