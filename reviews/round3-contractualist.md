# The Contractualist — Round 3 Review

**Scope:** Verify round-2 fixes landed on BOTH producer and consumer sides, and catch new drift introduced by the round-3 changes. Auth/security items deferred per user.

---

## ROUND-2 CLOSED (verified on both sides)

### [CRITICAL] `journey_service.get_member_journey` null coercion — CLOSED
Producer `backend/app/services/journey_service.py:132-136` now emits:
```python
"dob": member.date_of_birth.isoformat() if member.date_of_birth else "",
"age": (... expression ...) if member.date_of_birth else 0,
"gender": member.gender or "",
```
Consumer `backend/app/routers/journey.py:50-66 MemberSummary` requires `dob: str`, `age: int`, `gender: str` (all non-Optional). Pydantic `JourneyOut(**result)` at line 139 now validates — no more 500 on members with null DOB/gender. Contract holds at the schema level.

### [IMPORTANT] Mock `/api/onboarding/discover-structure` matches frontend `DiscoveryResult` — CLOSED (against frontend type)
`frontend/src/lib/mockApi.ts:1087-1122` now emits `{groups: [{tin, name, is_existing, relationship_type, providers: [{npi, name, specialty}]}], unmatched_count}`. Consumer `OrgDiscoveryReview.tsx:16-27 DiscoveryResult` reads exactly those fields. `g.tin`, `g.is_existing`, `g.providers` are no longer undefined in demo. But see NEW-1 below — the real backend still returns a different shape.

### [IMPORTANT] Mock `/api/tuva/raf-baselines/summary` matches `RafSummary` — CLOSED
`frontend/src/lib/mockApi.ts:2203-2209` now emits `{total_baselines: 247, discrepancies: 12, agreement_rate: 95.1, avg_discrepancy_raf: 0.089}` — exactly the four fields in `frontend/src/pages/TuvaPage.tsx:23-28 RafSummary` and exactly what `backend/app/routers/tuva_router.py:124-128` emits. `summary.agreement_rate` now renders "95.1%" in demo instead of "undefined%".

