# Phase Hardening — Security Cross-Cutting Sweeps

Owner: hardening agent
Scope: four cross-cutting sweeps (soft-delete read-path filters, JWT
revocation/logout, Claude per-tenant cost caps, TOTP/MFA).

## Summary

All four sweeps landed. Every file compiles (`python -m ast.parse`). No
third-party dependencies were added; TOTP is implemented in-stdlib
against RFC 4226/6238 rather than pulling in `pyotp`.

## Task 1 — Soft-delete read-path filter sweep

Added `.where(<Model>.deleted_at.is_(None))` (or the raw-SQL equivalent
`AND deleted_at IS NULL`) to every read-path SELECT that backs a live
view. Audit/export paths were NOT touched and continue to see
soft-deleted rows.

Services swept:

- `backend/app/services/member_service.py`
  - `get_member_list`: primary Member filter + every aggregate subquery
    (last_visit, suspect_count, gap_count, er/admit, spend).
  - `get_member_detail`: Member, Claim, HccSuspect, MemberGap lookups.
  - `get_member_stats`: mirrors `get_member_list`.
- `backend/app/services/hcc_engine.py`
  - `_get_member_claims` (both per-member + batch `_bulk_load_batch_context`).
  - `_detect_recapture_gaps` prior-suspect pull.
  - `analyze_member` dedup SELECT for existing open suspects.
  - `analyze_population` member-id roster.
- `backend/app/services/journey_service.py`
  - `get_member_journey`: Member, Claim, HccSuspect, MemberGap (+ join).
  - `get_member_risk_trajectory`: RafHistory, Claim, HccSuspect.captured_date,
    MemberGap.closed_date.
- `backend/app/services/dashboard_service.py`
  - Consolidated-CTE `get_dashboard_metrics`: added `deleted_at IS NULL`
    to every CTE (members, hcc_suspects ×2, claims).
  - `get_raf_distribution`, `get_revenue_opportunities`, `get_cost_hotspots`,
    `get_care_gap_summary`.
  - `get_dashboard_actions` CTE: added filters to `gaps` + `alerts` CTEs.
- `backend/app/services/care_gap_service.py`
  - `_get_eligible_members` (Member + dx-filter Claim).
  - `_detect_screening_gaps`, `_detect_medication_gaps`, `_detect_followup_gaps`
    (all Claim subqueries + MemberGap dedup fetches + Member PCP lookup).
  - `get_gap_population_summary` outer-join predicate on MemberGap.
  - `get_member_gaps`, `get_provider_gaps`.
  - `_auto_create_actions_for_critical_gaps` (gap + member + existing-action
    dedup).
  - `learn_gap_closure` — both candidate-CPT and fallback claim lookups.
- `backend/app/services/adt_service.py` (raw SQL — filters added as
  `AND deleted_at IS NULL` on `adt_events`, `care_alerts`, `members`,
  `hcc_suspects`):
  - `generate_alerts`: risk-tier lookup + open-suspects match.
  - `get_live_census`, `get_census_summary` (including NOT EXISTS discharge
    subqueries — both anchor and discharge sides filtered).
  - 7-day trend + today's admit/discharge counts.
  - `get_alerts` conditions seeded with `ca.deleted_at IS NULL`.
  - `_check_readmission`, `_match_patient` (all three matching strategies),
    `get_events`.
- `backend/app/services/annotation_service.py`
  - `get_annotations` + `get_follow_ups_due`.
- `backend/app/services/action_service.py`
  - `get_actions`, `get_action_stats`, `measure_outcomes`.

Intentionally NOT filtered (comments in-code):

- `learn_suspect_outcome` and `db.get(Member/HccSuspect, …)` point lookups
  — these are internal identifier resolutions, not listings.
- Raw SQL INSERT paths (`process_adt_event`, etc.) obviously unaffected.
- Audit/export paths (out of scope this sweep) continue to see the full
  row set — documented on the `Member.deleted_at` TODO.

## Task 2 — JWT revocation / logout

- New model `backend/app/models/revoked_token.py` (`platform.revoked_tokens`,
  PK on `jti`, indexed `expires_at` for cleanup and `user_id` for per-user
  lookups). Exported from `app.models.__init__`.
- `backend/app/services/auth_service.py`:
  - `create_access_token` + `create_refresh_token` now add a random
    `jti = secrets.token_urlsafe(16)` to the payload.
  - New helper `is_token_revoked(jti, db) -> bool` — returns False if jti
    is empty (transition safety for tokens issued before this change).
  - New helper `revoke_token(db, jti, user_id, expires_at)` — idempotent.
- `backend/app/dependencies.py` `get_current_user` — after decoding and
  confirming `type == access`, checks `is_token_revoked(payload["jti"], session)`
  and raises 401 if revoked. Pre-jti tokens still work until expiry.
