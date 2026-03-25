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
- **ICD-10 Direct Capture** — PCP office claims already contain actual ICD-10 codes entered by providers and coders. The platform reads these directly from claims data — no extraction or NLP needed. This is the fastest path for populating HCC profiles across PCP populations.
- **AQTracker Pre-Claims Feed** — AQTracker processes hospital rounding sheets through OCR, coding, and billing. The platform ingests this data as a predictive source — it shows what is being billed *before* the insurance company receives the claim. For managed Medicare RAF forecasting, this means predicting revenue months before CMS payment cycles.
- **ADT Sources** — ADT feed integration points (Bamboo Health, Availity) for real-time admit/discharge/transfer notifications.
- **Data Quality** — Automated quality scoring on every ingested row, quarantine for bad data pending human review, AI-powered entity resolution for patient matching across sources, and full data lineage tracing any number back to its source file, row, and ingestion date.

---

## Data Integration

The platform is designed to accept data from wherever it lives — clean or messy, structured or semi-structured, real-time or batch. There are five data input paths, ordered from simplest to most complex:

### 1. Direct ICD-10 from Claims

PCP office claims already contain actual ICD-10 codes entered by providers and coders. The platform reads these directly — no extraction needed. This is the fastest path for PCP populations. Upload a claims file, and the HCC engine immediately maps ICD-10 codes to HCC categories and calculates RAF impact.

### 2. Batch File Upload

MSOs upload roster CSVs, claims files, eligibility/enrollment files, and pharmacy claims from health plan portals. The AI column mapper auto-detects data types and proposes mappings. Corrections are learned — second uploads from the same source are one-click. This is how most data enters the system: someone downloads a file from a payer portal and uploads it here.

### 3. AQTracker Live Feed

AQTracker processes hospital rounding sheets through OCR, coding, and billing. The Health Platform can see what is being billed **before the insurance company receives the claim**. This is a predictive data source, not a confirmed one — but for managed Medicare RAF forecasting, it is transformative. You can forecast revenue months before CMS payment cycles catch up.

### 4. ADT Notifications

Real-time admit/discharge/transfer alerts from Bamboo Health, Availity, or health plan SFTP feeds. This is the only truly real-time signal in the system — "Margaret Chen was just admitted to Memorial Hospital." ADT events trigger census updates, care coordination alerts, and downstream workflows.

### 5. SNF Admit Assist Pipeline

For hospital and SNF documents that need extraction: PDF upload, document classification, multi-pass extraction, ICD-10 coding, code optimization, and RAF calculation. This handles the complex cases that do not come with clean ICD-10 codes — discharge summaries, H&P notes, operative reports. The SNF Admit Assist service runs as a separate API and returns structured, validated HCC data back to the platform.

### Data Tiers

Data flows through three tiers:

- **Signal (Tier 1)** — Real-time and estimated data from ADT notifications, AQTracker pre-claims, AI-generated suspects, and predictive models. This data is actionable immediately but not yet confirmed. Act on it, but know it may be revised.
- **Record (Tier 2)** — Adjudicated claims, confirmed HCCs, actual payments, closed care gaps. This is the source of truth for reporting, financial reconciliation, and regulatory submissions.
- **Reconciliation** — When Tier 2 data arrives, it validates Tier 1 predictions. The system tracks prediction accuracy, learns from discrepancies, and continuously improves its signal-tier confidence scores.

---

## Data Quality & Governance

Every row of data passes through a quality gate before entering production tables. Nothing is silently imported.

- **Format Validation** — ICD-10 code format validation, NPI Luhn check, date sanity checks, amount bounds verification. Invalid records are caught before they pollute downstream analytics.
- **Entity Resolution** — AI-powered patient matching across data sources. The system runs a three-stage pipeline: exact match (MBI, SSN), fuzzy match (name + DOB + address), and AI evaluation for ambiguous cases. This ensures that Margaret Chen from the claims file and M. Chen from the ADT feed resolve to the same patient record.
- **Data Quarantine** — Records that fail validation are held in quarantine for human review, not silently dropped or force-imported. A quarantine dashboard shows what failed, why, and lets authorized users approve, correct, or reject.
- **Data Lineage** — Every number in the system can be traced back to its source file, row number, and ingestion date. When a CFO asks "where did this RAF score come from?", the answer is one click away.
- **Quality Scoring** — Each data source receives an ongoing quality score based on validation pass rates, mapping accuracy, and timeliness. Sources that consistently produce bad data are flagged for review.

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
| **AI** | Anthropic Claude API (primary), OpenAI API (fallback) for insights, column mapping, narrative reports |
| **Workers** | ARQ (async Redis queue) for background ingestion and batch analytics |
| **HCC Engine** | SNF Admit Assist Platform API — ICD-10 coding, code optimization, RAF calculation |
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

### Full Stack Development (with SNF Admit Assist)

For full HCC coding and RAF calculation capabilities, run the SNF Admit Assist service alongside the platform:

```bash
# Terminal 1: SNF Admit Assist (HCC engine)
cd "SNF Admit Assist/backend"
uvicorn app.main:app --port 8000

# Terminal 2: Health Platform backend
cd "AQSoft Health Platform/backend"
uvicorn app.main:app --port 8090

# Terminal 3: Frontend
cd "AQSoft Health Platform/frontend"
npm run dev
```

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
│       ├── routers/             # API route handlers (30 routers)
│       │   ├── auth.py          #   Authentication & sessions
│       │   ├── clinical.py      #   Provider point-of-care
│       │   ├── dashboard.py     #   Population dashboard
│       │   ├── hcc.py           #   Suspect HCC engine
│       │   ├── expenditure.py   #   Cost drill-downs
│       │   ├── ingestion.py     #   Data upload & mapping
│       │   ├── discovery.py     #   Autonomous discovery engine
│       │   ├── learning.py      #   Self-learning feedback
│       │   ├── data_quality.py  #   Quality gates & quarantine
│       │   ├── claims.py        #   Claims processing & ICD-10 capture
│       │   ├── tenants.py       #   Multi-tenant management
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

