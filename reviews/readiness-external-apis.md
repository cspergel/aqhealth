# External API Integration Readiness

## Verdict per integration
| Integration | Status | Blocker? |
|---|---|---|
| Humana Data Exchange (FHIR) | Implemented adapter, OAuth + pagination + retry + rate limit all coded; no incremental sync, credentials only base64-encoded | Yes — base64 "encryption", no high-water-mark, no background job |
| Availity | **Not implemented** — zero code, referenced only in model comments | Yes |
| eCW SMART-on-FHIR | Largely implemented — PKCE, endpoint discovery, 14 FHIR resources, rate limit; same credential storage issue as Humana | Yes — same base64, 5-min token race around long syncs |
| Metriport HIE | Adapter present but **disconnected from the rest of the system** — registered in ADAPTERS, inherits `PayerAdapter` whose `fetch_*` methods all return `[]`; the real methods (`create_patient`, `start_document_query`, `get_consolidated_fhir`) are not wired to any router or worker | Yes |
| Bamboo ADT (webhook) | Webhook receiver + HL7v2 parser + CSV batch implemented; per-tenant secret supported but stored plaintext | Yes — unencrypted secret, no replay protection |
| Availity ADT | Same webhook path as Bamboo — would work if a source row is configured, but source config dict is also stored plaintext | Yes |
| FHIR generic ingest (`/api/fhir/ingest`) | Patient/Condition/MedicationRequest real; Observation/Encounter/Procedure are explicitly labeled stubs and skipped silently | Partial — Tuva pipeline will miss clinical signal |
| Tuva FHIR-to-CSV bridge | **Does not exist.** Tuva consumes from DuckDB rows exported from PostgreSQL (`tuva_export_service.export_claims`). There is no FHIR→CSV path from payer sync output other than what `_upsert_claims` writes to the `claims` table | Not a blocker by itself, but means payer FHIR data flows through the generic claims table before Tuva sees it |

## Overall verdict
**NOT READY** for authenticated production traffic.

Humana and eCW could probably connect to a sandbox and pull data for one patient without crashing. They are not ready for (a) real PHI under HIPAA (the "encryption" is `base64`), (b) a production tenant pulling nightly deltas (no incremental sync, no background worker, no idempotency on re-pulls of claims), or (c) silent-failure detection (no correlation IDs, no log redaction, no alerting). Metriport is wired into the registry but functionally inert. Availity is not wired at all.

---

## BLOCKERS

### B1 — Credentials "encryption" is base64, not encryption
`backend/app/services/payer_api_service.py:157-172`
```python
def _encrypt_value(value: str) -> str:
    """Encode a credential value for storage.
    Production should use Fernet or AWS KMS. For now we use base64
    as a placeholder that keeps plain text out of DB dumps.
    """
    return base64.b64encode(value.encode()).decode()
```
Applied to `client_id`, `client_secret`, `access_token`, `refresh_token`, and `code_verifier`. Anyone with read access to `platform.tenants.config` JSONB has every payer credential in clear text one `base64 -d` away. The docstring itself says "Production should use Fernet or AWS KMS."

### B2 — ADT webhook secrets stored plaintext per-tenant
`backend/app/routers/adt.py:130`
```python
tenant_secret = tenant_config.get("adt_webhook_secret")
```
The secret is read straight from `platform.tenants.config` JSONB with no decryption. Combined with the fact that any code path writing to that JSONB (`_upsert_payer_connection`, `configure_source`) stores dicts as-is, every ADT webhook secret is plaintext in the DB.

### B3 — No incremental sync / high-water-mark
`backend/app/services/payer_api_service.py:336` — sync builds `params = {"environment": ...}` with **no `_lastUpdated` or `since` filter**. `HumanaAdapter._fetch_all_pages` (`backend/app/services/payer_adapters/humana.py:336`) builds `next_url = f"{base_url}{resource_path}?_count={_PAGE_SIZE}"` — first-page URL never includes a date filter. Same pattern in `EcwAdapter._fetch_all_pages` (`backend/app/services/payer_adapters/ecw.py:617-621`). Every scheduled sync re-pulls the entire member's history from time zero. For a 5,000-member panel that's tens of thousands of pages per sync. Humana and eCW rate limits will throttle it, and Tuva will re-process duplicates.

