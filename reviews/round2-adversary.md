# Adversarial Security Review — AQSoft Health Platform (Round 2)

**Reviewer:** The Adversary
**Date:** 2026-04-17
**Scope:** Diff since round 1 (dashboard.py, journey.py, fhir_service.py, journey_service.py, member_service.py, FileUpload.tsx, JobHistory.tsx, WizardStep5Processing.tsx, AskBar.tsx, MemberDetail.tsx, mockApi.ts, DataQualityPage.tsx, TuvaPage.tsx).

---

## CLOSED (round-1 findings now fixed)

- **Silent frontend error-swallows (`catch {}`) on capture/dismiss actions** (MemberDetail.tsx round-1 implicit UX finding) — now verified: `handleCapture`/`handleDismiss` set per-row `errorByRow` state and render a red inline retry affordance (MemberDetail.tsx:88-94, 114-122, 247-258). Extracted `extractErrorMessage` handles 403/409/network cases (MemberDetail.tsx:58-66).
- **Silent failure in AskBar on `/api/query/ask` errors** — closed: AskBar now surfaces a differentiated status-code-aware message and a retry button using `lastAskedQuestion` (AskBar.tsx:69-79, 179-191).
- **TuvaPage raw `fetch()` bypassed the auth interceptor** — closed: all Tuva calls now go through `api.get()` (TuvaPage.tsx:194-199, 225, 914-918), which means Authorization headers are attached in real mode and mockApi interception works in demo mode. Once the user lands the deferred auth on the Tuva router this is correct by default.
- **FHIR CapabilityStatement advertised stub resources (`create` on Observation/Encounter/Procedure) that silently skip ingestion** — closed: `get_capability_statement` now only lists resources whose handler value is truthy (fhir_service.py:110-137).
- **Division-by-zero on empty ingestion batch in DataQualityPage** — closed: `latest.total_rows > 0` guard added (DataQualityPage.tsx:197-198).
- **WizardStep5Processing silently marked pipeline "complete" even on errors** — closed: it now checks `result.status` for `failed`/`error`/`stub`, surfaces a red error-summary banner, and only celebrates when every step succeeded (WizardStep5Processing.tsx:144-164, 279-306).

## STILL OPEN (round-1 findings user chose NOT to fix, still in scope)

- **Path traversal in upload filename** — unchanged: `unique_name = f"{uuid.uuid4().hex}_{file.filename}"` still at backend/app/routers/ingestion.py:218. An authenticated user can submit `file.filename = "../../etc/passwd"` and the UUID prefix becomes a subdirectory segment rather than a sanitizer. Blast radius grows with the deferred-root-Dockerfile decision. **Recommendation:** `safe_name = Path(file.filename).name` + reject if it contains `..` or path separators, or store as `f"{uuid.uuid4().hex}{ext}"` — the original filename is already persisted in the DB row.
- **File read fully into memory before size check** — unchanged: backend/app/routers/ingestion.py:209-214. Combined with the new 5s polling on JobHistory, any attacker who sends many concurrent large uploads OOMs the Uvicorn worker. Still an auth-gated DoS.
- **Tracebacks leak raw exception text in payer_api.py** — unchanged: backend/app/routers/payer_api.py:189, 219 still f-string `detail=f"Payer authentication failed: {e}"`.
- **`pool_pre_ping=True` without `pool_recycle` / `reset_on_return`** — unchanged (see database.py).
- **`hmac.compare_digest` uses global secret fallback** — unchanged (adt.py:128-137).
- **Passlib bcrypt startup check warns but boots** — unchanged (auth_service.py:12-25).
- **No CSP / security headers** — unchanged.
- **OAuth `state` parameter = tenant schema name** — unchanged (payer_api.py:94, 145-149).
- **`DEFAULT_SECRET` bypass switch via `ALLOW_DEFAULT_SECRET`** — unchanged (main.py:21-26).
- **Global exception handler bland 500 vs audit signals** — unchanged (main.py:115-118).
- **`member_id_value = fhir_id` fallback in `_ingest_patient`** — unchanged (fhir_service.py:165-170). Identifier-resolution logic is unchanged since round 1.
- **CORS `allow_credentials=True` with wildcard methods/headers** — unchanged.

## DEFERRED BY USER (for the record only — not re-flagged)

