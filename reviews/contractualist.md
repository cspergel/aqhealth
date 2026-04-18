# The Contractualist — Interface & Contract Review

**Project:** AQSoft Health Platform (EMR-agnostic managed care intelligence layer)
**Scope:** Full codebase contract/interface audit — backend routers/services, frontend consumers, dbt marts, FHIR adapters, shared model drift.
**Method:** Cross-referenced every producer (router response / service return / dbt column / adapter output) against the consumers that read it. Every finding below cites BOTH sides.

---

### [CRITICAL] `/api/members` list emits `None` for fields typed as required `str` — Pydantic 500 risk
**Producer:** `backend/app/services/member_service.py:277` emits `"dob": str(row.date_of_birth) if row.date_of_birth else None` and `"last_visit_date": str(row.last_visit_date) if row.last_visit_date else None` (lines 277, 283). `"pcp": pcp_name` is `None` when no PCP is assigned (line 278). `"plan": row.health_plan` (line 290) can be `None`.
**Consumer:** `backend/app/routers/members.py:32-52` declares `MemberRow.dob: str` (required), `pcp: str = ""`, `last_visit_date: str = ""`, `plan: str = ""`. Pydantic defaults do NOT coerce explicit `None` to `""`; the router then calls `MemberListOut(**data)` at line 176.
**Contract drift:** Service output → Pydantic response_model validation fails for any member lacking a DOB, last visit, plan, or PCP. Router returns 500 instead of a valid list.
**Evidence:**
```python
# service output (member_service.py:277)
"dob": str(row.date_of_birth) if row.date_of_birth else None,
# router model (members.py:35)
dob: str   # required, no Optional, no default — None rejects
```
**Recommendation:** Either change service to emit `""` (or ISO date only when present) for these fields, or change `MemberRow` fields to `str | None = None`. The frontend `MockMember` also declares these as required `string`, so aligning on `Optional` with coerced fallback (empty string) in the service is safer.

---

### [CRITICAL] `/api/dashboard/summary` reads keys that `get_dashboard_metrics` never emits
**Producer:** `backend/app/services/dashboard_service.py:118-125` returns keys `total_lives`, `avg_raf`, `recapture_rate`, `suspect_inventory`, `total_pmpm`, `mlr`.
**Consumer:** `backend/app/routers/dashboard.py:148-155` reads `metrics.get("total_members", 0)`, `metrics.get("open_suspects", 0)`, `metrics.get("suspect_value", 0)`, `metrics.get("open_care_gaps", 0)` — none of which exist in the service output.
**Contract drift:** All four values always return `0`. The onboarding wizard and "quick status" caller silently display zeros regardless of real state.
**Evidence:**
```python
# producer (dashboard_service.py)
return {"total_lives": total_lives, "avg_raf": ..., "suspect_inventory": suspect_inventory, ...}
# consumer (dashboard.py:150-154)
"total_members": metrics.get("total_members", 0),
"hcc_suspects":  metrics.get("open_suspects", 0),
"dollar_opportunity": metrics.get("suspect_value", 0),
"care_gaps":     metrics.get("open_care_gaps", 0),
```
**Recommendation:** Map the existing producer keys (`total_lives`, `suspect_inventory.count`, `suspect_inventory.total_annual_value`) or add a dedicated summary producer that emits the contract the router advertises.

---

### [CRITICAL] `GET /api/journey/members` is called by the frontend but does not exist on the backend
**Producer:** `backend/app/routers/journey.py` defines only `GET /{member_id}` and `GET /{member_id}/trajectory` (lines 83, 99). There is no collection endpoint.
**Consumer:** `frontend/src/pages/JourneyPage.tsx:90` does `api.get("/api/journey/members")` and types it as `MemberSearchResult[]`.
**Contract drift:** The member-search list always errors out; the code silently catches and sets `[]`, so the search UI is permanently empty when the real backend is used (it only works in demo mode via `mockApi`).
**Evidence:**
```ts
// frontend/src/pages/JourneyPage.tsx:90
api.get("/api/journey/members").then((res) => setMembers(...))
```
```python
# backend/app/routers/journey.py — only these routes exist
@router.get("/{member_id}", ...)
@router.get("/{member_id}/trajectory", ...)
```
**Recommendation:** Either implement `GET /api/journey/members` returning `[{id, member_id, name, dob, current_raf}]` (as typed by the frontend), or have the Journey page call `/api/members` with a small projection.

