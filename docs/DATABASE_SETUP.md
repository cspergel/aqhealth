# Database Setup

## Quick Start (One Command)

```bash
docker compose up postgres redis -d
cd backend
pip install -e ".[dev]"
cp .env.example .env  # edit with your API keys
python -m scripts.setup_db
```

That's it. Login: **demo@aqsoft.ai / demo123**

## What the Script Does

`backend/scripts/setup_db.py` performs a full clean-slate setup:

1. **Drops and recreates schemas** -- `platform` (tenants + users) and `demo_mso` (all tenant data)
2. **Drops stale PostgreSQL enum types** in the public schema (we use string columns now)
3. **Creates all tables via SQLAlchemy models** using `Base.metadata.create_all`:
   - Platform tables (`tenants`, `users`) go into the `platform` schema
   - All ~27 tenant tables go into the `demo_mso` schema (via temporary schema reassignment)
4. **Seeds base data**: demo tenant, 2 users, 5 practice groups, 10 providers, 13 HEDIS measures, 30 members, ~150 claims, 5 HCC suspects, ~15 care gaps
5. **Seeds extended data**: 10 insights, 18 learning metrics, 50 prediction outcomes, 30 user interactions, 2 ADT sources, 20 ADT events, 10 care alerts, 10 annotations, 5 watchlist items, 8 action items, 4 report templates, 1 generated report, 5 saved filters, 60 RAF history rows

## Schema Structure

```
aqsoft_health (database)
  |-- platform (schema)
  |     |-- tenants          # MSO clients
  |     |-- users            # All users (with tenant_id FK)
  |
  |-- demo_mso (schema)      # One schema per tenant
        |-- members
        |-- providers
        |-- practice_groups
        |-- claims
        |-- hcc_suspects
        |-- raf_history
        |-- gap_measures
        |-- member_gaps
        |-- adt_sources
        |-- adt_events
        |-- care_alerts
        |-- insights
        |-- prediction_outcomes
        |-- learning_metrics
        |-- user_interactions
        |-- upload_jobs
        |-- mapping_templates
        |-- mapping_rules
        |-- annotations
        |-- watchlist_items
        |-- action_items
        |-- report_templates
        |-- generated_reports
        |-- saved_filters
        |-- data_quality_reports
        |-- quarantined_records
        |-- data_lineage
```

## Adding New Tables

1. Create a SQLAlchemy model in `backend/app/models/` (no `schema=` arg -- tenant tables are schemaless by default)
2. Import it in `backend/app/models/__init__.py`
3. Run `python -m scripts.setup_db` to recreate everything (dev)
4. For production, create an Alembic migration:
   ```bash
   cd backend
   alembic revision --autogenerate -m "add new_table"
   alembic upgrade head
   ```

## Port Configuration

| Service    | Port | Env Var        |
|------------|------|----------------|
| PostgreSQL | 5433 | `POSTGRES_PORT`|
| Redis      | 6380 | `REDIS_PORT`   |
| Backend    | 8090 | `BACKEND_PORT` |
| Frontend   | 5180 | (vite.config)  |

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

```
DATABASE_URL=postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health
REDIS_URL=redis://localhost:6380/0
SECRET_KEY=<generate-a-real-secret>
ANTHROPIC_API_KEY=<your-key>
OPENAI_API_KEY=<your-key>
SNF_ASSIST_URL=http://localhost:8000
```