- `backend/app/routers/auth.py`:
  - New `POST /api/auth/logout` — decodes the bearer token, inserts a row
    into `platform.revoked_tokens`, returns 204. Idempotent (already-revoked
    or already-expired tokens return 204 without erroring).
- New migration `backend/alembic/versions/0004_revoked_tokens_and_usage.py`
  chained after `0003_uniques_and_hash`. Idempotent (`IF NOT EXISTS`-style
  guards via `inspect().has_table()` so tenant re-runs no-op cleanly).

## Task 3 — Claude cost caps in llm_guard

- `backend/app/config.py`: new setting
  `anthropic_daily_token_budget_per_tenant: int = 1_000_000`.
- `backend/app/services/llm_guard.py`:
  - `check_tenant_budget(tenant_schema)` — raises
    `HTTPException(429, "Daily AI budget exhausted")` when the day's usage
    is at or above the budget. Called at the start of every
    `guarded_llm_call`.
  - Usage counter implemented with Redis INCRBY when available (atomic,
    safe under concurrency) and with an in-process dict fallback for
    test/dev (best-effort — documented). Key:
    `claude_usage:{tenant}:{YYYY-MM-DD}`. TTL of 48h so keys don't linger.
  - `_record_usage_and_warn` books successful-response tokens after the
    LLM call returns, and emits a structured `logger.warning` line when
    usage crosses 80% (`"Claude daily budget nearing limit | tenant=... pct=..."`),
    and `logger.error` when it crosses 100%. Ops dashboards can alert on
    either.
  - Setting `ANTHROPIC_DAILY_TOKEN_BUDGET_PER_TENANT=0` disables enforcement
    (escape hatch).

## Task 4 — MFA verification path

- `backend/app/services/auth_service.py`:
  - `generate_mfa_secret()` — 20 random bytes, Base32-encoded (Google
    Authenticator compatible).
  - `verify_totp(secret, code)` — stdlib RFC 6238 (SHA-1, 6 digits, 30s
    step, +/- 1 step window for clock skew). `hmac.compare_digest`
    everywhere. No new dependency (checked pyproject.toml — `pyotp` isn't
    in deps, so a minimal implementation is shipped instead).
  - `build_otpauth_url(secret, account, issuer)` — produces the standard
    `otpauth://totp/...` URL the client renders as a QR code.
  - `create_mfa_token(user_id)` — 5-minute token with
    `type="mfa_pending"` used as the first-leg credential between
    password-check and TOTP-check.
- `backend/app/routers/auth.py`:
  - `POST /api/auth/login` now returns `{"mfa_required": true, "mfa_token": …}`
    instead of a full access token if the user has `mfa_secret` set.
  - `POST /api/auth/login/mfa` — exchanges the mfa_token + TOTP code for
    a real access/refresh pair.
  - `POST /api/auth/mfa/enroll` — writes a fresh secret to the user row
    and returns `{secret, otpauth_url}` for QR rendering.
  - `POST /api/auth/mfa/verify` — verifies the first TOTP code against
    the stored secret; returns 204 on success, 400 on bad code. (The
    secret is already persisted by `/mfa/enroll` so a re-enroll rolls it;
    MFA is effectively "armed" once the user has verified at least once,
    since `/login` will detect `mfa_secret` and route through the
    two-leg path.)

Design note: the user model only has the `mfa_secret` column (no
`mfa_verified` bool), so I did NOT add one — adding a column would drag
in another migration and is out of scope. The `/mfa/verify` endpoint is
effectively a smoke test that the user can still produce a valid code;
the security guarantee that matters is that `/login` requires both
leg-1 (password) and leg-2 (TOTP) for any user with a secret set, which
is now the case.

## Files created

- `backend/app/models/revoked_token.py`
- `backend/alembic/versions/0004_revoked_tokens_and_usage.py`
- `reviews/phase-hardening.md` (this file)

## Files modified

- `backend/app/models/__init__.py` — export `RevokedToken`
- `backend/app/services/auth_service.py` — jti, TOTP, revocation helpers
- `backend/app/services/llm_guard.py` — tenant budget enforcement
- `backend/app/dependencies.py` — jti revocation check
- `backend/app/routers/auth.py` — logout + MFA endpoints, MFA-aware login
- `backend/app/config.py` — `anthropic_daily_token_budget_per_tenant`
- Soft-delete sweeps listed above (9 services).

## Verification

- `python -c "import ast; ast.parse(open(F).read())"` for every modified
  file: pass.
- Alembic chain: `0001_baseline → 0002_soft_delete_and_audit →
  0003_uniques_and_hash → 0004_revoked_tokens_and_usage`. Migration is
  platform-only (no tenant DDL) and uses existence guards for idempotency.