---

### [CRITICAL] Journey page `TrajectoryPoint` and `MemberSummaryData` expect fields the router never returns
**Producer:** `backend/app/routers/journey.py:71-76` `TrajectoryPoint` has `date, raf, disease_raf, demographic_raf, hcc_count`. `MemberSummary` (lines 48-62) has no `conditions` field.
**Consumer:** `frontend/src/pages/JourneyPage.tsx:56-64` declares `TrajectoryPoint { date, raf, cost, disease_raf, demographic_raf, hcc_count, event? }` — **`cost` and `event` do not exist** on the backend model. `MemberSummaryData` at line 21-37 declares `conditions: string[]` and `total_spend_12m: number` (required) — backend emits no `conditions` and allows `total_spend_12m: None`.
**Contract drift:** Rendering risk trajectory with cost overlays reads `undefined`; Member Summary condition list is always empty. TypeScript treats these as guaranteed populated and may crash on downstream `.map()` / `.toFixed()` calls.
**Evidence:**
```python
# backend (journey.py)
class TrajectoryPoint(BaseModel):
    date: str; raf: float
    disease_raf: float | None = None
    demographic_raf: float | None = None
    hcc_count: int | None = None
```
```ts
// frontend (JourneyPage.tsx:56)
interface TrajectoryPoint { date, raf, cost, disease_raf, demographic_raf, hcc_count, event? }
```
**Recommendation:** Add `cost`, `event`, and optional `conditions` to the backend producers (or drop them from the frontend types). Decide once and align.

---

### [CRITICAL] `/api/ingestion/upload` response shape diverges from frontend on three fields
**Producer:** `backend/app/routers/ingestion.py:80-89` `UploadResponse` — `job_id: int`, `proposed_mapping: dict[str, ColumnMappingEntry]` (nested `{platform_field, confidence, transform}`), `sample_rows: list[list[str]]`, plus `headers`, `preprocessing`, `file_identification`.
**Consumer:** `frontend/src/components/ingestion/FileUpload.tsx:10-19` and `pages/IngestionPage.tsx:12-17` declare `job_id: string`, `proposed_mapping: Record<string, string>` (flat source→field), `sample_data: Record<string, string[]>`. Backend never emits `sample_data`.
**Contract drift:** Three mismatches in a single round-trip:
  1. `job_id` is `int` not `string` — fine in JS for equality but breaks strict typing and any string concatenation `` `/api/ingestion/jobs/${jobId}` `` is technically wrong.
  2. `proposed_mapping` is nested objects, but the frontend treats each value as a raw field-name string. `Object.entries(proposed).map(([src, target]) => target as string)` would read `"[object Object]"`.
  3. `sample_data` isn't returned — sample preview falls back to undefined.
**Evidence:**
```python
# backend (ingestion.py:80)
job_id: int
proposed_mapping: dict[str, ColumnMappingEntry]
sample_rows: list[list[str]]
```
```ts
// frontend (FileUpload.tsx:10)
job_id: string;
proposed_mapping: Record<string, string>;
sample_data: Record<string, string[]>;
```
**Recommendation:** Update the frontend `UploadResult` to mirror `UploadResponse` exactly (`job_id: number`, `proposed_mapping: Record<string, {platform_field: string | null; confidence: number}>`, `sample_rows: string[][]`, `headers: string[]`) and derive a `sample_data` view client-side from `headers` + `sample_rows` if needed. Update `ColumnMapper` to read `.platform_field` from each entry.

---

### [IMPORTANT] `/api/members` ignores the `conditions` param that MembersPage always sends
**Producer:** `frontend/src/pages/MembersPage.tsx:66` serialises the UniversalFilterBuilder state as `params.conditions = JSON.stringify(filterConditions)` and sends it to `/api/members` and `/api/members/stats`.
**Consumer:** `backend/app/routers/members.py:134-152` declares only discrete query params (`raf_min`, `risk_tier`, …) with no `conditions` field. FastAPI silently drops unknown query params. The service also has no `conditions` branch (`member_service.py:178` builds conditions from the discrete keys only).
**Contract drift:** Universal filters set through the advanced builder UI have zero effect when the real backend is used — they only work in demo (mockApi.ts:1464 honors them).
**Evidence:**
```ts
// frontend
if (filterConditions) { params.conditions = JSON.stringify(filterConditions); }
```
```python
# backend (members.py:134) — no conditions Query parameter
async def member_list(raf_min=..., risk_tier=..., provider_id=..., ...):
```
**Recommendation:** Add `conditions: str | None = Query(None)` to the router, parse the JSON, and translate via a generic filter engine in `member_service`. Otherwise the advanced filter UI should be marked demo-only.

