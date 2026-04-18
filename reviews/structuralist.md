# Structuralist Review — AQSoft Health Platform

**Agent:** The Structuralist
**Tier assumption:** MEDIUM (pre-revenue, 1 founder + dev team, early FL customers, aggressive roadmap)
**Scope:** Full codebase architecture — backend services/routers, layering, microservice claims, dbt coupling, frontend structure, evolution hazards.

---

## Executive framing

This is a MEDIUM-tier project wearing a LARGE-tier outfit. The ambition is clear and legitimate, but the current code shape —  **73 services, 57 routers, ~37k LOC of services, ~11k LOC of routers, and 34 ORM models** — has grown faster than its internal structure. Many "services" are file-sharded business logic that still has to hang together; many "routers" have assumed service responsibilities. None of it is *broken*, but it is not ready to scale to 10 engineers without friction.

The microservice framing ("All microservices" per memory) does not match the repo: the Health Platform is a single FastAPI monolith (one container, three worker processes) with a single HTTP client to SNF Admit Assist. That's fine — but it should be named honestly in docs.

Below are 18 findings.

---

### [CRITICAL] Business logic + raw SQL embedded in routers — layering is inverted in the largest endpoints
**Location:** `backend/app/routers/hcc.py` (616 lines), `backend/app/routers/ingestion.py` (753 lines), `backend/app/routers/tuva_router.py` (819 lines), `backend/app/routers/care_gaps.py` (423 lines), `backend/app/routers/claims.py` (226 lines)
**Structural issue:** Boundary / layering violation — routers are doing service work.
**Evidence:**
- Grep shows **120 SQLAlchemy `select(…)`/`.where(…)`/`.join(…)` calls and 81 `db.execute(...)` calls inside router files.** `routers/hcc.py` has 22 select-family calls; `routers/tuva_router.py` has 20; `routers/claims.py` has 20; `routers/care_gaps.py` has 18.
- `routers/hcc.py:165-272` — `list_suspects` builds a multi-join SQL query, applies filters, handles pagination sorting, and hand-maps ORM rows to Pydantic. That's repository + service + serializer work in one function.
- `routers/ingestion.py:255-335` — router writes raw SQL (`INSERT INTO upload_jobs … RETURNING id`) and loads mapping rules via `text(...)`. The parallel `services/ingestion_service.py` and `services/mapping_service.py` exist but are bypassed for the DB layer.
- `routers/tuva_router.py:291-500` (get_member_detail) — 200+ lines of member/claim/suspect assembly, code-ladder construction, and inline `_demo_session` session management in the router.
**Why it matters:** The project is heading toward multi-tenancy nuance, RBAC per endpoint, audit logging, caching, and eventual v2 API surface. Every one of those changes will require touching dozens of router files because service/repository boundaries don't exist. Tests for HCC business logic have to spin up HTTP dependencies. This is the single biggest evolution hazard in the codebase.
**Recommendation:** Draw a firm rule: **routers do auth + schema validation + calling one service function + Pydantic response coercion — no SQL, no business rules, no session bookkeeping.** Start with the top 5 fattest routers. Move their SQL into the matching `*_service.py` (which already exists for almost every router). Introduce a thin `repositories/` module only if a service accumulates >400 lines of query code.
**CROSS:** Contractualist (response-model drift), Skeptic (test surface).

---

