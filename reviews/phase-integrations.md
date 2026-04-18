# Phase Integrations — Completion Summary

Closes the six "integration completion" issues called out in
`reviews/readiness-external-apis.md` (B6, B7, B9, I7, I9) plus the related
"Observation/Encounter/Procedure silently skipped" and "FHIR bundle
accepted without schema validation" gaps.

## 1. FHIR Observation / Encounter / Procedure ingest — B9, stub catalog

### What changed
- `backend/app/services/fhir_service.py`
  - `RESOURCE_HANDLERS` now points `Observation`, `Encounter`, `Procedure`
    at real handlers (no more `None` silent-skip).
  - `_ingest_encounter`: infers `service_category` from
    `Encounter.class.code` via the HL7 v3-ActCode map
    (AMB -> professional, EMER -> ed_observation, IMP -> inpatient, HH ->
    home_health, etc.), writes a signal-tier `Claim` with
    `signal_source='fhir_encounter'`, computes LOS when period.start and
    period.end are both present.
  - `_ingest_observation`: writes a signal-tier `Claim` with
    `signal_source='fhir_observation'`, stores the coding (LOINC pref),
    the value choice (`valueQuantity | valueString | valueCodeableConcept
    | valueBoolean | valueInteger`), and the effective date into
    `Claim.extra` as structured JSON so downstream services can use it
    without a new model.
  - `_ingest_procedure`: writes a signal-tier `Claim` with
    `signal_source='fhir_procedure'` and `procedure_code` set from the
    first coding. `reasonCode` values (when short enough) land on
    `diagnosis_codes`.
  - `get_capability_statement()` automatically picks up the newly-active
    handlers so `/api/fhir/capability` no longer lies about what we
    accept.

### Design choices
- No new `Observation` / `Procedure` ORM models. The Claim table already
  has `signal_source`, `data_tier='signal'`, and `extra: JSONB`. Adding
  new tables would have rippled into reconciliation, Tuva export, care
  gap detector, HCC engine, RADV service. Minimally invasive: put the
  data where Tuva already reads it.
- Signal-tier only. These resources describe clinical events, not payer
  adjudication — reconciliation to record-tier claims is a separate
  step the existing dual-tier engine handles.
- Encounter.diagnosis stores **references** to separate Condition
  resources, not ICD-10 strings. Those are stashed in `Claim.extra`
  under `diagnosis_refs` rather than stuffed into the 10-char
  `Claim.diagnosis_codes` array.

## 2. FHIR Bundle schema validation — new gate

### What changed
- New `backend/app/services/fhir_validator.py`
  - `SUPPORTED_RESOURCE_TYPES` — frozenset of resource types we're
    willing to receive. Unknown types (typos like `"Medicationreqest"`)
    now fail fast at 400 instead of being silently dropped.
  - `validate_bundle(bundle)`:
    1. payload is a dict
    2. approximate size <= 50MB
    3. top-level `resourceType == "Bundle"`
    4. `Bundle.type` (if present) is one of the HL7-defined values
    5. `Bundle.entry` is a list of objects
    6. every `entry.resource.resourceType` is present + in
       `SUPPORTED_RESOURCE_TYPES`
    7. no duplicate `fullUrl` entries
    8. no `entry` has a nested `reference` pointing at its own `fullUrl`
       (circular-reference detection)
- `backend/app/routers/fhir.py`
  - `POST /api/fhir/ingest` now calls `validate_bundle(bundle)` before
    delegating to `fhir_service.ingest_fhir_bundle`.
  - `POST /api/fhir/patient` now rejects payloads without
    `resourceType == "Patient"`.
  - `POST /api/fhir/condition` now rejects list entries whose
    `resourceType != "Condition"`.

### Design choices
- Validator is deliberately structural-only. Code-system checks,
  cardinality, and cross-resource referential integrity are out of
  scope — let the ingest layer log and skip what it can't use. The goal
  is "stop obviously malformed garbage at the HTTP boundary," not
  FHIR conformance testing.
- Accept both `{"resource": {...}}` and flat `{"resourceType": "..."}`
  entries, since clients differ.

## 3. Metriport — removed from ADAPTERS registry (B6)