---

### [IMPORTANT] `MemberRow.snf_days_12mo` advertised in router schema but never populated
**Producer:** `backend/app/routers/members.py:52` declares `snf_days_12mo: int = 0  # TODO: not yet populated by member_service`. `member_service.py:274-293` never emits a `snf_days_12mo` key.
**Consumer:** `frontend/src/lib/mockData.ts:3094` `MockMember.snf_days_12mo: number` (required). `frontend/src/pages/MembersPage.tsx:156` includes `${m.snf_days_12mo}` in the CSV export verbatim.
**Contract drift:** Real backend returns the Pydantic default `0` for every member; the CSV export column is always `0`. The field pretends to be computed data but never is.
**Evidence:**
```python
# router field with TODO still live
snf_days_12mo: int = 0  # TODO: not yet populated by member_service
```
```ts
// frontend uses it in exports
...${m.admissions_12mo},${m.snf_days_12mo},${m.suspect_count}...
```
**Recommendation:** Either compute `snf_days_12mo` in `member_service.get_member_list` from `Claim.service_category == "snf_postacute"` with a `sum(length_of_stay)` subquery (analogous to the existing `er_sq`/`admit_sq`), or remove the field from the Pydantic model and frontend type.

---

### [IMPORTANT] `MemberRow.group_id` declared but never populated by service
**Producer:** `backend/app/services/member_service.py:274` item dict emits `"group": row.group_name` but no `group_id`, even though the query joins `PracticeGroup` and has `PracticeGroup.id` available.
**Consumer:** `backend/app/routers/members.py:39` declares `group_id: int | None = None` — fine for Pydantic, but `frontend/src/lib/mockData.ts:3081` declares `group_id: number` (required). The mock filter engine (`mockApi.ts:1472`) filters on `m.group_id`; real data never has it populated.
**Contract drift:** Real backend → frontend, `group_id` is always null and any filter that compares against it in TypeScript returns no matches.
**Evidence:** see producer/consumer snippets above. Service line 280: `"group": row.group_name,` — the next line never adds `"group_id": row.group_id`.
**Recommendation:** Add `PracticeGroup.id.label("group_id")` to the `select()` (line 158) and append `"group_id": row.group_id` to the item dict. Same fix applies to the `pcp` name vs missing `pcp_id` display issue — `pcp_id` at least IS emitted via `Member.pcp_provider_id`.

---

### [IMPORTANT] FHIR CapabilityStatement advertises `create` for resources whose handlers are stubs
**Producer:** `backend/app/services/fhir_service.py:23-30` `RESOURCE_HANDLERS` has `Observation`, `Encounter`, `Procedure` mapped to `None` (stubs). `get_capability_statement()` (line 110) iterates `sorted(RESOURCE_HANDLERS)` and emits `{"type": rt, "interaction": [{"code": "create"}]}` for EVERY key regardless of stub status.
**Consumer:** Any FHIR client that reads `/api/fhir/capability` and sends an `Observation` Bundle to `POST /api/fhir/ingest`. `ingest_fhir_bundle` (line 59) silently skips stub handlers (`continue`), so the bundle is accepted but nothing is ingested, and the response says `resources_processed` does not include that type.
**Contract drift:** The CapabilityStatement lies. FHIR conformance tooling (Inferno, Touchstone, HAPI validators) will consider this server claiming support and mark it as non-conformant when no resource is created.
**Evidence:**
```python
RESOURCE_HANDLERS = {
    "Patient": "_ingest_patient",
    "Condition": "_ingest_condition",
    "MedicationRequest": "_ingest_medication",
    "Observation": None,       # stub
    "Encounter":   None,       # stub
    "Procedure":   None,       # stub
}
# get_capability_statement emits create for ALL keys
"resource": [{"type": rt, "interaction": [{"code": "create"}]} for rt in sorted(RESOURCE_HANDLERS)]
```
**Recommendation:** Filter `rt` to only those with a non-`None` handler, or make `get_capability_statement` emit `read`-only interactions for stub resources until they are implemented. **CROSS:** Adversary (integration liability).

---