### [CRITICAL] Service count is not tier-appropriate — 73 service modules with heavy overlap in the ingestion/data-quality stack
**Location:** `backend/app/services/` (73 `.py` files, 37,325 LOC)
**Structural issue:** Over-sharding — many services split by feature name rather than by cohesive responsibility.
**Evidence:** Ingestion alone owns **10 services** with overlapping responsibility:
- `ingestion_service.py` (1,165 lines) — reads files, bulk-inserts
- `data_preprocessor.py` (1,258 lines) — encoding, header cleanup, date normalize, name parsing
- `mapping_service.py` (694 lines) — AI column mapping
- `common_column_aliases.py` (775 lines) — static alias table
- `ai_pipeline_service.py` (1,027 lines) — format detection, transformation, overlaps with mapping + preprocessor
- `interface_service.py` (832 lines) — HL7v2/X12/CDA parsers — another parallel "universal ingestion" system
- `entity_resolution_service.py` (987 lines) — member/provider match
- `data_quality_service.py` (538 lines) — validation
- `data_protection_service.py` (985 lines) — "8-layer defense" incl. fingerprinting, golden record, batch rollback
- `data_learning_service.py` — log corrections → create rules

Three "learning" modules that don't share a clear seam: `learning_service.py` (672), `learning_events.py` (427), `data_learning_service.py`. Two "discovery" modules: `discovery_service.py` (1,238) and `org_discovery_service.py`. "AI pipeline" (`ai_pipeline_service.py`) and "Universal Data Interface" (`interface_service.py`) claim the same problem space (format-agnostic ingestion) but live side by side.
**Why it matters:** New engineer asking "where does a new data source get added?" has 6 plausible entry points. That's not organic cohesion — that's convenience splits at write-time calcifying into boundaries. It also multiplies the cross-service drift surface.
**Recommendation:** Consolidate into **~4 ingestion packages**, not 10 files:
- `ingestion/pipeline` (preprocessor + mapper + loader — one owning module, internal helpers)
- `ingestion/formats` (hl7v2, x12, cda, fhir, csv — each a small module)
- `ingestion/quality` (validation + protection + entity resolution, since they all run over the same rows)
- `ingestion/learning` (corrections → rules)
Similarly collapse `learning_service` / `learning_events` / `data_learning_service` into `learning/` with clear sub-responsibilities. Target: drop ~20 service files with zero behavior loss.

---

