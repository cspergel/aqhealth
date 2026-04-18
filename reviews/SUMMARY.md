# Codebase Review — Cross-Agent Summary

Five forgeplan review agents (Adversary, Contractualist, Pathfinder, Skeptic, Structuralist) reviewed the full codebase in parallel on Opus.

## Headline

**Aggregate verdict: REQUEST CHANGES / NEEDS WORK.** All five agents returned non-approval.

| Agent | Total | CRITICAL | IMPORTANT | MINOR | Verdict |
|---|---|---|---|---|---|
| Adversary | 22 | 3 | 13 | 6 | REQUEST CHANGES |
| Contractualist | 21 | 5 | 8 | 8 | REQUEST CHANGES |
| Pathfinder | 21 | 4 | 9 | 6 | REQUEST CHANGES |
| Skeptic | 24 | 5 | 13 | 6 | NEEDS WORK |
| Structuralist | 18 | 5 | 10 | 3 | REQUEST CHANGES |
| **Total** | **106** | **22** | **53** | **29** | |

## Convergent findings (multiple agents flagged the same issue)

These are the highest-confidence issues — hit the top of any fix list.

1. **Auth gaps + DEMO_MODE PHI leak** — Adversary (CRITICAL: Tuva router auth bypass when `DEMO_MODE=true`, frontend-only RBAC on ~48 routers), Skeptic (CRITICAL: unauthenticated `/api/tuva/process-note`), Structuralist (5+ demo-mode activation paths that can disagree).
2. **Alembic wired but `versions/` empty** — Structuralist (CRITICAL), Skeptic (CRITICAL). `create_all()` at startup + ad-hoc ALTER patches. First real-tenant schema migration will lose data.
3. **Demo-mode fragility** — Pathfinder (CRITICAL: `/api/ingestion/*` mocks missing, TuvaPage raw `fetch()` bypasses adapter), Skeptic (CRITICAL: `api.defaults.adapter` globally mutated, no disable path), Structuralist (5+ activation paths).
4. **Router↔service shape drift** — Contractualist (CRITICAL: dashboard returns zeros, members 500s on null columns, `/api/journey/members` doesn't exist), Pathfinder (silent failures), Structuralist (business logic embedded in routers with 120 SQLAlchemy queries in router files).
5. **Tuva schema string-replace hack** — Contractualist and Structuralist both cite `services/tuva_data_service.py:48-68` where `.replace("main_cms_hcc.", "cms_hcc.")` papers over schema variance.
6. **Prompt-injection / LLM trust gaps** — Adversary (`corrected_answer` injected as "RULES the AI MUST obey," no defense on clinical notes fed to Claude), Skeptic (`validate_llm_output` whitelists "estimated" as non-hedging; `auto_extract_icd10_codes` assigns confidence 95 to any regex match).
7. **Stubs shipped as production** — Skeptic (6 skill actions returning `{"status": "not_implemented"}`), Structuralist (monolith claiming microservices), plus the pre-existing 11-item catalog in `project_stubs_and_incomplete.md`.

## Unique but high-impact CRITICALs

- **Adversary:** Payer OAuth creds "encrypted" only with base64 (`payer_api_service.py:157-172`) — DB dump compromises every connected payer.
- **Skeptic:** Recapture detection depends on prior-year *suspects* not *claims* (`hcc_engine.py:640-687`) — day-1 tenants with 2 years of history get `[]`.
- **Contractualist:** `/api/ingestion/upload` response has three independent shape mismatches vs the frontend; `JourneyPage.tsx:90` calls an endpoint that doesn't exist.
- **Pathfinder:** HCC suspect capture/dismiss has a literal `// silently fail` comment — core user action never surfaces errors.
- **Structuralist:** "Microservices" claim is aspirational — Health Platform is a FastAPI monolith + 3 same-image workers; only SNF Admit Assist is truly external.

## Hot-spot files (flagged by 2+ agents)

- `backend/app/routers/tuva_router.py` — auth bypass (Adversary), unauth LLM endpoint (Skeptic), business logic in router (Structuralist)
- `backend/app/services/tuva_data_service.py` — schema string-replace (Contractualist, Structuralist)
- `backend/app/services/hcc_engine.py` — confidence scoring (Skeptic), recapture logic (Skeptic)
- `backend/app/routers/ingestion.py` — shape drift (Contractualist), no mocks (Pathfinder), sharded services (Structuralist)
- `frontend/src/lib/mockApi.ts`, `mockData.ts` — adapter mutation (Skeptic), missing mocks (Pathfinder), 7,272 LOC (Structuralist), filter drift (Contractualist)
- `backend/app/database.py` + `backend/alembic/versions/` — empty migrations (Skeptic, Structuralist)

## Highest-leverage fixes (what to do first)

1. **Close the auth gaps.** Add `require_role` to the 48 routers that don't have it. Remove `DEMO_MODE=true` auth bypass in Tuva router. Authenticate `/api/tuva/process-note`.
2. **Encrypt payer OAuth tokens for real.** Base64 is not encryption. Use a KMS-backed key.
3. **Wire the first Alembic migration.** Before any real-tenant data lands. Stop using `create_all()` + ALTER patches.
4. **Generate frontend types from `/api/openapi.json`.** Single biggest lever against the router↔service↔frontend shape drift the Contractualist catalogued.
5. **Fix the demo:** add the missing `/api/ingestion/*` and `/api/onboarding/discover-structure` mock handlers; route TuvaPage through the adapter instead of raw `fetch`; make `disableDemoMode()` work.
6. **Fix HCC recapture** to read prior-year claims, not prior-year suspects.
7. **Move router SQL into services.** Routers should orchestrate, not query.

## Per-agent detail

Full findings with file:line evidence:
- `reviews/adversary.md`
- `reviews/contractualist.md`
- `reviews/pathfinder.md`
- `reviews/skeptic.md`
- `reviews/structuralist.md`