### [IMPORTANT] `/api/members/{member_id}` returns an untyped dict with keys the frontend has no type for
**Producer:** `backend/app/routers/members.py:116-126` — `member_detail` has no `response_model`; `member_service.get_member_detail` (lines 388-408) returns keys: `demographics: {age, gender, zip_code}`, `suspects: [{hcc_code, hcc_label, icd10_code, raf_value, confidence}]`, `gaps: [{measure_id, due_date, measurement_year}]`, `recent_claims: [{date, type, provider, amount, diagnoses}]`.
**Consumer:** Grepping the frontend, no component in `src/pages` calls `/api/members/{id}` directly (only the demo `mockApi.ts` returns `MockMember` which has a completely different shape — no `demographics` subobject, no `suspects`/`gaps`/`recent_claims` arrays). In demo mode the frontend thinks a member has `er_visits_12mo`; in real mode it would receive `demographics.age`. If any component ever hydrates from this endpoint it will get a shape mismatch.
**Contract drift:** Two parallel canonical member shapes (list row vs detail) with no shared types anywhere. Demo mode papers over the difference because `mockApi` just returns the list row shape for detail.
**Evidence:** compare `member_service.py:388-408` (detail dict) with `mockData.ts:3074` (`MockMember` — flat list row shape).
**Recommendation:** Add a `MemberDetailOut` Pydantic schema, annotate `member_detail` with `response_model=MemberDetailOut`, and add the matching TypeScript interface. Align the demo mock so its detail shape equals the real backend's detail shape (not the list row shape).

---

### [IMPORTANT] `SortOrder` param naming: router uses `sort_order`, frontend sends only `sort_by`
**Producer:** `backend/app/routers/hcc.py:157-158` — `sort_by: SortField`, `sort_order: SortOrder` (defaults to `desc`).
**Consumer:** `frontend/src/pages/SuspectsPage.tsx:80-87` sends `params.sort_by` but no `sort_order` — relying on default. Meanwhile `/api/members` (`members.py:148`) uses `order` (not `sort_order`) and the Suspects frontend hard-codes `sort_order`-style semantics.
**Contract drift:** Inconsistent sort param naming across routes — `hcc` uses `sort_order`, `members` uses `order`, `providers` uses `order`. A generic sort hook cannot be shared.
**Evidence:**
```python
# hcc.py:158
sort_order: SortOrder = Query(SortOrder.desc),
# members.py:148
order: str = Query("desc", pattern="^(asc|desc)$"),
```
**Recommendation:** Pick one name (`order`) and rename `sort_order` in `/api/hcc/suspects`. This is a breaking API change; do it before more consumers calcify.

---

### [IMPORTANT] `provider_leaderboard` row type drifts between dashboard and providers routers
**Producer:** `backend/app/routers/dashboard.py:73-79` `ProviderRow` on the dashboard has `id, name, specialty, panel_size, capture_rate`. `providers.py:44-59` `ProviderListItem` is much richer (capture_rate + recapture_rate + avg_raf + panel_pmpm + gap_closure_rate + tier + percentiles).
**Consumer:** `frontend/src/pages/DashboardPage.tsx:52-58` `ProviderRow` mirrors the dashboard one; `frontend/src/pages/ProvidersPage.tsx` consumes the richer one. There is no shared type — two separate "Provider" row shapes depending on which page you land on first.
**Contract drift:** Re-using provider listings cross-page requires a projection step. A "click to drill into provider scorecard" flow that passes the dashboard row into a component expecting the full scorecard shape will crash on undefined `percentiles`.
**Evidence:** two separate `class ProviderRow` definitions, intentional but undocumented.
**Recommendation:** Name them clearly (`ProviderLeaderboardRow` on the dashboard, `ProviderScorecardRow` on the providers page) and document that the leaderboard is a projection. Better: define one canonical `Provider` Pydantic model in a shared module and have the leaderboard return an explicit subset.

---

