# Database Setup Guide

## Current State

The initial migration (`alembic/versions/001_initial_schema.py`) creates the platform schema and 24 tenant tables. Since then, several new models and features have been added that require additional tables or modifications.

## What Needs to Happen

### Step 1: New Tables Needed

These models were added after the initial migration and need corresponding tables:

| Model | Table Name | File | Purpose |
|-------|-----------|------|---------|
| `PracticeGroup` | `practice_groups` | `models/practice_group.py` | Office/practice group for provider comparison |
| `SavedFilter` | `saved_filters` | `models/saved_filter.py` | User-created custom filters |
| `Annotation` | `annotations` | `models/annotation.py` | Notes attached to any entity |
| `WatchlistItem` | `watchlist_items` | `models/watchlist.py` | Personal monitoring lists |
| `ActionItem` | `action_items` | `models/action.py` | Action tracking from insights/alerts |
| `ReportTemplate` | `report_templates` | `models/report.py` | Auto-generated report templates |
| `GeneratedReport` | `generated_reports` | `models/report.py` | Generated report instances |
| `DataQualityReport` | `data_quality_reports` | `models/data_quality.py` | Ingestion quality scores |
| `QuarantinedRecord` | `quarantined_records` | `models/data_quality.py` | Bad data held for review |
| `DataLineage` | `data_lineage` | `models/data_quality.py` | Record provenance tracking |
| `PredictionOutcome` | `prediction_outcomes` | `models/learning.py` | Prediction accuracy tracking |
| `LearningMetric` | `learning_metrics` | `models/learning.py` | Aggregate accuracy metrics |
| `UserInteraction` | `user_interactions` | `models/learning.py` | User behavior tracking |
| `ADTSource` | `adt_sources` | `models/adt.py` | Configured ADT data sources |
| `ADTEvent` | `adt_events` | `models/adt.py` | Individual ADT events |
| `CareAlert` | `care_alerts` | `models/adt.py` | Care management alerts |

### Step 2: Modified Tables

These existing tables have new columns since the initial migration:

| Table | New Columns | File |
|-------|------------|------|
| `providers` | `practice_group_id` (FK to practice_groups) | `models/provider.py` |
| `claims` | `data_tier`, `is_estimated`, `estimated_amount`, `signal_source`, `signal_event_id`, `reconciled`, `reconciled_claim_id` (self-FK) | `models/claim.py` |
| `insights` | `connections` (JSONB), `source_modules` (JSONB) | `models/insight.py` |

### Step 3: New Indexes

These indexes should be added for query performance:

- `claims.service_category`
- `claims.claim_type`
- `hcc_suspects.payment_year`
- `hcc_suspects.status`
- `member_gaps.measurement_year`
- `member_gaps.status`

### Step 4: Seed Data Updates

The quality measures need to be updated from 13 to 37:

```bash
# The comprehensive measures file:
backend/data/quality_measures.json  # 37 measures with Star cutpoints

# Run the seed scripts:
cd backend
python -m scripts.seed           # Creates tenant, users, basic data
python -m scripts.seed_extended  # Creates insights, alerts, learning data, etc.
```

## How to Apply

### Option A: Fresh Database (Recommended for Development)

Drop and recreate everything:

```bash
# 1. Reset the database
docker compose down -v  # Removes volumes (data)
docker compose up postgres redis -d

# 2. Wait for Postgres to be ready
sleep 5

# 3. Create schemas and tables
cd backend
python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.models import Base

async def setup():
    engine = create_async_engine('postgresql+asyncpg://aqsoft:aqsoft@localhost:5433/aqsoft_health')
    async with engine.begin() as conn:
        await conn.execute(text('CREATE SCHEMA IF NOT EXISTS platform'))
        await conn.execute(text('CREATE SCHEMA IF NOT EXISTS demo_mso'))
        # Create enum types
        for name, vals in [
            ('tenantstatus', ['active','onboarding','suspended']),
            ('userrole', ['superadmin','mso_admin','analyst','provider','auditor']),
            ('risktier', ['low','rising','high','complex']),
            ('claimtype', ['professional','institutional','pharmacy']),
            ('suspectstatus', ['open','captured','dismissed','expired']),
            ('suspecttype', ['med_dx_gap','specificity','recapture','near_miss','historical','new_suspect']),
            ('gapstatus', ['open','closed','excluded']),
            ('uploadstatus', ['pending','mapping','validating','processing','completed','failed']),
            ('insightcategory', ['revenue','cost','quality','provider','trend','cross_module']),
            ('insightstatus', ['active','dismissed','bookmarked','acted_on']),
        ]:
            v = ', '.join(f\"'{x}'\" for x in vals)
            await conn.execute(text(f'DROP TYPE IF EXISTS {name} CASCADE'))
            await conn.execute(text(f'CREATE TYPE {name} AS ENUM ({v})'))
        # Create platform tables
        await conn.run_sync(Base.metadata.create_all)
        # Create tenant tables in demo_mso
        await conn.execute(text('SET search_path TO demo_mso, public'))
        tables = [t for t in Base.metadata.sorted_tables if t.schema is None]
        for table in tables:
            await conn.run_sync(lambda c: table.create(c, checkfirst=True))
    await engine.dispose()
    print('Done!')

asyncio.run(setup())
"

# 4. Seed data
python -m scripts.seed
python -m scripts.seed_extended
```

### Option B: Incremental Migration (For Existing Data)

If you have data you want to keep:

```bash
# Create a new Alembic migration that adds the missing tables
cd backend
alembic revision --autogenerate -m "add new feature tables"
alembic upgrade head
```

Note: Alembic autogenerate may not handle the schema-per-tenant pattern perfectly. You may need to manually edit the migration to include `create_tenant_tables()` calls for each new table.

## Port Configuration

| Service | Port | Env Var |
|---------|------|---------|
| PostgreSQL | 5433 | `POSTGRES_PORT` |
| Redis | 6380 | `REDIS_PORT` |
| Backend API | 8090 | `BACKEND_PORT` |
| Frontend Dev | 5180 | (vite.config.ts) |

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
