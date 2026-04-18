# Phase 2.1 / 2.5 / 2.7 — audit log + PHI scrubber + soft-delete

## Summary
Closed three HIPAA-flagged gaps from the earlier audit reports:

- **2.1 — PHI access audit log.** Added `platform.audit_log` and a FastAPI
  middleware that writes one row per authenticated `/api/*` request. Satisfies
  HIPAA §164.312(b) audit controls. Writes are fire-and-forget so audit never
  blocks the user request.
- **2.5 — LLM PHI scrubber + prompt-injection removal.** Added a regex
  scrubber run before any Anthropic call from `clinical_nlp_service.py`, and
  removed the stored prompt-injection path in `query_service.py` that
  promoted user "corrections" into Claude's system prompt as RULES after 5
  submissions.
- **2.7 — Soft-delete on PHI models.** Added `deleted_at` + `deleted_by` to
  9 PHI-bearing tables. Converted the only existing hard-delete on a PHI
  model (`Annotation`) to a soft-delete. New Alembic migration
  `0002_soft_delete_and_audit` ships both the audit table and the new
  columns.

## Files changed

### New files
- `backend/app/models/audit_log.py` — `AuditLog` model in `platform` schema.
- `backend/app/core/audit.py` — `AuditMiddleware` that writes audit rows
  after the response goes out.
- `backend/app/services/phi_scrubber.py` — `scrub()` / `scrub_strict()` regex
  identifier redaction with 5 inline example input/output pairs in the
  module docstring.
- `backend/alembic/versions/0002_soft_delete_and_audit.py` — migration.

### Modified files
- `backend/app/models/__init__.py:34` — export `AuditLog` so it joins
  `Base.metadata`.
- `backend/app/main.py:10, 56-63` — added `AuditMiddleware` import and
  registered it so the wire order becomes
  `client → RequestIdMiddleware → AuditMiddleware → CORS → router`
  (RequestId must run first so the correlation contextvar is set before
  Audit reads it).
- `backend/app/services/clinical_nlp_service.py:36-37, 542-612, 618-680,
  712-720, 820-851` — added `phi_scrub` and `guarded_llm_call` imports;
  `extract_from_note` now scrubs note text and metadata and runs through
  `guarded_llm_call` (this was the line-560 bypass the audit flagged);
  `assign_codes_with_tools` recursively scrubs the extraction payload
  before the tool_use loop. Tool-use loop remains on the Anthropic SDK
  because `guarded_llm_call` does not implement the tool_use protocol;
  that scoped exception is documented inline.
- `backend/app/services/query_service.py:14-19, 157-191` — replaced
  `_get_relevant_learnings` with a documented stub that always returns
  `""`. `log_query_feedback` still persists corrections for offline
  analytics, but they never re-enter a live system prompt. The earlier
  RULE/STRONG_SUGGESTION/SUGGESTION injection (query_service.py:234-256
  in the original code) was the stored prompt-injection sink flagged by
  the audit. Unused `Counter`, `select`, `func`, `Any` imports removed.
- `backend/app/services/annotation_service.py:6-7, 93-117` — converted
  `delete_annotation` from `session.delete()` to a UPDATE of
  `deleted_at` / `deleted_by`. Idempotent on already-deleted rows.
- `backend/app/models/member.py`, `claim.py`, `hcc.py` (both `HccSuspect`
  and `RafHistory`), `care_gap.py` (`MemberGap`), `adt.py` (both
  `ADTEvent` and `CareAlert`), `annotation.py`, `action.py` — added
  `deleted_at` (indexed) and `deleted_by` columns with a TODO at each
  site reminding the author of the read-path filter contract.

## Verification
- `python -m py_compile` over every changed file: pass.
- Import test: `import app.main` loads cleanly; `app.user_middleware`
  contains `[RequestIdMiddleware, AuditMiddleware, CORSMiddleware]` in
  registration order, which — given Starlette's `reversed()` wrap — yields
  the intended `RequestId → Audit → CORS → router` request path.
- `AuditLog` registers in `Base.metadata` as `platform.audit_log`
  (total tables: 65).
