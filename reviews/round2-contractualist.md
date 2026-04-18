# The Contractualist — Round 2 Review

**Scope:** Verify round-1 findings were actually fixed on BOTH producer and consumer sides, and catch new drift introduced by the fixes.

---

## CLOSED (round-1 fixes verified on both sides)

### [CRITICAL] `/api/dashboard/summary` keys now match producer output — CLOSED
`backend/app/routers/dashboard.py:152-164` now correctly maps `metrics.get("total_lives")`, `suspect_inv.get("count")`, `suspect_inv.get("total_annual_value")`, and queries `MemberGap` directly for open care gaps. These keys match `dashboard_service.get_dashboard_metrics` output (`dashboard_service.py:118-125`). The onboarding wizard's quick-status card no longer silently returns zeros.

### [CRITICAL] `/api/members` DOB / plan / PCP null coercion — CLOSED
`backend/app/services/member_service.py:277-290` now coerces every nullable string to `""` (`"dob": str(row.date_of_birth) if row.date_of_birth else ""`, `"pcp": pcp_name or ""`, `"plan": row.health_plan or ""`, `"last_visit_date": str(row.last_visit_date) if row.last_visit_date else ""`). The consumer `MemberRow` (`members.py:32-52`) has defaults of `""` for these fields, so the contract holds. No more 500s for members with missing DOB/PCP/plan.

### [CRITICAL] `GET /api/journey/members` endpoint exists — CLOSED
`backend/app/routers/journey.py:96-123` implements the endpoint with `response_model=list[MemberSearchResult]`. The response fields `{id, member_id, name, dob, current_raf}` exactly match `frontend/src/pages/JourneyPage.tsx:13-19 MemberSearchResult`. Both sides agreed.

### [CRITICAL] `TrajectoryPoint` emits `cost` and `event` — CLOSED
Producer `backend/app/routers/journey.py:82-89` now declares `cost: float = 0.0` and `event: str | None = None`; `backend/app/services/journey_service.py:321-329` populates both via a per-month spend aggregation and event tagging (HCC captured / gap closed). Consumer `JourneyPage.tsx:56-64` and `RiskTrajectory.tsx:19-27` both agree on the same fields.

### [CRITICAL] `MemberSummary.conditions: string[]` on both sides — CLOSED
Producer `backend/app/routers/journey.py:65` declares `conditions: list[str] = []`; `journey_service.py:206` populates it from HCC suspects (`sorted(conditions_set)`). Consumer `JourneyPage.tsx:36` and `MemberSummary.tsx:18` type it as `string[]`. Contract holds.

### [CRITICAL] `/api/ingestion/upload` consumer re-typed + normalized — CLOSED
`frontend/src/components/ingestion/FileUpload.tsx:10-26` now declares `UploadResponse` with `job_id: number`, `proposed_mapping: Record<string, ColumnMappingEntry>` (nested), and `sample_rows: string[][]` — matching backend `UploadResponse` exactly. `normalizeUploadResponse` (lines 43-67) flattens to the internal `UploadResult` shape that `IngestionPage` + `ColumnMapper` consume. The three-way mismatch from round 1 is resolved.

### [IMPORTANT] FHIR CapabilityStatement filters stub resources — CLOSED
`backend/app/services/fhir_service.py:117` now filters: `active = sorted(rt for rt, handler in RESOURCE_HANDLERS.items() if handler is not None)` and emits `create` only for resources with a real handler. Observation/Encounter/Procedure are no longer advertised. Conformance tooling will no longer see claimed support for unimplemented endpoints.

---

## STILL OPEN (round-1 findings not addressed, still in scope)

### [IMPORTANT] `/api/members` still ignores the `conditions` query param — STILL OPEN
**Producer:** `frontend/src/pages/MembersPage.tsx:66` still sends `params.conditions = JSON.stringify(filterConditions)` on every filter apply.
**Consumer:** `backend/app/routers/members.py:134-152` declares no `conditions` Query parameter. FastAPI silently drops it; `member_service.get_member_list` has no branch for it.
**Evidence:** `grep "conditions" backend/app/routers/members.py` → no matches. Advanced UniversalFilterBuilder filters set through the UI still no-op against the real backend (demo-only).
**Recommendation:** Add `conditions: str | None = Query(None)` + parse JSON in the service, OR mark the builder demo-only.

