# Database + Ops Readiness

**Reviewer:** DB/Ops auditor (round 6)
**Scope:** Alembic state, schema evolution, indexes, query perf, data integrity, observability, deployment, background jobs, tests, backup.
**Verdict:** **NOT READY for real partner data.** Multiple hard blockers around schema evolution, data integrity, observability, and zero backup strategy. The platform will lose data on the first schema change after launch.

---

## Verdict

**NOT READY — BLOCKERS PRESENT.**

Core reasoning:
1. First migration hasn't been generated; schema is created via `Base.metadata.create_all()` at startup. No ability to safely add, drop, or modify a column on a populated tenant without a custom one-off script.
2. Data-pipeline code (`tuva_export_service.ensure_schema`) is issuing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at request time against whatever tenant schema is active — a silent, untracked DDL path that bypasses versioning.
3. Zero observability stack — no Sentry, Prometheus, request IDs, or slow query log. Cannot debug a 3am incident.
4. Zero backup/PITR strategy of any kind. Partner data loss would be permanent.
5. 47 of ~61 foreign keys have no index, and high-volume tables (`Claim`, `HccSuspect`, `RafHistory`, `MemberGap`, `ADTEvent`, `CareAlert`) are missing composite indexes for the queries the service layer actually runs.

---

## Pre-launch BLOCKERS

### [BLOCKER 1] Alembic wired but **zero migrations exist**; schema is created via `create_all()` at startup
- `backend/alembic/versions/` is empty (`ls -la` returns only `.` and `..`).
- `backend/alembic/env.py` is configured correctly with `compare_type=True, include_schemas=True` and model imports (lines 25-38) — but has never been run.
- `backend/app/main.py:30` calls `init_db()` during the FastAPI `lifespan` startup.
- `backend/app/database.py:128-166` uses `Base.metadata.create_all(sync_engine, tables=platform_tables)` for the platform schema; lines 88-105 use `Base.metadata.create_all(sync_engine, tables=tenant_tables)` for every tenant schema during provisioning.
- `backend/scripts/setup.sh:6` calls `alembic upgrade head` — which currently is a no-op because there are no revisions.
- **What breaks in prod:** The first time anyone adds a column to a model (e.g., a new `last_refill_date` on pharmacy claims), the next deploy does one of:
  (a) Restart succeeds silently — new column is missing from every tenant schema — app raises `UndefinedColumn` on first query.
  (b) A developer runs `alembic revision --autogenerate` months after launch, and autogen diffs against a schema containing ad-hoc `ALTER TABLE` patches from `tuva_export_service` plus raw SQL indexes from `seed.py`. The generated migration either drops partner columns, tries to recreate existing objects, or mismatches enum types.
- **Fix (required before a byte of partner data is loaded):**
  1. `cd backend && alembic revision --autogenerate -m "0001 initial schema"` — review + commit the migration.
  2. Drop a database copy, run `alembic upgrade head` on a fresh DB, run tests, and verify.
  3. Remove `Base.metadata.create_all()` calls from `app/database.py:init_db()` (lines 161-165) and from `create_tenant_tables()` (line 101). Replace with `alembic upgrade head` run against each tenant schema.
  4. Delete `Base.metadata.create_all` invocations in `scripts/setup_db.py:139,151` and `scripts/create_tenant.py:56`; substitute `alembic upgrade head`.
  5. Document the multi-schema migration runner (see BLOCKER 2).

### [BLOCKER 2] No multi-tenant migration mechanism
- Alembic's `env.py` uses a single connection and runs `context.run_migrations()` once. In the schema-per-tenant model, a migration must run once against `platform`, then once against every tenant schema (`demo_mso`, and every real client going forward).
- `env.py` does include `include_schemas=True` for autogen comparison, but nothing loops over tenant schemas at upgrade time.
- **What breaks in prod:** Deploying a migration upgrades only the `public`/`platform` schema. Every real tenant keeps the old schema; the app starts serving tenant traffic that crashes the moment it queries the new column.
- **Fix:** Implement a per-tenant migration runner (pseudo-code):
  ```python
  # in env.py online mode or a custom alembic command
  tenant_schemas = conn.execute(text("SELECT schema_name FROM platform.tenants")).scalars().all()
  for schema in ["platform", *tenant_schemas]:
      conn.execute(text(f'SET search_path TO "{schema}"'))
      context.configure(connection=conn, target_metadata=metadata_for_schema(schema), version_table="alembic_version", version_table_schema=schema)
      context.run_migrations()
  ```
  Every tenant schema needs its own `alembic_version` table. Platform tables (`platform.tenants`, `platform.users`) must be split into their own migration head or handled separately.

