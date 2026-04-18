# The Skeptic — AQSoft Health Platform Review

**Reviewer:** review-skeptic (forgeplan)
**Date:** 2026-04-17
**Default stance:** NEEDS WORK until overwhelming evidence proves otherwise.
**Scope:** Full codebase feasibility/correctness. Claims in `README.md`, `planning docs/`, and demo claims vs actual code.

---

## CRITICAL findings

### [CRITICAL] Unauthenticated Claude/Anthropic API endpoint is a prompt-injection + cost DOS vector
**Location:** `backend/app/routers/tuva_router.py:668-693` (`POST /api/tuva/process-note`)
**Claim being challenged:** README promises "Clinical NLP — Diagnoses Hidden in Notes" as a production capability, and LLM Guard is presented as enforcing tenant isolation.
**Evidence:** The `process-note` endpoint accepts an arbitrary `note_text` query parameter and calls `process_clinical_note`, which in turn calls `clinical_nlp_service.extract_from_note` + `assign_codes_with_tools`. Both methods bypass `llm_guard.guarded_llm_call` and directly instantiate `anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)`. The endpoint has no auth, no rate limit, no token cap beyond `max_tokens=4000`, and runs a `max_turns=10` tool-use loop (`clinical_nlp_service.py:656`). The `llm_guard.py:10-21` docstring explicitly documents clinical_nlp_service as a "known bypass path" and admits `guarded_llm_call does not support tool_use`.
**Missing proof:** No auth dependency on the route, no API-key rate limiter, no prompt-injection scrubbing on `note_text`, no abuse monitoring. No test verifies that the endpoint is unreachable in production.
**Recommendation:** (a) Gate `/api/tuva/process-note` behind `DEMO_MODE` like the other Tuva endpoints (currently it isn't — it's not wrapped in `_demo_session()` for the NLP call). (b) Require auth on the endpoint and enforce tenant-scoped rate limits. (c) Wrap the Anthropic SDK calls in `guarded_llm_call` (extend the guard to support `tool_use` as the TODO says). (d) Reject notes over N KB and truncate aggressively.
**CROSS:** Adversary

### [CRITICAL] Recapture gap detection depends on prior-year *suspects*, not prior-year *claims*
**Location:** `backend/app/services/hcc_engine.py:640-687` (`_detect_recapture_gaps`)
**Claim being challenged:** README describes recapture as "prior-year HCCs not yet coded in current year" — i.e., the classic CMS recapture gap based on submitted claims.
**Evidence:** The function queries `HccSuspect` with `payment_year == prior_year` AND `status == captured.value`. It does NOT read `Claim.diagnosis_codes` for prior year. So on day-1 onboarding (no prior-year suspect history in this system), `_detect_recapture_gaps` returns `[]`. Only suspects this platform itself previously captured can generate recapture gaps.
**Missing proof:** No test covers a new-tenant scenario with 2+ years of claims and zero prior HccSuspect rows. The integration test `TestHccRecaptureGaps.test_recapture_members_have_prior_year_hcc` verifies the synthetic data generator put the right diagnoses in prior-year claims — it never runs `_detect_recapture_gaps` end-to-end to prove that recapture is actually detected from those claims.
**Recommendation:** Rewrite `_detect_recapture_gaps` to source prior-year HCCs from `Claim.diagnosis_codes WHERE EXTRACT(year FROM service_date) = prior_year`, resolve each via `lookup_hcc_for_icd10`, and flag HCCs not present in current-year codes. Add an e2e test against PostgreSQL that proves recapture gaps are found from claims alone with zero pre-existing suspects.

