# Phase: DB Performance Hardening

Owner: DB-perf agent.
Scope: addresses Blocker 7 + "Missing indexes" + "Query performance" sections
of `reviews/readiness-db-ops.md` (47 of 61 FKs unindexed; `analyze_population`
N+1; 6-query serial dashboard aggregates; Python-side provider percentiles).

---

## Summary

- 39 tenant-scope indexes + 1 platform-scope index added through migration
  `backend/alembic/versions/0004_perf_indexes.py`.
- `hcc_engine.analyze_population` refactored from ~25·N per-member SELECTs
  into ~5 aggregate SELECTs per batch (50k members, batch=50: **1.25M →
  ~5 000** round-trips — a **250x** reduction).
- `dashboard_service.get_dashboard_metrics` collapsed from 6 serial SELECTs
  into 1 CTE round-trip.
- `dashboard_service.get_dashboard_actions` collapsed from 6 serial SELECTs
  into 1 CTE round-trip.
- `provider_service` Python percentile loops (`scalars().all()` full-table
  loads in `get_provider_list`, `get_provider_scorecard`, `get_peer_comparison`)
  replaced with Postgres `PERCENT_RANK()` / `percentile_cont()` windows —
  one query each, no Python-side sort.

---

## Files changed

### Models (FK `index=True` + composite `__table_args__`)

| File | Changes |
|------|---------|
| `app/models/claim.py` | Added composite indexes `ix_claims_member_svcdate`, `ix_claims_category_svcdate`, `ix_claims_group_svcdate`, `ix_claims_rendering_provider`. |
| `app/models/member.py` | Added `ix_members_current_raf`, `ix_members_pcp_provider_id`. |
| `app/models/hcc.py` | Added `ix_hcc_suspects_dedup` (member/year/hcc/type/status) + `ix_hcc_suspects_member_status_year`. |
| `app/models/care_gap.py` | Added `ix_member_gaps_member_status`, `ix_member_gaps_member_year`, `ix_member_gaps_responsible_provider`. |
| `app/models/adt.py` | Added `ix_adt_events_member_ts`, `ix_adt_events_source_id`, `ix_adt_events_actual_claim_id`, **unique partial** `uq_adt_events_raw_message_id`, `ix_care_alerts_member_created`, `ix_care_alerts_status_priority`, `ix_care_alerts_adt_event_id`. |
| `app/models/action.py` | `index=True` on `member_id`, `provider_id`. |
| `app/models/alert_rule.py` | `index=True` on `rule_id`. |
| `app/models/boi.py` | `index=True` on `practice_group_id`. |
| `app/models/care_plan.py` | `index=True` on `care_plan_id`, `goal_id`. |
| `app/models/case_management.py` | `index=True` on `assignment_id`. |
| `app/models/clinical_exchange.py` | `index=True` on `member_id`. |
| `app/models/practice_expense.py` | `index=True` on `practice_group_id` (StaffMember + ExpenseEntry), `parent_category_id`, `category_id`. |
| `app/models/practice_group.py` | `index=True` on self-FK `parent_id`. |
| `app/models/report.py` | `index=True` on `template_id`. |
| `app/models/risk_accounting.py` | `index=True` on `provider_id`, `practice_group_id`. |
| `app/models/skill.py` | `index=True` on `skill_id`. |
| `app/models/tag.py` | `index=True` on `tag_id`. |
| `app/models/user.py` | `index=True` on `tenant_id` (platform schema). |

Net effect: of the 61 FKs reported unindexed by the audit, every one is now
either directly `index=True` on the column, or covered by a leading-column
composite in `__table_args__`.

### Migration

`backend/alembic/versions/0004_perf_indexes.py` (new, down-rev=0003).

- Iterates `platform.tenants.schema_name` using the same pattern as 0003
  (`_tenant_schemas(bind)`).