### [BLOCKER 3] Runtime `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in data pipeline
- `backend/app/services/tuva_export_service.py:53-81` (`ensure_schema`) executes `ALTER TABLE claims ADD COLUMN IF NOT EXISTS billing_npi VARCHAR(20)` etc. at **every Tuva export call**, against the tenant's claims table.
- This is hidden schema drift. Whatever a Tuva worker touches first, "wins." Two tenants can end up with different column types if the hardcoded fallback type is ever changed.
- `backend/scripts/seed.py:300, 365, 412-413, 514-517, 543-545, 563, 584, 600-603` and `backend/scripts/bootstrap_admin.py:87` also run raw `CREATE INDEX IF NOT EXISTS` SQL from app code instead of migrations.
- **Fix:** Delete `ensure_schema()`. Fold its columns into `claim.py` (most are already there) + a migration. Delete raw index statements from seed scripts — indexes belong in migrations.

### [BLOCKER 4] Zero backup / PITR strategy
- `docker-compose.yml` mounts `pgdata:/var/lib/postgresql/data` as a local named volume with no backup job, no WAL archiving, no PITR.
- No `pg_dump`/`pg_basebackup` in scripts, no cloud snapshotting config, no documented restore procedure.
- No mention of backup in `DEPLOYMENT.md`.
- **What breaks in prod:** Any disk failure, accidental `DROP TABLE`, bad migration, or ransomware and every partner's data is gone with no recovery path. HIPAA (45 CFR 164.308(a)(7)(ii)(A)) requires a data backup plan.
- **Fix:** Configure managed Postgres (RDS/Cloud SQL) with daily automated snapshots + 7-day PITR, OR add a dedicated backup container running `pg_dump` to S3/equivalent on a cron, OR use `pgbackrest` with offsite WAL archiving. Document tested restore procedure. Per-tenant restore requires schema-level `pg_dump -n tenant_schema`.

### [BLOCKER 5] `RafHistory` has no unique constraint — duplicate snapshots possible (prior review flag, still unfixed)
- `backend/app/models/hcc.py:61-77` defines `RafHistory` with `member_id, calculation_date, payment_year` but no unique constraint or index across that triple.
- `backend/app/services/hcc_engine.py:1224-1234` does `db.add(RafHistory(...))` inside `analyze_member` without checking for an existing row. Running `analyze_population` twice in the same day creates N duplicate rows per member.
- **What breaks in prod:** RAF trajectory endpoints return inflated / duplicate points; downstream aggregation (averages, trend lines) is wrong.
- **Fix:** Add `UniqueConstraint("member_id", "calculation_date", "payment_year", name="uq_raf_snapshot")` in `__table_args__`, and change the `analyze_member` path to upsert or short-circuit if today's snapshot already exists.

### [BLOCKER 6] Zero observability — no Sentry, Prometheus, request IDs, or structured logs
- Grep for `sentry|rollbar|prometheus|statsd`: **0 matches** across the backend.
- Grep for `correlation_id|request_id|x-request-id`: 8 hits, all in `clinical_exchange_service.py` / `clinical_exchange.py` — local to that one module, not a platform-wide middleware.
- No `structlog`/JSON log configuration; `main.py:11` uses a stock `logging.getLogger(__name__)` and no `logging.basicConfig()` or `dictConfig`. Logs default to human-readable stderr text — not parseable by any aggregator.
- No `/ready`, `/livez`, or dedicated DB-check endpoint. Only `/api/health` (line 122-124) which returns `{"status": "ok"}` without actually hitting the database.
- **What breaks in prod:** A 3am pager fires; you cannot pivot from an error rate spike to the offending request, member ID, or tenant. Postgres goes unhealthy and the load balancer keeps routing traffic because `/api/health` returns 200.
- **Fix:** Add `sentry-sdk[fastapi]`, init in `main.py` lifespan. Add a request-ID middleware that stamps `X-Request-ID` on every request/log line. Add `structlog` with JSON renderer. Add `/health/ready` that does `SELECT 1` against Postgres + `PING` Redis; mark `/api/health` as liveness only.

