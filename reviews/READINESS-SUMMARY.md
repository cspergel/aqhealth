# Production Readiness — Master Summary

Six parallel deep-dive audits (Opus, each traced actual code paths) against the question: **"Can this platform receive real partner data — Pinellas, Pasco, Miami-Dade MSOs — without losing records, leaking PHI, or silently misrepresenting reality?"**

## Overall verdict

**NOT READY.** All six audits returned NOT READY. Roughly **45–50 distinct blockers** across the six verticals. Many were flagged independently by multiple audits — those are the highest-confidence items.

| Audit | Blockers | Important | Report |
|---|---|---|---|
| Ingestion pipeline | 8 | 9 | `readiness-ingestion.md` |
| External APIs | 9 | 12 | `readiness-external-apis.md` |
| Tuva / dbt | 10+ | 15+ | `readiness-tuva-dbt.md` |
| Multi-tenant + PHI | 8 | 10+ | `readiness-multitenant-phi.md` |
| Auth + security | 12 | 16 | `readiness-security.md` |
| DB + ops | 8 | — | `readiness-db-ops.md` |

## The truth behind the surface

The platform runs end-to-end in demo mode. The 5-round review fixed demo flows. But several subsystems that appear to work are **broken under the hood** and demo mode was hiding it:

- **Tuva consumer queries reference columns and tables that don't exist.** 5 queries in `tuva_data_service.py` target `pmpm`, `main_quality_measures.summary`, `condition_date`, `hcc_recapture.summary`, and `raw_risk_score`. None exist. All 14 Tuva consumer queries are wrapped in `except Exception: return []` — SQL errors silently become empty arrays. Demo renders "No data yet" indistinguishably from broken.
- **Quarantine table never written.** Models and routers exist, service claims to read it; zero `INSERT INTO quarantined_records` in the codebase. Invalid rows are silently dropped.
- **Metriport adapter is functionally dead.** Registered in `ADAPTERS`, but all `fetch_*` methods return `[]`. Sync reports success having pulled nothing.
- **Availity is docstring-only.**
- **`/api/tuva/run` returns `"queued"` without enqueuing the job.**
- **Data lineage hardcodes `entity_id=0, ingestion_job_id=None`** → `rollback_batch` service is blind.
- **Redis-down returns HTTP 200** on enqueue failure → job stuck in `validating` forever, user thinks upload succeeded.

## Cross-confirmed blockers (flagged by 2+ audits — highest confidence)