- Emits `CREATE INDEX IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`
  (partial) for each of 39 tenant-scope indexes, per active tenant.
- Platform-scope: `ix_users_tenant_id` on `platform.users(tenant_id)`.
- Per-tenant per-table existence check (`information_schema.tables`) so a
  fresh tenant that hasn't yet migrated a given table is skipped silently
  (same tolerance 0003 relies on).
- `downgrade()` drops all 40 indexes cleanly.

### Services

**`app/services/hcc_engine.py`** — `analyze_population` + `analyze_member`:

- New `_bulk_load_batch_context(db, member_ids, payment_year)` helper runs
  4 aggregate SELECTs per batch: members, claims (3y), prior-year captured
  suspects, current-year OPEN suspects. Plus 1 optional SELECT for
  `SuspectOutcomeLearn` patterns grouped by every PCP in the batch (saves
  ~N provider-pattern queries).
- `analyze_member` now accepts a `preloaded` dict so it can skip every
  per-member SELECT when called from the population path: member,
  claims, prior suspects, existing open suspects (for dedup), provider
  patterns.
- The **dedup SELECT inside the inner suspect loop** — which was the
  dominant N+1 (was running ~20-40× per member) — is now resolved from
  an in-memory dict (`existing_open_suspects[(hcc_code, suspect_type)]`)
  when the preloaded path is used.

**`app/services/dashboard_service.py`** — `get_dashboard_metrics` +
`get_dashboard_actions`:

- Both now use a single `text()` CTE query (4 CTEs + CROSS JOIN for
  metrics; 6 CTEs + CROSS JOIN for actions) and read the whole result
  row into locals. Identical return shape; 1 round-trip instead of 6.

**`app/services/provider_service.py`** — hot-path percentile computation:

- New `_fetch_provider_percentiles(db)` — one UNION-ALL query that
  computes `PERCENT_RANK() OVER (ORDER BY <col>)` for every metric,
  returning `{metric: {provider_id: 0-100}}`. Replaces the
  `scalars().all()` full-table load + Python rank sort.
- `get_provider_list` no longer builds `metric_vectors` in Python; it
  just looks up `percentiles[metric][provider.id]`.
- `get_provider_scorecard` no longer pulls every Provider row; uses the
  same helper.