### [BLOCKER 7] 47 of 61 foreign keys lack indexes
- Counted via grep: `ForeignKey` occurs 61 times in `app/models/*.py`; `ForeignKey(...).*index=True` occurs 14 times. Every unindexed FK is a sequential scan when the parent row is deleted or looked up by child.
- Specific unindexed FKs on high-volume tables (see "Missing indexes" section below).

### [BLOCKER 8] Secrets / environment defaults still risky
- `app/config.py:12` defaults `secret_key = "CHANGE-ME-IN-PRODUCTION"`. `main.py:21-26` refuses to start unless changed or `ALLOW_DEFAULT_SECRET=true`. Good.
- BUT: `app/config.py:19` `cors_origins: list[str] = ["http://localhost:5180"]` — no validator rejects `"*"` in production.
- `docker-compose.yml:6-7` defaults `POSTGRES_USER=aqsoft / POSTGRES_PASSWORD=aqsoft` — fine for dev but if the same compose file is used in prod without override, the DB is wide open with the default password.

---

## Alembic state

| Item | Status |
|------|--------|
| `backend/alembic.ini` | Present, configured for psycopg2 |
| `backend/alembic/env.py` | Present, imports all models, `compare_type=True, include_schemas=True` |
| `backend/alembic/versions/` | **Empty (0 files)** |
| `backend/alembic/script.py.mako` | **Missing** (would auto-gen on first `alembic revision`) |
| Autogeneration ready? | Yes, but no multi-tenant loop |
| `Base.metadata.create_all()` at startup? | **Yes** — `app/main.py:30` → `app/database.py:128-166` |
| Migration naming convention? | **None defined** |

**Required steps to a first migration (in order):**
1. Spin up a fresh Postgres. Run `alembic upgrade head` (no-op today). Run `alembic revision --autogenerate -m "0001_initial_schema"`. Review every generated op carefully — autogen misses ENUM changes and Postgres-specific types.
2. Extend `env.py` with per-tenant loop driven by `SELECT schema_name FROM platform.tenants`.
3. Remove `Base.metadata.create_all()` from production code paths. Keep it in `tests/conftest.py:54` (SQLite-in-memory is fine for tests, and tests also use Postgres per conftest).
4. Add `alembic/script.py.mako` (get from a fresh `alembic init`).
5. Document migration naming: `NNNN_short_description.py`, one migration per PR, no squashing until a release tag.
6. Wire `alembic upgrade head` into CI (run it before tests) and into deploy (run once after image push, before traffic switchover).

---

## Missing indexes (prioritized)

