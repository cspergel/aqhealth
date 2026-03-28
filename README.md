# AQSoft Health Platform

**aqhealth.ai** -- The Palantir of MSOs: AI-powered Medicare Advantage intelligence.

[Live Demo](https://cspergel.github.io/aqhealth/?demo=true) | [API Docs](http://localhost:8090/api/docs)

---

## What It Does

- **Revenue optimization** -- AI-driven HCC suspect generation, RAF maximization, recapture tracking, and chase list prioritization across attributed Medicare Advantage populations.
- **Cost intelligence** -- Expenditure drill-downs by category (inpatient, SNF, pharmacy, ED, specialist), facility benchmarking, and AI-generated cost reduction recommendations with dollar-impact estimates.
- **Quality and Stars** -- HEDIS/Stars care gap tracking, Stars rating simulator, AWV management, RADV readiness scoring, and provider-level quality scorecards.
- **Self-learning AI pipeline** -- Ingests any data format (11 supported natively), auto-maps fields, resolves patient entities across sources, and improves accuracy with every correction.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts |
| **AI** | Anthropic Claude API (primary), OpenAI (fallback) -- insights, data mapping, narrative reports |
| **Workers** | ARQ async Redis queue for background ingestion and batch analytics |
| **Integration** | FHIR R4, HL7v2, X12/EDI, CDA/CCDA, REST, SFTP, Webhook, CSV/Excel, JSON, XML |

---

## Key Features

### Revenue
- Suspect HCC engine with RAF dollar-value ranking
- Predictive risk scoring and RAF forecasting
- Scenario modeling for capture strategies

### Cost
- Category-level expenditure drill-downs with AI optimization recommendations
- Avoidable admission analysis with root cause categorization
- Utilization command center (inpatient days, ED visits, readmissions, SNF)

### Quality
- Care gap tracking across 39 quality measures
- Stars rating simulator -- model gap closures to project rating changes
- AWV scheduling, due-list management, and revenue opportunity analysis
- RADV audit preparation with MEAT scoring

### Clinical and Care Ops
- Provider point-of-care overlay (works alongside any EMR)
- Care plan builder, case management, prior authorization workflows
- TCM tracking for post-discharge follow-up
- Live census and real-time ADT alerts

### Network
- Provider scorecards: RAF capture rate, cost efficiency, quality gap closure
- Group-level comparison and anonymized peer benchmarking
- AI coaching with dollar-impact estimates

### Intelligence
- Autonomous discovery engine (6 continuous scan types)
- Self-learning feedback system -- tracks which recommendations drive action
- Conversational AI query on every page ("Ask Bar")
- Cross-module context graph linking revenue, cost, quality, and provider data

### Finance
- P&L views (confirmed vs projected), IBNR estimates, revenue forecasting
- Risk accounting: capitation, subcapitation, pool accounting, surplus/deficit
- Stop-loss monitoring and reinsurance threshold alerts
- ROI tracker tied to intervention engine

### Data
- Universal Data Interface -- 11 formats natively
- AI pipeline: auto-detect format, auto-map fields, AI clean, entity resolution, learn rules
- Dual data tiers: Signal (real-time predictions) and Record (adjudicated claims) with reconciliation
- Data quality gates, quarantine, and full lineage tracing

---

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/cspergel/aqhealth.git
cd aqhealth

docker compose up -d
```

| Service | Port |
|---------|------|
| PostgreSQL 16 | `localhost:5433` |
| Redis 7 | `localhost:6380` |
| Backend (FastAPI) | `localhost:8090` |
| Worker (ARQ) | background |

### Frontend

```bash
cd frontend
npm install
npm run dev          # localhost:5180
```

### Demo Mode

Visit [localhost:5180/?demo=true](http://localhost:5180/?demo=true) to explore with synthetic data -- no backend required.

### Bootstrap

```bash
# Create admin user
curl -X POST http://localhost:8090/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "...", "role": "superadmin"}'

# Create tenant
curl -X POST http://localhost:8090/api/tenants \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My MSO", "schema_name": "my_mso"}'
```

---

## Architecture

- **Schema-per-tenant** multi-tenancy in PostgreSQL with Row-Level Security
- **60+ services** powering 52 API routers and 43 frontend pages
- **8 self-learning loops**: data quality improvement, HCC suspect refinement, insight relevance, provider coaching, care gap prioritization, cost optimization, entity resolution accuracy, and pipeline transformation rules
- **Invisible AI philosophy** -- no "AI-POWERED" badges; intelligence is woven into every module
- **8 user roles** with section-level and page-level access control
- **LLM Guard** enforces tenant data isolation across all AI calls

### Data Sources

| Source | Type |
|--------|------|
| CMS county benchmark rates | Baseline PMPM and risk adjustment |
| CMS MOOP limits | Maximum out-of-pocket by plan type |
| HCC model V28 | ICD-10 to HCC mapping, RAF coefficients |
| 39 quality measures | HEDIS/Stars measure definitions and targets |
| CMS DRG weights, MUP files, cost reports | Facility benchmarking baselines |

### Ecosystem

The Health Platform is the intelligence hub. It connects to:

- **AQTracker** -- hospital billing hub (pre-claims predictive feed)
- **SNF Admit Assist** -- HCC coding engine for complex documents
- **ADT feeds** -- real-time admit/discharge/transfer (Bamboo Health, Availity)
- **AIClaim** -- denial prevention and claim scrubbing (future)

---

## Status

**Pre-production.** Platform is built and running with seeded data. Preparing for first real MSO data load. Interactive demo available at [cspergel.github.io/aqhealth/?demo=true](https://cspergel.github.io/aqhealth/?demo=true).

---

## License

Proprietary. All rights reserved.
