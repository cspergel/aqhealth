# Tuva / dbt Pipeline Readiness

## Verdict
**NOT READY.** The dbt pipeline runs, but **three of the six consumer functions read from tables/columns that do not exist** in Tuva's mart schema. Those queries silently return `[]` via broad `except Exception` handlers, so the frontend renders empty panels with no error surfaced. `tuva_sync_service` uses a third, different-again schema convention (`main.cms_hcc__patient_risk_scores`) that is also wrong. Multi-tenant routing is declared in the service signatures but **never passed** by the router — every demo call reads the shared non-tenant DuckDB file. The pipeline is still at the "good enough for demo" stage; against a real 50k-member tenant today it will ingest claims, run dbt, populate marts, and then the UI will show zeros for PMPM, Quality Measures, Chronic Conditions, and Recapture.

## dbt → backend contract map

| Tuva Model (schema.table) | Consumer (file:line) | Contract robust? |
| --- | --- | --- |
| `main_cms_hcc.patient_risk_scores` | `backend/app/services/tuva_data_service.py:89` (`get_risk_scores`) | Partial — columns match; schema fallback via string-replace handles demo vs. warehouse DB, but `tenant_schema` arg is never passed by router |
| `main_cms_hcc.patient_risk_factors` | `backend/app/services/tuva_data_service.py:122` (`get_risk_factors`) | Partial — columns match; does NOT call `_query_with_schema_fallback`, hard-fails if run against the demo DB |
| `main_financial_pmpm.pmpm_prep` | `backend/app/services/tuva_data_service.py:151` (`get_pmpm_summary`) | **BROKEN** — selects `service_category_1`, `pmpm`, `member_months`; **none exist** on this table (verified in `data/tuva_demo.duckdb`). Returns `[]` silently |
| `main_quality_measures.summary` | `backend/app/services/tuva_data_service.py:170` (`get_quality_measures`) | **BROKEN** — table does not exist. Real tables: `summary_counts`, `summary_long`, `summary_wide` |
| `main_chronic_conditions.tuva_chronic_conditions_long` | `backend/app/services/tuva_data_service.py:192` (`get_chronic_conditions`) | **BROKEN** — selects `condition_date`; real columns are `first_diagnosis_date`, `last_diagnosis_date`. Returns `[]` silently |
| `main_hcc_suspecting.list` | `backend/app/services/tuva_data_service.py:305` (`get_tuva_suspects`) | OK — columns match actual schema |
| `hcc_recapture.summary` (no `main_` prefix even for warehouse DB) | `backend/app/services/tuva_data_service.py:331` (`get_tuva_recapture_opportunities`) | **BROKEN** — table does not exist in either DB; no fallback helper; hardcoded to a name that was never a Tuva output |
| `main.cms_hcc__patient_risk_scores` (tableized-schema form) | `backend/app/services/tuva_sync_service.py:41` (`_read_tuva_hcc`) | **BROKEN** — wrong schema convention entirely (Tuva splits schema+alias; this code assumes one big `main` schema). Also selects nonexistent `raw_risk_score` column |
| `main.financial_pmpm__pmpm_prep` | `backend/app/services/tuva_sync_service.py:61` (`_read_tuva_pmpm`) | **BROKEN** — same wrong schema convention; also selects nonexistent `pmpm` and `service_category_1` columns |

## Backend → dbt input map (raw tables)

| Raw table (DuckDB) | Writer (file:line) | Consumed by dbt source |
| --- | --- | --- |
| `raw.claims` | `backend/app/services/tuva_export_service.py:83-155` (`export_claims`) | `dbt_project/models/input_layer/medical_claim.sql:7` and `pharmacy_claim.sql:5` |
| `raw.members` | `backend/app/services/tuva_export_service.py:157-204` (`export_members`) | `dbt_project/models/input_layer/eligibility.sql:5` |
| `raw.providers` | `backend/app/services/tuva_export_service.py:206-235` (`export_providers`) | **Declared in `models/input_layer/sources.yml:11-13` but no dbt model consumes it.** Tuva's provider data comes from internal seeds, not this source |
| `raw.provider_attribution` | `backend/app/services/tuva_export_service.py:237-269` (`export_provider_attribution`) | **Declared in `sources.yml:14-15` but no dbt model reads it.** Dead write |
| `raw.lab_result` | `backend/app/services/tuva_export_service.py:300-390` (`export_observations`) | `dbt_project/models/input_layer/lab_result.sql:5` |