| # | Blocker | Flagged by |
|---|---|---|
| 1 | Base64 "encryption" on payer OAuth creds (`payer_api_service.py:157-172`) — docstring admits it's a placeholder | External-APIs, PHI, Security |
| 2 | `DEMO_MODE=true` bypasses auth on all 18 Tuva endpoints including `/api/tuva/member/{id}` full chart | PHI, Security |
| 3 | Alembic `versions/` empty; `create_all()` at startup; first schema change post-launch loses data | Ingestion, DB/Ops |
| 4 | No multi-tenant migration runner — `env.py` upgrades `platform` schema only | DB/Ops (implicit in PHI's tenant concern) |
| 5 | Clinical notes sent to Claude with no PHI scrub / no BAA evidence / no prompt-injection defense; `clinical_nlp_service.py:560` bypasses `llm_guard` | PHI, Security |
| 6 | Stored prompt injection via `corrected_answer` — after 5 submissions, user text gets promoted to Claude system-prompt RULE | PHI, Security |
| 7 | RBAC enforced on 7 of 57 routers; 50 PHI routers (members, claims, clinical, hcc, care_gaps, awv, fhir, journey, query, radv…) accept any authenticated role | PHI, Security |
| 8 | OAuth `state` = tenant schema name — CSRF bypass on payer connect flow | External-APIs, Security |
| 9 | Seeded `admin@aqsoft.ai / admin123` in `setup_db.py` + `seed.py` | Security (prior rounds) |
| 10 | `SECRET_KEY=change-me-in-production` committed as default; `ALLOW_DEFAULT_SECRET=true` bypasses guard | Security |
| 11 | No PHI access audit log anywhere (HIPAA §164.312(b)) | PHI, Security |
| 12 | Zero observability: no Sentry, no Prometheus, no structured logs, no request IDs, no `/health/ready`, no Docker healthchecks | DB/Ops |
| 13 | Upload filename path traversal accepts `../../etc/hosts.csv` (`ingestion.py:218-222`) | Ingestion (implicit), Security |
| 14 | File size checked after full read → RAM-exhaustion DoS (`ingestion.py:209-214`) | Ingestion, Security |
| 15 | Payer sync pulls full history every time — no incremental sync, no `_lastUpdated` or `since` watermark anywhere | Ingestion, External-APIs |
| 16 | FHIR Observation/Encounter/Procedure silently dropped (handlers `None`) | Ingestion, External-APIs |
| 17 | RafHistory no unique constraint → duplicates on every `analyze_member` | DB/Ops (round-1 carry-over) |

## Grouped by risk class

### A. HIPAA-gating — **no real PHI can enter until these are fixed**
- Missing audit log
- Plaintext payer OAuth tokens + ADT webhook secrets
- RBAC gap (50 of 57 routers)
- No soft-delete/tombstones (§164.528 disclosure accounting)
- Clinical notes to Claude without scrub/BAA
- DEMO_MODE auth bypass
- Admin superuser seed

### B. Data integrity — **will corrupt tenant data**
- Alembic empty + no tenant migration runner
- Quarantine never written (silent row drops)
- No `(claim_id, member_id)` unique constraint + chunk-commit races
- Full-sync-every-time payer pulls (duplicates pile up)
- Lineage hardcoded to zeroes (rollback blind)
- `RafHistory` missing unique constraint
- Ad-hoc `ALTER TABLE` in runtime code

### C. Functional — **features claim things that aren't true**
- Tuva consumer queries against non-existent columns/tables (5 queries)
- All Tuva consumers wrapped in `except: return []` (silent failure indistinguishable from empty)
- Metriport adapter functionally dead
- Availity unimplemented
- `/api/tuva/run` is a no-op
- Data quality reports never persisted
- FHIR resource types silently dropped
- `validate_llm_output` warnings logged but never enforced

### D. Operational — **can't debug or recover**
- No backups / PITR (HIPAA violation on top of operational risk)
- No structured logs, no correlation IDs, no error tracking
- Healthcheck doesn't touch DB
- Redis-down returns 200
- 47 of 61 FKs lack indexes
- N+1 on `analyze_population` (50k members ≈ 1.25M roundtrips)
- Background jobs: no DLQ, no idempotency keys, `run_insight_generation` duplicates on retry
- `bcrypt` breakage is a warning, not hard-fail (silent auth failure)

### E. Frontend / contract hygiene
- These are covered by the 5 prior review rounds and are mostly green. Carry-overs only.

## Sequencing — a defensible path to readiness

**This is ~3-6 weeks of focused backend work** depending on team size. Grouped by dependency:

### Phase 1: Foundation (cannot skip, nothing else is safe until this is done)
1. **Alembic: first migration from current schema** + multi-tenant runner that loops tenant schemas
2. **Backups:** automated `pg_dump` (or move to managed Postgres) + tested restore
3. **Observability:** structured logging with correlation IDs + Sentry (or equivalent) + Docker healthchecks + `/health/ready` that touches DB
4. **Real secret encryption:** swap base64 in `payer_api_service` for KMS-backed or `cryptography.Fernet`-backed encryption
5. **Rotate seeded admin creds; remove `ALLOW_DEFAULT_SECRET`; generate unique `SECRET_KEY`**

### Phase 2: HIPAA / security (must clear before any real PHI)
6. **PHI access audit log:** append-only table, middleware that logs every PHI read + write + failed access
7. **RBAC on all 57 routers:** audit every `@router.*` decorator; add `require_role` / `require_permission`; object-level checks for practice-group attribution
8. **Remove `DEMO_MODE` auth bypass** on Tuva; instead require an explicit `demo-tenant` role
9. **Fix OAuth `state`** to a nonce
10. **Clinical notes → Claude:** PHI scrubber before prompt, BAA (operational not code), prompt-injection guard; remove `corrected_answer` → system-prompt promotion path
11. **Upload hardening:** reject filename on path-traversal before disk; stream size-check before full read
12. **Soft-delete/tombstones** on PHI-bearing models

### Phase 3: Ingestion correctness
13. **Unique constraints:** `(claim_id, member_id)`, `RafHistory (member_id, payment_year)`, etc.
14. **Idempotency:** content hash on uploads; upsert semantics everywhere
15. **Wire quarantine table writes** — actually insert on validation failure
16. **Fix lineage: populate `entity_id` + `ingestion_job_id`**
17. **Fix Redis-down handling** to 503, not 200
18. **Background payer sync** with `last_sync` watermark, pagination state, resumption

### Phase 4: Tuva / dbt correctness
19. **Fix the 5 broken consumer queries** (`pmpm`, `quality_measures.summary`, `condition_date`, `hcc_recapture.summary`, `raw_risk_score`) — either update to real column names or drop the endpoints
20. **Copy `tuva_demo_data/macros/generate_schema_name.sql` to `dbt_project/macros/`** — eliminates the string-replace hack in one move
21. **Remove `except Exception: return []`** wraps — surface real errors
22. **Wire `/api/tuva/run`** to actually enqueue the arq job
23. **Per-tenant dbt builds** with dynamic profiles
24. **Enable required Tuva vars** (`hcc_recapture_enabled`, `hcc_suspecting_enabled`, `clinical_enabled`, `provider_attribution_enabled`)
25. **Broaden input surface:** wire `condition`/`encounter`/`medication`/`procedure`/`observation` tables through to Tuva

### Phase 5: Integrations that claim to work
26. **Metriport:** either remove from `ADAPTERS` registry or implement
27. **Availity:** remove from UI or implement
28. **eCW:** wire Observation/Encounter/Procedure FHIR handlers
29. **ADT:** webhook replay protection, dedup on `raw_message_id`, remove `X-Tenant-Schema` header path

### Phase 6: Performance + scale (do before onboarding large tenants, not before day 1)
30. **Add indexes** on 47 unindexed FKs + high-query-pattern composites
31. **Fix `analyze_population` N+1** — batch queries; target 50k members < 5 min
32. **Fix dashboard 12 serial aggregates** → CTE
33. **Add Claude cost caps** per tenant

### Phase 7: Structural debt (round-1 Structuralist, 5 rounds parked)
34. Shard `mockApi.ts` into `lib/api-contracts/`
35. Extract business logic from routers into services
36. Consolidate the 6 per-row state Records in `MemberDetail.tsx` into a reducer
37. Decide microservices vs monolith (currently monolith-as-microservices)

## What's actually in decent shape

- **Demo mode flows** (after 5 review rounds)
- **FastAPI + Pydantic contract hygiene** post round 4
- **JWT issuance + password hashing** (bcrypt — despite the silent-fail concern)
- **Schema-per-tenant isolation** (mechanism is right; enforcement is the gap)
- **Tuva pipeline exists and runs** (consumers are the problem, not the dbt project itself)
- **ARQ workers + job model** (DLQ and idempotency are the gaps)
- **Test suite exists** and 119/124 pass against real Postgres (not SQLite)

## Recommendation

**Do not onboard Pinellas until Phase 1 + Phase 2 are complete.** Those are the unambiguous HIPAA + data-integrity floor. Phase 3 + Phase 4 can overlap with a small pilot (Phase 1 + Phase 2 cleared, Pinellas sending a small test batch, Phases 3 + 4 in progress).

Estimate (solo-dev):
- Phase 1: ~1 week
- Phase 2: ~2 weeks
- Phase 3: ~1 week
- Phase 4: ~1 week
- Phases 5–7: ongoing / parallel

With a 2-3 person team, this compresses to **3-4 weeks to cleared-for-pilot.**

## Per-audit detail

- `reviews/readiness-ingestion.md`
- `reviews/readiness-external-apis.md`
- `reviews/readiness-tuva-dbt.md`
- `reviews/readiness-multitenant-phi.md`
- `reviews/readiness-security.md`
- `reviews/readiness-db-ops.md`
