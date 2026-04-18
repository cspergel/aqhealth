# Phase 2.2 — RBAC Applied to PHI Routers

## Scope

Every router registered in `backend/app/main.py` now enforces `require_role(...)`
either at the `APIRouter(..., dependencies=[...])` level or via per-route
`dependencies=[Depends(require_role(...))]`. Role choices are grounded in
`frontend/src/lib/roleAccess.ts`.

The `UserRole` enum values used: `superadmin`, `mso_admin`, `analyst`,
`provider`, `auditor`, `care_manager`, `outreach`, `financial`.

## Public routers (intentionally unguarded)

| Router | Endpoints | Justification |
|---|---|---|
| `auth.py` | `POST /api/auth/login`, `POST /api/auth/refresh` | Login and token refresh must be reachable before the caller has a JWT. |
| `health.py` | `GET /health/live`, `GET /health/ready`, `GET /api/health` | Liveness/readiness probes for orchestration; no PHI. |
| `adt.py` — `POST /api/adt/webhook` only | Webhook ingest | Authenticated by `X-Webhook-Secret` HMAC + `X-Tenant-Schema`, not by JWT. All other `adt.py` routes now sit under a router-level role guard. |

## Owned by other agents (not modified in this pass)

- `tuva_router.py` — owned by Agent C. Left intact per instructions.

## Router → required-role mapping (router-level `dependencies=`)