### The AQSoft Ecosystem

The Health Platform is one part of a broader product ecosystem. Each product works independently, but together they form a complete managed care operations and intelligence stack. **Not every client needs every product** — they plug together based on what the organization does.

```
┌─────────────────────────────────────────────────────────────────┐
│                    AQSoft Health Platform                        │
│              (Intelligence & Analytics Hub)                      │
│                                                                 │
│   Population analytics, HCC suspects, expenditure drill-downs,  │
│   care gaps, provider scorecards, AI insights, predictions,     │
│   scenario modeling, financial P&L, cohort builder               │
│                                                                 │
│   Used by: MSO admins, care managers, PCP offices (overlay)     │
└───────┬──────────┬──────────┬──────────┬──────────┬─────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│ AQTracker│ │SNF Admit │ │  ADT   │ │ Claims │ │ AIClaim  │
│          │ │ Assist   │ │ Feeds  │ │ Files  │ │          │
│ Hospital │ │          │ │        │ │        │ │ Denial   │
│ billing  │ │ HCC      │ │Bamboo  │ │Roster  │ │prevention│
│ hub      │ │ coding   │ │Health, │ │Claims  │ │& claim   │
│          │ │ engine   │ │Availity│ │Rx, 834 │ │scrubbing │
│ Rounding │ │          │ │        │ │        │ │          │
│ sheets → │ │ PDF →    │ │Real-   │ │Batch   │ │          │
│ OCR →    │ │ extract →│ │time    │ │upload   │ │          │
│ coding → │ │ code →   │ │alerts  │ │from    │ │          │
│ billing  │ │ optimize │ │        │ │health  │ │          │
│          │ │ → RAF    │ │        │ │plans   │ │          │
└──────────┘ └──────────┘ └────────┘ └────────┘ └──────────┘
```

**Who uses what:**

| Organization Type | Products They Need |
|-------------------|-------------------|
| **MSO managing populations** | Health Platform + Claims Files + ADT Feeds |
| **MSO with own billing company** | Health Platform + AQTracker + SNF Admit Assist + Claims + ADT |
| **Billing company only** | AQTracker + AQCoder (no Health Platform needed) |
| **PCP office under MSO** | Health Platform (overlay mode) — data comes from MSO's claims |
| **Hospitalist group** | AQTracker + SNF Admit Assist + Health Platform for insights |

**AQTracker** is the operational hub for hospital-side work. It handles the daily workflow: receiving rounding sheets, extracting patient data via OCR, routing through coding (AQCoder), managing the billing process, and tracking patient encounters across hospital systems (TGH, HCA, Baycare, Advent, Encompass, Kindred). It serves billing company clients (ISG, FMG, TPSG, GI) who have hospitalist and specialist providers seeing patients at these facilities.

**The Health Platform** is the intelligence hub for MSO-side analytics. It ingests data from ALL sources — AQTracker encounters, PCP office claims, pharmacy data, ADT feeds, eligibility files — and turns it into actionable intelligence. It sees across the entire continuum of care and finds patterns, opportunities, and risks that no single data source reveals.

**They connect but don't depend on each other.** A billing company can run AQTracker without the Health Platform. An MSO can run the Health Platform on claims data alone, without AQTracker. But when both are running, the Health Platform gets a predictive advantage — it sees what's being coded and billed in AQTracker BEFORE the insurance company receives the claim.

### Multi-Tenancy

The platform uses a **schema-per-tenant** model in PostgreSQL. Each MSO client gets a dedicated schema (e.g., `sunstate.*`, `gulfcoast.*`) with strong data isolation. A shared `platform` schema holds cross-tenant data: user accounts, tenant configuration, and platform metadata. Middleware extracts tenant context from the authenticated session and scopes all queries. PostgreSQL Row-Level Security serves as an additional safety net.

### Microservice Integration Points

| Service | Role | Integration |
|---------|------|-------------|
| **AQTracker** | Hospital-side operational hub: rounding sheet intake, OCR, patient tracking, coding, billing. Predictive data source — sees billing before the payer. | REST API / DB sync |
| **AQCoder** | AI coding engine inside AQTracker: CPT/ICD-10, MIPS, MDM, RAF scoring | Via AQTracker |
| **SNF Admit Assist** | HCC coding pipeline for complex documents. Exposes `/api/validate`, `/api/optimize`, `/api/raf` endpoints for the Health Platform. | REST API (port 8000) |
| **AutoCoder** | AQSoft.AI's proprietary HCC intelligence layer | External API |
| **AIClaim** | Denial prevention, claim scrubbing, X12 837 analysis | Future (external API) |
| **redact.health** | PHI de-identification for external data sharing | Available |

### API Surface

The backend exposes 30 routers covering: `actions`, `adt`, `annotations`, `auth`, `care_gaps`, `claims`, `clinical`, `cohorts`, `dashboard`, `data_quality`, `discovery`, `expenditure`, `financial`, `filters`, `groups`, `hcc`, `ingestion`, `insights`, `journey`, `learning`, `members`, `patterns`, `predictions`, `providers`, `query`, `reconciliation`, `reports`, `scenarios`, `tenants`, and `watchlist`.

---

## Screenshots

See the [live demo](https://cspergel.github.io/aqhealth/?demo=true) for a walkthrough of the platform with synthetic data.

---

## License

Proprietary. All rights reserved.