### What changed
- `backend/app/services/payer_adapters/__init__.py`
  - `MetriportAdapter` is **no longer in the `ADAPTERS` dict**. The file
    at `payer_adapters/metriport.py` still exists — its real helper
    methods (`create_patient`, `start_document_query`,
    `get_consolidated_fhir`, `process_patient`) are still useful once
    someone wires them into a router/worker — but the generic
    OAuth-style `POST /api/payer/sync {"payer_name":"metriport"}` path
    no longer falls into the adapter's `fetch_* -> []` stubs.
  - `get_adapter("metriport")` now raises a descriptive `ValueError`
    explaining *why* it's unsupported (document-based HIE integration,
    not OAuth-FHIR) and pointing at the readiness report.

### Why
- B6 (readiness report): "Calling `POST /api/payer/sync
  {'payer_name':'metriport'}` walks into the generic loop, fetches zero
  resources of every type, reports `{status:'completed', synced:{...:0}}`,
  and updates `connection['sync_status'] = 'active'`. Looks green,
  pulled nothing." That silent success was actively harmful. Better to
  fail loudly at `get_adapter()` time.
- No working Metriport sandbox access has landed in the repo. Git log
  does not show an integration PR with live credentials. The adapter's
  own docstring describes it as a "skeleton".

## 4. Availity — basic adapter landed (B7)

### What changed
- New `backend/app/services/payer_adapters/availity.py`
  - OAuth 2.0 **client credentials** flow against
    `https://api.availity.com/availity/v1/token` (no browser redirect —
    explicitly raises `NotImplementedError` from
    `get_authorization_url`).
  - `authenticate` / `refresh_token` — client creds don't issue a
    refresh token, so refresh just re-authenticates.
  - `_search` with page-following + exponential backoff on 429 / 5xx
    (mirrors the Humana adapter pattern so the behavior is
    recognisable).
  - Basic FHIR R4 search coverage: `fetch_patients`, `fetch_conditions`,
    `fetch_claims` (EOB), `fetch_coverage`. Each supports the
    `_lastUpdated=gt<iso>` high-water-mark when `params["since"]` is
    supplied.
  - Out-of-scope calls (`fetch_providers`, `fetch_medications`,
    `fetch_observations`) raise `NotImplementedError` with a clear
    message pointing at the readiness report — **no silent empty list**.
- Registered as `"availity"` in the `ADAPTERS` dict.

### Design choices
- Availity's FHIR R4 gateway (`/availity/v1/fhir/...`) was chosen over
  the per-payer gateway URLs because it's Availity's recommended
  unified endpoint.
- Parsers produce the same shape as Humana's (`fhir_id`, `member_id`,
  `diagnosis_codes`, `service_date`, etc.) so `_upsert_patients` /
  `_upsert_claims` in `payer_api_service` don't need adapter-specific
  branches.
- `get_scopes()` returns `"hipaa"` by default; callers can override via
  `credentials["scope"]` if Availity grants additional rights.

## 5. ADT webhook dedup + replay protection (I7, I9)

### What changed
- `backend/app/routers/adt.py` — `POST /api/adt/webhook`
  - **Replay protection**: if the payload has `message_datetime` or
    `event_timestamp`, compare to `datetime.now(utc)`. Anything older
    than `settings.adt_replay_window_seconds` (default 300s) is
    rejected with `400 Webhook timestamp is Xs old`. Malformed
    timestamps don't fail the request (HMAC is the real auth — we just
    skip the replay check and log).
  - **Dedup**: before calling `process_adt_event`, `SELECT id FROM
    adt_events WHERE raw_message_id = :rid LIMIT 1`. If a row exists,
    return `200 {"status":"duplicate","raw_message_id":...,"event_id":
    ...}` without re-processing.
  - **Race backstop**: if two concurrent deliveries both miss the
    pre-check, the DB-level unique index
    (`uq_adt_events_raw_message_id`) raises a unique violation — we
    catch `"duplicate key" / "uq_adt_events_raw_message_id"` in the
    error string and return the duplicate response instead of 500.
- `backend/app/services/adt_service.py` — `process_adt_event`
  - Same `raw_message_id` pre-check at the service layer so manual
    event POSTs (`/api/adt/events`) and CSV batches also benefit
    without router-level duplication.
- `backend/app/config.py`
  - New `adt_replay_window_seconds: int = 300`. Set to `0` to disable
    replay protection entirely (useful for load tests / backfills).

### Design choices
- `raw_message_id` is the idempotency key because vendors like Bamboo
  Health / Availity attach a stable `message_control_id` to every
  delivery; it's the intended HL7 dedup mechanism.