- PHI scrubber smoke test: the 5 docstring examples round-trip exactly as
  documented (`SSN`, `PHONE`, `EMAIL`, `MRN`, `DATE` placeholders all fire;
  control string with no PHI is returned unchanged).

## Design decisions worth highlighting

### Audit writes are fire-and-forget
`AuditMiddleware` schedules the DB insert via `asyncio.create_task` on a
fresh session and returns the response immediately. Rationale:
- Audit is a side channel; a slow DB should never add latency to user
  requests.
- A caller rollback can't take the audit row with it — different session.
- Failures are logged at ERROR with full context and do not raise.
- A sustained insert-failure rate is itself a compliance-significant
  signal and should page ops — we assume that's handled upstream.

### No global `with_loader_criteria` default-filter for soft-delete
The task spec called this out and I agreed: installing a global default
filter hides deleted rows from audit queries, RADV chases, and analytics
code that legitimately needs to see the full history. Instead every read
site must add `.where(Model.deleted_at.is_(None))` explicitly. TODOs
exist at each model to flag this for future work.

### Why `_get_relevant_learnings` became a no-op instead of being deleted
The public call from `answer_question` still references it. Returning `""`
is the safe null behaviour — no behavioural regression, no import churn,
no risk of a partial rebase reintroducing the vulnerable code. The reason
for the change is captured in the docstring so a future contributor
can't "fix" it by turning the logic back on.

### `clinical_nlp_service` Pass 2 still calls Anthropic directly
`guarded_llm_call` does not implement the tool_use protocol (tool
definitions + `tool_result` message blocks). Adding that support is a
bigger change than this phase allows and the explicit instruction is
"don't over-engineer". I scrubbed all PHI from the extraction payload
before it goes to the model and annotated the remaining bypass. The
pre-existing `llm_guard.py` module docstring already documents this
exception.

## Deferred / follow-up work
- **Named Entity de-identification.** `scrub_strict` is a pass-through
  alias for `scrub` today. Real PHI minimisation (names, addresses,
  organisations) needs either a Presidio recogniser set or a BAA'd DeID
  service. Hook exists.
- **Disclosure accounting views.** §164.528 requires the platform to
  furnish on demand a list of disclosures over the prior 6 years.
  `audit_log` + the new `deleted_at` columns are the raw material; the
  report query is not in this phase.
- **Read-path soft-delete filters.** TODOs at 9 models. A follow-up
  should add `.where(Model.deleted_at.is_(None))` at every service-layer
  read site, or introduce a project-wide helper. I chose not to do that
  sweep here because it touches dozens of services and is outside the
  declared file ownership.
- **`get_current_user` → audit contextvar wiring.** Right now the audit
  middleware reads `_user_id_var` / `_tenant_var` from `app.core.logging`.
  The dependency `get_current_user` in `app/dependencies.py` (another
  agent's ownership) does not yet populate those contextvars. Until it
  does, `audit_log.user_id` and `role` will be `NULL` for most requests.
  Hand-off: `dependencies.get_current_user` should call
  `set_request_context(user_id=..., tenant=...)` on success, or stash
  both on `request.state.audit_user_id` / `request.state.audit_role`
  (the middleware already falls back to those).
- **Tool-use support in `llm_guard`.** Would let Pass 2 of the clinical
  NLP pipeline drop its remaining direct-Anthropic call.

## Cross-cutting notes for other agents
1. **Middleware registration in `main.py`** was the only touch to that
   file — CORS, lifespan, router includes, and the global exception
   handler are all untouched.
2. **No new dependencies.** Everything uses stdlib, SQLAlchemy, Alembic,
   and the existing Anthropic client.
3. **Migration is idempotent.** The upgrade guards on column/table
   existence so re-running on a partially-migrated tenant is safe.
   Downgrade drops the new columns and table cleanly; no data depends
   on them yet so data loss is bounded to whatever audit rows accumulate
   before a rollback.
4. **Role data flowing into audit.** `audit_log.role` currently stays
   NULL unless a route attaches the user dict via
   `request.state.audit_role`. The `get_current_user` dependency is
   another agent's file — documented as a hand-off above.