### [CRITICAL] "All microservices" framing is aspirational — the Health Platform is one monolith, and docs/memory are misleading
**Location:** `docker-compose.yml`, `backend/app/services/snf_client.py`, `README.md:136-180` ("architecture"), memory/project_ecosystem.md ("All microservices")
**Structural issue:** Tier mismatch between claimed architecture and implemented one.
**Evidence:**
- `docker-compose.yml` defines 5 containers: postgres, redis, backend, worker (ingestion), hcc-worker, insight-worker. All three workers share one image (`build: ./backend`) and one codebase. No network boundary between modules.
- The only true cross-service call is `services/snf_client.py` — an httpx wrapper to SNF Admit Assist (which *is* a separate product).
- `README.md` ecosystem table lists AQTracker, AQCoder, redact.health, AutoCoder, AIClaim all as "microservices" — none are wired in; they are separate products.
**Why it matters:** This is a strategic-naming risk more than a code risk. Calling the internals microservices pressures future architecture decisions (e.g., splitting services for scale that doesn't exist, adding message buses, introducing service-mesh overhead). It also sets wrong expectations for new engineers and external reviewers who conflate "services in the ecosystem" with "microservices in the repo."
**Recommendation:** In docs and memory, distinguish three concepts:
1. **Products** in the AQSoft ecosystem (AQTracker, SNF Admit Assist, etc.) — *separate deployables*.
2. **Internal modules** in the Health Platform — *logical boundaries inside one monolith*.
3. **Integrations** — payer APIs, eCW, Metriport, Tuva pipeline.
Keep the monolith. It is the right tier for 1 founder + early customers. Only extract a service when a *concrete* scale or team-ownership forcing function appears.

---

### [IMPORTANT] Routers module loaded eagerly and registered one-by-one — single import line is 50+ names
**Location:** `backend/app/main.py:12` (import line), `:56-112` (57 registrations)
**Structural issue:** Boot-time coupling — one unreliable import breaks the whole app.
**Evidence:** Line 12 is a single `from app.routers import …` with 55 comma-separated module names. Line 56-112 are 57 lines of `app.include_router(x.router)` in an arbitrary order that doesn't group by domain.
**Why it matters:** A syntax error in any one router file takes the whole API down at startup. There is no grouping that reflects product structure (revenue, clinical, data, admin). Adding/removing modules is a merge-conflict magnet.
**Recommendation:**
```python
# app/routers/__init__.py
ROUTERS = [auth.router, adt.router, ...]
# app/main.py
for r in ROUTERS: app.include_router(r)
```
Or group by domain (`revenue`, `clinical`, `data`, `admin`, `analytics`) and register each group. Matches the sidebar taxonomy the frontend already uses.

---

### [IMPORTANT] Alembic is wired up but unused — schema is created from ORM at startup in every environment
**Location:** `backend/alembic/env.py`, `backend/alembic/versions/` (empty), `backend/app/database.py:128-166` (init_db, create_tenant_tables), `backend/app/services/tuva_export_service.py:53-80` (ensure_schema ALTER TABLE IF NOT EXISTS)
**Structural issue:** Schema evolution path is missing — replaced by a series of ad hoc `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` calls.
**Evidence:**
- `alembic/versions/` is empty.
- `database.py:init_db()` calls `Base.metadata.create_all(...)` at application startup.
- `database.py:create_tenant_tables()` does the same per tenant, with manual schema-swap gymnastics.
- `tuva_export_service.py:ensure_schema()` silently runs `ALTER TABLE claims ADD COLUMN IF NOT EXISTS billing_npi VARCHAR(20)` etc. — i.e., schema drift is being patched at runtime by a data-export service.
**Why it matters:** The moment you have live customer data, a model field rename or type change has no safe migration path. `create_all` never alters, and `ALTER TABLE IF NOT EXISTS` in a data pipeline is the anti-pattern version of a migration. Onboarding of Pinellas/Pasco/Miami-Dade members is near-term — this has to be fixed before then.
**Recommendation:** Generate an initial baseline migration from current models (`alembic revision --autogenerate`), check it in, and make it the only path to schema creation. Delete the `create_all` at startup. Delete `ensure_schema` from `tuva_export_service` and fold any drift into a migration.

---

### [IMPORTANT] Duplicated helper functions across 9+ services — `_safe_float`, `_safe_int`, `_pct`
**Location:** `financial_service.py`, `boi_service.py`, `expenditure_service.py`, `insight_service.py`, `practice_expense_service.py`, `risk_prediction_service.py`, `scenario_service.py`, `stoploss_service.py`, `temporal_service.py` (+14 more files with `_pct`/`_fmt_dollar` variants)
**Structural issue:** Shared-code duplication — the same 4-line helpers redefined per file.
**Evidence:** `grep "def _safe_float"` → 9 files. `grep` for safe-coerce/pct/dollar helpers → 23 files. Each redeclares near-identical functions.
**Why it matters:** Not dangerous today, but it signals there is no `utils/` discipline. When rounding rules change (Decimal precision, None→0 vs None→null semantics), there are 9 places to update and they will drift.
**Recommendation:** Create `app/utils/numeric.py` with `safe_float`, `safe_int`, `pct`, `fmt_dollar`, `fmt_pct`. Delete all local redeclarations. One commit, mechanical.

---

### [IMPORTANT] Multi-tenancy is mid-built — schema-per-tenant plus search_path gymnastics, with a foot-gun demo override
**Location:** `backend/app/database.py:36-54` (get_tenant_session), `:71-116` (create_tenant_tables with mutable `table.schema` swap), `backend/app/dependencies.py:58-70`, `backend/app/routers/tuva_router.py:42-63` (_demo_session bypasses auth), `:291` (raw `SET search_path TO demo_mso`).
**Structural issue:** Evolution hazard — tenant isolation depends on (a) always resetting `search_path` on connection return, (b) a global mutable swap of `table.schema` during DDL, and (c) nobody forgetting to use `get_tenant_db`.
**Evidence:**
- `create_tenant_tables` mutates `Base.metadata.sorted_tables[].schema` in place, wrapped in try/finally — one exception in the wrong place leaks schema names into ORM metadata.
- `tuva_router._demo_session` explicitly opens `async_session_factory()` (not tenant-scoped), runs `SET search_path TO demo_mso`, and exposes auth-free read endpoints. The comment block at `tuva_router.py:20-33` warns this must be removed before production.
- A number of routers reach for `async_session_factory` directly (e.g., `tuva_router.py:14`) bypassing `get_tenant_db`.
**Why it matters:** Multi-tenancy is a one-way door: a single cross-tenant read in production is a serious incident. The current pattern puts the correctness contract in every developer's head instead of in the framework.
**Recommendation:** (1) Ban direct `async_session_factory()` calls in routers — make `get_tenant_db` the only legal tenant session source. (2) Tag demo endpoints with a distinct dependency (`get_demo_db`) that requires `DEMO_MODE=true` and a demo-specific tenant name — don't reuse production code paths. (3) Replace the mutable `table.schema` swap in `create_tenant_tables` with a tenant-aware metadata instance, or with Alembic per-schema migrations.
**CROSS:** Adversary (tenant isolation / auth bypass).

---

### [IMPORTANT] dbt/Tuva coupling has no stable contract — callers handle schema variance by string-replacement
**Location:** `backend/app/services/tuva_data_service.py:48-68`, `backend/app/services/tuva_sync_service.py`, `backend/app/routers/tuva_router.py`
**Structural issue:** Data-contract boundary is implicit — FastAPI talks directly to Tuva's marts by hardcoded table names, and when those names differ it guesses.
**Evidence:** `tuva_data_service._query_with_schema_fallback`:
```python
alt_query = query.replace("main_cms_hcc.", "cms_hcc.") \
                 .replace("main_financial_pmpm.", "financial_pmpm.") \
                 ...
```
Any Tuva upgrade that renames or reorganizes marts breaks the platform silently — fallback is to return `[]`. Same in `tuva_sync_service._read_tuva_hcc` with `SELECT … FROM main.cms_hcc__patient_risk_scores`.
**Why it matters:** Tuva is a primary data source per README. A dependency this load-bearing needs a stable contract (even if simple): a view layer inside DuckDB, a view-per-consumer or a small adapter module that owns the mapping, and CI that fails if a Tuva version bump breaks the contract.
**Recommendation:** Define **one module** (`services/tuva/contract.py`) with a function per consumer-needed query. Inside DuckDB create stable views (`aqsoft_patient_risk_scores`, `aqsoft_pmpm`, …) that select from whatever Tuva produces. Callers use the views only. Kill the string-replace fallback.

---

### [IMPORTANT] Frontend loads every page at startup — no route-based code splitting
**Location:** `frontend/src/components/layout/AppShell.tsx:1-54` (imports 48 pages), `:148-200` (Routes)
**Structural issue:** Monolithic bundle — boot cost grows linearly with every new page.
**Evidence:** 48 static `import { XPage } from "../../pages/…"` at the top of AppShell, then mounted in one big `<Routes>` block. No `React.lazy` or dynamic import anywhere in the frontend (grep confirmed).
**Why it matters:** `pages/TuvaPage.tsx` alone is 1,452 lines; `AIPipelinePage.tsx` is 1,262; `SkillsPage.tsx` is 1,039. The JS bundle will be large and every page pays for every other. Demo load time will be first impression for partners — this is one of the visible surfaces.
**Recommendation:** Switch each route to `const TuvaPage = lazy(() => import("../../pages/TuvaPage"))` and wrap `<Routes>` in `<Suspense fallback={…}>`. Trivial refactor, large bundle-size win.

---

### [IMPORTANT] `lib/mockData.ts` is 7,272 lines and `lib/mockApi.ts` is 2,094 lines — demo mode is half the frontend codebase
**Location:** `frontend/src/lib/mockData.ts` (7,272 LOC), `frontend/src/lib/mockApi.ts` (2,094 LOC)
**Structural issue:** Demo fixtures have no internal structure — one giant file imported via a 100+ name barrel.
**Evidence:** `mockApi.ts` starts with a 119-line named-import list from `mockData.ts`. Every new demo scenario adds another top-level export.
**Why it matters:** (1) TypeScript checker and Vite both have to parse 9k lines on every cold build. (2) A mock response drifting from the real API response shape is invisible — there is no shared type. (3) Demo mode is the thing partners see; it must not rot.
**Recommendation:** Shard `mockData.ts` into `mockData/dashboard.ts`, `mockData/hcc.ts`, `mockData/financial.ts` … (matches page taxonomy). Have `mockApi.ts` import from those. Generate mock shapes from backend Pydantic schemas (e.g., via OpenAPI codegen) so drift becomes a compile error. **CROSS:** Contractualist (API ↔ mock drift).

---

### [IMPORTANT] Service-style is inconsistent — module-level async functions for ~70 services, classes for 3 Tuva services
**Location:** `services/tuva_runner_service.py:20` (class TuvaRunnerService), `services/tuva_sync_service.py:26` (class TuvaSyncService), `services/tuva_export_service.py:35` (class TuvaExportService) — every other service is a file of `async def` functions taking `db: AsyncSession`.
**Structural issue:** Style drift — two conventions for the same kind of component with no documented reason.
**Evidence:** `grep "^class \w+Service"` returns exactly 3 matches, all Tuva-related. All other services (`boi_service`, `awv_service`, `hcc_engine`, etc.) are function modules.
**Why it matters:** New engineer doesn't know whether to write a class. DI and testability differ between the two shapes. Session lifecycle also differs — `TuvaExportService` owns a DuckDB connection; function-style services get the session injected.
**Recommendation:** Pick one. Function-style is already the overwhelming majority and fits FastAPI idioms; keep it. Convert the three Tuva classes to module-level functions with an explicit `connection` parameter, or document why those three need object lifetime (they do — they own DuckDB connections) and formalize with a single `TuvaConnection` context manager.

---

### [IMPORTANT] Router auth/session pattern is repeated in every endpoint — no shared `TenantRouter` abstraction
**Location:** Every endpoint, e.g., `routers/hcc.py:147-161`, `routers/care_gaps.py`, `routers/members.py`, etc.
**Structural issue:** Missing cross-cutting abstraction — same 3-dep signature on every endpoint.
**Evidence:** The pattern
```python
async def list_suspects(
    ...
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
```
appears in hundreds of endpoints. `get_current_user` is already a transitive dependency of `get_tenant_db`.
**Why it matters:** (1) Adding org-level audit logging, or request-scoped tenant context, requires touching every endpoint. (2) Easy to forget the pair and accidentally get an unauthenticated endpoint (see `tuva_router.py` for the example of what goes wrong).
**Recommendation:** Create a `TenantRouter` subclass or a `Depends(tenant_context)` that returns a single `ctx` object (`ctx.user`, `ctx.db`, `ctx.tenant_schema`). Endpoints take one dep instead of two. Audit logging and rate limiting become one-line additions in the context dependency.

---

### [IMPORTANT] Workers (`backend/app/workers/`) are thin shells — unclear whether async queue is pulling its weight
**Location:** `backend/app/workers/` — ingestion_worker.py, hcc_worker.py, insight_worker.py, tuva_worker.py (4 files), `docker-compose.yml:30-58` (3 worker containers)
**Structural issue:** Boundary count — 3 worker processes for a system that hasn't yet faced real throughput.
**Evidence:** `docker-compose.yml` runs three independent arq worker containers. Each pulls from the same Redis queue. Code-wise all four worker modules share the same app image.
**Why it matters:** Three worker processes vs. one means 3× the baseline memory, 3× the cold-start complexity, 3× the ops surface, for zero isolation benefit (same image, same DB credentials). A single `arq` worker with multiple queues is the MEDIUM-tier choice.
**Recommendation:** Collapse to one worker container that handles `ingestion`, `hcc`, `insight`, `tuva` queues. Split only when a specific queue's workload actually requires isolation (and measure before splitting).

---

### [IMPORTANT] Frontend global filter leaks through `localStorage` side channel — framework-level state hidden in strings
**Location:** `frontend/src/lib/api.ts:21-31`, `frontend/src/lib/filterContext.tsx`
**Structural issue:** Control flow / state hidden in storage — axios interceptor reads `localStorage.getItem("global_filter_group_id")` on every request.
**Evidence:**
```ts
api.interceptors.request.use((config) => {
  const groupId = localStorage.getItem("global_filter_group_id");
  const providerId = localStorage.getItem("global_filter_provider_id");
  if (groupId || providerId) { config.params = config.params || {}; … }
});
```
And `FilterProvider` in `filterContext.tsx` (124 lines) is the formal context — but the effective source of truth is localStorage.
**Why it matters:** Two filter states exist: React context (what components render from) and localStorage (what network requests use). They can drift — e.g., during tab switches, logout cleanup, or demo role switches. Tests can't intercept filter changes without mocking localStorage.
**Recommendation:** Hold filter state in context, pass it explicitly to a tiny `apiWithFilter` wrapper, drop the interceptor. Or bind the interceptor to an in-memory singleton populated by `FilterProvider` — same effect, no cross-tab stealth sharing.

---

### [IMPORTANT] Frontend pages are 1000+ line monoliths — no component extraction
**Location:** `frontend/src/pages/TuvaPage.tsx` (1,452), `AIPipelinePage.tsx` (1,262), `SkillsPage.tsx` (1,039), `DataProtectionPage.tsx` (945), `DataManagementPage.tsx` (913), `InterfacesPage.tsx` (851), `DataQualityPage.tsx` (818). Many more in 500-800 range.
**Structural issue:** Pages are doing too much — state + data fetching + layout + subcomponents all in one file.
**Evidence:** Top 7 pages total 7,280 lines. By contrast, `components/` has a layout/ directory with 3 files and per-feature subdirectories that suggest extraction is *possible* but inconsistently done.
**Why it matters:** Page-level changes collide on merges. A second developer cannot work on the same page. Testability is limited. Visual consistency drifts because each page re-invents layouts inline.
**Recommendation:** For each page > 600 lines, extract: (1) data-fetch hook (`useTuvaData`), (2) table/chart subcomponents into `components/<feature>/`, (3) modal/drawer dialogs. Do it page-by-page as you touch them, not as a big-bang refactor.

---

### [MINOR] Feature-flag-like demo mode is scattered across frontend and backend — no single source of truth
**Location:** `frontend/src/lib/auth.tsx:32-47` (isDemoMode with 5 hostname allow-listed patterns + env var + URL param + localStorage); `backend/app/routers/tuva_router.py:36-39` (DEMO_MODE env var); `backend/app/main.py:21-26` (ALLOW_DEFAULT_SECRET)
**Structural issue:** Feature-flag system is informal — 3 different ways to enable demo behavior.
**Evidence:** Frontend: `VITE_DEMO_ENABLED=true` OR `localhost` OR `*.github.io` OR `aqhealth.ai` OR `*.pages.dev` OR `?demo=true` query OR `demo_mode` in localStorage. Backend: `DEMO_MODE=true`. They can disagree.
**Why it matters:** A partner visits the staging URL, demo frontend flips on, backend in production mode 503s the demo endpoints. Or worse, frontend thinks it's demo and backend is not, exposing real data under demo banner.
**Recommendation:** Put demo allow-list in one backend-served config (`/api/config`). Frontend reads once at boot. Remove hostname heuristics. **CROSS:** Adversary (demo/real-data boundary).

---

### [MINOR] Backend `utils/` is nearly empty for the size of the codebase
**Location:** `backend/app/utils/` — only `pagination.py` and `tin.py`.
**Structural issue:** Missing shared-code home — helpers migrate to services instead.
**Evidence:** See duplicated `_safe_float`/`_pct`/`_fmt_dollar` spread across 9-23 files. Soundex inside `entity_resolution_service.py`. NPI validation in `org_discovery_service.py`. Multiple `_safe_get` HL7 helpers in `interface_service.py`. Any of these could be generally useful.
**Why it matters:** Symptom of finding #6 — absence of a utilities discipline. With a real utils package, duplication is visibly redundant rather than invisibly spread.
**Recommendation:** Add `utils/numeric.py`, `utils/hl7.py`, `utils/code_validation.py` (ICD/CPT/NPI/DRG patterns, currently re-declared in `data_quality_service.py`). Move on first sighting of the duplicate.

---

### [MINOR] `services/common_column_aliases.py` is a 775-line static dictionary — treat as data, not code
**Location:** `backend/app/services/common_column_aliases.py`
**Structural issue:** Static reference data is conflating with code — grows unbounded and changes frequently by non-developers.
**Evidence:** The file is a single dict of column name aliases across member/provider/claim/pharmacy entities. Adding a new payer means editing a Python file.
**Why it matters:** Any time reference data lives in Python, domain experts can't update it without a PR. This file is guaranteed to grow as new payer sources are onboarded (Pinellas/Pasco/Miami-Dade each will bring their own column names).
**Recommendation:** Move to JSON/YAML in `backend/app/data/column_aliases.yaml`. Services load on startup. The "save as template" flow in `ingestion.py:409-423` already suggests this should live in a tenant-editable store in PostgreSQL — do that instead.

---

## Cross-cutting themes

1. **Too many named things.** 73 services, 57 routers, 48 pages — but only ~12 coherent domain areas (revenue, clinical, cost, quality, network, data, operations, admin). The sidebar/roleAccess code already knows the taxonomy; the backend should mirror it.
2. **Router-as-service and service-as-anything.** The line between "endpoint" and "business logic" is not drawn anywhere, so it's drawn everywhere, differently.
3. **Implicit contracts everywhere.** Tuva schema, demo mode, mock data, tenant session — each has a correctness contract held in developer memory rather than in types or tests.
4. **Actual architecture is simpler than the docs suggest.** One monolith + three workers + one external HTTP service + one dbt warehouse. Own that honestly. It's a fine architecture for this stage.

## What to do first (if ranking)

1. **Fix schema evolution (Alembic)** — necessary before real customer data lands (Finding 5).
2. **Extract business logic from top 5 routers** (Finding 1) — unblocks everything else.
3. **Consolidate ingestion services** (Finding 2) — biggest area of confused ownership.
4. **Tenant session discipline** (Finding 7) — correctness / security foundation.
5. **Stable Tuva contract** (Finding 8) — decouple from upstream dbt churn.

---

## VERDICT: REQUEST CHANGES

The architecture is coherent *in intent* but not *in enforcement*. The code has grown faster than its boundaries, and several foundational mechanisms (migrations, tenant isolation, routing pattern, Tuva contract) are held together by convention rather than structure. None of this is fatal — the same team that wrote 37k lines of services in a few months can consolidate them with a few weeks of disciplined refactoring. The priority is to stop the growth of the current patterns (more routers, more services, more mock fixtures, more ad-hoc DDL) before they ossify, and to make Alembic + tenant-session + thin-router the enforced defaults before the first real customer tenant lands.