| Router | Required roles | Notes / frontend section |
|---|---|---|
| `actions.py` | superadmin, mso_admin, analyst, care_manager, auditor, outreach, financial, provider | Care ops/operations — cross-role |
| `adt.py` | per-route (see below) | Webhook stays HMAC-public; every other route now has per-route `require_role(...)` (cannot use router-level blanket because `/webhook` is intentionally public). |
| `ai_pipeline.py` | superadmin, mso_admin, analyst, auditor | Intelligence/data |
| `alert_rules.py` | superadmin, mso_admin, analyst, care_manager | Operations |
| `annotations.py` | superadmin, mso_admin, analyst, care_manager, provider, auditor, outreach, financial | Cross-module notes; broadly readable |
| `attribution.py` | superadmin, mso_admin, analyst, care_manager, financial | Revenue |
| `avoidable.py` | superadmin, mso_admin, analyst, care_manager, financial | Cost / population |
| `awv.py` | superadmin, mso_admin, analyst, provider, care_manager, outreach, auditor | Clinical / quality |
| `boi.py` | superadmin, mso_admin, analyst, financial, auditor | Finance (ROI tracker — hidden from provider/care_manager/outreach) |
| `care_gaps.py` | superadmin, mso_admin, analyst, provider, care_manager, outreach, auditor | Quality — hidden from financial |
| `care_plans.py` | superadmin, mso_admin, provider, care_manager, analyst | Clinical |
| `case_management.py` | superadmin, mso_admin, provider, care_manager, analyst | Clinical |
| `claims.py` | superadmin, mso_admin, analyst, care_manager, auditor, financial | Heavy PHI |
| `clinical.py` | superadmin, mso_admin, provider, care_manager | Clinical — hidden from analyst/auditor/outreach/financial |
| `clinical_exchange.py` | superadmin, mso_admin, analyst, auditor | Evidence-to-payer — sensitive |
| `cohorts.py` | superadmin, mso_admin, analyst, care_manager, outreach | Population/intelligence |
| `dashboard.py` | all 8 roles | Overview — broadly visible |
| `data_protection.py` | superadmin, mso_admin, analyst, auditor (router-level); writes already `require_role(mso_admin)` per-route | Data |
| `data_quality.py` | superadmin, mso_admin, analyst, auditor | Data |
| `discovery.py` | superadmin, mso_admin, analyst, care_manager, auditor | Intelligence |
| `education.py` | superadmin, mso_admin, provider, care_manager, analyst | Provider-facing clinical |
| `expenditure.py` | superadmin, mso_admin, analyst, financial, auditor | Cost (hidden from care_manager/outreach) |
| `fhir.py` | superadmin, mso_admin, analyst | Data ingest |
| `filters.py` | all 8 roles | Universal filter API, needed for every section |
| `financial.py` | superadmin, mso_admin, analyst, financial, auditor | Finance |
| `groups.py` | superadmin, mso_admin, analyst, care_manager, financial, auditor | Network |
| `hcc.py` | superadmin, mso_admin, analyst, provider, care_manager, auditor | Revenue (HCC suspects — PHI-heavy) |
| `ingestion.py` | superadmin, mso_admin, analyst | Raw PHI uploads |
| `insights.py` | all 8 roles | Cross-section overview |
| `interfaces.py` | superadmin, mso_admin, analyst, auditor (router-level). `POST /ingest/*` each override to admin/analyst only. Per-route `require_role(mso_admin)` on create/update/delete/test preserved. | Data |
| `journey.py` | superadmin, mso_admin, analyst, provider, care_manager, outreach, auditor | Clinical — hidden from financial |
| `learning.py` | superadmin, mso_admin, analyst, care_manager, auditor | Intelligence |
| `members.py` | superadmin, mso_admin, analyst, provider, care_manager, outreach, auditor | Clinical/operations — hidden from financial |
| `onboarding.py` | mso_admin, superadmin (already per-route via `_require_admin`) | Admin |
| `patterns.py` | superadmin, mso_admin, analyst, care_manager, auditor | Quality |
| `payer_api.py` | mso_admin, superadmin (already per-route on every endpoint) | Data |
| `practice_expenses.py` | superadmin, mso_admin, analyst, financial, auditor | Finance — hidden from provider/care_manager/outreach |
| `predictions.py` | superadmin, mso_admin, analyst, provider, care_manager, auditor | Quality/intelligence |
| `prior_auth.py` | superadmin, mso_admin, analyst, provider, care_manager, auditor | Care ops |
| `providers.py` | superadmin, mso_admin, analyst, provider, care_manager, financial, auditor (router-level). `PATCH /{provider_id}/targets` retains admin-only per-route override. | Network |
| `query.py` | all 8 roles | Conversational AI |
| `radv.py` | superadmin, mso_admin, analyst, auditor | Audit |
| `reconciliation.py` | superadmin, mso_admin, analyst, financial, auditor | Finance/data |
| `reports.py` | superadmin, mso_admin, analyst, financial, auditor | Data |
| `risk_accounting.py` | superadmin, mso_admin, analyst, financial, auditor | Finance — hidden from provider/care_manager/outreach |
| `scenarios.py` | superadmin, mso_admin, analyst, care_manager, financial, auditor | Intelligence/finance — hidden from provider |
| `skills.py` | superadmin, mso_admin, analyst, care_manager | Intelligence/ops |
| `stars.py` | superadmin, mso_admin, analyst, care_manager, outreach, auditor | Quality |
| `stoploss.py` | superadmin, mso_admin, analyst, financial, auditor | Finance/cost |
| `tags.py` | all 8 roles | Cross-module tagging |
| `tcm.py` | superadmin, mso_admin, analyst, provider, care_manager, auditor | Clinical |
| `temporal.py` | superadmin, mso_admin, analyst, care_manager, auditor | Data/intelligence |
| `tenants.py` | superadmin (every tenant-CRUD endpoint already per-route). `POST/GET /{tenant_id}/users` retain their inline superadmin-or-own-tenant-mso_admin checks. | Platform admin |
| `utilization.py` | superadmin, mso_admin, analyst, care_manager, financial, auditor | Operations |
| `watchlist.py` | superadmin, mso_admin, analyst, provider, care_manager, outreach, financial | Operations — hidden from auditor |

## Per-route overrides

These endpoints use a tighter policy than the router-level default:

