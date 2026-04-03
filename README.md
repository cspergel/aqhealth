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

---

### Dual-Engine RAF Validation (Tuva + AQSoft)

The platform runs **two independent HCC engines** side by side — the community-validated [Tuva Health](https://github.com/tuva-health/tuva) framework and AQSoft's proprietary suspect detection — then cross-validates the results.

**Three-tier comparison:**
| Tier | Source | What It Tells You |
|------|--------|-------------------|
| **Tuva Confirmed** | Community-validated CMS-HCC V28 | What CMS will actually pay based on submitted claims |
| **AQSoft Confirmed** | Proprietary HCC engine | Claims-based RAF from your engine — should match Tuva closely |
| **AQSoft Projected** | Confirmed + suspects | What RAF *should* be if all opportunities are captured |

**The gap between confirmed and projected = your revenue opportunity.**

When they agree, you have high confidence. When they disagree, discrepancies are flagged with evidence — both values preserved, nothing silently overwritten.

**Evidence-based suspect classification:**
- **Easy Captures** — previously coded, just needs recapture. Or medication evidence directly supports missing diagnosis.
- **Likely Captures** — clinical evidence (labs, related diagnoses, medications) points to the condition. Review and confirm.
- **Investigate** — some evidence but needs clinical review. Code ladder shows all coding options with RAF impact.
- **Watch Items** — interaction bonus available but no current evidence. Monitor for future data.

Each opportunity shows: which data source found it, the evidence trail, suggested ICD-10 codes with a specificity ladder, and the dollar impact.

---

### Autonomous Discovery Engine

The system doesn't wait for questions — it **finds things on its own**. Six continuous scan types run automatically after every data load:

- **Anomaly scans** — statistical outliers in cost, utilization, coding patterns
- **Opportunity scans** — missed HCC captures, SNF diversions, AWV scheduling gaps
- **Temporal scans** — trends that are worsening or improving over time
- **Provider scans** — performance variation, best practices to replicate, coaching targets
- **Revenue cycle scans** — denial patterns, timely filing risks, payment anomalies
- **Cross-module scans** — connections between cost and quality, HCC capture and Stars impact

Each scan adapts its depth based on what's been useful before. Tuva baseline data is included in the AI context graph — Claude sees both engines' numbers and surfaces cross-engine insights.

---

### Clinical NLP — Diagnoses Hidden in Notes

Clinical notes are the richest source of uncoded diagnoses. The platform uses Claude to autonomously parse clinical notes from eCW and extract structured conditions, then compares against what's actually coded in claims:

| Gap Type | What It Finds | Example |
|----------|--------------|---------|
| **Uncoded** | Condition in note but not in claims | "Chronic systolic heart failure, EF 35%" in note, no I50.x in claims |
| **Undercoded** | Note supports higher specificity | Note says "EF 35%" but claims have I50.9 (unspecified) not I50.22 |
| **Historical** | Resolved condition still HCC-eligible | "History of colon cancer, s/p resection 2020" |

Each gap includes the evidence quote from the source note, the suggested ICD-10 with HCC/RAF impact, and a code ladder showing all coding options from least to most specific.

---

### Direct Payer, EHR & HIE Integration

No CSV exports. No manual uploads. Connect directly to data sources and pull automatically.

| Source | Integration | What You Get |
|--------|------------|-------------|
| **Humana** | OAuth 2.0 FHIR R4 (free) | Members, claims, diagnoses, meds, labs, providers — 15 resource types |
| **eClinicalWorks** | SMART on FHIR + PKCE | Problem list, encounters, clinical notes, labs, vitals — prospective HCC capture |
| **Metriport** (planned) | Carequality + CommonWell | Cross-network HIE — care at outside facilities via 300M+ patient records |
| **Tuva Health** | dbt + DuckDB (Apache 2.0) | Community-validated CMS-HCC V28, quality measures, PMPM, readmissions |
| **Optimum Healthcare** | AaNeel Connect (FHIR) | FL MA plan data |
| **Freedom Health** | AaNeel Connect | FL MA plan data |
| **Florida Blue** | BCBSFL Developer Portal | Care gaps, patient access, provider directory |
| **CSV/Excel upload** | Universal Data Interface | Any format — 11 supported natively with AI auto-mapping |

**The payer gives you the billing truth.** The EHR gives you the clinical truth. The HIE gives you the cross-network truth. Tuva validates the math. Combined, you see everything — and every finding traces back to its source.

---

### Real CMS Data, Not Estimates

Every dollar value in the platform is based on **actual CMS-published rates**, not industry averages:

- **3,248 county-level benchmark rates** from the 2026 MA Rate Book (range: $650-$2,537 PMPM)
- **Automatic ZIP-to-county resolution** — 33,486 ZIP codes mapped to CMS county codes
- **Quality bonus tiers** — 0%, 3.5% (4+ stars), 5% (5 stars) applied per office
- **MOOP and cost sharing limits** — CY2026 + CY2027 across 25+ service categories
- **HCC V28 model** — 7,793 ICD-10 codes with real RAF coefficients + 101,295 via Tuva

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL 16, Redis 7 |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts |
| **AI** | Anthropic Claude API (primary), OpenAI (fallback) — insights, NLP extraction, data mapping, discovery |
| **Analytics** | dbt-core 1.11 + DuckDB 1.5 + Tuva Health v0.17.2 (18 data marts) |
| **Workers** | ARQ async Redis queue — ingestion, HCC analysis, insight generation, Tuva pipeline |
| **Integration** | FHIR R4, HL7v2, X12/EDI, CDA/CCDA, SMART on FHIR, OAuth 2.0 |

---

## Architecture

```
DATA SOURCES                    PROCESSING                      INTELLIGENCE
─────────────                   ──────────                      ────────────
eCW FHIR (EMR)     ──┐
  Conditions          │
  Encounters          │
  Labs/Vitals         ├──→ PostgreSQL ──→ DuckDB ──→ Tuva ──┐
  Clinical Notes ─────┼──→ Claude NLP ──→ FHIR ──→──────────┤
                      │                                      │
Payer APIs            │                                      ├──→ AI Layer
  Humana FHIR        ├──→ PostgreSQL ──→ DuckDB ──→ Tuva ──┤     Discovery
  Availity            │   (record-tier)                      │     Insights
                      │                                      │     Patterns
Claims/Eligibility    │                                      │     Self-learning
  CSV uploads        ├──→ Ingestion ──→ HCC Engine ─────────┤     Cross-validation
  837 files           │   pipeline     (6 suspect types)     │
                      │                                      │
Metriport HIE         │                                      │
  Carequality        ├──→ FHIR_inferno ──→ Tuva ────────────┤
  CommonWell          │   (FHIR→CSV)                         │
                      │                                      │
AQTracker             │                                      │
  Hospital data      ├──→ Signal-tier claims ────────────────┤
  Rounding sheets     │                                      │
                      │                                      │
ADT Feeds            ├──→ Real-time alerts ──────────────────┘
  Bamboo Health       │
  Availity            │
                      │
SNF Admit Assist ─────┘
  Code optimizer
  RAF calculator
```

- **Schema-per-tenant** multi-tenancy — each MSO's data is completely isolated
- **60+ services** powering 54 API routers and 45+ frontend pages
- **Dual HCC engine** — AQSoft (6 suspect types) + Tuva (4 suspect types) cross-validated
- **8 self-learning loops** with cross-loop event bus
- **Clinical NLP** — autonomous extraction from unstructured notes via Claude
- **Evidence-based opportunities** — every suspect traced to its data source
- **LLM Guard** enforces tenant data isolation across all AI calls
- **County-level accuracy** — real CMS rates, not national averages

---

## Full Ecosystem

The Health Platform is the intelligence hub connecting all AQSoft microservices and external data sources:

### AQSoft Products

| Product | Role | Status |
|---------|------|--------|
| **AQSoft Health Platform** | EMR-agnostic managed care intelligence hub | Active development |
| **AQTracker** | Hospital billing/encounter management (OCR, coding, billing) | Production |
| **AQCoder** | AI-powered CPT + ICD-10 coding engine | Production (integrated with AQTracker) |
| **SNF Admit Assist** | HCC coding optimizer for complex clinical documents (2,800-line code_optimizer) | Production |
| **redact.health** | PHI de-identification service | Production |
| **AutoCoder** | Proprietary HCC engine (AQSoft.AI) | Available (batch use) |
| **AIClaim** | Denial prevention / claim scrubbing | Future integration |

### Open Source Integrations

| Project | Role | Status |
|---------|------|--------|
| **[Tuva Health](https://github.com/tuva-health/tuva)** | Community-validated dbt analytics (CMS-HCC, HEDIS, PMPM, readmissions) | Integrated |
| **[FHIR_inferno](https://github.com/tuva-health/FHIR_inferno)** | FHIR JSON → flat CSV converter for Tuva pipeline | Planned |
| **[Infherno](https://github.com/cspergel/infherno)** | Clinical notes → structured FHIR via NLP (reference architecture) | Forked, reference |
| **[Metriport](https://github.com/metriport/metriport)** | Universal HIE API (Carequality, CommonWell) | Evaluated, planned |

### Data Sources

| Source | Type | Integration | Status |
|--------|------|-------------|--------|
| Health plan claims | Record-tier | CSV/Excel upload, Payer FHIR APIs | Active |
| eClinicalWorks | Clinical | SMART on FHIR + PKCE | Adapter built, sandbox ready |
| Humana | Payer | OAuth 2.0 FHIR R4 | Adapter built |
| Metriport/HIE | Cross-network | Carequality + CommonWell | Planned |
| ADT feeds | Real-time | Bamboo Health, Availity | Architecture built |
| AQTracker | Hospital encounters | Internal API | Planned |
| Clinical notes | Unstructured | Claude NLP extraction | Service built |

---

## Current Build (as of April 2026)

### Completed
- 60+ backend services, 54 API routers, 45+ frontend pages
- Full Tuva Health integration (dbt + DuckDB, 18 data marts, 611/624 models)
- Dual-engine RAF comparison (Tuva vs AQSoft, 3-tier view)
- Evidence-based HCC suspect detection with code ladders
- Tiered opportunities (Easy Capture / Likely / Investigate / Watch)
- eCW SMART-on-FHIR adapter (85% complete, sandbox ready)
- Clinical NLP service (Claude-powered note extraction)
- Clinical gap detector (uncoded / undercoded / historical)
- 39 HEDIS/Stars quality measures
- Real CMS 2026 county rates (3,248 counties)
- Interactive demo with 30 seeded members + 1,000-patient Tuva synthetic data
- 8 self-learning feedback loops
- Multi-tenant schema isolation

### In Progress
- eCW lab/observation parsing completion → Tuva lab-based suspects
- Tuva 1,000-patient demo validation
- SNF Admit Assist code_optimizer → clinical gap detector wiring

### Planned
- Autonomous clinical evidence parsing (notes → NLP → HCC opportunities with evidence)
- Metriport HIE integration for cross-network visibility
- AQTracker data feed (hospital encounters as signal-tier data)
- AQCoder cross-validation against Tuva mappings
- RAF convergence alerting (projected RAF that doesn't converge → stale suspect flag)
- FHIR_inferno pipeline for direct FHIR → Tuva ingestion

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

# Run Tuva pipeline (optional — requires dbt + DuckDB)
cd dbt_project && dbt deps && dbt seed --profiles-dir . && dbt run --profiles-dir .
```

**Demo mode:** Visit [localhost:5180/?demo=true](http://localhost:5180/?demo=true) — no backend required.

---

## License

Proprietary. All rights reserved. (c) AQSoft LLC.
