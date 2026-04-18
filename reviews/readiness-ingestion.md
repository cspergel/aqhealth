# Ingestion Pipeline Readiness

**Audit date:** 2026-04-17
**Scope:** file uploads, FHIR bundles, ADT feeds, payer API pulls, dbt refresh, quality gate, entity resolution, lineage, idempotency.
**Bar:** a real partner can hand you 100k rows of claims and you don't lose data or corrupt state.

---

## Verdict

**NOT READY — BLOCKERS EXIST.**

The happy-path flow (small, well-formed CSV) works. The surrounding *production* concerns — idempotency, data-lineage traceability, quarantine, concurrent-upload safety, atomic batch rollback, schema migrations, dbt auto-refresh, quality-report persistence, and the FHIR-ingest pipeline — are mostly half-built or missing. A first partner dump (100k+ claim rows from Pinellas/Pasco/Miami-Dade) would ingest, but (a) re-uploading the same file will silently double-insert claims that lack a `claim_id`, (b) partial failures would leave the tenant in an unrecoverable mixed state (no transactional rollback, no useful lineage), (c) nothing re-runs dbt after rows land, and (d) the quality gate never actually quarantines anything — bad rows are just dropped with a log warning.

Below: 21 findings (8 blockers, 9 important, 4 minor), traced to `file:line`.

---

## End-to-end flow traced (with file:line refs)

### File upload path (synchronous)

1. `POST /api/ingestion/upload` — `backend/app/routers/ingestion.py:184-356`
   - `await file.read()` (line 209) — **loads full file into memory before size check**, so OOM on a >1 GB file.
   - Size cap 100 MB (line 42). Extension allow-list: `.csv`, `.xlsx`, `.xls` (line 44).
   - Unique-named copy to disk (line 218), preprocess via `data_preprocessor.preprocess_file` in a thread (line 228), header+sample read (line 248), mapping rules loaded (line 256), `propose_mapping` (line 294) → either Claude API or heuristic keyword match (`services/mapping_service.py:523`).
   - `INSERT INTO upload_jobs ... status='mapping'` (line 303).
   - `data_protection_service.fingerprint_source` (line 329) — computes SHA-256 over sorted column names; matches returning sources.

2. `POST /api/ingestion/{job_id}/confirm-mapping` — `backend/app/routers/ingestion.py:359-479`
   - Updates `upload_jobs.column_mapping`, sets status `validating` (line 398).
   - Enqueues `process_ingestion_job` in arq Redis queue `ingestion` (line 459).
   - **Silently no-ops if Redis unavailable** — returns 200 with a message, but no fallback inline processor (lines 467-473).

### File upload path (background worker)

3. `app.workers.ingestion_worker.process_ingestion_job` — `backend/app/workers/ingestion_worker.py:22-173`
   - Re-loads job, sets status `processing`.
   - Opens `TenantSession` → sets `search_path` to tenant schema (workers/__init__.py:26).
   - Runs `data_protection_service.detect_file_anomalies` on first 50 rows (line 79-87) — **non-blocking; even critical anomalies only log a warning**.
   - Calls `ingestion_service.process_upload` (line 93).
   - Inserts into `ingestion_batches` table for rollback tracking (line 101-106) but **never links data_lineage to this batch_id** (see §Data lineage below).
   - Triggers HCC analysis + insight generation on same-worker dispatch (line 191, 194). **Does NOT trigger the Tuva / dbt pipeline.**

### Row processing (ingestion_service.process_upload) — `backend/app/services/ingestion_service.py:901-1165`

- Chunked CSV read (`chunksize=5000`, line 974), Excel chunked only when >10k rows (line 998).
- For each row: `_process_member_row` / `_process_claim_row` / `_process_provider_row`.
- `_upsert_claims` (line 646) — for each row, dedup via `SELECT ... LIMIT 1` on `(claim_id, member_id)` (line 784), then INSERT or UPDATE.
- Chunk commit after 5000 rows (line 1108). **Each chunk commit is independent — there is no transactional "all or nothing" boundary for the file.**

### FHIR bundle ingest — `backend/app/routers/fhir.py` → `app/services/fhir_service.py`

- Only 3 of 6 advertised resource types actually ingest (Patient, Condition, MedicationRequest). Encounter/Observation/Procedure are stubs that log and return (services/fhir_service.py:308-320).
- No batching, no transaction boundary — each resource `db.flush()`s one at a time.

### ADT feed — `backend/app/routers/adt.py` + `services/adt_service.py`