### B4 — sync_payer_data buffers a full resource type in memory, then one commit at the end
`backend/app/services/payer_api_service.py:345-426`
```python
for data_type in sync_types:
    try:
        if data_type == "patients":
            resources = await adapter.fetch_patients(access_token, params)   # all pages in memory
            count = await _upsert_patients(db, resources)
        ...
    except Exception as e:
        results["errors"].append({"type": data_type, "error": str(e)})
...
await db.commit()   # single commit for all 14 resource types
```
Two consequences: (a) a 10k-page Humana claims pull holds the full list in Python memory; (b) if the request is terminated (timeout, server restart, client disconnect) before line 426, all 14 resource types roll back together — the `last_sync` is never updated, so the next run re-pulls from scratch. `fetch_*` has no "write a partial page to DB" hook.

### B5 — Humana partial-bundle failure silently drops everything after the break
`backend/app/services/payer_adapters/humana.py:339-369`
```python
async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
    while next_url:
        await asyncio.sleep(delay)
        response = await self._request_with_retry(client, next_url, headers)
        if response is None:
            break                      # <- stops loop, returns accumulator
        bundle = response.json()
        ...
```
If Humana returns 401 on page 50 of 100, `_request_with_retry` raises (line 410). If it returns a 4xx (not 429), `_request_with_retry` returns `None`, the loop silently `break`s, and `_fetch_all_pages` returns the first 50 pages as if they were complete — the caller has no way to tell "I got the full dataset" vs. "I got page 50 and gave up." There is no flag on the returned list indicating truncation.

### B6 — Metriport adapter is wired to OAuth registry it doesn't match
`backend/app/services/payer_adapters/metriport.py:293-333`
```python
async def authenticate(self, credentials: dict) -> dict:
    """Metriport uses API key auth, not OAuth code exchange."""
    return await self.connect(credentials)
...
async def fetch_patients(self, token: str, params: dict) -> list[dict]:
    """Patients are created/matched, not fetched in bulk from Metriport."""
    return []

async def fetch_conditions(self, token: str, params: dict) -> list[dict]:
    return []
async def fetch_claims(self, token: str, params: dict) -> list[dict]:
    return []
# (all 7 fetch_* return [])
```
And `backend/app/services/payer_adapters/__init__.py:18` registers it with the others. Calling `POST /api/payer/sync {"payer_name":"metriport"}` walks into the generic loop in `payer_api_service.py:345`, fetches zero resources of every type, reports `{status:"completed", synced:{patients:0, claims:0, ...}}`, and **updates `connection["sync_status"] = "active"`**. Looks green, pulled nothing.

The actually useful Metriport calls — `create_patient` (line 110), `start_document_query` (line 153), `get_consolidated_fhir` (line 215), `process_patient` (line 240) — are **not referenced from any router, any worker, or any service**:
```
$ grep -r "MetriportAdapter\|metriport_adapter" backend/app
backend/app/services/payer_adapters/__init__.py:11:from ...metriport import MetriportAdapter
backend/app/services/payer_adapters/__init__.py:18:    "metriport": MetriportAdapter,
backend/app/services/payer_adapters/metriport.py:44:class MetriportAdapter(...):
```
No router, no worker, no caller.

### B7 — Availity is not implemented at all
`backend/app/services/payer_adapters/__init__.py:15-19` — registry has only `humana`, `ecw`, `metriport`. References in `backend/app/models/adt.py:4,19,23` and `backend/app/services/onboarding_service.py:98,191` are string literals in docstrings and sample config labels. Nothing connects to Availity's eligibility, claims, or ADT APIs.

### B8 — No background worker for payer syncs
`backend/app/workers/` contains `hcc_worker.py`, `ingestion_worker.py`, `insight_worker.py`, `tuva_worker.py` — none for payer_api or ADT. `POST /api/payer/sync` runs inline in the HTTP handler (`backend/app/routers/payer_api.py:192`), calling `payer_api_service.sync_payer_data` which for a 5,000-member Humana panel can take 30+ minutes. Any ASGI proxy will timeout. No retry-on-failure persistence either.

### B9 — FHIR ingest endpoints claim 3 resources they silently drop
`backend/app/services/fhir_service.py:27-29`
```python
"Observation": None,       # stub — not yet implemented
"Encounter": None,         # stub — not yet implemented
"Procedure": None,         # stub — not yet implemented
```
`ingest_fhir_bundle` (line 58) uses these as keys: `if RESOURCE_HANDLERS.get(resource_type) is None: continue` — drops Observations/Encounters/Procedures without incrementing any counter or error. The `get_capability_statement` (line 117) filters these out, so the advertised capability is honest — but a bundle containing 1,000 observations posted to `/api/fhir/ingest` returns `observations_found: 0, errors: []`. The caller cannot distinguish "no observations in bundle" from "1000 silently dropped." This is the generic FHIR ingest endpoint a third party would post to.