| # | Query pattern | Current plan | Recommended index |
|---|---|---|---|
| 1 | `SELECT * FROM claims WHERE member_id = ? AND service_date >= ?` (used in `hcc_engine._get_member_claims` line 290-293, called per member during population analysis) | Seq scan on claims once `service_date` index alone is unselective; current single-column `member_id` + `service_date` indexes are separate | **Composite**: `CREATE INDEX ix_claims_member_svcdate ON claims (member_id, service_date DESC)` |
| 2 | `SELECT id FROM hcc_suspects WHERE member_id=? AND hcc_code=? AND suspect_type=? AND payment_year=? AND status='open'` (dedup check inside `hcc_engine.py:1175-1183`, runs 10-40x per member) | Seq scan — only `member_id`, `payment_year`, `status` are individually indexed | **Composite**: `CREATE INDEX ix_hcc_dedup ON hcc_suspects (member_id, payment_year, hcc_code, suspect_type, status)` |
| 3 | `RafHistory` uniqueness check / `WHERE member_id=? AND calculation_date=?` (once BLOCKER 5 is fixed) | Seq scan | `CREATE UNIQUE INDEX uq_raf_snapshot ON raf_history (member_id, calculation_date, payment_year)` |
| 4 | `SELECT * FROM adt_events WHERE member_id=? ORDER BY event_timestamp DESC` (member timeline views) | Single-column `member_id` index triggers index scan + heap lookups + sort | `CREATE INDEX ix_adt_events_member_ts ON adt_events (member_id, event_timestamp DESC)` |
| 5 | `SELECT * FROM care_alerts WHERE member_id=? AND status IN ('open','acknowledged') ORDER BY created_at DESC` (dashboard/caseload views) | Seq scan — no `member_id` column index at all on `care_alerts` (model has FK but no `index=True`) | `CREATE INDEX ix_care_alerts_member_status ON care_alerts (member_id, status, created_at DESC)` |
| 6 | `SELECT * FROM member_gaps WHERE member_id=? AND measurement_year=?` | `member_id` + `measurement_year` each indexed separately (seed.py:600-603), planner picks one + filters | `CREATE INDEX ix_memgaps_member_year ON member_gaps (member_id, measurement_year, status)` |
| 7 | `SELECT * FROM claims WHERE practice_group_id=? AND service_date BETWEEN ? AND ?` (group-level expenditure) | Single-column `practice_group_id` index only | `CREATE INDEX ix_claims_group_svcdate ON claims (practice_group_id, service_date)` |
| 8 | Dashboard MLR: `SELECT SUM(paid_amount) FROM claims WHERE service_date BETWEEN ? AND ?` + `COUNT(*)` queries in `dashboard_service.py:90-110` | Seq scan over full claims table for every dashboard load | `CREATE INDEX ix_claims_svcdate_paid ON claims (service_date) INCLUDE (paid_amount)` (Postgres 11+) |
| 9 | FK lookups: `providers.practice_group_id` — ORM has this indexed (provider.py:15), but **FK `Claim.rendering_provider_id`** (claim.py:37) has no `index=True` | Seq scan on claims when opening provider scorecard | `CREATE INDEX ix_claims_rendering_provider ON claims (rendering_provider_id)` |
| 10 | **Cross-schema `platform.users.tenant_id` FK** (user.py:28-30) has no index | Seq scan on users when resolving tenant on login | `CREATE INDEX ix_users_tenant_id ON platform.users (tenant_id)` |

**Summary:** all of these are unindexed today. With ~50 claims per member × 50k members = 2.5M claim rows per tenant, the dashboard's `SELECT SUM(paid_amount)` alone is a multi-second full-table scan. Claims-driven endpoints will P95 > 5 seconds on modest partner data.

---

## Query performance

### N+1 queries — **confirmed**

1. **`analyze_population` → `analyze_member` loop** — `hcc_engine.py:1287-1303`. Loads member IDs in one query, then for each member:
   - 1 `db.get(Member, id)` call (`analyze_member` line 920)
   - 1 `_get_member_claims` query (line 948)
   - 1 provider-pattern query (line 931) if PCP exists
   - **N inner queries for suspect dedup** (line 1175-1183) — one per candidate suspect
   - 1 `db.add(RafHistory)` + final `db.flush()`
   For a member with 20 candidate suspects that's ~25 roundtrips per member. For 50k members, **1.25M roundtrips**. At 1ms each over localhost that's 20+ minutes; over a cloud-hosted DB it's hours.
   **Fix:** bulk-load claims and existing suspects per batch of 50 members, then dedup in Python/SQLAlchemy identity map.

2. **`dashboard_service.get_dashboard_metrics`** — 6 serial aggregate queries that could be combined into one CTE (lines 36-96). Not N+1 per-row, but 6 roundtrips per dashboard load is 6x the necessary latency.

3. **`dashboard_service.get_dashboard_actions`** — 6 serial aggregate queries (lines 372-433). Same story; easy to merge via CTE or `UNION ALL`.

4. **`patient_context_service` (line 212-217)** — `select(Claim).where(member_id=?)` pulls **all** claims for a member into memory with no date filter on this path. A long-tenure member with 10 years of claims = unbounded row pull. Prior round-5 flagged "trajectory" only.

### Unbounded Python-side loads

- `provider_service.py:208, 264, 524, 541` — `all_providers = all_result.scalars().all()` pulls every provider row for percentile computation. At 500 providers that's fine; at 5,000 it's 50MB+ of Python objects per dashboard call, and 5x slower GC. Should use `percent_rank()` window function in SQL.
- `patient_context_service.py:215` (above).
- `dashboard_service.py:139` — `scores = [float(row[0]) for row in result.all()]` — loads every member's RAF into Python for histogram; same issue at scale.

### `SELECT *` in hot paths