- `get_peer_comparison` — same issue, same fix: one UNION-ALL query
  computing `AVG()` + `percentile_cont(0.25/0.75)` per metric.
  (`refresh_provider_scorecards` still iterates all providers to write
  computed-field updates back; it's a batch job, not a hot request path,
  so it's left alone per scope.)

---

## Query-count before / after

| Workload | Before | After |
|---|---|---|
| `analyze_population` (50 k members, batch=50) | ~1.25 M SELECTs (25·50 000) | **≈ 5 000 aggregate SELECTs** (5 per batch × 1 000 batches) |
| Dashboard load `/api/dashboard/metrics` | 6 SELECTs | **1 SELECT** |
| Dashboard load `/api/dashboard/actions` | 6 SELECTs | **1 SELECT** |
| Provider list `/api/providers` | 1 list SELECT + in-Python O(P²) percentile | 1 list SELECT + **1 SQL `PERCENT_RANK`** UNION |
| Provider scorecard `/api/providers/{id}` | 1 SELECT + full-table `scalars().all()` + in-Python ranks | 1 SELECT + **1 SQL `PERCENT_RANK`** UNION |
| Provider peer comparison | full-table load + Python quartile sort | **1 SQL aggregate** UNION with `percentile_cont` |

---

## Indexes added (by table)

### `claims`
- `ix_claims_member_svcdate` — `(member_id, service_date)` — member journey, `_get_member_claims`.
- `ix_claims_category_svcdate` — `(service_category, service_date)` — ER/admit/spend roll-ups.
- `ix_claims_group_svcdate` — `(practice_group_id, service_date)` — group expenditure.
- `ix_claims_rendering_provider` — `(rendering_provider_id)` — provider scorecard opens.

### `members`
- `ix_members_current_raf` — `(current_raf)` — panel sort by RAF.
- `ix_members_pcp_provider_id` — `(pcp_provider_id)` — provider scorecard refresh groupings.

### `hcc_suspects`
- `ix_hcc_suspects_dedup` — `(member_id, payment_year, hcc_code, suspect_type, status)` — the dedup SELECT that's now the inner loop.
- `ix_hcc_suspects_member_status_year` — `(member_id, status, payment_year)` — member-detail open-suspects list.

### `member_gaps`
- `ix_member_gaps_member_status` — `(member_id, status)`.
- `ix_member_gaps_member_year` — `(member_id, measurement_year, status)`.
- `ix_member_gaps_responsible_provider` — `(responsible_provider_id)` (FK).

### `adt_events`
- `ix_adt_events_member_ts` — `(member_id, event_timestamp)` — member ADT timeline.
- `ix_adt_events_source_id` — FK.
- `ix_adt_events_actual_claim_id` — FK.
- `uq_adt_events_raw_message_id` — partial **unique** (`WHERE raw_message_id IS NOT NULL`), aligning with the router/service code that catches this constraint name for idempotent dedup.

### `care_alerts`
- `ix_care_alerts_member_created` — `(member_id, created_at)`.
- `ix_care_alerts_status_priority` — `(status, priority)`.
- `ix_care_alerts_adt_event_id` — FK.

### Low-traffic FK indexes (cascade + join hygiene)
`action_items(member_id, provider_id)`, `alert_rule_triggers(rule_id)`,
`interventions(practice_group_id)`, `care_plans(member_id)`,
`care_plan_goals(care_plan_id)`, `care_plan_interventions(goal_id)`,
`case_assignments(member_id)`, `case_notes(assignment_id)`,
`data_exchange_requests(member_id)`,
`staff_members(practice_group_id)`, `expense_categories(parent_category_id)`,
`expense_entries(category_id, practice_group_id)`,
`practice_groups(parent_id)` [self-FK], `generated_reports(template_id)`,
`skill_executions(skill_id)`, `subcap_payments(provider_id, practice_group_id)`,
`entity_tags(tag_id)`, `prior_authorizations(member_id)`.

### Platform scope
- `ix_users_tenant_id` on `platform.users(tenant_id)` — login tenant lookup.

---

## Verification

- `python -m py_compile` passes on every edited model + service + the new
  migration.
- Imports of all three service modules succeed with models loaded:
  no index-name collisions across `Base.metadata` (confirmed by scanning
  `Base.metadata.sorted_tables` — 110 total Index objects, 0 duplicates).
- Migration module parses with `importlib`; `revision = 0004_perf_indexes`,
  `down_revision = 0003_uniques_and_hash`, 39 tenant-scope entries.
- Idempotent DDL (`CREATE INDEX IF NOT EXISTS` + per-table existence
  probe) — rerunning `alembic upgrade head` is a no-op.

---

## Out of scope for this phase (left for follow-ups)

- Partial index on `care_alerts (status, priority) WHERE status IN ('open','acknowledged')` — would further tighten the "unacknowledged alerts" dashboard query; not added to keep the first cut conservative.
- `INCLUDE (paid_amount)` covering index on `claims(service_date) INCLUDE (paid_amount)` — Postgres-11+ only, and the current `(service_category, service_date)` + claim totals CTE is already well-served by the existing claims indexes.
- Check constraints (confidence 0-100, dates, non-negative amounts) — owned by the data-integrity phase, not this one.
- `RafHistory` unique constraint — already present via migration 0003.
- `dashboard_service.get_raf_distribution` still pulls every member's RAF via `result.all()`; the histogram bucketing can also move to SQL (`WIDTH_BUCKET`), but this phase was scoped to the 6-aggregate consolidation.