### [CRITICAL] Demo mode permanently overwrites the axios adapter with no restore path
**Location:** `frontend/src/lib/mockApi.ts:294-298` and `frontend/src/lib/auth.tsx:57-67`
**Claim being challenged:** The memory note (`project_stubs_and_incomplete.md` item 11) flags this as "intentional, will need cleanup before production." README implies a deployed product at aqhealth.ai.
**Evidence:** `enableDemoMode()` does `api.defaults.adapter = (config) => {...}` and there is no `disableDemoMode()` symmetric restore. Once the URL contains `?demo=true` and the adapter is swapped, every subsequent axios call — including the auth refresh at `api.ts:38-71` and the protected pages — returns mock data. Combined with the fact that the auth refresh interceptor posts to the real URL but the adapter intercepts, a session that drifts from demo to real is broken.
**Missing proof:** No automated test verifies that navigating away from `?demo=true` restores real-network behavior without a full page reload. `demoModeInitialized` is a module-scope boolean that's never reset.
**Recommendation:** Either (a) compute adapter choice per-request (interceptor, not default override), or (b) store the original `api.defaults.adapter` before swapping and restore it in a `disableDemoMode()` function. Add a test that flips demo mode off and asserts a real network call is attempted.

### [CRITICAL] Database has no migration history — every schema change requires drop/recreate
**Location:** `backend/alembic/versions/` (empty) and `backend/alembic/README.md:3-6`
**Claim being challenged:** README section "Current Build (as of April 2026)" lists completed multi-tenant schema isolation and "Schema-per-tenant multi-tenancy — each MSO's data is completely isolated" as production-ready.
**Evidence:** The `versions/` directory is empty. `alembic/README.md` says "Initial schema creation is handled by setup_db.py, not Alembic." Production schema evolution therefore requires taking the DB down and running `scripts/setup_db.py` which drops everything. There is no committed migration, so there is no way to roll forward a real tenant's schema safely.
**Missing proof:** No alembic revision exists. `scripts/setup_db.py` presumably drops/creates schemas — there is no "upgrade this existing tenant from v0.1 to v0.2" path proven anywhere.
**Recommendation:** Generate an initial baseline migration immediately (`alembic revision --autogenerate`) before any real tenant is loaded. Otherwise the first schema change after launch loses or corrupts customer data.

### [CRITICAL] Several "completed" pipeline actions in skill_service are literal stubs
**Location:** `backend/app/services/skill_service.py:378-400`
**Claim being challenged:** README: "8 self-learning feedback loops with cross-loop event bus"; `project_stubs_and_incomplete.md` says items 7-9 were "partially addressed" on 2026-04-03.
**Evidence:** Six actions (`generate_chase_list`, `create_action_items`, `send_notification`, `generate_report`, `refresh_dashboard`, `calculate_stars`) all have bodies of the form:
```python
logger.info("STUB: %s — not yet implemented", action)
return {"status": "not_implemented", "message": "This action is not yet implemented"}
```
But `skill_service.py:35,48,51,66-68,82-84,97,100,102-103` defines *shipped* skill templates that call these exact actions in production flow (e.g., the "Monthly Board Report" skill chains `refresh_dashboard`, `calculate_stars`, `generate_report`, `send_notification` — all six stubs fire in sequence). Every skill that wires to these returns "not_implemented" to the user; the skill will report "completed" only because the orchestrator treats a `status: not_implemented` as non-error.
**Missing proof:** No test asserts that an end-to-end skill execution actually produces a chase list, an action item, or a notification.
**Recommendation:** Either implement these actions, or hide the un-implemented skills from the UI templates list (`IMPLEMENTED_ACTIONS` flags at lines 118-128 already admit `"implemented": False` but the templates still reference them). Status output from the orchestrator should surface `not_implemented` as a user-visible warning, not silent success.

---

## IMPORTANT findings

### [IMPORTANT] N+1 query inside analyze_member persistence loop
**Location:** `backend/app/services/hcc_engine.py:1169-1221`
**Claim being challenged:** The README claims the system handles "population-level analysis" and scales to MSO populations (tens of thousands of members).
**Evidence:** Inside `analyze_member`, after gathering suspects, the code loops over `suspects` and for each issues an independent `await db.execute(select(HccSuspect).where(...))` to dedupe. For a member with 5–10 candidate suspects, that's 5–10 round-trips. At 100k members this is up to 1M extra SELECTs on top of the per-member claim query, provider-pattern query, and RAF snapshot write. No index hint on `(member_id, hcc_code, suspect_type, payment_year, status)` is defined in the model.
**Missing proof:** No benchmark, no perf test, no bulk-upsert path.
**Recommendation:** Replace with a single upfront SELECT of all existing suspects for the member (`WHERE member_id = :m AND payment_year = :y AND status = 'open'`), build a dict keyed by `(hcc_code, suspect_type)`, then update/insert in memory. Use `insert ... on conflict` (upsert) for the write.