- Webhook (`POST /api/adt/webhook`) — auth via header secret + tenant header (routers/adt.py:96-159).
- CSV batch (`POST /api/adt/batch`) — one row at a time, synchronous, all in the request thread (adt_service.py:866-896).
- No queue, no idempotency key on webhook payloads.

### Payer API pulls — `backend/app/services/payer_api_service.py`

- `sync_payer_data` (line 253) — iterates 14 resource types sequentially, upserts per-row.
- **No high-water-mark state** — every sync re-fetches everything the adapter returns.

### dbt refresh

- `POST /api/tuva/run` returns `{"status": "queued"}` but **does not actually enqueue** the job (routers/tuva_router.py:166-173, comment says "In production, this would enqueue…").
- Tuva worker runs `dbt build` only when manually invoked (workers/tuva_worker.py:23).
- No auto-refresh after `upload_jobs.status='completed'`.

---

## BLOCKERS (must fix before real-partner data)

### [BLOCKER] No database-level uniqueness on claims — concurrent uploads will insert duplicates

- **Location:** `backend/app/models/claim.py:17-84` (no `UniqueConstraint`, no unique index on `(claim_id, member_id)`); upsert logic at `backend/app/services/ingestion_service.py:780-837`.
- **Evidence:**
  ```python
  # ingestion_service.py:784-790
  if claim_id_val and member_id_val:
      dup_check = await db.execute(
          text("SELECT id FROM claims WHERE claim_id = :cid AND member_id = :mid LIMIT 1"),
          {"cid": claim_id_val, "mid": member_id_val},
      )
      existing_claim_pk = dup_check.scalar()
  ...
  # line 832 — if not existing, INSERT
  await db.execute(text(f"INSERT INTO claims ({cols_str}) VALUES ({vals_str})"), safe_data)
  ```
- **Why it blocks:** SELECT-then-INSERT race. Two parallel worker jobs (max_jobs=5 per `ingestion_worker.py:214`) or an accidental concurrent re-upload will both see `existing_claim_pk=None` and both INSERT. No DB constraint catches it. A partner re-sending a 100k-row file while a prior run is still chunking will silently double the claim population for the overlapping ingestion window.
- **Fix:** Add a partial unique index `CREATE UNIQUE INDEX claims_claim_member_uk ON claims (claim_id, member_id) WHERE claim_id IS NOT NULL;` and rewrite `_upsert_claims` to use `INSERT … ON CONFLICT (claim_id, member_id) DO UPDATE`. Do the same for the `practice_groups.tin` reverse-lookup path if any. This also lets you drop the per-row `dup_check` round-trip.

### [BLOCKER] No Alembic migrations — schema evolves by `Base.metadata.create_all()` only

- **Location:** `backend/alembic/versions/` (empty directory); `backend/app/database.py:71-125`.
- **Evidence:** Running `ls backend/alembic/versions/` returns nothing. `create_tenant_tables` (line 71) temporarily mutates `table.schema` in process memory and calls `Base.metadata.create_all(..., checkfirst=True)` — it will CREATE missing tables but **will NOT add columns, indexes, or constraints to tables that already exist**. The Round-1 Structuralist review (`reviews/structuralist.md`) flagged this; it's still open in Round 5.
- **Why it blocks:** Once Pinellas is onboarded and has real tables, every future schema change (adding the unique index above, widening `claims.diagnosis_codes` capacity, adding an `uploaded_at` column) requires manual SQL against every tenant schema. First time someone deploys a model change forgetting the manual step, you get schema drift between tenants and random production errors. This is the single most expensive fix to put off.
- **Fix:** Generate an initial Alembic revision (`alembic revision --autogenerate`), commit it, and wire `create_tenant_schema_with_tables` to `alembic upgrade head` on the new schema. Every subsequent PR adds an autogen migration. Backfill the current state into tenant 000001.

### [BLOCKER] No idempotency on re-uploads — re-submitting the same file double-ingests member/provider updates and claims without `claim_id`