### [IMPORTANT] `tuva_data_service.get_quality_measures` relies on an undocumented column contract
**Producer:** `dbt_project/dbt_packages/the_tuva_project/models/data_marts/...` produces `main_quality_measures.summary` with Tuva-determined columns; those columns differ between Tuva releases.
**Consumer:** `backend/app/services/tuva_data_service.py:165-181` does `SELECT * FROM main_quality_measures.summary LIMIT 100` and returns `[dict(zip(columns, row))]` using `con.description` — i.e., whatever Tuva emits becomes the contract. No downstream consumer knows what keys to expect.
**Contract drift:** This is an implicit contract. Upgrading Tuva will silently change the keys returned by this function; any frontend or router that reads specific keys (e.g., `measure_id`) will break without a code change.
**Evidence:**
```python
result = con.execute("SELECT * FROM main_quality_measures.summary LIMIT 100").fetchall()
columns = [desc[0] for desc in con.description]
return [dict(zip(columns, row)) for row in result]
```
**Recommendation:** Enumerate the columns explicitly (e.g., `measure_id, measure_name, numerator, denominator, rate`) and document the schema compatibility version. At least add a TypedDict / Pydantic schema at the service boundary so consumers know the contract.

---

### [IMPORTANT] DuckDB schema-prefix fallback is a string hack, not a real contract
**Producer:** dbt output schema depends on project profile; Tuva defaults may be `main_cms_hcc.*` locally or `cms_hcc.*` in the demo DuckDB.
**Consumer:** `backend/app/services/tuva_data_service.py:48-68` `_query_with_schema_fallback` does a `.replace("main_cms_hcc.", "cms_hcc.")` textual substitution on the query string if the first attempt fails. This crosses four schema prefixes (`main_cms_hcc`, `main_financial_pmpm`, `main_chronic_conditions`, `main_quality_measures`, `main_hcc_suspecting`).
**Contract drift:** The service has no idea which schema layout is real; a new mart in a different prefix (e.g., `main_hcc_recapture.*` in `get_tuva_recapture_opportunities` at line 330) will fail silently — that function doesn't even call the fallback helper, so it's hard-coded to `hcc_recapture.summary` without the `main_` variant.
**Evidence:**
```python
# generic helper used for 4 marts
alt_query = query.replace("main_cms_hcc.", "cms_hcc.").replace(...)
# get_tuva_recapture_opportunities (line 330) doesn't use the helper
result = con.execute("SELECT * FROM hcc_recapture.summary LIMIT 100").fetchall()
```
**Recommendation:** Establish a single schema-naming contract via a dbt variable (`target.schema`) or a `TUVA_SCHEMA_PREFIX` env var; resolve once at connection time and format all queries with `f"FROM {prefix}cms_hcc.patient_risk_scores"`. Remove the string-replace fallback.

---

### [MINOR] Frontend `MockMember.risk_tier` is a closed union but router accepts any string
**Producer:** `backend/app/routers/members.py:41` `risk_tier: str = "low"` (any string). `backend/app/models/member.py` defines `RiskTier` enum (values `low, rising, high, complex`).
**Consumer:** `frontend/src/lib/mockData.ts:3083` `risk_tier: "low" | "rising" | "high" | "complex"` (closed union).
**Contract drift:** If any downstream ETL writes `risk_tier = "moderate"` (typo or future enum value), Pydantic passes it through, TypeScript sees it as `string` at runtime but typed as the closed union — pattern matches (`switch (tier)`) fall through to `default`.
**Evidence:** `MemberTable.tsx:46-53 tierTag(tier)` has `case "low"... case "complex"... default:`. A rogue value would silently render as the fallback.
**Recommendation:** Change `MemberRow.risk_tier: Literal["low", "rising", "high", "complex"]` — Pydantic will 422 out if the DB has bad data, exposing the problem at the seam.

---

### [MINOR] InsightCard category union is safer than router schema
**Producer:** `backend/app/routers/dashboard.py:107` `InsightOut.category: str` (open string).
**Consumer:** `frontend/src/components/ui/InsightCard.tsx:20` `category: "revenue" | "cost" | "quality" | "provider" | "trend" | "cross_module"`, used to index `categoryColors` dict (line 25). If the DB ever stored a different category, `colors = categoryColors[category]` returns `undefined` and the render crashes.
**Contract drift:** The enum is defined once in `backend/app/models/insight.py:9` but not exposed on the response model. The frontend effectively re-implements the enum from scratch.
**Evidence:** `InsightCategory` enum in `insight.py`; no shared export; frontend hand-copies the values.
**Recommendation:** Make `InsightOut.category: InsightCategory` on the backend (Pydantic + OpenAPI will surface the enum to clients); generate the TS union from the OpenAPI schema or keep them in sync by code review discipline.

---