### [IMPORTANT] RafHistory has no uniqueness constraint — rerunning analyze_member creates duplicate snapshots every call
**Location:** `backend/app/models/hcc.py:61-77` and `backend/app/services/hcc_engine.py:1223-1234`
**Claim being challenged:** Any trend chart or "RAF over time" visualization assumes one snapshot per member per calculation event.
**Evidence:** `RafHistory` has no `UniqueConstraint` on `(member_id, calculation_date)` or any idempotency key. `analyze_member` always `db.add(RafHistory(...))` — running the worker twice on the same day gives two rows with the same `calculation_date`.
**Missing proof:** No test checks for idempotency. No service disables a re-run guard.
**Recommendation:** Either add a unique constraint on `(member_id, calculation_date)` and use upsert, or add a `pipeline_run_id` column. Otherwise reporting duplicates inflate downstream analytics.

### [IMPORTANT] Hard-coded confidence scores masquerade as evidence-weighted
**Location:** `backend/app/services/hcc_engine.py:680, 750, 975, 988, 1011, 1024, 1102, 1137, 1156`
**Claim being challenged:** README: "Evidence-based suspect classification — Easy Captures / Likely / Investigate / Watch" with confidence scores (0-100).
**Evidence:** Every suspect type gets a hard-coded integer: recapture=85, historical=40, med_dx (local)=60, med_dx (SNF)=65, specificity=75, non-billable=80, near-miss with evidence=75 (or 60 for staging), near-miss without evidence=20. No derivation from evidence strength, no citation to any CMS guidance, no calibration against ground truth. The `_adjust_confidence_from_patterns` tweaks by ±5 or ±10 based on provider capture history, but the base is still a magic number.
**Missing proof:** No document or test shows how these numbers were derived or validated. Labels like "Easy Capture" in the README implicitly claim these scores are meaningful ranks.
**Recommendation:** (a) Document origin of each value (call them defaults, not evidence-derived), or (b) derive them from a calibration run against captured-vs-dismissed outcomes in the learning table. Label the current values "heuristic priors" in the UI until calibration exists.

### [IMPORTANT] Demographic RAF always = 0 in local fallback — under-reports total RAF
**Location:** `backend/app/services/hcc_engine.py:387-425` (`_local_raf_calculation`)
**Claim being challenged:** README promises "HCC V28 model" and accurate RAF — the demographic component is a non-trivial (~0.4+) part of the CMS model.
**Evidence:** The comment says "Disease-only RAF from local HCC table. No demographic component." The return value hard-codes `"demographic_raf": 0.0`. Whenever the SNF microservice is unreachable (`SNFClient` returns None), every member's total RAF is missing ~0.4 demographic RAF. The rest of the platform — risk tiers, dollar-impact calculations — uses these undercounted values.
**Missing proof:** The fallback path is on the happy path whenever SNF is offline, but no test exercises it with realistic members and verifies total_raf ≥ CMS demographic minimum.
**Recommendation:** Implement a demographic-RAF table locally (Medicare A+B enrollee, age/sex bucket, Medicaid, disability) — the CMS tables are public. Until then, loudly flag the result as `"demographic_raf_fallback": True` so downstream consumers don't display it as authoritative.