### [IMPORTANT] `MemberRow.snf_days_12mo` still a ghost field — STILL OPEN
**Producer:** `backend/app/routers/members.py:52` still has `snf_days_12mo: int = 0  # TODO: not yet populated by member_service`. `member_service.py:274-293` never emits this key.
**Consumer:** `frontend/src/lib/mockData.ts:3094` declares it required; `MembersPage.tsx:156` emits it in CSV exports verbatim. Every real-backend CSV has a `0` column.
**Recommendation:** Compute via a `Claim.service_category == "snf_postacute"` subquery (parallels existing `er_sq` / `admit_sq`) or drop the field.

### [IMPORTANT] `MemberRow.group_id` still not populated by service — STILL OPEN
**Producer:** `backend/app/services/member_service.py:268-293` builds the item dict with `"group": row.group_name or ""` but still no `"group_id"` key. The SELECT (line 140-166) joins `PracticeGroup` via `Provider.practice_group_id` but only pulls `PracticeGroup.name`, not `PracticeGroup.id`.
**Consumer:** `backend/app/routers/members.py:39` declares `group_id: int | None = None` — so Pydantic doesn't 500, but `frontend/src/lib/mockData.ts:3081 MockMember.group_id: number` is required. Real backend → every member has `group_id=null`, silent filter breakage in the frontend.
**Recommendation:** Add `PracticeGroup.id.label("group_id")` to the select and append `"group_id": row.group_id` to the dict.

### [MINOR] `sort_order` vs `order` param naming drift — STILL OPEN
`backend/app/routers/hcc.py:158` still uses `sort_order: SortOrder = Query(SortOrder.desc)`. `members.py:148` and `providers.py` use `order`. A shared sort hook still can't be written.

### [MINOR] Dashboard `ProviderRow` vs `ProviderListItem` two-shape drift — STILL OPEN
`backend/app/routers/dashboard.py:73-79 ProviderRow` (5 fields) and `backend/app/routers/providers.py:44 ProviderListItem` (richer set) are still two separate undocumented shapes.

### [MINOR] `SuspectRow` / `Suspect` TS type duplication — STILL OPEN
`frontend/src/components/suspects/ChaseList.tsx` and `MemberDetail.tsx` still hand-maintain two separate interfaces for the same backend concept.

### [MINOR] DuckDB `_query_with_schema_fallback` string-replace hack — STILL OPEN
`backend/app/services/tuva_data_service.py:59` still does `.replace("main_cms_hcc.", "cms_hcc.")` and line 331 `SELECT * FROM hcc_recapture.summary LIMIT 100` bypasses the helper entirely. Inconsistent schema resolution remains.

---

## NEW FINDINGS (introduced by fixes or missed before)

### [CRITICAL] `journey_service.get_member_journey` still returns `dob: None` / `age: None` / `gender: None` — `MemberSummary` Pydantic will 500
**Producer:** `backend/app/services/journey_service.py:128-142` builds the dict with:
```python
"dob": member.date_of_birth.isoformat() if member.date_of_birth else None,   # line 132
"age": (... expression ...) if member.date_of_birth else None,                # line 133-135
"gender": member.gender,                                                       # line 136 — may be None in DB
```
**Consumer:** `backend/app/routers/journey.py:50-65 MemberSummary` — `dob: str` (required, no default), `age: int` (required, no default), `gender: str` (required, no default). Router then calls `JourneyOut(**result)` → Pydantic validation error if any of these are None.
**Contract drift:** The same null-coercion bug that round-1 flagged on `MemberRow` was fixed for `/api/members` but NOT for `/api/journey/{member_id}`. Any demo/seed member with a null DOB or null gender will 500 on this endpoint.
**Evidence:** see lines above. `"age": None` passes to Pydantic `age: int` which rejects.
**Recommendation:** Either mirror the `member_service` fix (coerce to `"" / 0`) or change the router model to `dob: str = ""`, `age: int = 0`, `gender: str = ""`.