- Payer OAuth base64 "encryption"
- Frontend-only RBAC / missing `require_role` on backend routers
- `DEMO_MODE=true` auth bypass on Tuva router
- JWTs in localStorage
- No login rate limiting
- No PHI audit log
- Seeded `admin@aqsoft.ai / admin123` and `demo@aqsoft.ai / demo123`
- Stored prompt injection via `corrected_answer`
- Clinical notes fed to Claude with no prompt-injection defense
- Dockerfile runs as root

---

## NEW FINDINGS (introduced by round-1 fixes or surfaced fresh)

### [CRITICAL] `get_member_risk_trajectory` uses SQLite-only `func.strftime` — breaks on Postgres, endpoint 500s
**Location:** `backend/app/services/journey_service.py:262-286`
**Evidence:**
```python
from sqlalchemy import func
...
cost_q = await db.execute(
    select(
        func.strftime("%Y-%m", Claim.service_date).label("ym"),
        func.coalesce(func.sum(Claim.paid_amount), 0).label("spend"),
    )
    .where(Claim.member_id == member_id)
    .group_by("ym")
)
cost_by_month: dict[str, float] = {}
try:
    for ym, spend in cost_q.all():
```
The platform's configured database is `postgresql+asyncpg://...` (backend/app/config.py:6). PostgreSQL does not have `strftime()` — the correct function is `to_char(col, 'YYYY-MM')`. `await db.execute(...)` will raise `asyncpg.exceptions.UndefinedFunctionError` on line 272, **before** entering the `try` block at line 281, so the defensive `except` does nothing. The request returns a 500 via the global exception handler. The round-1 fix to enrich the trajectory with cost + event overlays regressed the `/api/journey/{member_id}/trajectory` endpoint on Postgres.
**Risk:** Journey trajectory chart is broken for every tenant running on Postgres (i.e. all of them). In real mode the chart never renders; users see a generic 500. The `event_by_month` / `captured_q` / `closed_q` blocks that follow also never execute. This is both a correctness regression and an availability issue for a customer-facing page.
**Recommendation:** Replace with `func.to_char(Claim.service_date, 'YYYY-MM').label("ym")` (Postgres) or compute month bucketing in Python by iterating `Claim` rows and grouping by `c.service_date.strftime("%Y-%m")`. Same fix for the `event_by_month` path (those already use Python `d.strftime` — fine — so only the SQL `func.strftime` needs changing). Add a regression test that hits `/api/journey/{id}/trajectory` against the real Postgres engine.

---

### [IMPORTANT] `/api/journey/members` search has no input length or wildcard bound — DoS + pattern-enumeration vector
**Location:** `backend/app/routers/journey.py:96-123`
**Evidence:**
```python
@router.get("/members", response_model=list[MemberSearchResult])
async def list_journey_members(
    limit: int = Query(250, ge=1, le=1000),
    search: str | None = Query(None),
    ...
):
    stmt = select(Member).order_by(Member.current_raf.desc().nullslast()).limit(limit)
    if search:
        like = f"%{search.lower()}%"
        stmt = select(Member).where(
            (Member.first_name.ilike(like))
            | (Member.last_name.ilike(like))
            | (Member.member_id.ilike(like))
        ).limit(limit)
```
`search` has no `min_length`/`max_length`. An authenticated user can POST `search=<200KB string>` and Postgres will run `ILIKE '%<huge>%'` across three text columns, full-scan. Additionally, `search` is passed verbatim without escaping `%` or `_`: a user sending `search="%"` matches every member (harmless — equivalent to empty search), but a user sending `search="M%1%0%0%3"` can perform pattern probing to enumerate members by partial identifier without ever having the full MBI. Because the search is case-lowered but `%`/`_` wildcards reach the DB, this becomes a tenant-scoped enumeration primitive for anyone with the lowest-privilege token.
**Risk:** Authenticated DoS (cheap — one slow query per request, many ILIKEs fan-out per column), plus subtle member-ID probing that never matches the UI's expected free-text behavior. Compounds the deferred RBAC finding — since no role check gates `/api/journey/members`, any `outreach` user can probe identifiers.
**Recommendation:** Add `search: str | None = Query(None, min_length=2, max_length=64)`. Escape `%` and `_` by calling `.ilike(like, escape="\\")` and wrapping the raw search with `search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")` before forming `like`. Also consider requiring at least 2 chars before hitting the DB.

---