### [MINOR] `normalizeUploadResponse` row_count dropped — CLOSED
`frontend/src/components/ingestion/FileUpload.tsx:64-68` now explicitly leaves `row_count: undefined` with a code comment explaining why (backend `UploadResponse` doesn't emit a file-level row count, only `sample_rows.length` which would mislead by 3-4 orders of magnitude). The "5 rows detected" misdisplay is gone.

---

## STILL OPEN (cumulative — rounds 1+2 items NOT fixed, per user scope)

1. **`conditions=` query param** — `frontend/src/pages/MembersPage.tsx:66` still sends `params.conditions = JSON.stringify(filterConditions)`; `backend/app/routers/members.py:134-152` still declares no `conditions` Query — UniversalFilterBuilder no-ops on real backend.
2. **`MemberRow.snf_days_12mo` ghost** — `backend/app/routers/members.py:52` still `snf_days_12mo: int = 0  # TODO: not yet populated`; `member_service.py:274-295` never emits the key; every real CSV export column is `0`.
3. **`MemberRow.group_id` unpopulated** — `backend/app/services/member_service.py:268-295` still builds items with `"group": row.group_name` and no `"group_id"`. Frontend `MockMember.group_id: number` (required) — real backend sends null.
4. **`sort_order` vs `order` naming** — `hcc.py:158` still uses `sort_order`; `members.py:148` / `providers.py` use `order`. No shared sort hook possible.
5. **`ProviderRow` vs `ProviderListItem` two shapes** — `dashboard.py:73-79` and `providers.py:44` still two undocumented `Provider*` row shapes.
6. **`SuspectRow` / `Suspect` TS duplication** — `ChaseList.tsx` + `MemberDetail.tsx` still hand-maintain two divergent interfaces for one backend concept.
7. **DuckDB schema-prefix string-replace hack** — `tuva_data_service.py:59` still `.replace("main_cms_hcc.", "cms_hcc.")`; line 330 `get_tuva_recapture_opportunities` still bypasses the helper.
8. **Mock `avg_v24_risk_score` spurious** — `mockApi.ts:2227` still emits V24 field the real backend no longer supports.
9. **`"(unmapped)"` sentinel string** — `FileUpload.tsx:47` still writes the literal `"(unmapped)"` into the mapping that `ColumnMapper.tsx:107` posts to the backend.
10. **`job_id` string-vs-int drift** — `FileUpload.tsx:59 String(resp.job_id)` still stringifies; `UploadResult.job_id: string` leaks through `IngestionPage`/`ColumnMapper`. Backend `job_id: int` and onboarding `DiscoverStructureRequest.job_id: int` rely on Pydantic coercion.
11. **Journey search mock ignores `search` param** — `mockApi.ts:1388-1395` ignores `search` the real backend honors.
12. **`confirm-mapping` status drift** — mock returns `status: "completed"`; real backend returns `status: "validating"`.

---

## NEW FINDINGS (introduced by round-3 fixes or uncovered while verifying them)

### [CRITICAL] Empty-string `gender` silently renders as "Male" on the Journey page
**Producer:** `backend/app/services/journey_service.py:136` — `"gender": member.gender or ""`. Any member with a null `gender` now produces `""`.
**Consumer:** `frontend/src/components/journey/MemberSummary.tsx:63` — `{member.gender === "F" ? "Female" : "Male"}`. The ternary has no branch for `""` or `"M"`; anything non-`"F"` falls through to "Male".
**Drift:** The round-2 fix converts null-gender from a 500 (good) into a confidently-wrong UI label (bad). Every member whose DB `gender` column is NULL is now displayed as "Male" with zero warning. This is a data-integrity regression masquerading as a schema fix.
**Evidence:**
```python
# producer (journey_service.py:136)
"gender": member.gender or "",
```
```tsx
// consumer (MemberSummary.tsx:63)
{member.age}yo {member.gender === "F" ? "Female" : "Male"}
```
**Recommendation:** Either keep `gender: str | None` end-to-end and render `"--"` when missing (`member.gender === "F" ? "Female" : member.gender === "M" ? "Male" : "--"`), or have the service emit `"U"`/`"Unknown"` and add a third branch. A silent default of "Male" for unknown gender is worse than a 500.

### [IMPORTANT] `age: 0` renders as "0yo" for members with no DOB — semantically wrong
**Producer:** `backend/app/services/journey_service.py:133-135` — `"age": (... expr ...) if member.date_of_birth else 0`.
**Consumer:** `frontend/src/components/journey/MemberSummary.tsx:63` — `{member.age}yo {...}` with no null check. A member with missing DOB renders "0yo Male". Also `MemberSummaryData.age: number` in `JourneyPage.tsx:26` makes this a semantic lie — zero is a valid age for a newborn, not a sentinel for "unknown".
**Drift:** The fix trades a 500 for nonsense output. The schema says `age: int` (required), but the value `0` cannot be disambiguated from a real infant. Same for `dob: ""` (line 132) — `JourneyPage.tsx:217` interpolates it as `DOB: ` (empty).
**Recommendation:** Make `MemberSummary.age: int | None = None` and `dob: str | None = None` on the router (`journey.py:54-55`); emit `None` from the service; have the component fall back to `"--"` when missing. The null-coerce-to-zero pattern hides missing-data bugs the Pydantic layer would otherwise surface.

### [IMPORTANT] `days_since_visit` contract drift across `/members` vs `/members/stats` vs `/members/{id}` vs `alert_rules_service`
**Producer A (member list):** `backend/app/services/member_service.py:132-135` coalesces to `9999` at the SQL level, then line 286 converts to `None` in the item dict. Round-3 router `members.py:43 days_since_visit: int | None = None`.
**Producer B (member stats):** `backend/app/routers/members.py:78 days_not_seen: Optional[int] = Query(None)` — the filter param, not returned in response. OK but `MemberStatsOut` (line 63-67) doesn't include any days-since metric at all.
**Producer C (member detail):** `backend/app/services/member_service.py:390-410` `get_member_detail` does NOT emit `days_since_visit`, `last_visit_date`, ER/admit counts, or group — the detail shape is completely different from the list row shape.
**Producer D (alert rules):** `backend/app/services/alert_rules_service.py:214-215` still uses `value = 9999` sentinel for members with no visits, NOT `None`. So an alert rule `days_since_visit > 180` triggers for every new-tenant member, even though the list-API fix was explicitly made to avoid that.
**Consumer:** `frontend/src/lib/mockData.ts:3085 MockMember.days_since_visit: number | null` (matches list), `mockApi.ts:1547/1585` filters `m.days_since_visit >= parseInt(...)` — `null >= 90` is `false` (JS coerces null → 0), so members with null are silently excluded from `days_not_seen` filters instead of being excluded by intent. `mockApi.ts:1598` sort key `last_visit: "days_since_visit"` — `av - bv` with null sorts to NaN, unstable ordering.
**Drift:** Three different "never visited" representations across the backend (`9999` sentinel in SQL coalesce; `None` in list response; `9999` again in alert_rules). Round-3 fixed the list-API side but alert_rules still triggers "no visit in 180 days" alerts for new tenants.
**Recommendation:** Pick one: keep `None` end-to-end and update `alert_rules_service:214-215` to `continue`/skip members with no visits (not treat them as 9999-day stale); also align `get_member_detail` to emit `days_since_visit` so `/api/members/{id}` and `/api/members` agree.

### [IMPORTANT] Mock `/api/onboarding/discover-structure` still doesn't match the REAL backend — mock now lies in a new direction
**Producer (real backend):** `backend/app/services/org_discovery_service.py:249-256` returns `{job_id, existing_groups, proposed_groups: [{tin, tin_raw, suggested_name, provider_count, new_provider_count, row_count}], existing_providers, new_providers, routing_summary}`.
**Producer (round-3 mock):** `frontend/src/lib/mockApi.ts:1087-1122` now emits `{groups: [{tin, name, is_existing, relationship_type, providers: [{npi, name, specialty}]}], unmatched_count}`.
**Consumer:** `frontend/src/components/onboarding/OrgDiscoveryReview.tsx:16-27 DiscoveryResult` accepts the mock shape.
**Drift:** The round-2 fix aligned the mock with the frontend type, but the frontend type never matched the real backend to begin with. When the real backend is wired in:
  - `res.data.groups` → undefined (real backend uses `proposed_groups` + `existing_groups`).
  - `res.data.unmatched_count` → undefined (real backend uses `routing_summary.unmatched`).
  - Every group's `providers: []` field is missing (real backend lists providers as a separate top-level `new_providers` / `existing_providers` array, not nested under each group).
  - `relationship_type: "owned" | "affiliated"` doesn't exist on the real proposal — it only exists in the confirm step (`confirm-structure` body and `PracticeGroup.relationship_type`).
**Evidence:**
```python
# real backend (org_discovery_service.py:249-256)
return {"job_id", "existing_groups", "proposed_groups": [...], "existing_providers", "new_providers", "routing_summary"}
```
```ts
// frontend DiscoveryResult (OrgDiscoveryReview.tsx:24-27)
interface DiscoveryResult { groups: DiscoveredGroup[]; unmatched_count: number; }
```
**Recommendation:** Either (a) add a response-normalization layer in `OrgDiscoveryReview` that flattens the real backend shape into the frontend's `DiscoveryResult` (merging `existing_groups` + `proposed_groups`, attaching providers by TIN, using `routing_summary.unmatched` for `unmatched_count`), OR (b) reshape the real backend response to match the frontend (simpler). Flag as **doc-debt** until one side moves — demo works, but the first real-backend call will break this page.

### [MINOR] Mock sort stability regression — `days_since_visit: null` produces NaN in sort compare
**Producer:** Round-3 `mockData.ts:3085 MockMember.days_since_visit: number | null` — legitimately nullable now. None of the 30 seeded mock rows actually uses `null`, but the type permits it and any future mock row (or universal-filter result) may.
**Consumer:** `mockApi.ts:1600-1604` — the sort key for `last_visit` is `days_since_visit`; the comparator is `av - bv`. If `av` is `null`, `null - 90 === -90` (JS coerces), so null-rows sort as the smallest value, not "unknown". This changes the semantic of the sort silently.
**Drift:** The type-level change created a latent correctness issue in a downstream consumer nobody updated.
**Recommendation:** Add explicit null handling in the sort: `if (av == null) return order === "asc" ? 1 : -1;` (push unknowns to the end regardless of direction), OR guarantee in seed data that nullable fields are never actually null.

### [MINOR] `journey_service` emits `health_plan: member.health_plan` without null-coerce — inconsistent with `dob`/`age`/`gender` fix
**Producer:** `backend/app/services/journey_service.py:137` — `"health_plan": member.health_plan`. `member.health_plan` is nullable in the DB.
**Consumer:** `backend/app/routers/journey.py:57 health_plan: str | None = None` — accepts null, good. But the round-3 fix coerced DOB/age/gender to `"" / 0 / ""` while leaving `health_plan` and `pcp` as legitimate `None`. Same for `risk_tier` (line 141: `member.risk_tier if member.risk_tier else None`).
**Drift:** Inconsistent null-handling convention in one function. Reader can't tell whether a field returning `""` means "empty" or "unknown"; reader can't tell whether a field returning `None` is an oversight or intentional. See finding #2 — the schema types disagree about whether the canonical "missing" representation is `""` or `None`.
**Recommendation:** Pick one convention per function. If the fix direction is "coerce to falsy for required Pydantic fields," then `health_plan`, `pcp`, and `risk_tier` should also be required with empty-string defaults. If the fix direction is "make router model Optional," flip `dob`/`age`/`gender` back to `str | None` / `int | None` and coerce on the render side. Mixing the two is the thing that creates round-4 findings.

---

## VERDICT: REQUEST CHANGES

All four round-2 fixes landed on both sides and closed cleanly — the journey service no longer 500s on null demographics, and the two mock responses now match the consumer types. But the round-2 null-coerce pattern, applied to `gender` specifically, introduces a **new CRITICAL UI bug**: `MemberSummary.tsx` will render every unknown-gender member as "Male" because its ternary has no `""` branch. Secondarily, the `age: 0` coercion loses the distinction between "infant" and "unknown DOB" at the schema layer, and the `days_since_visit: null` change made on `/api/members` isn't consistent with `alert_rules_service` (still uses 9999 sentinel) or `/api/members/{id}` (doesn't emit the field at all). Finally, the `onboarding/discover-structure` mock now matches the frontend type but the frontend type was wrong from the start — the real backend returns `{proposed_groups, existing_groups, routing_summary, ...}`, not `{groups, unmatched_count}`, so the first real-backend call will break the page. Fix the gender ternary and the alert-rules sentinel this round; flag the onboarding shape mismatch as doc-debt for the next contract pass.