Missing writer-to-source surface area: **no `raw.condition`, `raw.observation`, `raw.medication`, `raw.procedure`, `raw.encounter` tables are produced.** Tuva's FHIR-preprocessing and clinical marts (which feed `hcc_suspecting`, `quality_measures`, `chronic_conditions`) expect these standard Tuva input tables. The only clinical-type input is `raw.lab_result` — and even then, only observations with `service_category IN ('lab', 'vital-signs', 'social-history')` are exported (`tuva_export_service.py:322-324`). Result: clinical suspects / recapture / chronic conditions have nothing upstream to work with on the AQSoft warehouse, which is why those downstream queries would return nothing even if they were syntactically correct.

Also note that the backend's memory doc references **FHIR_inferno** for FHIR-to-CSV conversion, but `tuva_export_service.py` does its own ad-hoc conversion (`export_observations` at line 300) for observations only. No integration with `tuva-health/FHIR_inferno` is present.

## BLOCKERS (for real tenant data)

1. **`get_pmpm_summary` queries columns that don't exist** — `tuva_data_service.py:145-152` selects `service_category_1 AS service_category, pmpm, member_months` from `main_financial_pmpm.pmpm_prep`. Verified against live `data/tuva_demo.duckdb`: `pmpm_prep` has wide-format paid/allowed columns per service category and NO `pmpm` scalar, NO `service_category_1`, NO `member_months`. The function is covered by a broad `except Exception: return []`, so the failure is silent. Frontend `TuvaPage.tsx:745-757` renders an empty PMPM table on production data.

2. **`get_quality_measures` queries a nonexistent table** — `tuva_data_service.py:168-172` runs `SELECT * FROM main_quality_measures.summary LIMIT 100`. The real tables are `summary_counts`, `summary_long`, `summary_wide` (verified in demo DB). Also uses `SELECT *` with `con.description` column-capture, so even when pointed at the correct table it makes the emitted column set a Tuva-version-dependent implicit contract with no schema check.

3. **`get_tuva_recapture_opportunities` queries a nonexistent table** — `tuva_data_service.py:330-336` runs `SELECT * FROM hcc_recapture.summary LIMIT 100` (note: no `main_` prefix, not in the fallback helper, no tenant schema). The `hcc_recapture` mart has `gap_status`, `hcc_status`, `recapture_rates`, `recapture_rates_monthly`, `recapture_rates_monthly_ytd` — no `summary`. Silent `[]` return.

4. **`get_chronic_conditions` queries a nonexistent column** — `tuva_data_service.py:190-194` selects `condition_date` from `main_chronic_conditions.tuva_chronic_conditions_long`. Real columns (verified in `models/data_marts/chronic_conditions/final/chronic_conditions__tuva_chronic_conditions_long.sql:28-31`): `person_id, condition, first_diagnosis_date, last_diagnosis_date, tuva_last_run`. Silent `[]` return.

5. **`tuva_sync_service` uses a completely different (and wrong) schema convention** — `tuva_sync_service.py:41,61` queries `FROM main.cms_hcc__patient_risk_scores` and `FROM main.financial_pmpm__pmpm_prep`. This treats the DuckDB schema as a single `main` and the mart_table as one concatenated name. Tuva actually materializes tables with separate schema (`main_cms_hcc`) and alias (`patient_risk_scores`). Both queries will raise "Table does not exist" and `sync_raf_baselines` / `sync_pmpm_baselines` will silently end up writing zero rows to `tuva_raf_baselines` and `tuva_pmpm_baselines`, which is what `/api/tuva/raf-baselines` and `/api/tuva/pmpm-baselines` read. Background worker `tuva_worker.py:68-74` will report `"sync": {"success": true, "synced": 0, "discrepancies": 0}`.

6. **`_read_tuva_hcc` also selects a nonexistent column** — `tuva_sync_service.py:41` selects `raw_risk_score AS raf_score`. The final `cms_hcc__patient_risk_scores` table has no `raw_risk_score` — it has `v24_risk_score, v28_risk_score, blended_risk_score, normalized_risk_score, payment_risk_score, payment_risk_score_weighted_by_months`. Even if the schema reference were fixed, the column reference is wrong. Cross-verified in `dbt_packages/the_tuva_project/models/data_marts/cms_hcc/final/cms_hcc__patient_risk_scores.sql:6-18`.