- Replay check uses `datetime.now(timezone.utc)` — timezone-naive
  timestamps are assumed UTC (common in HL7 v2 messages that don't
  include TZ).
- The `uq_adt_events_raw_message_id` index is **partial**
  (`WHERE raw_message_id IS NOT NULL`) so manual-entry rows without a
  message ID don't collide.

## 6. Migration 0005_adt_dedup_and_fhir

### What it does
- Re-asserts the `uq_adt_events_raw_message_id` partial unique index
  (belt-and-braces — the same index shipped in
  `0004_perf_indexes` but declaring it `IF NOT EXISTS` means an
  environment that somehow skipped 0004 still gets dedup protection).
- Adds `ix_claims_signal_source_date` — partial index
  (`WHERE signal_source IS NOT NULL`) on `(signal_source, service_date)`.
  Care-gap detector and Tuva sync worker need cheap `WHERE
  signal_source = 'fhir_observation'` lookups, and these signal-tier
  rows flood the `claims` table once FHIR Observation/Encounter/
  Procedure handlers are active.
- `down_revision = "0004_perf_indexes"`.
- Every DDL is idempotent; safe to re-run.

## Files touched

### Implemented (owned)
- `backend/app/services/fhir_service.py` — real Observation / Encounter
  / Procedure handlers; updated `RESOURCE_HANDLERS` + CapabilityStatement.
- `backend/app/services/fhir_validator.py` (new) — bundle validator.
- `backend/app/routers/fhir.py` — wired validator into `/api/fhir/ingest`.
- `backend/app/services/payer_adapters/__init__.py` — removed Metriport,
  added Availity, clearer `get_adapter` errors.
- `backend/app/services/payer_adapters/availity.py` (new) — client-creds
  OAuth + FHIR R4 search basic implementation.
- `backend/app/routers/adt.py` — replay window + dedup in webhook.
- `backend/app/services/adt_service.py` — dedup at service layer.
- `backend/app/config.py` — `adt_replay_window_seconds` setting.
- `backend/alembic/versions/0005_adt_dedup_and_fhir.py` (new) — index
  migration.

### Touched only for unique index (already present)
- `backend/app/models/adt.py` — another agent already added the
  `uq_adt_events_raw_message_id` unique index to `ADTEvent.__table_args__`
  and it ships in `0004_perf_indexes`. No changes needed here.

### Not modified (explicitly left alone)
- `backend/app/services/payer_adapters/metriport.py` — file kept for
  future HIE integration work. It's just no longer registered in
  `ADAPTERS`. Reinstate by re-adding the import + registry entry once
  `create_patient`, `start_document_query`, `get_consolidated_fhir` are
  wired into a router/worker.
- `backend/app/models/member.py`, `claim.py` — read-only (Claim model's
  `extra: JSONB` is the landing pad for Observation payloads).

## Verification

```
python -m py_compile \
  backend/app/services/fhir_service.py \
  backend/app/services/fhir_validator.py \
  backend/app/services/payer_adapters/availity.py \
  backend/app/services/payer_adapters/__init__.py \
  backend/app/services/payer_adapters/metriport.py \
  backend/app/routers/fhir.py \
  backend/app/routers/adt.py \
  backend/app/services/adt_service.py \
  backend/app/config.py \
  backend/app/models/adt.py \
  backend/alembic/versions/0005_adt_dedup_and_fhir.py
```
All files compile clean.

## What's still open
- **Metriport real integration** — the adapter file still holds real
  Metriport API code behind helpers that no router calls. When the
  team is ready to turn on HIE ingestion, re-register the adapter
  (with a different `fetch_*` shim that calls the real helpers) and
  add a dedicated `/api/hie/...` router rather than folding it into
  the generic `/api/payer/sync` path.
- **Availity endpoint hardening** — the `/test` and `/production`
  entries in `_ENVIRONMENTS` currently share a URL because Availity
  provisions sandbox creds against the same host. Split once they
  issue a distinct test hostname.
- **Availity fetch_providers / medications / observations** — raise
  `NotImplementedError` today. Endpoints vary per downstream payer and
  should be added as specific payers are onboarded.
- Credential encryption (B1), background worker for payer syncs (B8),
  incremental sync high-water-mark wiring (B3), per-page commits (B4),
  truncation detection (B5) are **out of scope for this phase** — they
  live in the Humana / eCW hardening track.