- **Location:** `backend/app/routers/ingestion.py:184-356`; no content hash stored on `upload_jobs`.
- **Evidence:** `_ensure_uploads_dir()` + `uuid.uuid4().hex + filename` (line 218) — every upload gets a unique path. No SHA-256 of content is compared against prior jobs. `upload_jobs` schema has `filename`, `file_size`, `detected_type` but no `content_hash` column (grep `sha256|content_hash|file_hash` in `backend/app`: zero hits in ingestion code).
- **Why it blocks:** MSOs send the same file three ways (SFTP → email attachment → portal re-upload). Claims without a `claim_id` field (common on early Medicaid / some UHC feeds) have no natural key; every re-upload creates N new rows. Roster re-uploads with changed PCP assignments cannot distinguish "corrected reassignment" from "same-day accidental re-send."
- **Fix:** (a) compute `SHA-256(content)` at upload time, store in `upload_jobs.content_hash`, warn-and-block with override flag if the hash matches any prior completed job from the same tenant in the last 30 days; (b) for claims without `claim_id`, require `(member_id, service_date, procedure_code, billed_amount)` as a soft natural key before INSERT.

### [BLOCKER] Quality gate never quarantines — rows that fail validation are silently dropped

- **Location:** `backend/app/services/ingestion_service.py:1068-1081`; `backend/app/services/data_quality_service.py:173-272`; `backend/app/models/data_quality.py:32-47` (model exists, never written).
- **Evidence:**
  ```python
  # ingestion_service.py:1069-1079
  try:
      if data_type in ("claims", "pharmacy"):
          from app.services.data_quality_service import validate_claim_row
          dq_result = validate_claim_row(record)
          if not dq_result.get("valid"):
              for dq_err in dq_result.get("errors", []):
                  all_errors.append({"row": row_num, "field": "data_quality", "error": dq_err})
              record = None  # skip invalid row
  except Exception:
      pass  # best-effort — don't block ingestion
  ```
  No `INSERT INTO quarantined_records` anywhere in the codebase — verified: `grep "INSERT INTO quarantined_records"` returns zero matches. Only `entity_resolution_service.get_unresolved_matches` reads from the table.
- **Why it blocks:** A partner sends 100k claim rows; 4,800 have a malformed NDC or an out-of-range DOB. Those rows vanish. The `upload_jobs.error_rows` counter shows 4,800 and `upload_jobs.errors` stores the first 100 error messages (line 1143). The actual rows? Unrecoverable without re-parsing the file by hand. The partner cannot answer "which members got dropped?" and neither can you.
- **Fix:** In `_process_claim_row` / `_process_member_row`, on any `dq_result.valid=False`, write the raw row dict to `quarantined_records` with `upload_job_id`, `source_type`, `row_number`, `raw_data`, `errors`. Surface via the existing `/api/data-quality/unresolved` endpoint (router already exists at `routers/data_quality.py`, service at `entity_resolution_service.get_unresolved_matches:940`).

### [BLOCKER] Data lineage is unusable — `entity_id=0`, `ingestion_job_id=None`

- **Location:** `backend/app/services/ingestion_service.py:1110-1135`.
- **Evidence:**
  ```python
  # lines 1115-1128
  await db.execute(
      text("""
          INSERT INTO data_lineage
              (entity_type, entity_id, source_system, source_file,
               ingestion_job_id, created_at, updated_at)
          VALUES (:etype, 0, 'file_upload', :src,
                  :job_id, NOW(), NOW())
      """),
      {"etype": entity_type, "src": file_path, "job_id": None},
  )
  ```
  One row per chunk, hard-coded `entity_id=0`, `job_id=None`. The claim-correction path (line 817) writes a proper `entity_id` but only on UPDATEs, and passes `source_file='claim_upsert'` (line 826) — a tag, not a filename.
- **Why it blocks:** Partner asks "which claim came from the March Humana drop?" — you cannot answer. The `data_protection_service.rollback_batch` code (`data_protection_service.py:718`) explicitly assumes lineage rows carry the real `entity_id` (see `entity_id=row.entity_id` at line 757), so **batch rollback is wired but its input data is meaningless**. The `ingestion_batches` record is created (ingestion_worker.py:101) but never cross-referenced to actual rows.
- **Fix:** Inside `_upsert_claims` / `_upsert_members`, after each successful INSERT/UPDATE, append to a list of `(entity_id, source_row_num, field_changes)` tuples; batch-insert them into `data_lineage` at chunk end with the real `ingestion_job_id` from the worker. Remove the 1-row-per-chunk stub insert.

### [BLOCKER] `confirm-mapping` silently succeeds when Redis is down — job never processes

- **Location:** `backend/app/routers/ingestion.py:447-479`.
- **Evidence:**
  ```python
  # lines 467-473
  except Exception as e:
      logger.warning(f"Could not enqueue background job (Redis may be unavailable): {e}")
      message = (
          "Mapping confirmed. Background queue unavailable — "
          "job will be processed when the worker starts."
      )
  ```
  The job stays in `status='validating'` forever. No retry, no dead-letter queue, no health check raising the status to failed. The job is orphaned.
