# AQSoft Health Platform — Team Development Guide

**Last updated:** 2026-03-25
**Status:** MVP demo functional, real backend operational, AI insights generating

---

## Quick Start

```bash
# 1. Start infrastructure
docker compose up postgres redis -d

# 2. Set up backend
cd backend
pip install -e ".[dev]"
cp .env.example .env              # Add your ANTHROPIC_API_KEY and OPENAI_API_KEY
python -m scripts.setup_db        # Creates schemas, tables, seeds data (~30 seconds)

# 3. Start backend
uvicorn app.main:app --port 8090

# 4. Start frontend (separate terminal)
cd frontend
npm install
npm run dev                       # Runs on http://localhost:5180

# 5. Optional: Generate AI insights
cd backend
python -m scripts.generate_insights
```

**Login:** `demo@aqsoft.ai` / `demo123`
**Demo (no backend needed):** Add `?demo=true` to any URL

---

## Architecture Overview

```
frontend (React 19 + Vite)          → localhost:5180
    ↓ API calls
backend (FastAPI + Python 3.12)     → localhost:8090
    ↓ queries
PostgreSQL 16                       → localhost:5433
Redis 7                             → localhost:6380
    ↓ optional
SNF Admit Assist (FastAPI)          → localhost:8000
```

**Multi-tenant:** Each MSO client gets a PostgreSQL schema (`demo_mso`, `sunstate`, etc.). All queries are schema-scoped via middleware.

**No PostgreSQL enums:** All status/type fields use `VARCHAR(20)`. This avoids cross-schema enum issues and makes migrations simpler.

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app — 163 routes registered
│   ├── config.py            # Settings from .env
│   ├── database.py          # Async engine, tenant schema routing
│   ├── dependencies.py      # Auth, tenant session injection
│   ├── models/              # 20 SQLAlchemy models
│   ├── routers/             # 30 API routers (see below)
│   ├── services/            # 33 business logic services
│   └── workers/             # 3 background workers (arq/Redis)
├── scripts/
│   ├── setup_db.py          # One-command database setup
│   ├── generate_insights.py # Run AI insight generation
│   ├── generate_synthetic_data.py  # Generate test CSV files
│   └── seed.py / seed_extended.py  # Legacy seeders (use setup_db instead)
├── data/
│   ├── synthetic/           # Generated CSV files (roster, claims, pharmacy)
│   └── quality_measures.json # 37 HEDIS/Stars measures with cutpoints
├── tests/                   # 104 tests
└── alembic/                 # Database migrations