7. **Router never passes `tenant_schema` to any data-service call** — every call in `tuva_router.py` (lines 186, 268, 276, 284, 301, 304, 507, 515, 533, 814) invokes `get_risk_scores()`, `get_risk_factors()`, `get_tuva_summary()` with no tenant arg. Service signatures accept `tenant_schema: str | None = None` (`tuva_data_service.py:71, 104, 136, 162, 184, 204, 286, 319`) but every caller uses the default `None`, so `_connect()` always falls through to `get_duckdb_path()` without the tenant and returns the single shared `data/tuva_warehouse.duckdb`. Multi-tenant isolation exists only at the export layer; at read time every tenant sees the same (last-written) warehouse.

8. **Router has no mapping from authenticated tenant to Tuva DuckDB** — `/api/tuva/*` endpoints use `_demo_session` (`tuva_router.py:43-63`) which hard-codes `search_path TO demo_mso, public`. There is no authenticated path that resolves the current tenant and passes it to `get_risk_scores(tenant_schema=...)`. Onboarding a second real tenant is not a parameter change; it requires routing work.

9. **Schema-prefix string-replace hack is unchanged from prior reviews** — `tuva_data_service.py:48-68` `_query_with_schema_fallback` does `.replace("main_cms_hcc.", "cms_hcc.")` across five hardcoded prefixes. Root cause: `dbt_project/` uses dbt's default `generate_schema_name` (produces `main_cms_hcc`) while `tuva_demo_data/macros/generate_schema_name.sql:6-13` overrides it to emit bare schemas (`cms_hcc`). The correct fix is to copy that macro into `dbt_project/macros/` so both databases agree; the string-replace is papering over a 12-line override.

10. **No multi-tenant dbt profile plumbing** — `dbt_project/profiles.yml:1-9` is static: `path: "../data/tuva_warehouse.duckdb"`, `schema: main`. There is no env-var or dynamic target for tenant-scoped runs. `tuva_worker.py` computes a per-tenant `duckdb_path` and passes it into `TuvaExportService` and `TuvaSyncService`, but `TuvaRunnerService` (line 53) has no hook to override the DuckDB path; it always writes to whatever `profiles.yml` says. **The writer writes to `data/tuva_{tenant}.duckdb`, the runner builds into `data/tuva_warehouse.duckdb`, and the sync reads from `data/tuva_{tenant}.duckdb`.** End-to-end the pipeline is internally inconsistent for any tenant other than the default.

## IMPORTANT

11. **`get_quality_measures` uses `SELECT *` with implicit contract** — `tuva_data_service.py:168-176` returns `[dict(zip([desc[0] for desc in con.description], row))]`. Any Tuva version that adds/removes/renames columns on `summary_*` silently changes the API response shape. Downstream consumers (AI context, dashboards) have no way to know what keys will be present.

12. **`hcc_recapture_enabled` and `hcc_suspecting_enabled` are default-false in Tuva** — see `dbt_packages/the_tuva_project/dbt_project.yml:80-81` (commented), and each mart's `{{ config(enabled = var('hcc_recapture_enabled', false)) }}`. `dbt_project/dbt_project.yml:17` sets `claims_enabled: true` but does NOT set `hcc_recapture_enabled` or `hcc_suspecting_enabled`. Without explicitly enabling these, those marts don't build — so `get_tuva_suspects` and `get_tuva_recapture_opportunities` return `[]` even with a working pipeline.

13. **`clinical_enabled` and `provider_attribution_enabled` not set** — `dbt_project.yml:12-24` only enables `claims_enabled`. Tuva's suspecting mart also needs `clinical_enabled` and its `hcc_suspecting__int_medication_suspects`, `hcc_suspecting__int_lab_suspects`, etc. models. Our `input_layer/lab_result.sql` exists but Tuva won't read it unless clinical is turned on. Verified by tuva_demo_data's `dbt_project.yml:9-11` which sets all three.

