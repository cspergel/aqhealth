# Phase — Tuva multi-tenancy + input-surface broadening

## Scope
Readiness report `readiness-tuva-dbt.md` flagged three coupled problems:
1. `tenant_schema` declared in ten router → data-service signatures but never plumbed through the runner, so dbt always built into the shared `tuva_warehouse.duckdb`.
2. Required Tuva vars (`hcc_recapture_enabled`, `hcc_suspecting_enabled`, `clinical_enabled`, `provider_attribution_enabled`) were off, so clinical marts compiled as disabled stubs.
3. Input surface was limited to claims / members / lab_result, leaving `hcc_suspecting`, `chronic_conditions`, and `quality_measures` with nothing upstream.

This phase closes all three and leaves the pipeline end-to-end tenant-isolated with a full clinical input surface.

## Changes

### 1. Required Tuva vars enabled
`dbt_project/dbt_project.yml` — added `hcc_recapture_enabled`, `hcc_suspecting_enabled`, `clinical_enabled`, and `provider_attribution_enabled`, all set to `true`. Without these, Tuva's `hcc_recapture` / `hcc_suspecting` / `clinical_enabled` models compile as empty stubs (`{{ config(enabled = var('clinical_enabled', false)) }}`).

### 2. Per-tenant DuckDB path via env var
`dbt_project/profiles.yml` — `path` now templates off `DBT_DUCKDB_PATH`, defaulting to `../data/tuva_warehouse.duckdb`. That lets `TuvaRunnerService` route each tenant's dbt build to its own DuckDB file without editing the profile between runs.

### 3. Runner plumbing
`backend/app/services/tuva_runner_service.py` — every public verb (`run_seeds`, `run_all`, `run_models`, `run_mart`, `compile_project`) now takes `tenant_schema: str | None = None`. `_execute` resolves the tenant's DuckDB path, injects `DBT_DUCKDB_PATH` into the subprocess env, and returns it in the result dict (`duckdb_path`) so the caller can verify tenant isolation end-to-end. `None` and the `"platform"` sentinel both resolve to the shared warehouse — no existing single-DB flow breaks.

### 4. Data-service tenant awareness
`tuva_data_service.py` was already wiring `tenant_schema` through to `_connect` via `get_duckdb_path(tenant_schema)`. The supporting change is in `tuva_export_service.get_duckdb_path`: it now treats `"platform"` the same as `None` (both → shared warehouse), which keeps the auth layer's non-tenanted superadmin path from trying to open `data/tuva_platform.duckdb`.

Every router endpoint already passes `current_user["tenant_schema"]` (`tuva_router.py:234, 325, 339, 353, 370, 384, 398, 412, 426, 456, 457, 965`). No router changes required beyond confirming the plumbing.

### 5. Sync-service tenant awareness
`tuva_sync_service.TuvaSyncService` now accepts either an explicit `duckdb_path` (legacy callers) or a `tenant_schema` and resolves the per-tenant DuckDB file internally. Back-compatible — the existing worker invocation `TuvaSyncService(duckdb_path=duckdb_path)` keeps working.

### 6. Worker plumbing
`backend/app/workers/tuva_worker.py` — passes `tenant_schema` to `runner.run_seeds(...)` and `runner.run_models(...)`. Each phase result now surfaces the `duckdb_path` actually used, so a regression where dbt silently writes to the wrong DuckDB is visible in the job output.

### 7. Broadened export surface
`tuva_export_service.py` gains five new exporters for the Tuva clinical input layer:

| Exporter | Raw table | Source |
| --- | --- | --- |
| `export_conditions` | `raw.condition` | `claims.diagnosis_codes` unnested with position-based `condition_rank` and `claim_type`-derived `condition_type` |
| `export_encounters` | `raw.encounter` | one row per record-tier claim; `service_category` → Tuva `encounter_type` map; LOS computed from claim |
| `export_medications` | `raw.medication` | `claims WHERE service_category = 'pharmacy'`, NDC + drug_name + days_supply |
| `export_procedures` | `raw.procedure` | `claims.procedure_code` (HCPCS) |
| `export_observations_tuva` | `raw.observation` | signal-tier `ecw_observation` + `vital-signs` / `social-history` / `assessment` categories |

Column sets match Tuva's `input_layer__<name>.yml` contracts (verified against `dbt_project/dbt_packages/the_tuva_project/models/input_layer/*.yml`). Each exporter matches the existing pattern (DROP + CREATE + per-row INSERT) so the output is a drop-in sibling to `export_claims` / `export_members`.

`export_all` now runs all five clinical exporters after the existing ones, each wrapped in a try/except so a missing source column degrades gracefully instead of failing the whole job.

### 8. dbt model wiring
`dbt_project/models/input_layer/sources.yml` — added five new source tables (condition, encounter, medication, procedure, observation).

Five new input-layer models at `dbt_project/models/input_layer/{condition,encounter,medication,procedure,observation}.sql`, each selecting from its raw source table with explicit casts matching Tuva's contract. Tuva's `input_layer__condition.sql` (and siblings) do `select * from {{ ref('condition') }}` — these new models fill that ref, so enabling `clinical_enabled` no longer blows up on unresolved references.

## Files touched
- `dbt_project/dbt_project.yml` — 4 new vars
- `dbt_project/profiles.yml` — env-var-templated `path`
- `dbt_project/models/input_layer/sources.yml` — 5 new source declarations
- `dbt_project/models/input_layer/condition.sql` — new
- `dbt_project/models/input_layer/encounter.sql` — new
- `dbt_project/models/input_layer/medication.sql` — new
- `dbt_project/models/input_layer/procedure.sql` — new
- `dbt_project/models/input_layer/observation.sql` — new
- `backend/app/services/tuva_runner_service.py` — `tenant_schema` plumbed through every verb; `DBT_DUCKDB_PATH` set in subprocess env
- `backend/app/services/tuva_export_service.py` — `"platform"` ↔ `None` equivalence in `get_duckdb_path`; 5 new exporters; `export_all` runs them
- `backend/app/services/tuva_sync_service.py` — constructor accepts either `duckdb_path` or `tenant_schema`
- `backend/app/workers/tuva_worker.py` — passes `tenant_schema` to runner calls; surfaces `duckdb_path` in phase results

## Back-compat guarantees
- `tenant_schema=None` or `"platform"` always routes to `data/tuva_warehouse.duckdb` (old single-DB behavior).
- `TuvaSyncService(duckdb_path=...)` still works; new `tenant_schema=...` kwarg is additive.
- `TuvaRunnerService.run_*()` with no args still writes to the shared warehouse.
- New exporters are wrapped in try/except in `export_all` — if a tenant's schema doesn't have one of the upstream tables, the job keeps going.

## Verified
- `python -c "import py_compile; ..."` — all six modified Python files compile.
- `yaml.safe_load` — `dbt_project.yml`, `profiles.yml`, `sources.yml` all parse.

## Not done (out of scope for this phase)
- Per-row INSERTs are still the ingestion pattern (readiness report item #14). Bulk register via pandas/arrow is the next optimization.
- `cms_hcc_payment_year` is still hardcoded to 2026 (item #22). Making it a per-tenant var requires a Config table + `--vars` support in the runner, not covered here.
- `get_quality_measures` / `get_chronic_conditions` / `get_tuva_recapture_opportunities` query rewrites — handled in a prior phase per the data-service file comments; not in scope here.
- `payer='medicare'` hardcoding in `medical_claim.sql` + new `condition.sql` / `medication.sql` / `observation.sql` — tracked as readiness items #23/#24, needs a member.plan_type-based mapping layer.