- `app/services/adt_service.py:651, 672, 692, 741, 749` — `text("SELECT * FROM care_alerts WHERE id = :aid")` — pulls every column (including `description`, `recommended_action`, JSONB `alerts_sent`) when most callers only need status.
- `app/services/data_protection_service.py:420` — `text("SELECT * FROM members WHERE id = :mid")`.
- `app/services/tuva_data_service.py:169, 331` — `SELECT *` from Tuva marts.

### Eager/lazy loading

- **No `relationship()` definitions anywhere in the model layer.** Grep for `from sqlalchemy.orm import relationship`: 0 matches. Every FK is manual `ForeignKey(...)` + manual join in service code.
- This is defensible (explicit joins, no accidental lazy load across async boundary), but it also means there's no ORM-level guardrail against N+1; every developer must remember to bulk-load.

---

## Data integrity

| Concern | Status |
|---|---|
| FK constraints at DB level | **Yes** — `ForeignKey` on all FKs, so referential integrity is enforced in Postgres. Good. |
| Cross-schema FK `platform.users.tenant_id → platform.tenants.id` | Yes (user.py:28-30) |
| `users.practice_group_id` FK — **missing by design** (user.py:37) because it's cross-schema (users in platform, groups in tenant). Relies on app-layer validation only. |
| Unique constraint on `members.member_id` (external plan ID) | Yes (member.py:22, `unique=True`) |
| Unique constraint on `providers.npi` | Yes (provider.py:12) |
| Unique constraint on `practice_groups.tin` | Yes (practice_group.py:24) |
| Unique constraint on `tenants.schema_name` | Yes (tenant.py:22) |
| Unique constraint on `users.email` | Yes — but scoped globally, not per tenant. Two tenants can't have the same user email even if the users are different people. |
| Unique constraint on `raf_history (member_id, calculation_date, payment_year)` | **NO** — BLOCKER 5 |
| Unique constraint on `member_gaps (member_id, measure_id, measurement_year)` | **NO** — care-gap ingestion can create duplicates |
| Unique constraint on `hcc_suspects` to prevent dup opens for same (member, hcc, year, type) | **NO** — dedup logic lives in Python (hcc_engine.py:1175) and can race under concurrent analyses |
| NOT NULL on `members.first_name/last_name/dob/gender` | Yes |
| NOT NULL on `claims.member_id/claim_type/service_date` | Yes |
| Check constraint `claims.paid_amount >= 0` | **NO** — no `CheckConstraint` anywhere in the codebase (grep returned 0 matches) |
| Check constraint `members.date_of_birth < current_date` | **NO** |
| Check constraint `hcc_suspects.confidence BETWEEN 0 AND 100` | **NO** — model comment says 0-100 but no enforcement |
| Check constraint for valid `claim_type` values | **NO** — enum defined in Python (`ClaimType`) but column is `String(20)` without a DB check |

Pattern: **the platform enforces almost zero domain invariants at the database layer.** Any bug that writes `paid_amount = -5.0` or `confidence = 250` goes straight through.

---

## Logging / observability gap

| Category | Current state | Missing |
|---|---|---|
| Error tracking | None | Sentry / Rollbar init in `main.py` lifespan |
| Structured logging | Default Python `logging.getLogger(__name__)` in 134 files, no handler config | `structlog` + JSON formatter + `RequestIDMiddleware` |
| Correlation IDs | Only in `clinical_exchange_service.py` (8 refs), no platform-wide middleware | Per-request `X-Request-ID` header propagation |
| Metrics | None | Prometheus `/metrics` endpoint; track request rate/duration/error rate, DB pool stats, worker queue depth |
| Healthchecks | `/api/health` returns static 200 without DB/Redis check | `/health/live` (static), `/health/ready` (hits DB + Redis) |
| Slow query log | None in `alembic.ini` or `database.py` (`echo=False`) | Postgres `log_min_duration_statement=500ms` + capture into JSON logs |
| Docker healthchecks | `docker-compose.yml` has **no** `healthcheck:` blocks on postgres, redis, backend, or any worker | Add healthchecks so `depends_on: condition: service_healthy` works |
| Request logging | Global exception handler (main.py:115-118) logs with `exc_info=True`, but nothing logs the incoming request, user, or tenant | Access log middleware that tags tenant/user/request-id |

---

## Deployment config gap

### `docker-compose.yml` review