### [IMPORTANT] `/api/skills/execute-by-name` leaks the full action catalog on bad input
**Location:** `backend/app/routers/skills.py:125-130`
**Evidence:**
```python
known_actions = {a["action"] for a in AVAILABLE_ACTIONS}
if action not in known_actions:
    raise HTTPException(
        status_code=400,
        detail=f"Unknown action '{body.action}'. Available: {sorted(known_actions)}",
    )
```
The wizard retry (WizardStep5Processing.tsx:143, 165) now drives this endpoint from the UI on every retry. Any authenticated tenant user, regardless of role, can `POST /api/skills/execute-by-name {"action":"x"}` and receive the full enumerated action list (run_hcc_engine, detect_care_gaps, generate_insights, run_discovery, evaluate_alert_rules, run_quality_checks, generate_chase_list, create_action_items, send_notification, generate_report, refresh_dashboard, calculate_stars, refresh_provider_scorecards, and every alias). Combined with the absence of server-side RBAC (user-deferred), the same low-privilege user can then invoke any of those actions against the tenant — the enumeration + execution path is end-to-end reachable from one JWT.
**Risk:** Information disclosure (pipeline surface), and — because executing an action has side effects (regenerate insights, refresh scorecards, evaluate alert rules) — a low-privilege user can force expensive background jobs to run or can cause spurious alerts to fire. Low severity in the current deferred-RBAC posture, but it gets worse, not better, as more actions are added.
**Recommendation:** Return a generic `detail="Unknown action"` without enumerating. Log the rejected action server-side only. When RBAC lands, gate this route behind `require_role("mso_admin","superadmin")`.

---

### [IMPORTANT] `_execute_step` returns raw `str(e)` exception text in the JSON response
**Location:** `backend/app/services/skill_service.py:329-376` + `backend/app/routers/skills.py:133-139`
**Evidence:**
```python
# skill_service.py
except Exception as e:
    logger.error("run_hcc_engine failed: %s", e)
    return {"status": "failed", "error": str(e)}
```
```python
# skills.py
return {
    "action": body.action,
    "resolved_action": action,
    "summary": result.get("message") or result.get("status", "completed"),
    **result,
}
```
Because `**result` is spread into the response, the `"error": str(e)` field propagates verbatim to the client for every catching branch (run_hcc_engine, detect_care_gaps, generate_insights, run_discovery, evaluate_alert_rules, run_quality_checks). This is the same class of information disclosure that round 1 flagged in payer_api.py — but now reachable from every authenticated user via the onboarding wizard. SQLAlchemy errors typically embed the offending SQL fragment and parameter values; those can include member IDs, tenant schema names, and date ranges.
**Risk:** Exception text on the wire. The frontend doesn't render `result.error` directly (it uses `result.message`/`result.summary`), but anyone inspecting the raw JSON (browser devtools, a compromised browser extension, a proxy) sees the stack-derived string. This is the round-1 finding replicated in a different router.
**Recommendation:** Drop the `"error"` key (or rename to an internal-only logger field). Return `{"status": "failed", "message": "Pipeline step failed — see logs"}` and log the stacktrace once server-side.

---

### [IMPORTANT] `member_service.get_member_list` sentinel `days_since_visit = 999` silently flags members with no recorded visit as overdue
**Location:** `backend/app/services/member_service.py:289`
**Evidence:**
```python
"days_since_visit": int(row.days_since_visit) if row.days_since_visit is not None else 999,
```
The round-1 fix normalized nulls to non-null values so the frontend wouldn't display "null days since visit". But `999` isn't a neutral sentinel — it's a value that passes every existing "stale member" predicate. The frontend Alert Rules (`conditions: { ... rules: [{ field: "days_since_visit", operator: ">=", value: 180 }] }` in mockData.ts:3269) and member-filter queries all compare numerically. Any member whose `last_visit_date` is genuinely unknown (new attribution, missing claims feed, freshly onboarded tenant) is now silently counted as 999-days-overdue and fires care-management workflows. On a 1,000-member panel this can flood the care team with false alerts on day 1 of ingestion.
**Risk:** Data integrity — alert fatigue, fabricated urgency, and incorrect "overdue visits" counts on scorecards. A care manager sees 300 "no visit in 180+ days" rows that are really "no claims data yet".
**Recommendation:** Keep `days_since_visit` nullable in the API. Have the frontend render "—" when null. If a non-null default is truly required for a frontend framework constraint, use a negative sentinel (`-1`) or a separate `has_visit_data: bool` flag that rules must check. Do NOT use `999` which silently crosses every threshold.

---

