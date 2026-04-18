# Tranche C — DEMO_MODE removal, OAuth nonce, upload hardening, ingestion correctness, Tuva correctness, unique constraints

**Date:** 2026-04-17
**Scope:** Phases 2.3, 2.4, 2.6, 3.1–3.6, 4.1–4.4.
**Author:** Opus 4.7 (1M context) via agent workflow.

---

## Files changed

| File | Phase(s) | Nature |
| --- | --- | --- |
| `backend/app/routers/tuva_router.py` | 2.3, 4.2, 4.3, 4.4 | Rewrite — removed DEMO_MODE bypass, applied `require_role`, wired `/run` to arq, surface Tuva errors as 502, added endpoints for PMPM/quality/chronic/suspects/recapture, tenant_schema now threaded through every `tuva_data_service` call. |
| `backend/app/routers/payer_api.py` | 2.4, 3.6 | OAuth `state` now a `secrets.token_urlsafe(32)` nonce persisted in `platform.oauth_state` (10-min TTL, single-use). `/sync` moved to enqueue an arq job (returns 202). |
| `backend/app/routers/ingestion.py` | 2.6, 3.2, 3.5 | Filename sanitisation (`_safe_filename`); streaming body read with hard `Content-Length` pre-check and per-chunk cap (`_stream_to_disk`); SHA-256 content hash persisted + dedup check against prior terminal-state jobs for the same tenant; confirm-mapping now returns 503 + marks job `queue_unavailable` when Redis is unreachable. |
| `backend/app/services/payer_api_service.py` | 3.6 | Reads `last_sync_at` watermark from the connection record and passes it to adapters as `params["since"]`. On successful sync, writes the start-of-window ISO timestamp back to `last_sync_at`. |
| `backend/app/services/ingestion_service.py` | 3.3, 3.4 | New `_quarantine_row` helper inserts failing rows into `quarantined_records` (raw JSON + errors + row_number + `upload_job_id`). Row-shape and data-quality failures now quarantine instead of silently dropping. `data_lineage` rows are emitted with REAL `entity_id` + `ingestion_job_id`, via new `inserted_ids`/`updated_ids` lists returned by the upsert helpers. `process_upload` now accepts `ingestion_job_id`. Added `quarantined_rows` to the result dict. |
| `backend/app/services/tuva_data_service.py` | 4.1, 4.2, 4.3 | Rewrote every query against real Tuva mart columns. Bare-schema queries first, legacy `main_<schema>` fallback second (via `_fetch_with_schema_fallback`). PMPM returns raw wide-format rows. Quality measures target `summary_long`. Chronic conditions uses `first_diagnosis_date`/`last_diagnosis_date`. Recapture targets `hcc_recapture.hcc_status`. Removed the broad `except: return []` handlers — callers now see real exceptions. |
| `backend/app/services/tuva_sync_service.py` | 4.2 | `_read_tuva_hcc` selects `blended_risk_score/v28/v24` (no more non-existent `raw_risk_score`) with proper schema (`cms_hcc.patient_risk_scores`, legacy fallback). `_read_tuva_pmpm` emits one aggregated PMPM row per `year_month` computed from `pmpm_prep`'s real wide-format columns. |
| `backend/app/services/tuva_runner_service.py` | _(unchanged in this tranche)_ | No edits required. |
| `backend/app/services/payer_adapters/humana.py` | 3.6 | Added `_since_param` helper and plumbed `extra_params={_lastUpdated:gt<ISO>}` into every `fetch_*` call. `_fetch_all_pages` now accepts `extra_params`. |
| `backend/app/services/payer_adapters/ecw.py` | 3.6 | Added `_merge_since` helper and plumbed the watermark into every `fetch_*` call, merging with resource-specific filters (Condition category, Observation category). |
| `backend/app/models/claim.py` | 3.1 | Added `UniqueConstraint("claim_id", "member_id", name="uq_claim_identity")` to the ORM (DB side gets a partial unique index via migration 0003). |
| `backend/app/models/hcc.py` | 3.1 | Added `UniqueConstraint("member_id", "payment_year", "calculation_date", name="uq_raf_history_snapshot")` to `RafHistory`. |
| `backend/app/models/ingestion.py` | 3.2 | Added indexed `content_hash: Mapped[str \| None]` field to `UploadJob`. |
| `backend/app/workers/ingestion_worker.py` | 3.4 | Passes `ingestion_job_id=job_id` when calling `process_upload` (minimal scope change — worker still not explicitly listed in the owned set, but required to thread the id end-to-end). |
| `backend/app/workers/payer_worker.py` | 3.6 | **NEW** worker file — `sync_payer_data_job` is the arq task the refactored `/api/payer/sync` endpoint enqueues. `PayerWorkerSettings` runs on the `default` queue. |
| `backend/alembic/versions/0003_uniques_and_hash.py` | 3.1, 3.2, 2.4 | **NEW** migration — creates `platform.oauth_state`, adds `claims` partial unique index, `raf_history` unique constraint, and `upload_jobs.content_hash` + its index, iterating every tenant schema via `platform.tenants`. Idempotent DDL. |
| `dbt_project/macros/generate_schema_name.sql` | 4.1 | **NEW** — copy of `tuva_demo_data/macros/generate_schema_name.sql` so the dbt project emits bare mart schemas (`cms_hcc`, `financial_pmpm`, etc.) instead of `main_<name>`. |