### [IMPORTANT] Mock `/api/onboarding/discover-structure` response shape matches NEITHER the real backend NOR the frontend TypeScript type
**Producer (real backend):** `backend/app/services/org_discovery_service.py:249-256` returns `{job_id, existing_groups, proposed_groups, existing_providers, new_providers, routing_summary}`.
**Producer (demo mock):** `frontend/src/lib/mockApi.ts:1087-1096` returns `{groups: [{id, name, provider_count, relationship_type}], unassigned_providers, total_groups, total_providers, total_unassigned}`.
**Consumer:** `frontend/src/components/onboarding/OrgDiscoveryReview.tsx:16-27` types `DiscoveryResult = {groups: [{tin, name, is_existing, relationship_type, providers}], unmatched_count}`.
**Contract drift:** Three different shapes for one endpoint. In demo mode, `res.data.groups.map((g) => ({ ...g }))` at `OrgDiscoveryReview.tsx:59` works (it's just spread) but `g.tin` is `undefined`, `g.is_existing` is `undefined`, `g.providers` is `undefined`. The confirm step then sends `{tin: undefined, name, relationship_type}` to the backend's confirm-structure endpoint, which filters by TIN — nothing gets confirmed.
**Evidence:**
```ts
// mockApi.ts:1089  — wrong shape
groups: [{ id: "g1", name: "Pinellas Medical Associates", provider_count: 12, relationship_type: "owned" }]
// OrgDiscoveryReview.tsx:92-96  — consumes g.tin which is undefined in demo
tin: g.tin, name: g.name, relationship_type: g.relationship_type
```
**Recommendation:** Fix the mock to emit the real backend's shape (`proposed_groups: [{tin, tin_raw, suggested_name, ...}]` or flatten to the frontend's shape with real TINs `{tin: "***-***4567", name, is_existing, relationship_type, providers: []}`. Currently it is neither.

### [IMPORTANT] Mock `/api/tuva/raf-baselines/summary` response drifts from real backend
**Producer (real backend):** `backend/app/routers/tuva_router.py:124-128` returns `{total_baselines, discrepancies, agreement_rate, avg_discrepancy_raf}`.
**Producer (demo mock):** `frontend/src/lib/mockApi.ts:2177-2184` returns `{total_members, raf_range_p25, raf_range_p50, raf_range_p75, raf_range_p95, pmpm_range_p25, pmpm_range_p50, pmpm_range_p75, pmpm_range_p95, discrepancies, version}`.
**Consumer:** `frontend/src/pages/TuvaPage.tsx:22-28 RafSummary = {total_baselines, discrepancies, agreement_rate, avg_discrepancy_raf}`.
**Contract drift:** In demo mode, `summary.total_baselines`, `summary.agreement_rate`, and `summary.avg_discrepancy_raf` are all `undefined`. `summary.agreement_rate` at `TuvaPage.tsx:408-410` then renders as `undefined%` and the ternary `>= 95` is always false.
**Evidence:**
```ts
// mockApi.ts:2177 — does NOT emit total_baselines, agreement_rate, avg_discrepancy_raf
mockResponse = { total_members: 1000, raf_range_p25: 0.78, ... discrepancies: 42, version: "2026.1" };
// TuvaPage.tsx:409 — reads fields that don't exist in demo
value={`${summary.agreement_rate}%`}
```
**Recommendation:** Align the mock to `{total_baselines: 1000, discrepancies: 42, agreement_rate: 95.8, avg_discrepancy_raf: 0.089}`.

### [IMPORTANT] Mock `/api/tuva/demo/summary` includes a spurious `avg_v24_risk_score` field
**Producer (real backend):** `backend/app/services/tuva_data_service.py:265-271` emits only V28 fields (`members_scored, avg_v28_risk_score, min_v28_risk_score, max_v28_risk_score`, plus `source, model`). The V24 scoring was removed.
**Producer (demo mock):** `frontend/src/lib/mockApi.ts:2198-2206` returns `avg_v24_risk_score: 1.217` alongside V28.
**Consumer:** `frontend/src/pages/TuvaPage.tsx:949` reads `s.v24_risk_score ?? s.v28_risk_score ?? 0` on individual score rows (fallback — OK), but the summary rendering at line 968-971 only uses V28 fields. The mock's `avg_v24_risk_score` is dead data that implies V24 support that no longer exists.
**Contract drift:** Demo hints at a V24 capability the real backend doesn't expose.
**Recommendation:** Drop `avg_v24_risk_score` from the mock response; also remove the `s.v24_risk_score ?? s.v28_risk_score` fallback in the Demo1kTab since the backend will never emit it.

### [IMPORTANT] `ColumnMapper` sends the literal string `"(unmapped)"` as a platform_field on confirm
**Producer (frontend):** `frontend/src/components/ingestion/FileUpload.tsx:47` sets `flatMapping[source] = entry?.platform_field || "(unmapped)"`. `ColumnMapper.tsx:107-108` then POSTs `column_mapping: mapping` without filtering out `"(unmapped)"`.
**Consumer (backend):** `backend/app/routers/ingestion.py:91-100 ConfirmMappingRequest.column_mapping: dict[str, str]` accepts anything. `confirm_mapping` at line 390-393 stores it verbatim: `{src: {"platform_field": field, "confidence": 1.0} ...}`. Downstream ingestion processors treat `"(unmapped)"` as a real field name and will fail silently or try to map to a non-existent column.
**Contract drift:** A sentinel display string leaks into the backend's persisted mapping. No backend code filters it (`grep "(unmapped)" backend/` → zero matches).
**Evidence:**
```ts
// FileUpload.tsx:47
flatMapping[source] = entry?.platform_field || "(unmapped)";
// ColumnMapper.tsx:107 — posts literal "(unmapped)" verbatim
await api.post(`/api/ingestion/${jobId}/confirm-mapping`, { column_mapping: mapping, ... })
```
**Recommendation:** In `ColumnMapper.handleConfirm`, strip `(unmapped)` entries before POSTing (`Object.fromEntries(Object.entries(mapping).filter(([,v]) => v !== "(unmapped)"))`), OR use `null` in both layers and have `ColumnMappingEntry.platform_field: str | None` carry the null.

### [MINOR] `normalizeUploadResponse` stringifies `job_id` but backend's `discover-structure` / `confirm-structure` want `int`
**Producer:** `backend/app/routers/ingestion.py:81` returns `job_id: int`. `FileUpload.tsx:59 job_id: String(resp.job_id)` converts to string.
**Consumer:** `backend/app/routers/onboarding.py:70 DiscoverStructureRequest.job_id: int` and line 74 `ConfirmStructureRequest.job_id: int`. `OrgDiscoveryReview.tsx:55` sends `{job_id: jobId}` where `jobId: string`.
**Contract drift:** Pydantic coerces a numeric string `"42"` → 42, so this works today. But `UploadResult.job_id: string` typing leaks into `ColumnMapper.jobId: string` and URL `/api/ingestion/${jobId}/confirm-mapping` — the URL works because it's interpolated, but the typing is inconsistent with backend truth. Any consumer that does numeric comparison will silently fail.
**Recommendation:** Keep `job_id` as `number` end-to-end in the frontend. `UploadResult.job_id: number`; let the URL interpolation stringify naturally.

### [MINOR] Journey `MemberSearchResult` does NOT honor the `search` query param when called with filter IDs — demo vs real mismatch
**Producer (real backend):** `backend/app/routers/journey.py:97-111` accepts `search: str | None`. If `search` is passed, it filters by name/member_id only (ignores `limit` ordering).
**Producer (demo mock):** `frontend/src/lib/mockApi.ts:1388-1395` ignores `search` entirely and only filters by `providerIds`.
**Consumer:** `JourneyPage.tsx:90` calls `/api/journey/members` with no params, so neither side is exercised today. But if a future caller adds `?search=smith`, demo vs real will diverge silently.
**Recommendation:** Either parse `search` from `config.params` in the mock, or drop `search` from the backend until it's a documented contract.

### [MINOR] Mock `/api/ingestion/{jobId}/confirm-mapping` returns `status: "completed"`; real backend returns `status: "validating"`
**Producer (real backend):** `backend/app/routers/ingestion.py:475-479` returns `ConfirmMappingResponse(job_id, status="validating", message=...)`.
**Producer (demo mock):** `frontend/src/lib/mockApi.ts:1084` returns `{job_id, status: "completed", message: "Processed in demo mode."}`.
**Consumer:** `ColumnMapper.tsx:103-118` does not read `res.data.status` from the confirm response (it sets local `setStatus("pending")` and polls the jobs endpoint), so this is cosmetic. But if any future consumer reads `response.status`, demo and real will diverge.
**Recommendation:** Change the mock to emit `status: "validating"` to match.

---

## VERDICT: REQUEST CHANGES

All five round-1 CRITICALs were closed with real producer+consumer fixes — the dashboard summary maps keys correctly, member null coercion works, `/api/journey/members` exists, trajectory emits `cost`/`event`, and the ingestion upload shape is normalized. However, the same null-coercion pattern that was fixed for `MemberRow` was NOT applied to the parallel `MemberSummary` schema in `journey.py` — `dob`/`age`/`gender` are still required fields fed from possibly-None DB columns, so `/api/journey/{id}` will 500 on any member with a missing DOB. Two round-1 IMPORTANT findings (`conditions` filter param, `group_id`/`snf_days_12mo` ghost fields) are still unaddressed. Finally the new mockApi handlers for `onboarding/discover-structure`, `tuva/raf-baselines/summary`, and `tuva/demo/summary` drift from the real backend shapes — the demo papers over bugs that would surface the moment a real backend is wired up.