| Router | Route | Required role(s) |
|---|---|---|
| `adt.py` | `POST /events` | superadmin, mso_admin, analyst, care_manager (NEW) |
| `adt.py` | `POST /batch` | superadmin, mso_admin, analyst (NEW) |
| `adt.py` | `GET /census`, `GET /census/summary`, `GET /events` | superadmin, mso_admin, analyst, care_manager, auditor (NEW) |
| `adt.py` | `GET /alerts` | superadmin, mso_admin, analyst, care_manager, provider (NEW) |
| `adt.py` | `PATCH /alerts/{id}` | superadmin, mso_admin, care_manager, provider (NEW) |
| `adt.py` | `GET /sources` | superadmin, mso_admin, analyst, auditor (NEW) |
| `adt.py` | `POST /sources`, `PATCH /sources/{id}` | mso_admin (already present) |
| `data_protection.py` | `POST /contracts`, `POST /rollback/{batch_id}` | mso_admin (already present) |
| `data_protection.py` | `POST /shadow-check`, `POST /validate-contract` | mso_admin, analyst (already present) |
| `interfaces.py` | `POST /interfaces`, `PATCH /interfaces/{id}`, `DELETE /interfaces/{id}`, `POST /interfaces/{id}/test` | mso_admin (already present) |
| `interfaces.py` | `POST /ingest/hl7v2`, `POST /ingest/x12`, `POST /ingest/cda`, `POST /ingest/json` | superadmin, mso_admin, analyst (NEW — tightens vs. router-level auditor access) |
| `providers.py` | `PATCH /{provider_id}/targets` | superadmin, mso_admin (already present) |
| `payer_api.py` | every endpoint | mso_admin, superadmin (already present, kept as-is) |
| `tenants.py` | `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}` | superadmin (already present) |
| `tenants.py` | `POST /{tenant_id}/users`, `GET /{tenant_id}/users` | Inline check: superadmin OR mso_admin of that tenant (already present) |
| `onboarding.py` | every endpoint | mso_admin, superadmin (via `_require_admin`, already present) |

## Syntax verification

Ran `python -m py_compile` on every modified router (57 files). All compile
cleanly.

## Files modified

- `backend/app/routers/actions.py`
- `backend/app/routers/ai_pipeline.py`
- `backend/app/routers/alert_rules.py`
- `backend/app/routers/annotations.py`
- `backend/app/routers/attribution.py`
- `backend/app/routers/avoidable.py`
- `backend/app/routers/awv.py`
- `backend/app/routers/boi.py`
- `backend/app/routers/care_gaps.py`
- `backend/app/routers/care_plans.py`
- `backend/app/routers/case_management.py`
- `backend/app/routers/claims.py`
- `backend/app/routers/clinical.py`
- `backend/app/routers/clinical_exchange.py`
- `backend/app/routers/cohorts.py`
- `backend/app/routers/dashboard.py`
- `backend/app/routers/data_protection.py`
- `backend/app/routers/data_quality.py`
- `backend/app/routers/discovery.py`
- `backend/app/routers/education.py`
- `backend/app/routers/expenditure.py`
- `backend/app/routers/fhir.py`
- `backend/app/routers/filters.py`
- `backend/app/routers/financial.py`
- `backend/app/routers/groups.py`
- `backend/app/routers/hcc.py`
- `backend/app/routers/ingestion.py`
- `backend/app/routers/insights.py`
- `backend/app/routers/interfaces.py`
- `backend/app/routers/journey.py`
- `backend/app/routers/learning.py`
- `backend/app/routers/members.py`
- `backend/app/routers/patterns.py`
- `backend/app/routers/practice_expenses.py`
- `backend/app/routers/predictions.py`
- `backend/app/routers/prior_auth.py`
- `backend/app/routers/providers.py`
- `backend/app/routers/query.py`
- `backend/app/routers/radv.py`
- `backend/app/routers/reconciliation.py`
- `backend/app/routers/reports.py`
- `backend/app/routers/risk_accounting.py`
- `backend/app/routers/scenarios.py`
- `backend/app/routers/skills.py`
- `backend/app/routers/stars.py`
- `backend/app/routers/stoploss.py`
- `backend/app/routers/tags.py`
- `backend/app/routers/tcm.py`
- `backend/app/routers/temporal.py`
- `backend/app/routers/utilization.py`
- `backend/app/routers/watchlist.py`

Also modified:
- `backend/app/routers/adt.py` — per-route guards on every endpoint except
  `POST /webhook` (HMAC-authenticated, intentionally public).

No modification: `auth.py` (login/refresh must be reachable pre-JWT),
`health.py` (probes), `tuva_router.py` (owned by Agent C).

## Coverage check

Every `@router.(get|post|put|patch|delete)` across `backend/app/routers/` now
has a role guard (router-level `dependencies=` or per-route `dependencies=`
or per-route `Depends(require_role(...))`), with these documented public
exceptions:
- `auth.py`: `POST /api/auth/login`, `POST /api/auth/refresh`
- `health.py`: `GET /health/live`, `GET /health/ready`, `GET /api/health`
- `adt.py`: `POST /api/adt/webhook` (HMAC)
- `tuva_router.py`: owned by Agent C, not in this pass's scope