### [IMPORTANT] `auto_extract_icd10_codes` assigns confidence 95 regardless of clinical context
**Location:** `backend/app/services/clinical_nlp_service.py:435-516`
**Claim being challenged:** README claims evidence quotes are per-code and support "confidence scores".
**Evidence:** The regex finds any string that matches `[A-TV-Z]\d{2}\.?\d{0,4}` in the note and if the code is in the HCC reference, records it with `"confidence": 95` and `"extraction_method": "auto_regex"`. The only context check is `_find_context(text, code, window=80)` which returns nearby text but doesn't interpret it. A note that says "ruled out I50.9" or "no evidence of N18.4" will produce a 95-confidence suspect. The exclude list (`_ICD10_EXCLUDE`) only contains four codes.
**Missing proof:** No negative-polarity test ("no history of", "ruled out", "family history of") to check whether auto-extracted codes are filtered.
**Recommendation:** Run NegEx-style negation/context checks on the 80-char window before assigning high confidence. Treat regex-matched codes as hypotheses requiring Pass-2 LLM confirmation, not 95-confidence facts.

### [IMPORTANT] Tool-use loop silently returns empty on malformed LLM output
**Location:** `backend/app/services/clinical_nlp_service.py:656-701` (`assign_codes_with_tools`)
**Claim being challenged:** Clinical NLP is presented as a reliable production capability.
**Evidence:** The loop iterates up to `max_turns = 10`. If Claude ever produces a final (non-tool_use) response whose content cannot be parsed as JSON, the `except json.JSONDecodeError: pass` falls through and the function returns `[]`. If the loop exhausts 10 turns without a stop_reason other than tool_use, it silently returns `[]`. No retry, no circuit-breaker metric, no telemetry emitted to distinguish "no codes found" from "LLM looped forever."
**Missing proof:** No test simulates a malformed tool-use response or a 10-turn loop to verify the error path.
**Recommendation:** Log the last response and classify the failure. Return a structured error rather than empty list so downstream code doesn't confuse "clean note with no findings" with "LLM failed."