14. **Export uses one `INSERT` per row** — `tuva_export_service.py:144-151` and `:194-200` loop `con.execute("INSERT ...", [...])` per row. For a 50k-member tenant with ~500k claims/year this is pathologically slow (tens of minutes in DuckDB vs. <1 minute for a single `INSERT ... SELECT FROM pg` via a Postgres extension, or even a pandas DataFrame `register+INSERT FROM`). Prior reviews flagged this; still not addressed.

15. **Claims export drops all non-"record" data** — `tuva_export_service.py:94-98` filters `WHERE data_tier = 'record'`. Signal-tier data (payer API, eCW) never reaches Tuva. That's a design choice, but the ADR isn't in the code and there is no way to include signal-tier for `hcc_suspecting` without bypassing the export service.

16. **Timeout hard-coded to 600s, job-level to 3600s** — `tuva_runner_service.py:68` uses 10 min subprocess timeout; `tuva_worker.py:100` sets `job_timeout = 3600`. A real 50k-member tenant running full Tuva build (seed + run + test across ~600 models) will easily exceed 10 min on the subprocess; the `_execute` will kill dbt mid-run and return `{"error": "timeout"}`. No partial-run handling.

17. **No freshness / incrementality** — Tuva's core marts are `materialized: table` (verified: `cms_hcc_models.yml:11`, `financial_pmpm_models.yml:14`, etc.). Every run rebuilds from scratch. `DROP TABLE IF EXISTS` on raw tables (`tuva_export_service.py:102, 169`) means a concurrent read during export sees a half-populated table, then the dbt run consumes incomplete data. No snapshot isolation; no incremental materialization anywhere in our `dbt_project.yml`.

18. **No row-count assertion between export and dbt** — if export writes 0 claims (e.g. no member has `data_tier='record'`), dbt runs successfully on an empty input layer and produces 0-row marts. The worker returns `"success": true`. Frontend shows zeros. No "pipeline emitted unexpectedly low data" alert.

19. **`is_tuva_available` uses the hardcoded `main_cms_hcc.` prefix without fallback** — `tuva_data_service.py:350`. On the demo DB, this returns `False` even though data is fully present. `/api/tuva/status` (`tuva_router.py:810-819`) will report `available=false` for the demo DB.

20. **Frontend assumes backend emits keys that get_pmpm_summary cannot produce** — `TuvaPage.tsx:51-59` expects `{period, service_category, tuva_pmpm, aqsoft_pmpm, has_discrepancy, member_months}`. The backend `get_pmpm_summary` is the only PMPM source, and its query breaks on every Tuva deployment. The PMPM comparison panel will always render "No PMPM baselines yet" on real data.

## MINOR

21. **`packages.yml` version range allows major-version drift** — `dbt_project/packages.yml:3` pins `version: [">=0.17.1", "<1.0.0"]`. A Tuva 0.18.x or 0.19.x release that renames a column on any consumed table will break the backend silently. `package-lock.yml:8` records `0.17.2` as resolved, but a fresh `dbt deps` will pull a newer compatible version. Prefer exact pin + manual bump.

22. **`cms_hcc_payment_year: 2026`** is hardcoded in `dbt_project/dbt_project.yml:14` — needs to be overridable per-tenant (some clients may be on 2025).

23. **`input_layer/medical_claim.sql:19-20`** hardcodes `payer='medicare'` for all claims regardless of the member's actual payer. Any Medicaid / commercial tenant will be RAF-scored as Medicare. TODO comment is in the file but unfixed.

24. **`input_layer/eligibility.sql:23-24`** also hardcodes `payer='medicare'` and `payer_type='medicare'`. Same issue.

25. **`input_layer/medical_claim.sql:14-16`** maps anything that isn't `institutional` to `professional`. `pharmacy`-excluded rows are fine, but DME, ambulance, etc., get forced into `professional`. Tuva's service-category classification depends on this.

26. **`export_observations` only handles two signal sources** — `tuva_export_service.py:322-324` filters to `signal_source IN ('payer_api_observation', 'ecw_observation')` OR specific service categories. Tuva's `input_layer/observation` table is not the same as `lab_result`; we're only populating the latter. Things like vital signs flow in via lab_result, which is schema-incorrect per Tuva spec.