- No `restart:` policy on any service — if backend crashes, container dies until someone notices.
- No `healthcheck:` on postgres or redis — `backend` + workers start before dependencies are ready, causing connection-refused races on first boot.
- No `mem_limit` / `cpus` — a runaway Tuva export can starve the backend of memory in the same container host.
- Mounts `./backend:/app` as a volume in **all** 4 service definitions (backend + 3 workers, lines 27, 37, 47, 57) — fine for dev hot-reload, **dangerous in prod**: any container can rewrite app code. A production `docker-compose.prod.yml` override is needed; it doesn't exist.
- `command: uvicorn ... --reload` (line 28) is the dev default — prod needs to drop `--reload` and add `--workers N` behind a reverse proxy.
- No HTTPS termination configured. The compose file exposes port 8090 raw. Deployment relies on an external LB/proxy that isn't part of the repo — not documented anywhere except "Cloudflare Pages for frontend."

### Environment inventory (from `config.py` + `DEPLOYMENT.md`)

| Var | Required? | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Required (at runtime) | `postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health` | Default uses dev password — production deploys must override |
| `REDIS_URL` | Required for workers | `redis://localhost:6380/0` | Same |
| `SECRET_KEY` | **Required** (startup check in main.py:21) | `"CHANGE-ME-IN-PRODUCTION"` | Good — startup refuses if not changed |
| `CORS_ORIGINS` | Required (implicit) | `["http://localhost:5180"]` | No `"*"` guard — a dev who sets `CORS_ORIGINS=*` for "testing" silently disables origin enforcement |
| `ANTHROPIC_API_KEY` | Required for insights | empty | No startup check; insights silently degrade if missing |
| `OPENAI_API_KEY` | Optional | empty | |
| `SNF_ASSIST_URL` | Optional | `http://localhost:8000` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Optional | 30 | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Optional | 7 | |
| `UPLOADS_DIR` | Optional | `uploads` | No validation that the dir exists/is writable |
| `ALLOW_DEFAULT_SECRET` | Dev-only escape hatch | unset | Good — explicitly flagged |

No `.env.example` file was found at `backend/.env.example` (only referenced in DEPLOYMENT.md:20) — confirm it exists and enumerates every variable.

### Hosting

- Frontend: Cloudflare Pages (per commit log, `aqhealth.ai` + `cspergel.github.io/aqhealth`).
- Backend: **not actually hosted anywhere production-grade yet.** `docker-compose.yml` is the only deploy artifact. No Kubernetes manifests, no Cloud Run / ECS / Fly.io config in the repo. For a first partner this is a manual VM deploy at best.

---

## Background jobs inventory

ARQ (Redis-based) is the queue. Three worker processes: `ingestion_worker`, `hcc_worker`, `insight_worker`. A fourth module `tuva_worker.py` exists but isn't in `docker-compose.yml`.

| Job | Module | Trigger | Retry? | Idempotent? | Timeout |
|---|---|---|---|---|---|
| `process_ingestion_job` | `ingestion_worker.py:22` | Enqueued when user confirms column mapping in the UI | ARQ default retry: **not configured** (so default = 5 retries) but **no dead-letter queue** | **No.** Inserts `IngestionBatch` (line 102-106) and can double-process if re-queued; no idempotency key check | 600s |
| `run_hcc_analysis` | `hcc_worker.py:19` | Chained from ingestion (`ingestion_worker.py:191`) or manual API trigger | ARQ default | **Partial** — dedup via SQL SELECT (hcc_engine.py:1175), but `db.add(RafHistory(...))` always inserts; duplicate runs = duplicate snapshots (BLOCKER 5) | 1800s |
| `refresh_provider_scorecards` | Chained inside `run_hcc_analysis` (line 47) | Implicit | Caught exception → logged + recorded in result dict (line 56-60), not retried | Unknown (depends on `provider_service.refresh_provider_scorecards`) | inherits |
| `run_insight_generation` | `insight_worker.py:19` | Chained from ingestion (`ingestion_worker.py:194`) | ARQ default | **No** — always calls LLM, always writes new `Insight` rows; running twice creates duplicate insights | 600s |
| `tuva_worker` tasks | `tuva_worker.py` | Not scheduled anywhere | Unknown | Export service runs `ensure_schema` ALTER TABLE every time (non-idempotent at DDL level) | Unknown |