### [MINOR] `mockApi` accepts filter params the real backend does not
**Producer (real backend):** `/api/members` router params list is closed at `members.py:134-152` — no `frequent_utilizers`.
**Producer (demo mock):** `frontend/src/lib/mockApi.ts:1478, 1516` accepts `params.frequent_utilizers === "true"` and filters by `er_visits_12mo >= 3 || admissions_12mo >= 2`.
**Consumer:** Any UI control that emits `frequent_utilizers=true` works in demo but silently no-ops against the real backend.
**Contract drift:** Demo and real backends aren't contract-equivalent; demo has a richer filter surface.
**Evidence:**
```ts
// mockApi.ts:1478
if (params.frequent_utilizers === "true") filtered = filtered.filter((m) => m.er_visits_12mo >= 3 || m.admissions_12mo >= 2);
```
**Recommendation:** Either implement `frequent_utilizers: bool` on the router, or document in `mockApi.ts` that this is demo-only and remove any UI that emits it when not in demo mode.

---

### [MINOR] `clinical.CaptureRequest` requires `member_id` but the endpoint already knows it via suspect lookup
**Producer:** `backend/app/routers/clinical.py:34-36` `CaptureRequest { member_id: int; suspect_id: int }`. Logic at line 93 rejects the request if `suspect.member_id != req.member_id`, even though the correct member_id is derivable from the suspect.
**Consumer:** `frontend/src/components/clinical/CaptureButton.tsx:21-24` dutifully sends both. Good, but the contract has redundant data where the router could verify from the suspect alone.
**Contract drift:** Minor — redundant required field. A future consumer that only has the suspect_id (e.g., bulk capture from a report) must re-fetch the member_id.
**Recommendation:** Make `member_id` optional and cross-check only when supplied, or drop it entirely and derive from the suspect row.

---

### [MINOR] SuspectOut and related schemas duplicate field declarations across router and frontend
**Producer:** `backend/app/routers/hcc.py:37-55` `SuspectOut` + `SuspectWithMemberOut` + `SuspectOut` in `members.py` detail.
**Consumer:** `frontend/src/components/suspects/ChaseList.tsx:11-35` `SuspectRow` and `frontend/src/components/suspects/MemberDetail.tsx:10-23` `Suspect` — two different TS shapes for the same concept.
**Contract drift:** The ChaseList type has 21 fields; the MemberDetail type has 11 fields (subset). They are maintained by hand; any field rename on the backend must be updated in 2+ places and will not be caught at compile time.
**Evidence:** two TS interfaces hand-built, no shared type.
**Recommendation:** Generate TS types from the OpenAPI spec (FastAPI already publishes `/api/openapi.json`) using `openapi-typescript` or similar. Alternatively, define `SuspectRowBase` in TS with `ChaseSuspect = SuspectRowBase & ChaseExtras`.

---

### [MINOR] Dashboard insights `source_modules` emitted but not consumed
**Producer:** `backend/app/services/dashboard_service.py:360` emits `"source_modules": i.source_modules` (JSONB list). Router `InsightOut.source_modules: list[str] | None = None` (dashboard.py:113).
**Consumer:** `frontend/src/pages/DashboardPage.tsx:90-98` `DashboardInsight` declares `id, category, title, description, dollar_impact, recommended_action, confidence` — **no `source_modules`**. The field crosses the wire, is parsed by Pydantic, sent as JSON, and the frontend silently drops it.
**Contract drift:** Wasted bandwidth and a feature defined but not surfaced. If the product spec is "show which modules contributed to this insight" (per project memo `feedback_cascading_alerts.md`), the feature is half-built.
**Recommendation:** Either add `source_modules?: string[]` to the frontend type and render it as chips, or remove the field from the router response.

---

## VERDICT: REQUEST CHANGES

Several crash-grade contract drifts exist between producers and consumers: the dashboard summary endpoint silently returns zeros, the member list will 500 on real members with null DOBs, the ingestion upload response doesn't match what the frontend expects (three fields off), and the Journey page search endpoint doesn't exist. Most issues cluster at two seams — **(a) router → service dict shape** (where Pydantic response_models are more aspirational than real) and **(b) backend → frontend TypeScript** (where TS types were written against the demo mock rather than the real API). The fastest wins are (1) align `MemberRow` and service output on `Optional` fields + emit `group_id` and `snf_days_12mo`; (2) fix `get_dashboard_summary` keys; (3) generate the frontend API types from `/api/openapi.json` to eliminate the entire class of silent drift.