### [IMPORTANT] Test suite is ~60% smoke tests; "104 tests" oversells coverage
**Location:** `backend/tests/`
**Claim being challenged:** Memory note says "104 tests" — implies real coverage.
**Evidence:** 
- `test_care_gaps.py` contains 2 tests that only verify `GapStatus.open.value == "open"` and `GapStatus.closed.value == "closed"`. No test exercises gap detection.
- `test_expenditure.py` has 3 tests that only check that `SERVICE_CATEGORIES` contains certain strings. No arithmetic, no DB, no integration.
- `test_tuva_sync.py` tests only that a SQLAlchemy model instance stores the values passed to its constructor — no sync logic is exercised.
- `test_tuva_runner.py` asserts only that `_build_command` concatenates strings correctly.
- `test_api_routes.py` auth-protected checks accept responses 401/403/**422** — a validation error (422) on a route that should require auth is indistinguishable from "no auth middleware at all"; these tests are too lenient.
- Integration tests (`test_integration.py`) are real but require PostgreSQL and are skipped by default (`pytestmark = pytest.mark.integration`) — CI must run them explicitly.
- `test_tuva_e2e.py` skips if dbt or DuckDB isn't installed — doesn't fail, just skips. A CI without these tools reports "all green" while skipping every integration test.
**Missing proof:** No coverage number is published. No CI config asserts integration tests actually ran.
**Recommendation:** (a) Split tests into `unit`, `integration`, `slow`. (b) Require integration + e2e to run in CI (not just optional skips). (c) Remove or expand near-empty tests — a pass on `GapStatus.open.value == "open"` is worse than no test because it inflates the count.

### [IMPORTANT] `analyze_population` commits inside a batch even when individual members error
**Location:** `backend/app/services/hcc_engine.py:1286-1306`
**Claim being challenged:** Safe re-runnable population analysis.
**Evidence:** The loop uses `async with db.begin_nested()` per member (SAVEPOINT), then `await db.commit()` per batch. If an error happens inside one `analyze_member`, the savepoint rolls back. But the `db.commit()` at end of each batch is outside any tryexcept and will raise if the session is in a broken state from a non-savepoint-caught error. There is no resume/checkpoint — a mid-run crash leaves inconsistent state (some batches persisted, some not, `RafHistory` rows partially written).
**Missing proof:** No chaos test. No "resume from member X" mechanism.
**Recommendation:** Log per-member outcomes to a durable `pipeline_run` table. Fail-fast on DB errors and provide a resume command keyed on `pipeline_run_id`.

### [IMPORTANT] Tenant-isolation LLM guard's validation is string-match heuristics, easily fooled
**Location:** `backend/app/services/llm_guard.py:205-246`
**Claim being challenged:** "LLM Guard enforces tenant data isolation across all AI calls" (README).
**Evidence:** `validate_llm_output` checks for regex hedging patterns ("I think", "I believe", "approximately") and a naive `tenant[_\s](\w+)` regex. A model response containing numbers with decimals and no naive "tenant_X" string is declared valid. It does not verify that the response's numbers appear in the provided context — the fabrication-detection claim in the docstring is aspirational, not enforced.
**Missing proof:** No test with a known-wrong LLM output shows the guard catching it.
**Recommendation:** Extract all numbers from the response, check they exist verbatim in the serialized `context_data`, and flag any unseen numeric value. Add a test that feeds a known-hallucinated response and asserts `validated=False`.

### [IMPORTANT] Tuva synthetic-data demo claim ("1,000 patients" / "611/624 models") is unverifiable from code
**Location:** README `Current Build` section; `backend/tests/test_tuva_e2e.py`
**Claim being challenged:** "Full Tuva Health integration (dbt + DuckDB, 18 data marts, 611/624 models)" is stated as Completed.
**Evidence:** `test_tuva_e2e.py` skips every test if `dbt` isn't installed. Even when it runs, the assertions are `returncode == 0` and "compile succeeded." No test verifies that 611/624 models built, that 1,000 members were scored, or that the HCC mart matches the AQSoft engine within a tolerance. There's no recorded "last successful run" artifact.
**Missing proof:** No stored test report, no CI log, no `dbt run --target=test` baseline.
**Recommendation:** Commit a nightly CI job that runs the full Tuva pipeline on synthetic data and fails if any of the 624 models errors. Publish the output as a build artifact.

### [IMPORTANT] Hard-coded PMPM_BENCHMARKS, SNF_LOS_BENCHMARKS, EXPENDITURE_BENCHMARKS with no source citation
**Location:** `backend/app/constants.py:24-49` and `backend/app/services/discovery_service.py:54-58`
**Claim being challenged:** README: "Real CMS Data, Not Estimates" and "Every dollar value in the platform is based on actual CMS-published rates."
**Evidence:** `constants.py:24-33` declares PMPM_BENCHMARKS (`"inpatient": 450`, etc.) with no source cite. `discovery_service.py:54-57` declares SNF_LOS_BENCHMARKS (`"CHF": 18, "COPD": 14`, etc.) that trigger "$-impact" calculations. Variance against these benchmarks drives the "autonomous discovery" dollar-impact numbers shown in the UI. The constants file comment "THIS IS A DEFAULT ESTIMATE" for CMS_PMPM_BASE is honest — but the README headline claim contradicts it.
**Missing proof:** No per-tenant override mechanism live, no CMS source document citation.
**Recommendation:** Either cite sources for each benchmark or relabel them as "starter defaults, override in tenant.config." The README's "not estimates" sentence should be struck until county-rate-driven PMPM is the actual computation everywhere.

### [IMPORTANT] `date.today()` used throughout — timezone-sensitive logic in a multi-tenant SaaS
**Location:** `backend/app/services/hcc_engine.py:170, 260, 289, 793, 1166` (and many others)
**Claim being challenged:** Correctness at the year boundary for CMS payment year calculation.
**Evidence:** `get_current_payment_year()` uses `date.today().year`. Run on a Docker container in UTC at 2026-01-01 00:15 UTC (US-west 2025-12-31 16:15 local), the "current payment year" flips based on server timezone. CMS "collection year" for payment year computation similarly flips. The server locale is not pinned in Dockerfile reviews or lifespan hook.
**Missing proof:** No test covering the 23:59→00:01 UTC boundary.
**Recommendation:** Use `datetime.now(timezone.utc).date()` or an explicit tenant-configured TZ. Audit every `date.today()` call.

### [IMPORTANT] Onboarding wizard still falls back to DEMO_FINDINGS in real mode
**Location:** `frontend/src/components/onboarding/WizardStep5Processing.tsx:195-203`
**Claim being challenged:** `project_stubs_and_incomplete.md` item 3 says "Onboarding wizard fake success" was FIXED on 2026-04-03.
**Evidence:** After fetching `/api/insights`, the code does: `setFindings(realFindings.length > 0 ? realFindings : DEMO_FINDINGS)` and in the catch block `setFindings(DEMO_FINDINGS)`. If the real API returns an empty insights list (a valid outcome for a brand-new tenant), the UI silently shows synthetic demo findings as if they were real results. The distinction between "no insights yet" and "demo fallback" is invisible to the user.
**Missing proof:** No test of the empty-insights path.
**Recommendation:** Show an empty-state UI ("Still processing — check back in a few minutes") rather than hallucinated demo findings. Reserve DEMO_FINDINGS for `demoMode === true` only.

### [IMPORTANT] `filter_service.apply_filter` is still a no-op despite catalog claim of "partial fix"
**Location:** `backend/app/services/filter_service.py:195-218`
**Claim being challenged:** The frontend calls `/api/filters/apply` expecting filtered results.
**Evidence:** The service returns `{"applied": True, "conditions": conditions, "context": page_context}` — it does NOT apply any filter server-side. The TODO admits "This function intentionally does NOT perform server-side filtering." The router (`routers/filters.py:154-167`) happily exposes this as `apply_filter_preview`. The frontend relies on being small enough to filter client-side; scaling past ~5K rows silently over-serves unfiltered data.
**Missing proof:** No gate on result-set size.
**Recommendation:** Either implement server-side filtering or rename the endpoint `/api/filters/echo` so callers cannot assume filtering occurred. Add a row-count guard to reject payloads > 5000.

### [IMPORTANT] Metriport "adapter" is a skeleton — marked "Planned" in ecosystem table but importable and registered
**Location:** `backend/app/services/payer_adapters/metriport.py:22-28` (docstring) and `309-333` (stub methods)
**Claim being challenged:** README's integration table lists Metriport as "Evaluated, planned" but code loads it into the payer adapter registry.
**Evidence:** Docstring line 22: "NOTE: This adapter is a skeleton." Nine abstract methods (`fetch_patients`, `fetch_conditions`, `fetch_claims`, `fetch_coverage`, `fetch_providers`, `fetch_medications`, `fetch_observations`) are all `return []`. `process_patient` sends live HTTP to Metriport's sandbox — if a tenant admin misconfigures the adapter as "production" with placeholder credentials, first call throws an uncaught `KeyError` from `patient.get("id")` on None.
**Missing proof:** No integration test; no guard preventing registration if adapter is skeleton.
**Recommendation:** Gate registration behind a `status="beta"` flag in `PAYER_REGISTRY` so the UI labels Metriport as "Not ready — cross-network data will not load." Guard `process_patient` against None `patient` result.

### [IMPORTANT] LLM hallucination protection whitelists "estimated" — a commonly fabricated hedge
**Location:** `backend/app/services/llm_guard.py:212-214`
**Evidence:** Comment says "estimated is intentionally excluded — our prompts ask the LLM for 'estimated annual dollar impact.'" Meaning the single most common hedge verb that appears in fabrication ("I estimated the patient has roughly...") is explicitly allowed through. Output with `"estimated $4,200 in HCC opportunity"` will pass validation even if no underlying data exists.
**Missing proof:** No counter-test showing that a fabricated "estimated" number is caught by the remaining checks (it isn't — no cross-reference against context_data numbers).
**Recommendation:** Don't whitelist the token — inspect the surrounding sentence for a concrete citation from context_data.

### [IMPORTANT] `/api/tuva/comparison` is documented as auth-free (demo) but the test expects 500 too
**Location:** `backend/tests/test_api_routes.py:168-177`
**Evidence:** `test_tuva_comparison` asserts `resp.status_code in (200, 500)` — i.e., the test considers a 500 server error an acceptable outcome. A "demo" endpoint that's allowed to 500 in CI gives no regression protection.
**Missing proof:** The test proves nothing about correctness.
**Recommendation:** Either make the endpoint deterministic (seed the demo DB as part of the fixture) or mark the test `xfail` with a reason.

---

## MINOR findings

### [MINOR] No cleanup/close of DuckDB connections in Tuva export tests
**Location:** `backend/tests/test_tuva_export.py` — each test calls `service.close()` but `TuvaExportService` holds a handle that may leak on test failure.
**Recommendation:** Use a pytest fixture with `yield` + teardown.

### [MINOR] README ICD-10 example (N18.3 → HCC 329) is at odds with CMS V28 published mapping for some codes
**Location:** `backend/app/services/hcc_engine.py:96-111` example in docstring.
**Evidence:** The example says `N18.3  -> no HCC (truncated)`, `N18.30 -> HCC 329, RAF 0.127`. CMS-V28 specifies N18.30 (CKD stage 3 unspecified) — worth confirming the RAF 0.127 came from the same CMS release used for N18.31/32/4/5. No build-time check cross-references against a CMS master.
**Recommendation:** Add a unit test that verifies a few spot codes match an official CMS V28 RAF sheet.

### [MINOR] `SuspectStatus` vs `suspect.status == SuspectStatus.captured.value` comparison style is inconsistent
**Location:** `backend/app/services/learning_service.py:61-66` does `suspect.status == SuspectStatus.captured` (enum), then three lines later compares to `SuspectStatus.captured.value` (string). Silent bugs lurk here.
**Recommendation:** Pick enum or str consistently; enforce via mypy + tests.

### [MINOR] `CLINICAL_RULES` and `_ICD10_FULL_LOOKUP` are not thread-safe on first load
**Location:** `backend/app/services/clinical_nlp_service.py:40-85`
**Evidence:** Two concurrent requests racing on first hit could both load the JSON and assign to the global — benign but wasteful.
**Recommendation:** Use `functools.lru_cache` or an `asyncio.Lock`.

### [MINOR] `CMS_PMPM_BASE = 1100.0` used directly to compute annual dollar impact everywhere
**Location:** `backend/app/constants.py:19` and every caller.
**Evidence:** Even though county-rate resolution exists (`county_rate_service`), the fallback is a single national number. Insight output claims exact dollar amounts.
**Recommendation:** Label UI dollar values `estimate (national rate)` when county fallback is in use.

### [MINOR] `analyze_member` swallows exceptions in provider-pattern lookup (`except Exception: pass`)
**Location:** `backend/app/services/hcc_engine.py:929-934` and `944-945`
**Evidence:** `bare-except: pass` hides data-quality issues. If the SQL query fails, analysis proceeds silently.
**Recommendation:** `logger.warning` at minimum.

### [MINOR] `search_path RESET` in `_demo_session` swallows errors with a bare `except Exception: pass`
**Location:** `backend/app/routers/tuva_router.py:57-62`
**Recommendation:** Log the failure — leaving search_path set to `demo_mso` would cross-contaminate the next request if connection pooling is in play.

---

## VERDICT

**NEEDS WORK.**

Root concerns: (1) several production-labeled capabilities are stubs or heuristics dressed as evidence-based (hard-coded confidence scores, demographic-RAF=0 in fallback, recapture depending on pre-existing suspects, dollar-impact from uncited benchmarks); (2) security posture has real holes (unauth'd Claude endpoint, auth/demo adapter that cannot be restored, webhook endpoint checks OK but unauth'd NLP remains); (3) the "104 tests" figure hides that a meaningful portion are empty assertions or CI-skippable, and integration/e2e tests don't fail-hard when tools are missing. The platform is a credible partner demo, not a production system for managing real Medicare Advantage dollars. Fix the CRITICAL items and re-run this review before onboarding any tenant with real PHI or real dollar decisions.