**Concerns:**
- No DLQ. When ARQ retries are exhausted, the job is lost silently.
- No scheduled / cron jobs for daily RAF recalculation, weekly insight refresh, etc. (`insight_worker.py:5` mentions "on a daily schedule" but nothing schedules it.)
- Ingestion triggers HCC → HCC triggers scorecard → insights fire all serially; for a large partner roster, this is a ~1 hour pipeline where any step failing breaks the next.
- Worker `max_jobs = 5` (ingestion), 3 (hcc), 2 (insight) — total worker concurrency is 10 across the tenant pool, which will bottleneck with >1 active tenant.

---

## Test suite status

- Ran tests: **YES** — `cd backend && python -m pytest -q --tb=no`
- Collected: **124 tests** across 14 files.
- Result: **119 passed, 5 failed, 1 warning** in 78s.
- Failures — all infrastructure-related:
  - `test_api_routes.py::test_adt_webhook_requires_tenant_and_secret`
  - `test_api_routes.py::test_tuva_comparison`
  - `test_api_routes.py::test_tuva_population_opportunities`
  - `test_api_routes.py::test_tuva_convergence`
  - `test_api_routes.py::test_tuva_stale_suspects`
  - 4 of the 5 are `ConnectionRefusedError` (Tuva-related — need Postgres + DuckDB setup). 1 is an ADT webhook tenant-resolution test.
- Test DB: **Postgres** (not SQLite) — `tests/conftest.py:37-45` replaces the DB URL with `aqsoft_health_test` and `pytest.skip`s if Postgres isn't available. Good — addresses the round-5 Skeptic's SQLite concern.
- Coverage: `pyproject.toml:51` `fail_under = 25` — the bar is set at 25%, which is low. Coverage not run this session (no `--cov` run) but the test count (124) across 134 service files is thin.
- `tests/conftest.py:54` still uses `Base.metadata.create_all` for the test DB. This is acceptable for isolated tests but means **tests do not verify the migration chain** — a bad migration can ship without any test failure.

---

## Backup & recovery

- **Automated backups:** None.
- **Tested restore:** No evidence anywhere in repo.
- **Point-in-time recovery:** Not configured; WAL archiving is off.
- **Per-tenant restore:** Not possible with current setup. Would require `pg_dump -n <schema>` to a per-tenant backup bucket, and no such tooling exists.
- **Volume:** `docker-compose.yml` named volume `pgdata`; a single `docker volume rm pgdata` destroys everything.

**Minimum viable bar before partner data:**
1. Daily `pg_dump` to object storage, encrypted, 30-day retention.
2. Per-tenant `pg_dump -n <schema>` monthly (cheap, enables per-tenant restore).
3. Weekly automated restore test (spin fresh DB from latest backup, run smoke tests).
4. Documented RPO / RTO targets (e.g., RPO=24h, RTO=4h) and confirm the above meets them.
5. For Tier-1 partners, move to managed Postgres with 7-day PITR (RDS/Cloud SQL).

---

## Summary — fixes required before partner data

1. Generate `0001_initial_schema` Alembic migration; delete `create_all()` from startup.
2. Build multi-tenant migration runner; add per-tenant `alembic_version` tables.
3. Delete `tuva_export_service.ensure_schema()` and all ad-hoc DDL from seed scripts.
4. Add backup (daily `pg_dump` minimum) + documented restore test.
5. Add Sentry, structured JSON logging, request IDs, `/health/ready`, Docker healthchecks, service restart policies.
6. Add the 10 missing indexes (especially claims composite indexes).
7. Add `UniqueConstraint` to `RafHistory`, `MemberGap`, `HccSuspect`, and a unique on per-tenant user email.
8. Add at least the `CheckConstraint`s for amounts, dates, confidence ranges.
9. Refactor `analyze_population` to bulk-load claims + suspects per batch (fix the 1M-roundtrip N+1).
10. Move `all_providers = scalars().all()` percentile calc into SQL `percent_rank()`.
11. Configure CI to run `alembic upgrade head` on a fresh DB before every test run.
12. Document a zero-downtime migration pattern (add column nullable → backfill → enforce NOT NULL in a second migration) in `docs/` and enforce in PR template.

Without items 1-5 the platform is not safe to load a single real partner record. Items 6-12 are required before a partner exceeds ~5k members.