27. **`provider_attribution` raw table is written but no input_layer model maps it** — no `dbt_project/models/input_layer/provider_attribution.sql`. Tuva's provider attribution mart expects a specific shape; ours is declared in `sources.yml:14-15` and dead-ends.

28. **`TuvaRunnerService` has no `--vars`** — `tuva_runner_service.py:26-35` builds `dbt run --project-dir X --profiles-dir X --select Y`. It cannot pass `cms_hcc_payment_year`, `tuva_schema_prefix`, or anything else dynamically. Per-tenant payment year or schema prefix is impossible without editing `dbt_project.yml` before each run.

29. **`run_in_threadpool` / async concerns** — `tuva_router.py:260-262` acknowledges that `def` (non-async) endpoints go to a threadpool for DuckDB I/O, but `get_live_comparison` (`tuva_router.py:177` onward) is `async def` and calls the synchronous `get_risk_scores()` (`line 186`) on the event-loop thread. This blocks the event loop during the DuckDB read (can be slow on a 50k-member tenant).

30. **`/api/tuva/run` is a no-op placeholder** — `tuva_router.py:165-173` returns `{"status": "queued"}` but does not actually enqueue the `tuva_pipeline_job`. The comment at line 168 says "In production, this would enqueue tuva_pipeline_job via arq." No enqueue code exists.

## Tuva version-lock fragility

Every place below will silently break or return `[]` on a Tuva release that renames/relocates anything. None has a schema or column assertion, and none fails loudly.

1. `tuva_data_service.py:89` — schema `main_cms_hcc`, table `patient_risk_scores`, columns `person_id, v24_risk_score, v28_risk_score, blended_risk_score, payment_risk_score, member_months, payment_year`
2. `tuva_data_service.py:122` — schema `main_cms_hcc`, table `patient_risk_factors`, columns `person_id, factor_type, risk_factor_description, coefficient, model_version, payment_year`
3. `tuva_data_service.py:151` — schema `main_financial_pmpm`, table `pmpm_prep`, columns `year_month, service_category_1, pmpm, member_months` (already broken)
4. `tuva_data_service.py:170` — schema `main_quality_measures`, table `summary`, `SELECT *` (already broken; also implicit column contract)
5. `tuva_data_service.py:192` — schema `main_chronic_conditions`, table `tuva_chronic_conditions_long`, columns `person_id, condition, condition_date` (already broken on `condition_date`)
6. `tuva_data_service.py:218` — duplicates 1 with a narrower SELECT
7. `tuva_data_service.py:225` — duplicates 2 with a narrower SELECT
8. `tuva_data_service.py:305` — schema `main_hcc_suspecting`, table `list`, columns `person_id, hcc_code, hcc_description, reason, contributing_factor, suspect_date`
9. `tuva_data_service.py:331` — schema `hcc_recapture`, table `summary`, `SELECT *` (already broken; no fallback)
10. `tuva_data_service.py:350` — schema `main_cms_hcc`, table `patient_risk_scores`, `SELECT count(*)` (no fallback for demo DB)
11. `tuva_sync_service.py:41` — schema `main`, table `cms_hcc__patient_risk_scores`, column `raw_risk_score` (wrong convention AND wrong column)
12. `tuva_sync_service.py:61` — schema `main`, table `financial_pmpm__pmpm_prep`, columns `year_month, service_category_1, pmpm, member_months` (wrong convention AND wrong columns)
13. `_query_with_schema_fallback` hard-codes five replace pairs at `tuva_data_service.py:59-63` — adding a new mart (e.g., `main_readmissions`) requires editing this macro-list
14. `dbt_project/packages.yml:3` version range — a Tuva minor bump is allowed but untested
15. No contract tests — `backend/tests/test_tuva_*.py` only verify that dbt runs, that runner builds a command, and that DuckDB gets a `raw` schema. No test asserts "`get_risk_scores` returns rows when the DB has rows". No test against the real demo DB.

## Stubs & partial implementations

1. **`/api/tuva/run` endpoint** — `tuva_router.py:165-173` returns a canned `"queued"` without enqueuing the arq job. Worker `tuva_worker.py:23` exists but is never invoked from the API.

2. **`TuvaPmpmBaseline.aqsoft_pmpm` never populated** — `tuva_sync_service.py:161` sets `aqsoft_pmpm=None` with the comment "Will be populated when expenditure comparison is built". Frontend always shows em-dash for `aqsoft_pmpm`.

