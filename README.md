# AQSoft Health Platform

**aqhealth.ai** — The Palantir of MSOs: AI-powered Medicare Advantage intelligence that learns, adapts, and gets smarter with every interaction.

[Live Demo](https://cspergel.github.io/aqhealth/?demo=true) | [API Docs](http://localhost:8090/api/docs)

---

## What Makes This Different

Most healthcare analytics platforms are dashboards that display data. This one **thinks**.

### The Recursive Intelligence Loop

Every interaction teaches the system. Every correction makes it smarter. Every data point connects to every other data point across every module. The platform doesn't just analyze — it discovers, learns, and adapts autonomously.

**8 self-learning feedback loops** run continuously:

| Loop | What It Learns | How It Gets Smarter |
|------|---------------|-------------------|
| **Data Ingestion** | Column mapping corrections, value fixes | Auto-creates transformation rules — 2nd upload needs fewer corrections, 5th needs zero |
| **HCC Suspects** | Which providers capture which suspect types | Boosts confidence on suspects a provider is likely to capture |
| **Care Gaps** | Which procedures successfully close which gaps | Auto-recommends proven closure procedures |
| **AI Insights** | Which insights drive action vs get dismissed | Stops generating noise, amplifies valuable findings |
| **Alert Rules** | Dismissed alerts, threshold effectiveness | Auto-tightens thresholds that generate false positives |
| **Discovery Engine** | Which scan types produce actionable findings | Skips low-value scans, expands high-value ones |
| **Query/Ask Bar** | Bad AI answers corrected by users | Injects past corrections as rules for future queries |
| **Column Mapping** | AI mapping overrides by users | Learns source-specific patterns for one-click re-imports |

**Three-tier autonomy model:**
- **Ask** (1-2 occurrences): "I noticed this pattern. Should I fix it?"
- **Notify** (3-5 confirmed): "Auto-fixed. Undo?" — toast notification
- **Silent** (5+ never rejected): Just does it. Logged for audit, invisible to user.

**Cross-loop intelligence:** Loops feed each other through a shared event bus. A care gap closure teaches the HCC engine which providers are effective, which teaches the discovery system where to look, which generates insights that inform alert rules. The whole system is smarter than any individual part.

**Goal: the platform gets quieter over time.** First week = lots of questions. First month = mostly auto-fixes. After 3 months = silent, just works.

---

### Autonomous Discovery Engine

The system doesn't wait for questions — it **finds things on its own**. Six continuous scan types run automatically after every data load:

- **Anomaly scans** — statistical outliers in cost, utilization, coding patterns
- **Opportunity scans** — missed HCC captures, SNF diversions, AWV scheduling gaps
- **Temporal scans** — trends that are worsening or improving over time
- **Provider scans** — performance variation, best practices to replicate, coaching targets
- **Revenue cycle scans** — denial patterns, timely filing risks, payment anomalies
- **Cross-module scans** — connections between cost and quality, HCC capture and Stars impact

Each scan adapts its depth based on what's been useful before. High-value scan types get expanded parameters; low-value ones get skipped entirely.

---

### Direct Payer & EHR Integration

No CSV exports. No manual uploads. Connect directly to health plan APIs and pull data automatically.

| Source | Integration | What You Get |
|--------|------------|-------------|
| **Humana** | OAuth 2.0 FHIR R4 (free) | Members, claims, diagnoses, meds, labs, providers — 15 resource types |
| **eClinicalWorks** | SMART on FHIR + PKCE | Problem list, encounters, clinical notes, labs, vitals — prospective HCC capture |
| **Optimum Healthcare** | AaNeel Connect (FHIR) | FL MA plan data |
| **Freedom Health** | AaNeel Connect (same integration) | FL MA plan data |
| **Florida Blue** | BCBSFL Developer Portal | Care gaps, patient access, provider directory |
| **CSV/Excel upload** | Universal Data Interface | Any format — 11 supported natively with AI auto-mapping |

**The payer gives you the billing truth.** The EHR gives you the clinical truth. Combined, you see what's documented in the chart but hasn't hit a claim yet — **prospective HCC capture before the claim lag**.

---

### Real CMS Data, Not Estimates

Every dollar value in the platform is based on **actual CMS-published rates**, not industry averages:

- **3,248 county-level benchmark rates** from the 2026 MA Rate Book (range: $650–$2,537 PMPM)
- **Automatic ZIP-to-county resolution** — 33,486 ZIP codes mapped to CMS county codes
- **Quality bonus tiers** — 0%, 3.5% (4+ stars), 5% (5 stars) applied per office
- **MOOP and cost sharing limits** — CY2026 + CY2027 across 25+ service categories
- **HCC V28 model** — 7,793 ICD-10 codes with real RAF coefficients

A member in Pinellas County FL (5-star plan) at $1,310.10/month is worth 19% more per RAF point than the $1,100 national average most platforms use.

---

### Skill Framework — AI That Builds Its Own Workflows

The platform doesn't just learn data patterns — it learns **workflow patterns**:

- When the system detects a sequence of actions that consistently produces results, it proposes a **Skill** — a reusable, automated workflow
- Example: "After every Humana data sync, run HCC analysis → refresh scorecards → detect care gaps → generate insights" becomes a single skill that triggers automatically
- Skills can be triggered manually, on a schedule, by an event (ADT admit, new claims), or by a condition (capture rate drops below 50%)
- Skills evolve: the system observes which steps are always run together and proposes combining them

**The recursive loop applied to automation itself:** Data teaches rules → rules teach skills → skills execute autonomously → results teach better rules.

---

## What It Does

- **Revenue optimization** — AI-driven HCC suspect generation, RAF maximization, recapture tracking, and chase list prioritization across attributed Medicare Advantage populations
- **Cost intelligence** — Expenditure drill-downs by category, facility benchmarking, avoidable admission analysis, and AI-generated cost reduction recommendations with dollar-impact estimates
- **Quality and Stars** — 39 HEDIS/Stars care gap measures, Stars rating simulator, AWV management, RADV readiness scoring, and provider-level quality scorecards
- **Clinical overlay** — Provider point-of-care view, visit prep cards, care plan builder, case management, TCM tracking — works alongside any EMR
- **Network intelligence** — Provider scorecards with capture rate, cost efficiency, gap closure. Group-level comparison and AI coaching with dollar-impact estimates
- **Financial analytics** — P&L, IBNR estimates, revenue forecasting, risk accounting, stop-loss monitoring, ROI tracking tied to intervention engine

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts |
| **AI** | Anthropic Claude API (primary), OpenAI (fallback) — insights, data mapping, discovery, narrative reports |
| **Workers** | ARQ async Redis queue — ingestion, HCC analysis, insight generation |
| **Integration** | FHIR R4, HL7v2, X12/EDI, CDA/CCDA, SMART on FHIR, OAuth 2.0 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LEARNING EVENT BUS                         │
│  Every loop publishes what it learns. Every loop reacts.     │
└─────────────────────────┬───────────────────────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │                     │                     │
┌───▼───┐  ┌──────▼──────┐  ┌──────▼──────┐
│ Data  │  │  Clinical   │  │ Analytics   │
│ Layer │  │  Layer      │  │ Layer       │
├───────┤  ├─────────────┤  ├─────────────┤
│Ingest │  │HCC Engine   │  │Discovery    │
│PreProc│  │Care Gaps    │  │Insights     │
│Entity │  │Patient View │  │Predictions  │
│Quality│  │Care Plans   │  │Scenarios    │
│Learn  │  │TCM/ADT      │  │Patterns     │
└───┬───┘  └──────┬──────┘  └──────┬──────┘
    │             │                │
    └─────────────┼────────────────┘
                  │
    ┌─────────────▼─────────────┐
    │   Payer & EHR APIs        │
    │ Humana | eCW | BCBSFL     │
    │ Availity | AaNeel         │
    └───────────────────────────┘
```

- **Schema-per-tenant** multi-tenancy — each MSO's data is completely isolated
- **60+ services** powering 54 API routers and 45 frontend pages
- **8 self-learning loops** with cross-loop event bus
- **Invisible AI** — intelligence is woven into every module, no "AI-POWERED" badges
- **8 user roles** with section-level and page-level access control
- **LLM Guard** enforces tenant data isolation across all AI calls
- **County-level accuracy** — real CMS rates, not national averages

---

## Quick Start

```bash
# Clone and start
git clone https://github.com/cspergel/aqhealth.git
cd aqhealth
docker compose up -d

# Create first admin
python -m scripts.bootstrap_admin --email admin@aqsoft.com --password <pw>

# Create a tenant (MSO)
python -m scripts.create_tenant \
  --name "My MSO" \
  --schema my_mso \
  --admin-email admin@mymso.com \
  --admin-password <pw>

# Run post-ingestion analysis
python -m scripts.post_ingestion --schema my_mso
```

**Demo mode:** Visit [localhost:5180/?demo=true](http://localhost:5180/?demo=true) — no backend required.

---

## Ecosystem

The Health Platform is the intelligence hub connecting:

- **AQTracker** — hospital billing hub (pre-claims predictive feed)
- **SNF Admit Assist** — HCC coding engine for complex clinical documents
- **ADT feeds** — real-time admit/discharge/transfer (Bamboo Health, Availity)
- **Payer APIs** — Humana, eCW, Florida Blue, Optimum, Freedom Health, Anthem, UHC
- **AIClaim** — denial prevention and claim scrubbing (future)

---

## Status

**Pre-production.** Platform built, reviewed (280+ bugs fixed across 265 files), and preparing for first real MSO data from Pinellas County FL practices. Interactive demo at [cspergel.github.io/aqhealth/?demo=true](https://cspergel.github.io/aqhealth/?demo=true).

---

## License

Proprietary. All rights reserved. © AQSoft LLC.