### [IMPORTANT] MemberDetail retry button silently morphs "dismiss" into "capture" after cancel
**Location:** `frontend/src/components/suspects/MemberDetail.tsx:230, 251`
**Evidence:**
```jsx
<button
  onClick={() => { setDismissingId(null); setDismissReason(""); }}  // Cancel clears dismissingId
  ...
>
  Cancel
</button>
...
<button
  onClick={() => (dismissingId === s.id ? handleDismiss(s.id) : handleCapture(s.id))}
  className="underline font-medium"
>
  Retry
</button>
```
Flow: user clicks Dismiss → types reason → clicks OK → server 500 → `errorByRow[s.id]` set, `dismissingId` NOT cleared (line 115-123 clear it only on success) → user clicks Cancel → `dismissingId` is now null → user clicks Retry on the lingering error → the ternary routes to `handleCapture(s.id)`, a completely different action. A care manager thinks they're retrying their dismiss; the server records a capture, which affects HCC submission and RAF revenue.
**Risk:** Integrity — wrong suspect status is persisted. In HCC workflow, "dismissed" and "captured" are operationally opposite: one takes a code out of the submission queue, the other puts it in. Silently swapping them on user retry produces incorrect CMS submissions and could trigger false-positive findings in a RADV audit.
**Recommendation:** Track the last action type alongside the error: `errorByRow: Record<number, { message: string; action: "capture" | "dismiss" }>`. Retry routes to the remembered action regardless of current `dismissingId`. Or clear `errorByRow[s.id]` in the Cancel handler to prevent retrying a stale error after the mode has changed.

---

### [MINOR] `/api/journey/members` has no `ORDER BY` secondary key — nondeterministic pagination order
**Location:** `backend/app/routers/journey.py:104, 111`
**Evidence:**
```python
stmt = select(Member).order_by(Member.current_raf.desc().nullslast()).limit(limit)
if search:
    stmt = select(Member).where(...).limit(limit)  # <-- ORDER BY lost entirely when searching
```
When `search` is supplied, the new `stmt` has no `order_by` clause, so Postgres returns rows in arbitrary order. When `search` is absent and there are many members with identical `current_raf` (e.g., `NULL` for freshly-onboarded tenants), ordering within ties is also nondeterministic. Pagination tooling cannot give stable results.
**Risk:** UX confusion; also can confuse downstream tests that assume stable ordering.
**Recommendation:** Always chain `.order_by(Member.current_raf.desc().nullslast(), Member.id.asc())` and preserve ordering in the search branch: rewrite as a single `stmt` that conditionally adds `.where(...)` rather than rebuilding from scratch.

---

### [MINOR] `JobHistory` polls every 5s forever if a job is stuck in a non-terminal status
**Location:** `frontend/src/components/ingestion/JobHistory.tsx:5-6, 59-76`
**Evidence:**
```js
const POLL_INTERVAL_MS = 5000;
const TERMINAL_STATUSES = new Set(["completed", "failed"]);
...
if (hasInFlight) {
  pollTimerRef.current = setTimeout(() => { fetchJobs(); }, POLL_INTERVAL_MS);
}
```
No max-attempts guard and no exponential backoff. If the ingestion worker dies with a job stuck in `"processing"`, every browser tab with the page open pounds `/api/ingestion/jobs` every 5s indefinitely. At a dozen open tabs per office user this becomes noticeable load on `/api/ingestion/jobs` and triggers no alarm. Also, because the effect runs on every `jobs` change, an unstable response (shuffled array identity) could invalidate the effect and reset the timer, re-calling fetchJobs more often than intended.
**Risk:** Client-driven DoS-adjacent load. Mostly relevant once the backend is under real production load.
**Recommendation:** Cap total polls or switch to exponential backoff (5s → 10 → 20 → 60s). Detect "processing > 10 min" and flip to a manual-refresh UI. Consider a websocket/SSE for real-time job status instead of polling.

---

### [MINOR] FileUpload's 413/415 status-code branches are unreachable — backend never returns those codes
**Location:** `frontend/src/components/ingestion/FileUpload.tsx:163-168` vs `backend/app/routers/ingestion.py:201-214`
**Evidence:** Frontend:
```js
if (status === 413) setError("File is too large. Split it into smaller files and retry.");
else if (status === 415) setError("Unsupported file type. Use CSV or Excel.");
```
Backend:
```python
raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. ...")
raise HTTPException(status_code=400, detail=f"File too large. ...")
```
Both conditions emit `400`, not `413`/`415`. The friendly messages in the frontend never trigger; users see the default branch (`detail` string). Not a security bug but falsely implies resilience to conditions that aren't actually distinguished.
**Risk:** None. Cleanliness.
**Recommendation:** Either return 413 for size and 415 for type from the backend (standard HTTP semantics, also aligns with reverse-proxy error pages), or delete the unreachable frontend branches.