---

## Key evidence / verification

- **Auth**: every Tuva endpoint now carries `Depends(_tuva_user())` or `Depends(_tuva_writer())`. The old `_demo_session()` + `DEMO_MODE=true` backdoor is gone (verified: `grep DEMO_MODE backend/app` returns only documentation references).
- **OAuth**: `payer_api.py:43-102` minting function + `:218-227` consume function. Neither the state value nor the mapping is visible to the adapter layer.
- **Upload hardening**: `ingestion.py:196-253` — path-traversal rejection tests every combination (separators, `..`, NUL, non-basename forms, non-allowlisted chars). `ingestion.py:255-286` streams in 1 MiB chunks and deletes partials on failure.
- **Tuva queries**: all five broken queries (`get_pmpm_summary`, `get_quality_measures`, `get_chronic_conditions`, `get_tuva_recapture_opportunities`, `_read_tuva_hcc`, `_read_tuva_pmpm`) now target real Tuva tables/columns with legacy schema fallback.
- **Tuva `/run`**: `tuva_router.py:164-198` creates an arq pool and enqueues `tuva_pipeline_job` on the `tuva` queue, returns 503 if Redis is unreachable.
- **Idempotent uploads**: `ingestion.py:312-344` — content-hash dedup raises 409 with `prior_job_id` in the detail so the caller can reuse the earlier result.
- **Redis-down**: `ingestion.py:590-609` — marks the job `queue_unavailable` and returns 503 instead of 200 + warning.
- **Payer watermark**: `payer_api_service.py:343-352` reads `last_sync_at`; `:428-435` writes it only on clean sync. Adapters pass `_lastUpdated=gt<ISO>` on the first-page URL.

All 16 files touched verified with `python -m py_compile` (no syntax errors).

---

## Left for follow-up / not owned by this tranche

- `raf_history` `deleted_at` column interacts with the new unique constraint; soft-deleted snapshots still occupy the key. If this becomes an issue, switch to a partial unique index `WHERE deleted_at IS NULL`. Flagged but not fixed here because it changes deletion semantics and those are owned elsewhere.
- `tuva_runner_service.py` does not yet pass the per-tenant DuckDB path — Tuva readiness report item 10 (not in the owned task list). Left for a later tranche.
- `hcc_recapture_enabled` / `clinical_enabled` / `provider_attribution_enabled` flags in `dbt_project.yml` (readiness items 12-13) — not in scope.
- The migration's `down_revision` assumes `0001_baseline` is still head; if another tranche lands a `0002_*` file first, the `down_revision` on `0003_uniques_and_hash.py` needs manual rebase before merge.