3. **`TuvaRafBaseline.aqsoft_hcc_list` never populated** — `tuva_sync_service.py:126` sets `aqsoft_hcc_list=None`.

4. **`TuvaRafBaseline.tuva_hcc_list`** — model has the column (`tuva_baseline.py:36`) but nothing writes it; sync service never constructs a member-level HCC list.

5. **Provider-attribution export is a dead path** — `tuva_export_service.py:237-269` writes `raw.provider_attribution` but no dbt model consumes it (`models/input_layer/` has no such file). The data is dropped.

6. **Providers source is a dead path** — same story for `raw.providers`.

7. **Lab-only clinical export** — `tuva_export_service.py:300-390` handles labs/vitals but not encounters, conditions, procedures, medications, or observations-as-observations. Tuva's `hcc_suspecting__int_medication_suspects`, `__int_observation_suspects`, `__int_lab_suspects` all need richer clinical input than we emit.

8. **FHIR_inferno not wired** — project memory says FHIR → Tuva requires FHIR_inferno bridge. Not present in `requirements.txt` or any service.

9. **No tenant-aware dbt profile** — `dbt_project/profiles.yml:1-9` is single-target. Multi-tenant requires either profile templating or a wrapper that copies per-tenant profiles per run.

10. **`raw_risk_score` reference** (`tuva_sync_service.py:41`) is dead code — Tuva never had this column on the final `patient_risk_scores`. Likely copied from an older Tuva version or from intermediate `..._monthly_by_factor_type` and never updated.

11. **`get_pmpm_summary` is dead from day one** — nothing on Tuva's public schema history exposes a scalar `pmpm` column on `pmpm_prep`. The function was authored against a mental model that doesn't match the package.

12. **`hcc_recapture.summary` was never a Tuva model** — `get_tuva_recapture_opportunities` has never returned data. Cross-reference `dbt_packages/the_tuva_project/models/data_marts/hcc_recapture/final/` — the final tables are `gap_status, hcc_status, recapture_rates, recapture_rates_monthly, recapture_rates_monthly_ytd`.

13. **`get_quality_measures` likewise never returned data** — no `summary` table in Tuva's quality_measures mart.

14. **`get_chronic_conditions` with `condition_date`** — never matched the actual `tuva_chronic_conditions_long` column set.

---

## Summary for the caller

The Tuva pipeline has four consumer layers (`tuva_data_service`, `tuva_sync_service`, router, frontend) and three of them contain at least one broken query that silently returns empty. The fault is consistent: **broad `except Exception: return []` handlers turn SQL errors into empty arrays**, so the UI renders "no data yet" instead of a stack trace. Running the same codebase against a real partner's data dump will **not** fail — it will successfully ingest, run dbt to completion, and render a partially-empty dashboard with zero obvious signal that anything is wrong.

Fix order for production-readiness:
1. Copy `tuva_demo_data/macros/generate_schema_name.sql` into `dbt_project/macros/` (eliminates the `main_*` prefix issue and kills the string-replace hack).
2. Rewrite all three broken `tuva_data_service.py` queries against actual Tuva tables (start with `financial_pmpm__pmpm_payer`, `quality_measures__summary_wide`, `hcc_recapture__hcc_status`, chronic_conditions column rename).
3. Rewrite `tuva_sync_service` queries with correct schema AND column names.
4. Tighten `except Exception: return []` handlers — at minimum log ERROR with the exception, ideally raise on column mismatch so broken queries surface in CI.
5. Plumb `tenant_schema` from router → data-service. Today it's an unused argument.
6. Add contract tests that assert each Tuva mart query returns at least 1 row against `data/tuva_demo.duckdb` (`backend/tests/test_tuva_contracts.py`).
7. Fix `TuvaRunnerService` to use the tenant's DuckDB path (pass `--vars` or env var, or dynamic profile).
8. Enable `hcc_recapture_enabled`, `hcc_suspecting_enabled`, `clinical_enabled`, `provider_attribution_enabled` in `dbt_project.yml`, or explicitly document why they're off.
9. Replace per-row INSERTs with DuckDB bulk-register of a pandas/arrow table.
10. Make `/api/tuva/run` actually enqueue the worker.