---

## IMPORTANT

### I1 — OAuth state == tenant_schema is not a real CSRF nonce
`backend/app/routers/payer_api.py:94` sets `creds["state"] = current_user["tenant_schema"]`. `/callback` (line 145) validates `body.state == tenant_schema`. This prevents cross-tenant callback abuse, but it is a fixed, predictable value per tenant — not a single-use nonce. An attacker who knows the tenant name can craft a valid-looking state.

### I2 — Starting a new OAuth connect obliterates an existing connection
`backend/app/routers/payer_api.py:116` calls `_upsert_payer_connection(db, tenant_schema, body.payer_name, pending_auth)` where `pending_auth` has only `code_verifier`, `environment`, `status`. This **overwrites** the entire `payer_connections[payer_name]` dict — if the tenant was already connected (has `access_token`, `refresh_token`, `last_sync`), those fields are thrown away the moment a user clicks "Connect" again. A cancelled connect attempt leaves the tenant disconnected.

### I3 — Metriport adapter has no retry, backoff, or rate-limit handling
Compare `metriport.py:82-98` (connect), `:132-147` (create_patient), `:159-176` (document query):
```python
async with httpx.AsyncClient() as client:
    resp = await client.get(f"{self.base_url}/medical/v1/organization", headers=self._headers(), timeout=10)
    if resp.status_code == 200: ...
    else: return {"status": "error", "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
```
No 429 handling, no 5xx retry, no exponential backoff, no rate limiter (unlike humana.py and ecw.py). One transient 502 from Metriport = dropped patient. Also `except Exception as e` catches everything including `asyncio.CancelledError`.

### I4 — eCW token lifetime is 5 minutes; no refresh mid-sync
`backend/app/services/payer_adapters/ecw.py:52`: eCW access tokens live 300s. `payer_api_service.sync_payer_data` checks token expiry **once** at the top (line 293) and then fetches 14 resource types sequentially. For a practice with a few thousand patients, the token will expire mid-sync. Neither `EcwAdapter._fetch_all_pages` nor `_request_with_retry` refreshes on 401 — they raise `httpx.HTTPStatusError` (ecw.py:700). The sync aborts halfway through.

### I5 — No correlation / request IDs in logs
The only structured logging uses plain `logger.info/error(..)`. `grep -r "correlation_id\|X-Request-ID" backend/app` returns only an internal DB request record ID in `clinical_exchange_service.py`. When a Humana sync fails at 3am for tenant X, the operator has no way to join "the 401 response" to "the tenant's connection record" to "the member we were syncing."

### I6 — Sensitive data not redacted in error logs
`backend/app/services/payer_adapters/humana.py:406-409`
```python
logger.error("Humana auth failure %d on %s: %s",
             response.status_code, url, response.text[:500])
```
`response.text` can contain `access_token` fragments, `refresh_token`, patient demographics (in OAuth/SMART error responses the server sometimes echoes the scope). 500-char truncation is not redaction. Same pattern eCW: `ecw.py:696-700`, `:705-708`.

### I7 — `process_adt_event` commits on every event; no replay / idempotency
`backend/app/services/adt_service.py:238` commits per event. A duplicated Bamboo webhook (network retry) inserts a second `adt_events` row. There is no unique constraint on `raw_message_id` or `(source_id, event_timestamp, patient_mrn)`, so the same admission can alert twice. `routers/adt.py:154` does not dedupe.

### I8 — `_upsert_patients` is not safe under concurrent syncs
`backend/app/services/payer_api_service.py:591-648` does `SELECT` then `db.add(Member(...))` without `ON CONFLICT`. Two overlapping syncs for the same tenant (e.g., someone clicks "Sync" twice) both see "no existing member" and both attempt to insert — one will hit the `unique=True` constraint on `Member.member_id` (`models/member.py:22`) and the entire transaction rolls back. No advisory lock prevents concurrent `sync_payer_data` for the same tenant+payer.

### I9 — ADT webhook has no timestamp validation / replay protection
`backend/app/routers/adt.py:96-159` — verifies HMAC (`hmac.compare_digest`) on the static secret only. No timestamp check, no nonce. An attacker who captures one valid webhook can replay it forever. Bamboo Health specifically signs payloads with a timestamp; the check is missing.

