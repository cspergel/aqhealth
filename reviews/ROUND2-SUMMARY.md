# Round 2 Review — Cross-Agent Summary

Five forgeplan review agents re-reviewed the codebase after the first round of fixes. All five again returned non-approval.

| Agent | New findings | Verdict | Round-1 closures verified |
|---|---|---|---|
| Adversary | 11 (1C/6I/4M) | NEEDS WORK | 6 |
| Contractualist | 8 (1C/4I/3M) | REQUEST CHANGES | 7 (all 5 CRITICALs) |
| Pathfinder | 10 (2C/5I/3M) | REQUEST CHANGES | all 4 round-1 CRITICALs |
| Skeptic | 13 (1C/9I/3M) | NEEDS WORK | 0 (most were parked) |
| Structuralist | 8 (0C/6I/2M) | REQUEST CHANGES | 1 |

## The biggest round-2 finding (3-agent cross-confirmed)

**[CRITICAL] `journey_service.py:274` uses SQLite-only `func.strftime("%Y-%m", …)`.** The platform runs Postgres (`config.py:6`). Postgres has no `strftime` — the SQL query raises **before** my defensive `try: … except` block, so `/api/journey/{id}/trajectory` now 500s on every tenant. This is a regression I introduced while fixing the Contractualist's TrajectoryPoint contract. Flagged independently by **Adversary, Skeptic, Structuralist**.

Fix: `func.to_char(Claim.service_date, 'YYYY-MM')`.

## The second biggest — a parallel bug I missed

**[CRITICAL] `journey_service.get_member_journey` emits `dob=None, age=None, gender=None`** against a `MemberSummary` Pydantic model I declared with `dob: str`, `age: int`, `gender: str` (required). I fixed the same null-coercion bug in `member_service` and forgot to carry it to the journey path. `/api/journey/{id}` will 500 on any member with a missing DOB. Flagged by **Contractualist**.

## Two CRITICALs from my own demo mocks

**[CRITICAL] `/api/onboarding/discover-structure` mock** returns groups without a `providers` array. `OrgDiscoveryReview` reads `group.providers.length` → crashes the demo ingestion wizard at Step 2. The very flow I was trying to unbreak. Flagged by **Pathfinder + Contractualist**.

**[CRITICAL] `/api/tuva/raf-baselines/summary` mock** missing `total_baselines`, `agreement_rate`, `avg_discrepancy_raf`. TuvaPage Overview calls `.toLocaleString()` / `.toFixed()` on `undefined` → page crashes on demo mode load. Flagged by **Pathfinder + Contractualist**.

## High-impact IMPORTANTs (multi-agent or novel)

- **`days_since_visit = 999` sentinel** — my null replacement trips every `>= 180 days` alert rule on day-1 tenants. Day-one customers see a flood of false care alerts. **Adversary + Skeptic**.
- **`MemberDetail` retry button** — `dismissingId === s.id ? handleDismiss : handleCapture`. If the user canceled the dismiss panel between failure and retry, the retry clicks Capture instead — a wrong HCC clinical decision persisted. **Pathfinder + Adversary + Skeptic**.
- **`WizardStep5` `onComplete` still fires even if every step failed** — my gate only prevents the celebration UI, not the `onComplete()` callback. User can click "Finish" with no data. **Pathfinder**.
- **`JobHistory` `setTimeout` polling** — stops permanently after a single transient fetch failure (I switched from `setInterval` to `setTimeout`-chained). Also polls forever if backend adds any non-terminal status beyond `completed`/`failed` (e.g. `validating`, `paused`). **Pathfinder + Skeptic**.
- **`normalizeUploadResponse.row_count`** reports sample rows (5), not file rows — misleading user by 3-4 orders of magnitude on any real upload. **Skeptic**.
- **`dashboard.py /summary` inline imports** — regresses round-1's "routers shouldn't do service work." `dashboard_service` already imports the same symbols at module top; if those work there, they work here. Inline imports are a code smell masking a layering problem. **Structuralist**.
- **`/api/journey/members` duplicates `/api/members`** — same resource, different projection, new endpoint. Sets precedent for 57 routers → 80. **Structuralist + Skeptic**.
- **`normalizeUploadResponse` lives in `FileUpload.tsx`** — wrong layer. Should be in a `lib/api-contracts/` module if the project plans to do this transformation in more than one place (it will). **Structuralist**.

## Round-1 findings verified CLOSED

Across the five agents: all 4 Pathfinder CRITICALs, all 5 Contractualist CRITICALs, 6 Adversary items, and the FHIR CapabilityStatement. The demo-breaking UX fixes are real and shipped.

## What was correctly deferred (user decision)

Auth / RBAC / DEMO_MODE security, OAuth encryption, prompt-injection defense, rate limiting, audit log, `admin123` seeds, Alembic migrations, router business logic, hardcoded confidence scores, recapture logic bug, test quality. Agents listed these for the record but did not re-score them.

## Highest-leverage fixes (what to do next)

1. **Fix the Postgres `strftime` bug** in `journey_service.py:274` — one-line swap to `func.to_char`.
2. **Carry null-coercion to `journey_service.get_member_journey`** so dob/age/gender never emit `None` against the required-field schema.
3. **Fix the two mock shapes** (onboarding/discover-structure `providers`, tuva raf-baselines/summary fields) so the demo actually loads end-to-end.
4. **Swap `days_since_visit = 999`** for `None` (widen the Pydantic type) or a `has_visit_data` flag to stop false alerts.
5. **Fix `MemberDetail` retry** — store the last *action type* per row, not derive from transient `dismissingId` state.
6. **Gate `onComplete` on step success** in WizardStep5, not just the celebration UI.
7. **JobHistory polling** — swap back to `setInterval` with cleanup ref, OR keep `setTimeout` but retry on fetch fail (don't abandon); widen terminal-status check.

## Per-agent detail

Full findings with file:line evidence:
- `reviews/round2-adversary.md`
- `reviews/round2-contractualist.md`
- `reviews/round2-pathfinder.md`
- `reviews/round2-skeptic.md`
- `reviews/round2-structuralist.md`