frontend/
├── src/
│   ├── App.tsx              # Root with auth, routing, error boundary
│   ├── pages/               # 30 page components
│   ├── components/          # Reusable UI components
│   │   ├── layout/          # Sidebar, TopBar, AppShell
│   │   ├── ui/              # Tag, MetricCard, InsightCard, etc.
│   │   ├── clinical/        # Patient view, worklist, capture
│   │   ├── expenditure/     # Category cards, drill-downs
│   │   └── ...
│   └── lib/
│       ├── tokens.ts        # Design system (CANONICAL — all colors here)
│       ├── api.ts           # Axios client with auth interceptor
│       ├── auth.tsx          # Auth context + demo mode
│       ├── filterContext.tsx  # Global office/provider filter
│       ├── mockApi.ts        # Demo mode adapter (interactive)
│       └── mockData.ts       # Demo mock data
```

---

## API Router Map (30 routers, 163+ routes)

| Section | Router | Key Endpoints |
|---------|--------|---------------|
| **Auth** | `auth` | POST `/login`, `/refresh` |
| **Clinical** | `clinical` | GET `/patient/{id}`, `/worklist`, POST `/capture`, `/close-gap` |
| **Dashboard** | `dashboard` | GET `/dashboard`, `/dashboard/insights` |
| **HCC** | `hcc` | GET `/suspects`, `/summary`, PATCH `/suspects/{id}`, GET `/export` |
| **Expenditure** | `expenditure` | GET `/expenditure`, `/{category}`, `/{category}/insights` |
| **Providers** | `providers` | GET `/providers`, `/{id}`, `/{id}/comparison`, PATCH `/{id}/targets` |
| **Groups** | `groups` | GET `/groups`, `/{id}`, `/compare`, `/{id}/trends` |
| **Care Gaps** | `care_gaps` | GET `/care-gaps`, `/members`, `/measures`, PATCH `/{id}` |
| **Members** | `members` | GET `/members`, `/stats`, `/{id}` |
| **Ingestion** | `ingestion` | POST `/upload`, `/{job_id}/confirm-mapping`, GET `/jobs`, `/templates` |
| **Insights** | `insights` | GET `/insights`, `/member/{id}`, `/provider/{id}`, PATCH `/{id}` |
| **Discovery** | `discovery` | POST `/run`, GET `/latest`, `/revenue-cycle` |
| **Predictions** | `predictions` | GET `/hospitalization-risk`, `/cost-trajectory`, `/raf-impact` |
| **Scenarios** | `scenarios` | POST `/run`, GET `/prebuilt` |
| **Financial** | `financial` | GET `/pnl`, `/pnl/by-plan`, `/pnl/by-group`, `/forecast` |
| **Reconciliation** | `reconciliation` | POST `/run`, GET `/report`, `/ibnr` |
| **Stars** | `stars` | GET `/projection`, `/opportunities`, POST `/simulate` |
| **AWV** | `awv` | GET `/dashboard`, `/due`, `/opportunities`, `/export` |
| **TCM** | `tcm` | GET `/dashboard`, `/active`, PATCH `/{member_id}` |
| **RADV** | `radv` | GET `/readiness`, `/member/{id}`, `/vulnerable` |
| **Attribution** | `attribution` | GET `/dashboard`, `/changes`, `/churn-risk` |
| **Stop-Loss** | `stoploss` | GET `/dashboard`, `/high-cost`, `/risk-corridor` |
| **ADT** | `adt` | POST `/webhook`, `/events`, `/batch`, GET `/census`, `/alerts` |
| **Actions** | `actions` | GET `/actions`, `/stats`, POST `/actions`, PATCH `/{id}` |
| **Reports** | `reports` | GET `/templates`, `/reports`, `/{id}`, POST `/generate` |
| **Annotations** | `annotations` | GET/POST/PATCH/DELETE `/annotations` |
| **Watchlist** | `watchlist` | GET/POST `/watchlist`, DELETE `/{id}`, PATCH `/acknowledge` |
| **Learning** | `learning` | GET `/accuracy`, `/report`, POST `/track` |
| **Patterns** | `patterns` | GET `/code-utilization`, `/success`, `/playbooks`, `/benchmarks` |
| **Education** | `education` | GET `/recommendations`, `/library`, POST `/complete` |
| **Cohorts** | `cohorts` | POST `/build`, `/save`, GET `/cohorts`, `/{id}`, `/{id}/trends` |
| **Filters** | `filters` | GET `/fields`, `/filters`, POST `/filters`, DELETE `/{id}` |
| **Data Quality** | `data_quality` | GET `/reports`, `/quarantine`, `/unresolved`, `/lineage` |
| **Journey** | `journey` | GET `/{member_id}`, `/{member_id}/trajectory` |
| **Query** | `query` | POST `/ask`, GET `/suggestions` |
| **Tenants** | `tenants` | GET/POST/PATCH `/tenants`, POST `/{id}/users` |
| **Claims** | `claims` | GET `/claims`, `/{id}`, `/stats` |

---

## How to Add a New Feature

### New API endpoint:

1. Create service: `backend/app/services/my_service.py`
2. Create router: `backend/app/routers/my_router.py` with `router = APIRouter(prefix="/api/my-thing")`
3. Register in `backend/app/main.py`: `from app.routers import my_router` + `app.include_router(my_router.router)`
4. If new database tables needed: create model in `backend/app/models/`, import in `__init__.py`, run `setup_db.py`

### New frontend page:

1. Create page: `frontend/src/pages/MyPage.tsx`
2. Add route in `frontend/src/components/layout/AppShell.tsx`
3. Add nav item in `frontend/src/components/layout/Sidebar.tsx`
4. For demo: add mock data in `mockData.ts`, add route handler in `mockApi.ts`

### Design system:

- **Colors:** ONLY use values from `frontend/src/lib/tokens.ts`
- **Aesthetic:** Warm stone (#fafaf9 bg), green accent (#16a34a), no AI badges
- **Typography:** Inter for body, monospace for numbers/codes
- **Components:** Tag, MetricCard, InsightCard — reuse these everywhere
- **Reference:** `planning docs/design-reset.jsx` and `design-reset-full.jsx`

---

## What's Working vs TODO

### Working (demo + real backend):

- [x] Dashboard with population metrics and AI insights
- [x] Suspect HCC chase lists with capture workflow
- [x] Expenditure drill-downs (inpatient, ED, SNF, pharmacy, etc.)
- [x] Provider + group scorecards with peer comparison
- [x] Care gap tracking (13 HEDIS measures + custom)
- [x] Stars rating simulator with intervention builder
- [x] AWV tracking with revenue opportunity analysis
- [x] TCM post-discharge tracking
- [x] RADV audit readiness with MEAT scoring
- [x] Attribution management with churn risk
- [x] Stop-loss / risk corridor monitoring
- [x] Financial P&L (confirmed vs projected, IBNR)
- [x] Predictions (hospitalization risk, cost, RAF scenarios)
- [x] Scenario modeling (6 what-if types)
- [x] Member roster with smart filters + presets
- [x] Cohort builder (15+ filter criteria)
- [x] Patient journey timeline (24-month)
- [x] Clinical patient view (provider overlay)
- [x] Live census + care alerts (ADT)
- [x] Intelligence (playbooks, patterns, improvements, learning)
- [x] Conversational AI (Ask Bar)
- [x] Data ingestion with AI column mapping
- [x] Data quality + entity resolution + lineage
- [x] Annotations, watchlists, actions, reports
- [x] Provider education engine
- [x] Global office/provider filter
- [x] Universal custom filter builder
- [x] Autonomous discovery engine (6 scans)
- [x] Self-learning feedback system
- [x] Dual data tiers (signal vs record) with reconciliation
- [x] Real AI insight generation (Claude)

### TODO (next priorities):

- [ ] AQTracker connector (live hospital billing data feed)
- [ ] Load real MSO data through ingestion pipeline (test with actual files)
- [ ] FHIR / eCW integration for PCP office overlay
- [ ] 37 quality measures seeded from quality_measures.json (currently 13)
- [ ] Production deployment (Docker, Kubernetes, HIPAA hardening)
- [ ] SOC 2 / HIPAA compliance audit
- [ ] PCC Chrome Extension integration
- [ ] Automated report scheduling (cron-based generation)
- [ ] Email/SMS notification system for alerts
- [ ] User onboarding flow for new MSO clients
- [ ] CAHPS / member experience tracking
- [ ] Medicare Advantage bid support analytics
- [ ] Staff productivity / SLA monitoring

### Known Issues:

- Backend server sometimes crashes on Windows due to numpy/pandas conflicts in conda env. Recommend using a dedicated venv: `python -m venv .venv && .venv/Scripts/activate && pip install -e ".[dev]"`
- `--reload` flag on uvicorn doesn't always pick up file changes on Windows. Kill and restart manually.
- The synthetic data CSV generator creates 500 members but the seed script only seeds 30. Use the ingestion pipeline to load the full 500.

---

## Environment & Ports

| Service | Port | Notes |
|---------|------|-------|
| PostgreSQL | 5433 | Non-default to avoid conflicts |
| Redis | 6380 | Non-default to avoid conflicts |
| Backend API | 8090 | Swagger docs at `/api/docs` |
| Frontend | 5180 | Vite dev server |
| SNF Admit Assist | 8000 | Optional, for HCC coding pipeline |

---

## Key Commands

```bash
# Database
python -m scripts.setup_db              # Full reset + seed
python -m scripts.generate_insights     # Generate AI insights
python -m scripts.generate_synthetic_data  # Generate test CSVs

# Backend
uvicorn app.main:app --port 8090        # Start server
pytest -v -m "not integration"          # Run unit tests
pytest -v -m integration                # Run integration tests (needs DB)

# Frontend
npm run dev                             # Start dev server
npm run build                           # Production build
npm test                                # Run component tests
npx gh-pages -d dist                    # Deploy demo to GitHub Pages

# Alembic (production migrations)
alembic revision --autogenerate -m "description"
alembic upgrade head
```

---

## Contact

Questions? Check the README.md, architecture design doc at `docs/plans/2026-03-24-platform-architecture-design.md`, or the implementation plan at `docs/plans/2026-03-24-implementation-plan.md`.