---

### [MINOR] Demo mode `mockApi` ingestion upload response reveals real backend field schema and data patterns to anyone on aqhealth.ai
**Location:** `frontend/src/lib/mockApi.ts:1053-1079`
**Evidence:**
```js
const proposed_mapping: Record<string, {...}> = {
  member_id:      { platform_field: "member_id",     confidence: 98, transform: null },
  dos:            { platform_field: "service_date",  confidence: 88, transform: null },
  dx_primary:     { platform_field: "diagnosis_1",   confidence: 82, transform: null },
  paid_amt:       { platform_field: "paid_amount",   confidence: 92, transform: null },
  rendering_npi:  { platform_field: "rendering_npi", confidence: 95, transform: null },
};
```
This mock is bundled into the public demo (github.io, aqhealth.ai, *.pages.dev). It exposes the exact internal canonical field names (`service_date`, `diagnosis_1`, `paid_amount`, `rendering_npi`) and the column-mapper's confidence scoring schema. An attacker scoping future real uploads knows precisely which column names to target and what confidence thresholds trigger auto-accept.
**Risk:** Low — these are standard healthcare field names that anyone with domain knowledge can guess. But the mock needlessly codifies them and pairs them with confidence scores, which is more information than needed for a visual demo.
**Recommendation:** Accepted risk given the demo audience. If it matters, generalize the mock to use generic labels (`target_field: "<canonical>"`) or synthesize randomized confidences each call so the schema isn't pinned.

---

### [MINOR] Demo mode mockApi does not intercept `/api/ingestion/\d+/errors` or similar error-detail paths — those fall through to real backend
**Location:** `frontend/src/lib/mockApi.ts:2135-2174`
**Evidence:** The mock intercepts `/api/ingestion/jobs/\d+` and `/api/ingestion/jobs` but does NOT cover every ingestion sub-route (e.g., any future `/errors`, `/retry`, `/rollback` routes). The fallback is `data: null` which the frontend may not handle gracefully, potentially causing the demo to make real network calls from a public page that has no auth.
**Risk:** Minor — future routes risk leaking calls from the public demo to the production backend (or more likely, failing silently).
**Recommendation:** Add a catch-all `else if (url.includes("/api/ingestion/"))` that returns `{ items: [], total: 0 }` or an explicit demo-mode error, so no ingestion URL escapes the mock in demo mode.

---

### [MINOR] `_build_claim_event` reads `row["service_date"]` but `get_member_journey` populates the row with the DB column `c.service_date` which is a `Date` → code is fine; however the `diagnoses` list comes straight from DB and is rendered in the UI — trust boundary note
**Location:** `backend/app/services/journey_service.py:85` + `frontend/src/components/members/... (timeline renderers)`
**Evidence:**
```python
"diagnoses": dx_codes,  # from c.diagnosis_codes JSONB
```
`diagnosis_codes` is a JSONB column populated by the ingestion pipeline. If the ingestion parser ever lets non-code strings through (e.g., "See note re: <script>..."), those reach the rendered timeline. React escapes by default, but any future use of `dangerouslySetInnerHTML` on timeline descriptions would be trivially exploitable.
**Risk:** Conditional / future-proofing; not an exploit today because all renderers are text-safe.
**Recommendation:** Keep an invariant test: every diagnosis code in the timeline must match `^[A-Z][0-9A-Z]{2,6}(\.[0-9A-Z]{1,4})?$`. Reject or strip anything else at ingestion; never at render time.

---

## VERDICT: NEEDS WORK

Round 1's error-handling fixes are real and closed the UX silent-failures. The new `/api/journey/members` endpoint plus the `get_member_risk_trajectory` expansion introduced four fresh issues worth fixing before any production pilot: (1) the Postgres-incompatible `func.strftime` call makes the trajectory endpoint 500 on every configured database, (2) the unbounded search parameter enables DoS and wildcard probing, (3) the `days_since_visit = 999` sentinel fires false stale-member alerts, and (4) the MemberDetail retry button can convert a failed dismiss into a capture and persist the wrong HCC decision. The path-traversal, in-memory file buffering, and error-text leakage findings from round 1 remain open in the areas touched this session. Ship the CRITICAL Postgres-`strftime` fix and the IMPORTANT sentinel/retry-semantics fixes before the next customer touch.