### I10 — `sync_status = "active"` even when all 14 resource types threw errors
`backend/app/services/payer_api_service.py:423`
```python
connection["sync_status"] = "active" if not results["errors"] else "partial"
```
If `results["errors"]` has items for every single data_type (because the token is bad, say), the status is `"partial"`, never `"failed"`. No status transition to "needs_reauth" on 401. The UI shows a connection as still-useful when it is completely broken.

### I11 — No tenant feature-flagging of which payers are enabled
Any mso_admin user can `POST /api/payer/connect {"payer_name":"ecw", ...}` regardless of whether the tenant is licensed for eCW, has signed a BAA, or paid for the integration. No `tenant.enabled_integrations` list.

### I12 — No per-tenant per-payer circuit breaker
If Humana's sandbox is down, `_request_with_retry` does three attempts per page, each with exponential backoff — then the next page does three more. For a 100-page sync against a down API, that's 300 requests and ~15 minutes before giving up. No cool-down period. No "Humana returned 5xx on last 20 attempts, skip this tenant for 10 minutes."

---

## MINOR

### M1 — `except Exception` catches `asyncio.CancelledError`
`backend/app/services/payer_adapters/metriport.py:97,145,175,196,208,232` — each uses bare `except Exception as e`. If the calling task is cancelled, this eats the cancellation and logs an error instead of propagating. Humana and eCW use specific `httpx.TimeoutException` / `httpx.HTTPError` blocks.

### M2 — `_resolve_member` has no LIMIT on the `fhir_id` fallback
`backend/app/services/payer_api_service.py:665-672`
```python
result = await db.execute(
    select(Member).where(Member.extra["fhir_id"].astext == member_id_str)
)
```
No unique constraint guarantees only one row matches — if the same `fhir_id` appears in two tenants or under two different member IDs (possible in cross-payer data), `scalar_one_or_none()` raises `MultipleResultsFound`. Failure mode is an unhandled exception mid-sync.

### M3 — `process_csv_batch` swallows per-row errors without tracking them
`backend/app/services/adt_service.py:888-889`
```python
except Exception as e:
    logger.error(f"Error processing CSV row: {e}")
```
The `processed/matched/unmatched` counters don't include a `failed` counter. A batch of 10,000 ADT events where 9,999 fail and 1 succeeds returns `{"processed":1, "matched":1, "unmatched":0, "alerts_generated":N}` with no indication 9,999 were dropped.

### M4 — eCW `_code_verifier` stored on the adapter instance
`backend/app/services/payer_adapters/ecw.py:90-95`:
```python
def __init__(self) -> None:
    self._code_verifier: str | None = None
```
Since `get_adapter(payer_name)` returns a **new instance every call** (`payer_adapters/__init__.py:37: return adapter_cls()`), `get_authorization_url` sets `_code_verifier` on an adapter that is thrown away when the function returns. The router (`payer_api.py:104`) reads it right after — this works by accident because the two calls share the same local variable. But if two connect flows interleave, the verifier is still persisted via `_upsert_payer_connection` under `payer_name`, so concurrent connects to the same payer from the same tenant collide (see I2).

### M5 — Humana `fetch_*` silently skips resources whose parser returns `None`
Many `_parse_*` methods return `None` on partial data (e.g., no `member_id` — `humana.py:694-706`). `fetch_claims` (line 171-176) does `if claim: parsed.append(claim)`. No counter of "skipped" resources. If Humana returns 100 EOBs and 40 lack a resolvable subject, the caller sees 60 claims with no hint that 40 were dropped.

### M6 — Humana `_ENVIRONMENTS` has only 2 entries; no per-tenant override
`backend/app/services/payer_adapters/humana.py:36-47` hardcodes the sandbox and prod FHIR base URLs. If Humana stands up a UAT or a custom endpoint for a specific customer, there is no way to point to it without a code change.

### M7 — `fhir.py` CapabilityStatement has `status: "active"` but no security / OAuth block
`backend/app/services/fhir_service.py:110-137` — server announces itself as a SMART-on-FHIR-consumable endpoint without declaring authentication. Implementers pointing an EMR at `/api/fhir/capability` will see no `security.service`, no `oauth-uris` extension — they can't auto-discover how to auth.

---

## Credential storage audit

