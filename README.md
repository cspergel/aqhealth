# AQSoft Health Platform

**EMR-agnostic managed care intelligence platform.**

[Live Demo](https://cspergel.github.io/aqhealth/?demo=true)

---

## What It Is

The AQSoft Health Platform is the intelligence layer that managed care organizations have been missing. Most MSOs sit on mountains of claims data — rosters, eligibility files, encounter records, pharmacy feeds — and extract a fraction of the value locked inside. AQSoft turns that raw data into real-time, actionable intelligence across two axes: **revenue optimization** (HCC capture, RAF maximization, recapture tracking) and **cost intelligence** (expenditure analysis, facility benchmarking, pharmacy optimization, network steerage). Think of it as the Palantir of MSOs — an analytical engine that connects every data point to every decision.

The platform is built around an invisible AI philosophy. There are no "AI-POWERED" badges or glowing indicators. Instead, the system continuously analyzes population data and surfaces recommendations where they matter: suspect HCCs ranked by dollar value on chase lists, cost outliers flagged with plain-English explanations on expenditure dashboards, provider coaching suggestions embedded directly in scorecards. The AI is a quiet advisor — always working, never in the way.

AQSoft serves three customer segments. **Billing companies** use it for operational analytics across their provider clients. **PCP offices** under MSO contracts use it as an EMR overlay — a lightweight web interface that shows suspect HCCs, care gaps, and coding suggestions at point of care alongside their existing EHR. **MSOs** (including the internal MSO) use it for population-level intelligence across all provider groups and attributed members, driving both revenue capture and cost containment at scale.

---

## Key Features

### Clinical
- **Patient View** — Provider point-of-care interface showing patient context, suspect HCCs with evidence, care gaps, RAF uplift, and coding suggestions. Works as an EMR overlay (separate tab or embedded) without requiring an EHR replacement.

### Overview
- **Dashboard** — Population-level metrics at a glance: attributed lives, average RAF score, recapture rate, suspect HCC inventory, PMPM spend, MLR. AI-generated insight panel with the 3-5 highest-impact findings.
- **Live Census** — Real-time view of patient activity across facilities.
- **Alerts** — Configurable care alerts with open/acknowledged/in-progress tracking.
- **Watchlist** — Monitored members with change detection and notification.
- **Actions** — Centralized action queue for follow-ups across all modules.

### Population
- **Members** — Full member roster with smart filters (risk tier, plan, PCP, open suspects, open gaps). Drill into any member for a complete longitudinal view.
- **Cohorts** — Dynamic, rule-based cohorts for targeted analytics and outreach.

### Revenue
- **Suspect HCCs** — AI-driven chase lists ranked by estimated RAF dollar value. Suspects sourced from med-dx gap detection, specificity upgrades, recapture gaps, near-miss interactions, and historical pattern analysis. Filterable by provider, HCC category, risk tier, plan, and suspect type.
- **Predictions** — Predictive risk scoring and RAF forecasting. Scenario modeling for what-if analysis on capture strategies.

### Cost
- **Expenditure** — Category-level drill-downs across inpatient, outpatient, ED/observation, specialist, SNF/post-acute, pharmacy, home health, and DME. Each category includes total spend, PMPM, trend, and benchmark comparison. AI optimization engine generates actionable recommendations (facility redirection, generic substitution, discharge disposition optimization) with dollar-impact estimates.

### Quality
- **Care Gaps** — HEDIS and Stars measure tracking with configurable targets. Population-level closure rates, member-level gap lists, and provider-level performance feeds. AI prioritization tied to Stars impact — triple-weighted measures and ROI-ranked closure recommendations.

### Network
- **Providers** — Individual provider scorecards: panel size, RAF capture rate, cost efficiency (PMPM vs peers), quality gap closure, trend lines. AI coaching with dollar-impact estimates. Anonymized peer benchmarking surfaces what high performers do differently.
- **Groups** — Group and office-level comparison across all scorecard dimensions.

### Intelligence
- **Intelligence** — AI playbooks, code utilization analysis, what's working / what's not across the network. Autonomous discovery engine running continuous scans.
- **Scenarios** — What-if modeling and intervention simulation with projected financial outcomes.

### Finance
- **Financial** — P&L views (confirmed vs projected), IBNR estimates, revenue forecasting, reconciliation workflows.
- **Reports** — Exportable report generation across all modules. Clean enough to hand directly to provider offices or plan sponsors.

### Data
- **Data Ingestion** — Intelligent file upload (CSV, Excel, flat files) with AI-powered column mapping. The system auto-detects data types, proposes mappings, and learns from corrections — second imports from the same source are one-click. Background processing via Redis workers with status tracking and rejected-row review.
- **ADT Sources** — ADT feed integration points (Bamboo Health, Availity) for real-time admit/discharge/transfer notifications.

---

## Platform Intelligence

The platform's intelligence layer is not a single feature — it is woven through every module.

- **Autonomous Discovery Engine** — Runs 6 continuous scan types across population data: med-dx gap detection, specificity upgrades, recapture gaps, near-miss interactions, historical pattern analysis, and cross-module correlation.
- **Self-Learning Feedback System** — Users dismiss, bookmark, or act on insights. The system tracks which recommendations drive action and deprioritizes patterns that don't resonate. Every correction to data mappings becomes a rule for future uploads.
- **Cross-Module Context Graph** — Revenue suspects, cost outliers, quality gaps, and provider performance are linked. A member's suspect HCC appears in their care gap context; a provider's capture rate appears alongside their cost efficiency.
- **Conversational AI (Ask Bar)** — Available on every page. Natural language queries against the full dataset — "Which providers have the most aging suspects?" or "Show me pharmacy spend trending above benchmark."
- **Dual Data Tiers** — Signal-tier data (AI-generated suspects, recommendations, scores) and record-tier data (confirmed claims, captured codes, closed gaps) with reconciliation workflows that keep them in sync.
- **Predictive Analytics & Scenario Modeling** — RAF forecasting, cost trend projections, and what-if modeling for intervention strategies with estimated financial impact.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts |
| **AI** | Anthropic Claude API for insights, column mapping, narrative reports |
| **Workers** | ARQ (async Redis queue) for background ingestion and batch analytics |
| **Design** | Warm stone palette, invisible AI philosophy (Linear/Stripe inspired) |

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- [Node.js](https://nodejs.org/) 20+
- [Python](https://www.python.org/) 3.12+

### Quick Start with Docker Compose

```bash
# Clone the repository
git clone <repo-url>
cd aqsoft-health-platform

# Start all services
docker compose up -d
```

This starts:

| Service | Port |
|---------|------|
| PostgreSQL 16 | `localhost:5433` |
| Redis 7 | `localhost:6380` |
| Backend (FastAPI) | `localhost:8090` |
| Worker (ARQ) | — (background process) |

### Frontend Development

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server starts at `localhost:5180`.

### Demo Mode

Visit [http://localhost:5180/?demo=true](http://localhost:5180/?demo=true) to explore the platform with synthetic data — no backend required.

### Backend Development (without Docker)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # configure database URL, Redis, API keys
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

API documentation is available at `localhost:8090/api/docs` (Swagger UI).

---

## Project Structure

```
aqsoft-health-platform/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, router registration
│       ├── config.py            # Settings and environment config
│       ├── database.py          # Async SQLAlchemy engine, session
│       ├── models/              # SQLAlchemy ORM models
│       ├── routers/             # API route handlers (27 routers)
│       │   ├── auth.py          #   Authentication & sessions
│       │   ├── clinical.py      #   Provider point-of-care
│       │   ├── dashboard.py     #   Population dashboard
│       │   ├── hcc.py           #   Suspect HCC engine
│       │   ├── expenditure.py   #   Cost drill-downs
│       │   ├── ingestion.py     #   Data upload & mapping
│       │   ├── discovery.py     #   Autonomous discovery engine
│       │   ├── learning.py      #   Self-learning feedback
│       │   └── ...              #   (and 19 more)
│       ├── services/            # Business logic layer
│       ├── workers/             # ARQ background workers
│       └── utils/               # Shared utilities
├── frontend/
│   └── src/
│       ├── App.tsx              # Root component, routing
│       ├── pages/               # Page-level components
│       ├── components/          # Shared UI components
│       │   └── layout/          #   Sidebar, shell, navigation
│       └── lib/                 # Tokens, mock data, utilities
├── docs/
│   └── plans/                   # Architecture & design documents
├── docker-compose.yml           # Full stack orchestration
└── README.md
```

---

## Architecture

### Multi-Tenancy

The platform uses a **schema-per-tenant** model in PostgreSQL. Each MSO client gets a dedicated schema (e.g., `sunstate.*`, `gulfcoast.*`) with strong data isolation. A shared `platform` schema holds cross-tenant data: user accounts, tenant configuration, and platform metadata. Middleware extracts tenant context from the authenticated session and scopes all queries. PostgreSQL Row-Level Security serves as an additional safety net.

### Microservice Integration Points

The Health Platform is the intelligence hub connecting a broader ecosystem of specialized services:

| Service | Role | Status |
|---------|------|--------|
| **AQTracker** | Encounter management, billing, provider scheduling, patient tracking | Active integration |
| **AQCoder** | AI-powered CPT/ICD-10 coding, MIPS measures, MDM scoring | Active integration |
| **SNF Admit Assist** | HCC coding pipeline, med-dx gap detection, RAF calculation | Active (internal API) |
| **AutoCoder** | Additional AI coding intelligence layer | Active (external API) |
| **AIClaim** | Denial prevention, claim scrubbing | Future integration |
| **redact.health** | PHI de-identification for external data sharing | Available |

### API Surface

The backend exposes 27 routers covering: `actions`, `adt`, `annotations`, `auth`, `care_gaps`, `clinical`, `cohorts`, `dashboard`, `discovery`, `expenditure`, `financial`, `filters`, `groups`, `hcc`, `ingestion`, `insights`, `journey`, `learning`, `members`, `patterns`, `predictions`, `providers`, `query`, `reconciliation`, `reports`, `scenarios`, and `watchlist`.

---

## Screenshots

See the [live demo](https://cspergel.github.io/aqhealth/?demo=true) for a walkthrough of the platform with synthetic data.

---

## License

Proprietary. All rights reserved.