- **Why it blocks:** Redis is a hard dependency of the platform. If it's transiently down during a partner's end-of-day file push, the upload is accepted (HTTP 200), the mapping is stored, and nothing processes. The user sees "Mapping confirmed. Processing started in background." (line 466) or the ambiguous fallback message and assumes success.
- **Fix:** (a) Fail the request with 503 when Redis is unreachable; OR (b) write a `pending_enqueue` status, run a startup sweep in the worker that re-enqueues any job in `validating`/`pending_enqueue` older than N minutes. Option (a) is simpler and safer.

### [BLOCKER] Chunk commits break per-file atomicity — partial failures leave the tenant in a mixed state

- **Location:** `backend/app/services/ingestion_service.py:1086-1141`.
- **Evidence:**
  ```python
  # line 1108
  await db.commit()    # after each 5000-row chunk
  ...
  # line 1137-1140
  except Exception as e:
      await db.rollback()
      logger.error(f"Database error during ingestion chunk: {e}")
      raise
  ```
  If chunks 1-3 succeed (15k rows committed) and chunk 4 throws, the worker marks the job `failed` but the first 15k rows are permanently in `members`/`claims`. No cleanup, no rollback of the committed chunks.
- **Why it blocks:** Real partner data will have surprise encodings mid-file, malformed rows, or DB constraint violations (e.g., a member_id that overflows VARCHAR(50)). The operator cannot know "is this a clean load or is it the first 15k of 100k?" without reconciling against the source file line count. Re-ingesting the full file compounds the duplicate problem (see Blocker #1 + #3).
- **Fix:** Two options. **Strong:** wrap the whole `process_upload` in a savepoint/transaction; on any failure, rollback the whole file. Requires per-row `RELEASE SAVEPOINT` rather than `db.commit()` per chunk and enough connection memory. **Pragmatic:** keep chunked commits but link every INSERT to an `ingestion_batches` row (via the lineage fix above), and ensure the already-built `rollback_batch` (`data_protection_service.py:718`) is automatically invoked when the worker catches an exception and marks the job failed. Operator still has a single-click "undo this load" button.

### [BLOCKER] dbt / Tuva pipeline never auto-refreshes after ingestion

- **Location:** `backend/app/workers/ingestion_worker.py:176-198`; `backend/app/routers/tuva_router.py:166-173`.
- **Evidence:** `_trigger_downstream` (line 176) only enqueues `run_hcc_analysis` and `run_insight_generation` (lines 191-194). No call to `tuva_pipeline_job`. The `/api/tuva/run` endpoint is explicitly a placeholder:
  ```python
  # tuva_router.py:167-173
  async def trigger_tuva_pipeline():
      """Manually trigger the Tuva pipeline. Returns immediately — runs async."""
      # In production, this would enqueue tuva_pipeline_job via arq.
      # For now, return a placeholder acknowledging the request.
      return {
          "status": "queued",
          "message": "Tuva pipeline job enqueued. Check /api/tuva/raf-baselines for results.",
      }
  ```
- **Why it blocks:** The whole Tuva investment (per-tenant DuckDB, 18 data marts, RAF baselines, PMPM marts — see `reference_tuva.md`) is inert after the first partner load. Dashboards showing "Tuva confirmed vs AQSoft projected" (router line 176-202) display stale data until somebody manually runs `dbt build` against a DuckDB file that doesn't yet exist for the tenant.
- **Fix:** In `ingestion_worker._trigger_downstream`, after HCC/insights enqueue, also `await redis.enqueue_job("tuva_pipeline_job", tenant_schema, _queue_name="tuva")` — but gate it on `data_type in ("claims", "pharmacy")` and rate-limit per tenant (one Tuva run per 15 min) to avoid thrashing when a partner uploads 5 files back-to-back. Replace the placeholder in the router with the same enqueue call.

---

## IMPORTANT (fix soon, won't break day 1 but will bite)

### [IMPORTANT] 100 MB cap reads entire file into memory before enforcing it

- **Location:** `backend/app/routers/ingestion.py:209-214`.
- **Evidence:** `content = await file.read()` (line 209) runs first; the size check is line 210. A 2 GB upload attempt will OOM the web worker before returning 400.
- **Fix:** Stream the upload with `file.file` + chunked reads, counting bytes; abort as soon as 100 MB is exceeded. FastAPI does not enforce `max_upload_size` by default — add `Content-Length` header check at the reverse-proxy tier (nginx `client_max_body_size`) as a second defense.

### [IMPORTANT] `_upsert_members` reports wrong `inserted`/`updated` counts (always 0 updated)

- **Location:** `backend/app/services/ingestion_service.py:563-578`.
- **Evidence:** Comment on line 567-570 and code return `{"inserted": inserted, "updated": 0}` — "For simplicity in the ON CONFLICT model, report total affected." `upload_jobs.processed_rows` is therefore wrong every time a roster is re-uploaded (updates count as inserts).
- **Fix:** `ON CONFLICT … DO UPDATE … RETURNING (xmax != 0) AS updated` gives a per-row insert/update flag; sum them into correct counters.

### [IMPORTANT] FHIR ingest is advertised but half-stubbed, and each resource commits independently

- **Location:** `backend/app/services/fhir_service.py:23-320`.
- **Evidence:** `RESOURCE_HANDLERS` (line 23-30) maps Encounter/Observation/Procedure to `None`. `ingest_fhir_bundle` skips them (line 59-60). Capability statement correctly omits them (line 117), but no row-count or warning is returned to the caller when a bundle contains 900 Encounters.
- **Why it matters:** Humana Data Exchange and eCW SMART-on-FHIR adapters routinely return bundles heavy on Encounters and Observations. The caller will think ingestion succeeded (resource count = Patients + Conditions) and silently lose the rest.
- **Fix:** Return `skipped: {"Observation": 450, "Encounter": 900, "Procedure": 120}` in the response dict so the operator can see what was dropped; prioritize Observation ingestion before connecting real eCW patients (already in memory file `project_ecw_integration.md`).

### [IMPORTANT] Entity-resolution fallback runs synchronously inside the claims upsert loop — one Claude call per unmatched member

- **Location:** `backend/app/services/ingestion_service.py:718-746` calling `entity_resolution_service.match_member` (line 683).
- **Evidence:** For every claim row whose `member_id` can't be batched-resolved, `match_member` runs (exact lookup → fuzzy SQL → Claude API). Each AI call is `max_tokens=1024` at `ai_match_member:272`. On a 100k-row file with 2% unmatched, that's 2000 Claude calls serial inside one worker's db transaction.
- **Why it matters:** A partner's first file is ~90% new members — almost all will hit the AI path. Claim ingestion will take hours and exhaust the Anthropic rate limit.
- **Fix:** Use the existing `ai_resolve_batch` (line 495) — collect unresolved rows in a list, resolve in batches of 10-20 per API call after all deterministic-path members are inserted. Or: on first-load of a partner, skip entity resolution entirely and trust the payer-supplied member_id.

### [IMPORTANT] ADT `CSV batch` endpoint processes rows inside the HTTP request thread

- **Location:** `backend/app/routers/adt.py:187-205`; `backend/app/services/adt_service.py:866-896`.
- **Evidence:** `process_csv_batch` iterates rows and calls `process_adt_event` (adt_service.py:881), which runs a 15+ statement cascade (INSERT adt_event → UPDATE adt_sources → INSERT claims if admit → generate alerts → INSERT care_alerts) per row, all in the web worker.
- **Why it matters:** A Bamboo Health 24-hour batch can be 50k rows. The request times out; half the rows process, half don't; no resumption.
- **Fix:** Same arq pattern as file upload — accept the file, write to disk, enqueue a background job.

### [IMPORTANT] Webhook idempotency is absent — `raw_message_id` is stored but never checked for duplicates

- **Location:** `backend/app/services/adt_service.py:91, 119`.
- **Evidence:** The INSERT at line 91 writes `raw_message_id` as a column but there is no UNIQUE index on it and no SELECT-before-INSERT check. Bamboo Health retries on 5xx; a single upstream hiccup produces 2-3 identical ADT events with the same `raw_message_id`, each triggering alert generation.
- **Fix:** UNIQUE INDEX on `(source_id, raw_message_id)` where `raw_message_id IS NOT NULL`, and `ON CONFLICT DO NOTHING` in the INSERT.

### [IMPORTANT] Payer API `sync_payer_data` has no high-water-mark — every sync refetches from scratch

- **Location:** `backend/app/services/payer_api_service.py:253-444`.
- **Evidence:** `params = {"environment": ...}` (line 338) is passed to every adapter `fetch_*` method with no `_lastUpdated` / `since` filter. `connection["last_sync"]` is written (line 422) but never read back to filter subsequent fetches.
- **Why it matters:** Humana Data Exchange has millions of claim resources. Re-pulling everything every sync is (a) slow, (b) rate-limited by the payer, (c) wastes the partner's free-tier API allocation. More subtly: the `_upsert_claims` dedup (lines 733-754) assumes the same `claim_id` — adjudication updates produce a new claim_id variant and re-insert.
- **Fix:** Read `connection["last_sync"]` into `params["since"]`, pass through to each adapter (Humana & eCW both support `_lastUpdated` FHIR search param per their adapter docstrings). Also: store the payer's server-authoritative `meta.lastUpdated` per-resource if available.

### [IMPORTANT] Data-quality report is computed post-ingest but never persisted

- **Location:** `backend/app/workers/ingestion_worker.py:142-149`; `backend/app/routers/data_quality.py:54-79`.
- **Evidence:** `run_quality_checks(quality_db, job_id)` (worker line 146) returns a dict with score + checks, `logger.info`s the score, then discards the result. No `INSERT INTO data_quality_reports` anywhere (confirmed by grep). The `/api/data-quality/summary` endpoint reads `data_quality_reports ORDER BY created_at DESC LIMIT 1` (data_quality.py:54-56) — it will always return the empty-state response (line 69-77) for a new tenant.
- **Fix:** Persist the result inside `ingestion_worker` immediately after line 146: `INSERT INTO data_quality_reports (upload_job_id, overall_score, total_rows, ...) VALUES (...)`.

### [IMPORTANT] `_upsert_claims` `practice_group_id` routing silently fails for unmapped TINs — counted as `unrouted`, not surfaced

- **Location:** `backend/app/services/ingestion_service.py:701-711, 841-847`.
- **Evidence:** When a `billing_tin` isn't in `practice_groups`, `unrouted += 1` (line 711). The return dict carries `unrouted` (line 846) → worker line 97, but not written to `upload_jobs.errors`. Operator sees `processed_rows=100000` with no hint that 40% of them have null `practice_group_id` (which quietly breaks office-level dashboards).
- **Fix:** When `unrouted / inserted > 0.1`, log a job-level warning into `upload_jobs.errors` ("47,000 claims could not be routed to a practice group — missing TINs: [list]"). Add a `practice_group_coverage_pct` field to the job summary response.

---

## MINOR / nice-to-have

### [MINOR] Preprocessor is run twice on the happy path

- **Location:** `backend/app/routers/ingestion.py:228` and `backend/app/services/ingestion_service.py:936`.
- **Evidence:** Upload route preprocesses, stores `cleaned_file_path`; `process_upload` checks `"_cleaned_" in basename` to skip (ingestion_service.py:933). But the filename stored is the cleaned path — verifies a sub-string in the filename. Brittle: if the cleaned-temp-dir naming ever changes, we re-preprocess a 100k-row file a second time.
- **Fix:** Pass an explicit `already_preprocessed: bool` flag via the arq job payload.

### [MINOR] Deduplication in `data_preprocessor.detect_duplicates` removes exact-match rows — correct for demo data, but real claims files contain legitimate exact duplicates

- **Location:** `backend/app/services/data_preprocessor.py:683-711`.
- **Evidence:** Exact full-row duplicate detection with `remove=True` default. The docstring correctly notes healthcare-duplicate edge cases (line 689-695) but still removes if every column matches. A 1-line professional claim repeated for a same-day bilateral procedure (modifier RT + LT on the same row? no — different modifier rows, so the point is narrow) can appear identical when modifiers are blank.
- **Fix:** Default `remove=False` for `claim_type in ("claims","pharmacy")`; let the downstream quality gate flag duplicates instead of deleting them.

### [MINOR] Heuristic `_HEURISTIC_MAP` aliases are hard-coded in Python — no per-source learning reflected at mapping time until after a full reload

- **Location:** `backend/app/services/mapping_service.py:114-272`.
- **Evidence:** 150+ alias lists in a dict literal. The self-learning feedback loop (`log_mapping_corrections`) stores user corrections in `data_corrections` and eventually turns them into `transformation_rules`, but the AI mapper and heuristic matcher don't consult either. Round-1 Structuralist review flagged this; still open.
- **Fix:** Move aliases into a `mapping_aliases` table; have `propose_mapping` also consult `data_corrections` for prior-confirmed alias pairs.

### [MINOR] No test coverage for real-data ingestion scenarios

- **Location:** `backend/tests/test_ingestion.py` — 105 lines covering only `classify_service_category`.
- **Evidence:** No test for: malformed CSV, encoding fallback, multi-sheet Excel, diagnosis-column merging, concurrent uploads, rollback, quarantine, entity-resolution batching, dbt refresh. The one ingestion test file tests nine POS→category rules.
- **Fix:** Add integration tests under `test_integration.py` (skeleton already exists) for: (1) 100k-row synthetic claims file end-to-end including quality-gate quarantine; (2) duplicate upload detection; (3) partial-failure rollback.

---

## What is ACTUALLY wired vs stubbed

### File upload / mapping pipeline

- ✓ `services/ingestion_service.py` `process_upload`, `_upsert_members`, `_upsert_providers` — **IMPLEMENTED**, core path works
- ⚠ `services/ingestion_service.py` `_upsert_claims` — **IMPLEMENTED but race-prone** (no DB unique constraint, SELECT-then-INSERT)
- ✓ `services/data_preprocessor.py` `preprocess_file` — **IMPLEMENTED**, extensive edge-case handling (encoding, dates, ICD, names, phones, ZIPs, diagnosis merging)
- ✓ `services/mapping_service.py` `propose_mapping`, `_heuristic_mapping`, `_ai_mapping` — **IMPLEMENTED**, Claude + heuristic fallback
- ⚠ `services/mapping_service.py` `log_mapping_corrections` → `data_learning_service.apply_learned_rules` — **IMPLEMENTED but underused**: learned rules only applied if `data_learning_service` import succeeds at ingest time; no hot-reload of the rule cache
- ⚠ `services/ingestion_service.py` validation-to-quarantine flow — **BROKEN**: invalid rows are dropped (line 1077: `record = None`), never written to `quarantined_records` (see Blocker #4)
- ✓ `workers/ingestion_worker.py` `process_ingestion_job` — **IMPLEMENTED**, arq worker functional
- ⚠ `workers/ingestion_worker.py` `_trigger_downstream` — **IMPLEMENTED but incomplete**: doesn't trigger Tuva (see Blocker #8)

### Quality & lineage

- ✓ `services/data_quality_service.py` `validate_claim_row`, `validate_roster_row`, `validate_pharmacy_row`, `run_quality_checks` — **IMPLEMENTED**
- ✗ `services/data_quality_service.py` report persistence — **NOT WIRED**: `run_quality_checks` returns a dict; no INSERT into `data_quality_reports` anywhere (Important #8)
- ⚠ `models/data_quality.py` `QuarantinedRecord` table — **SCHEMA EXISTS, NEVER WRITTEN**; only read by `entity_resolution_service.get_unresolved_matches`
- ⚠ `services/ingestion_service.py` data_lineage writes — **SCHEMA USED INCORRECTLY**: writes `entity_id=0`, `ingestion_job_id=None` (Blocker #5); makes `rollback_batch` unusable
- ✓ `services/data_protection_service.py` `fingerprint_source`, `detect_file_anomalies`, `test_contract`, `update_golden_record`, `rollback_batch` — **IMPLEMENTED**
- ⚠ `services/data_protection_service.py` `detect_file_anomalies` integration — **NON-BLOCKING**: critical anomalies only log a warning (worker line 84-87), never fail the job

### Entity resolution

- ✓ `services/entity_resolution_service.py` `match_member` (exact MBI, name+DOB, fuzzy+Soundex, AI) — **IMPLEMENTED**
- ✓ `services/entity_resolution_service.py` `match_provider` (NPI, name, Soundex, AI) — **IMPLEMENTED**
- ⚠ `services/entity_resolution_service.py` ER fallback inside claims upsert — **SLOW**: serialized per-row AI calls (Important #4)
- ✓ `services/entity_resolution_service.py` `ai_resolve_batch` — **IMPLEMENTED**, unused by the ingestion path

### FHIR / real-time feeds

- ⚠ `services/fhir_service.py` `_ingest_patient`, `_ingest_condition`, `_ingest_medication` — **IMPLEMENTED**
- ✗ `services/fhir_service.py` `_ingest_encounter`, `_ingest_observation`, `_ingest_procedure` — **STUBS** (lines 308-320); log-and-return, no counters
- ✓ `services/adt_service.py` `process_adt_event`, `process_hl7_message`, `process_csv_batch`, `generate_alerts`, `get_live_census` — **IMPLEMENTED**
- ⚠ `services/adt_service.py` webhook idempotency — **MISSING** (Important #6)
- ⚠ `services/adt_service.py` CSV batch — **IMPLEMENTED but sync in web thread** (Important #5)

### Payer API pulls

- ✓ `services/payer_api_service.py` `connect_payer`, `sync_payer_data`, `_upsert_patients/coverage/claims/conditions/providers/medications/observations` — **IMPLEMENTED** (14 resource types)
- ✓ `services/payer_adapters/humana.py`, `services/payer_adapters/ecw.py`, `services/payer_adapters/metriport.py` — **IMPLEMENTED**, ~2000-4000 LOC each, with OAuth, retry, pagination
- ⚠ `services/payer_api_service.py` incremental sync — **MISSING high-water-mark** (Important #7)
- ⚠ `services/payer_api_service.py` credential encryption — **BASE64 PLACEHOLDER** (line 157-163, comment says "Production should use Fernet or AWS KMS")

### dbt / Tuva pipeline

- ✓ `services/tuva_export_service.py` PG→DuckDB export — **IMPLEMENTED**
- ✓ `services/tuva_runner_service.py` dbt CLI wrapper — **IMPLEMENTED**
- ✓ `services/tuva_sync_service.py` DuckDB→PG sync — **IMPLEMENTED**
- ✓ `workers/tuva_worker.py` `tuva_pipeline_job` — **IMPLEMENTED**
- ✗ Tuva auto-trigger after ingestion — **NOT WIRED** (Blocker #8)
- ✗ `routers/tuva_router.py:166-173` `/api/tuva/run` endpoint — **PLACEHOLDER** (returns success without enqueuing)

### Schema management

- ✗ `backend/alembic/versions/` — **EMPTY**; no migrations (Blocker #2)
- ⚠ `database.py:71-125` `create_tenant_tables` — **IMPLEMENTED but drift-prone**: adds only missing tables, never alters

---

## Test coverage gap

Tests that *should* exist for real-data scenarios but don't:

1. **100k-row synthetic file end-to-end.** A single test that generates 100k claim rows via `scripts/generate_synthetic_data.py` (already referenced by `test_integration.py:48`), writes a CSV, uploads through the router, confirms mapping, runs the worker, verifies row counts, verifies lineage, verifies quarantine counts. Currently zero tests exercise the HTTP router path beyond auth (`test_api_routes.py:97` only tests that ingestion requires auth).

2. **Re-upload detection.** Upload the same file twice, verify the second upload produces a deterministic error or is deduped. Today this would silently double-insert.

3. **Chunk-failure recovery.** Inject a DB error on chunk 3 of 5, verify `upload_jobs.status='failed'`, verify the tenant is not left with chunks 1-2 committed. Currently would fail both assertions.

4. **Malformed CSV handling.** Truncated mid-row, BOM, windows-1252, headerless, all-empty, single-column. `data_preprocessor.preprocess_file` is thoroughly implemented but has **zero** dedicated unit tests.

5. **Concurrent ingestion.** Two workers process two different uploads against the same tenant schema simultaneously, verify no deadlock, no crossed data. The `TenantSession` search-path pattern is correct (`workers/__init__.py:26-34`) but has never been load-tested.

6. **Quarantine round-trip.** Upload a file with 100 invalid rows, verify 100 `quarantined_records` exist, verify `/api/data-quality/unresolved` returns them, verify an operator can fix and reprocess one. **Cannot test because the quarantine path isn't wired.**

7. **FHIR bundle with mixed resource types.** 100 Patients + 500 Conditions + 200 Encounters + 300 Observations. Verify ingest returns accurate counts for all four — today, it returns 0 for Encounters/Observations with no indication they were skipped.

8. **ADT webhook duplicate delivery.** Same `raw_message_id` posted twice, verify single `adt_events` row. Today would create two.

9. **Payer incremental sync.** `sync_payer_data` twice in a row, verify second call fetches only post-`last_sync` resources. Currently would refetch everything.

10. **dbt refresh after ingestion.** Upload claims, verify `tuva_pipeline_job` was enqueued. Currently would show the test-double was never called.

---

## Summary

The ingestion code reads like a good draft: the shape is right, the building blocks (preprocessor, fingerprinting, entity resolution, rollback service, lineage schema) are mostly in place. What's missing is the **wiring that makes those pieces load-bearing under partner conditions**: DB-level uniqueness, migrations, idempotency, batch-linked lineage, a quarantine path that actually catches rows, auto-refresh to dbt, and failure semantics that don't leave the tenant mixed-state. Before Pinellas' first file lands, the 8 blockers above must be fixed — the "important" tier can be worked in parallel but will bite within the first month of real traffic.