| Credential | Where stored | How protected | Evidence |
|---|---|---|---|
| Payer `client_id` | `platform.tenants.config["payer_connections"][<payer>]["client_id"]` | `base64.b64encode` | `payer_api_service.py:216, 157-163` |
| Payer `client_secret` | same | `base64.b64encode` | `payer_api_service.py:217, 157-163` |
| OAuth `access_token` | same | `base64.b64encode` | `payer_api_service.py:218` |
| OAuth `refresh_token` | same | `base64.b64encode` | `payer_api_service.py:219` |
| eCW PKCE `code_verifier` | same (under `"code_verifier"` key) | `base64.b64encode` | `routers/payer_api.py:110` |
| eCW `practice_code` | same | **plaintext** | `payer_api_service.py:230-232` |
| Cached SMART endpoints (URLs) | same | plaintext | `payer_api_service.py:235-236` |
| ADT webhook secret (global) | `settings.adt_webhook_secret` (env var) | env var | `config.py:34` |
| ADT webhook secret (per tenant) | `platform.tenants.config["adt_webhook_secret"]` | **plaintext** | `routers/adt.py:130` |
| ADT source config (incl. SFTP creds, API keys) | `adt_sources.config` JSONB | **plaintext** | `models/adt.py:25`, `services/adt_service.py:718-738` |
| Metriport `api_key` | `MetriportAdapter.api_key` instance attr + would land in tenant config via same path if wired | base64 if routed through `connect_payer` (currently not) | `metriport.py:49,72` |
| LLM / AutoCoder API keys | env vars in `Settings` | env var | `config.py:25-30` |

At least one credential storage path bypasses even base64: `practice_code` for eCW, `cached_endpoints`, per-tenant webhook secret, and ADT source configs are stored in cleartext JSONB.

---

## Stubs catalog

Every external-API-adjacent function returning mock/empty/not-implemented:

| Location | Function | Status |
|---|---|---|
| `backend/app/services/fhir_service.py:308-310` | `_ingest_encounter` | Stub — logs debug, returns None |
| `backend/app/services/fhir_service.py:313-315` | `_ingest_observation` | Stub — logs debug, returns None |
| `backend/app/services/fhir_service.py:318-320` | `_ingest_procedure` | Stub — logs debug, returns None |
| `backend/app/services/fhir_service.py:27-29` | `RESOURCE_HANDLERS` entries for Observation/Encounter/Procedure | Set to `None` → silently skipped in `ingest_fhir_bundle` loop (line 58-60) |
| `backend/app/services/payer_adapters/metriport.py:309-311` | `fetch_patients` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:313-315` | `fetch_conditions` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:317-319` | `fetch_claims` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:321-323` | `fetch_coverage` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:325-327` | `fetch_providers` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:329-330` | `fetch_medications` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:332-333` | `fetch_observations` | Returns `[]` |
| `backend/app/services/payer_adapters/metriport.py:297-299` | `refresh_token` | Returns `{"status":"ok"}` no-op |
| `backend/app/services/payer_adapters/metriport.py:301-303` | `get_authorization_url` | Returns `""` (would break if UI called it) |
| `backend/app/services/payer_adapters/metriport.py:305-307` | `get_scopes` | Returns `""` |
| `backend/app/services/payer_adapters/ecw.py:359-365` | `fetch_claims` (by design — EHR not payer) | Returns `[]`, documented |
| `backend/app/services/payer_adapters/ecw.py:1665` | `_parse_*` | `"facility_name": None,  # TODO: resolve from encounter` |
| `backend/app/services/payer_api_service.py:114-140` | `PayerAdapter.fetch_practitioner_roles`, `fetch_care_plans`, `fetch_care_teams`, `fetch_allergy_intolerances`, `fetch_document_references`, `fetch_immunizations`, `fetch_procedures` | Base-class stubs returning `[]` — individual adapters override Humana does, eCW does, Metriport inherits empty |

No router calls into Metriport's real methods (`create_patient`, `start_document_query`, `get_documents`, `download_document`, `get_consolidated_fhir`, `process_patient`). These exist but are unreachable via the public API.

---

## Summary

Humana and eCW adapters are the two mature pieces and with about a week of hardening (real Fernet/KMS encryption, a dedicated background worker, high-water-mark incremental sync, per-page DB commits, retry-on-401 mid-sync, truncation detection) could hit production. Metriport and Availity are both effectively not integrated — Metriport's registration into the OAuth-style `ADAPTERS` dict is actively harmful because it makes `POST /api/payer/sync {"payer_name":"metriport"}` return a green 200 having done nothing. Fix those blockers before sandbox traffic.
