# AQSoft Health Platform

## The Intelligence Layer for Medicare Advantage MSOs

---

### The Problem

Managing a Medicare Advantage population today means drowning in data from dozens of sources — health plan claims, EHR systems, hospital feeds, pharmacy data, quality reports — and trying to manually connect the dots between revenue optimization, cost management, quality compliance, and provider performance. Most analytics platforms just give you dashboards. You still have to figure out what to do.

### What We Built

AQSoft Health Platform is an **AI-powered intelligence layer** that sits on top of all your data sources, automatically discovers what matters, and tells you exactly what to do about it — with the dollar impact attached.

It doesn't replace your EMR or your billing system. It connects to them, learns from them, and makes the entire operation smarter over time.

---

## How Data Flows In

The platform pulls from every available source and treats each one as a piece of the full picture:

**Health Plan Claims** (the billing truth)
- Direct API connections to Humana, Availity, Florida Blue, Optimum, Freedom Health
- CSV/Excel uploads for any payer format with AI-powered column mapping
- Claims, eligibility, pharmacy, provider directories — all standardized automatically

**eClinicalWorks EHR** (the clinical truth)
- SMART on FHIR integration pulling conditions, encounters, labs, vitals, medications, clinical notes
- Problem list analysis for prospective HCC capture — find what's in the chart before it hits a claim
- Lab values (eGFR, A1c, BMI) drive automatic clinical staging

**Hospital & Post-Acute Data**
- ADT feeds from Bamboo Health and Availity for real-time admit/discharge/transfer alerts
- AQTracker integration for hospital rounding sheet data and encounter management

**Health Information Exchanges** (the cross-network truth)
- Metriport HIE adapter connecting to Carequality and CommonWell networks
- See care happening at facilities outside your network — hospital admissions, specialist visits, ED encounters your PCPs don't know about

**Every data point is classified, validated, and connected** — claims data is "record tier" (confirmed), EMR and ADT data is "signal tier" (early intelligence). The system reconciles signals against records as claims catch up.

---

## What the AI Does With It

### Dual-Engine RAF Optimization

We run **two independent HCC engines** on the same data and compare the results:

1. **Tuva Health** — an open-source, community-validated analytics framework used by 2,400+ healthcare data professionals. It calculates CMS-HCC V28 risk scores, quality measures, PMPM, readmissions, and more. This is your trusted baseline.

2. **AQSoft HCC Engine** — our proprietary engine that goes beyond what Tuva does. It detects six types of suspect HCCs that Tuva doesn't look for:
   - **Medication-diagnosis gaps** — patient is on insulin but no diabetes diagnosis coded
   - **Specificity upgrades** — unspecified codes that should be more specific based on clinical evidence
   - **Recapture gaps** — HCCs coded last year but not yet this year
   - **Historical drop-offs** — conditions that were coded 2+ years ago and disappeared
   - **Evidence-backed interaction bonuses** — disease combinations that qualify for CMS bonus payments
   - **Clinical note extraction** — AI reads clinical notes and finds diagnoses that were documented but never coded

When both engines agree on a member's RAF score, you have high confidence. When they disagree, the system flags the discrepancy and shows you exactly where and why — with evidence trails back to the source claim, lab value, or clinical note.

### Three-Tier Opportunity Classification

Every HCC opportunity is classified by actionability:

| Tier | What It Means | Action |
|------|--------------|--------|
| **Easy Capture** | Previously coded, or medication directly supports the diagnosis | Add at next visit — minimal clinical review needed |
| **Likely Capture** | Clinical evidence (labs, related diagnoses) supports the condition | Review clinical data, confirm, and code |
| **Investigate** | Some evidence but needs clinical judgment | Schedule for provider review |
| **Watch** | Interaction bonus available but no current evidence | Monitor for future data |

Each opportunity shows: the suggested ICD-10 code, a **code specificity ladder** (all coding options from least to most specific with RAF impact), the evidence source (which claim, lab, or note), and the dollar impact based on your county's actual CMS benchmark rate.

### Clinical Note Intelligence

The platform uses Claude AI to parse unstructured clinical notes and extract structured diagnoses — finding conditions that providers documented but nobody coded:

- **Uncoded conditions** — "chronic systolic heart failure, EF 35%" in the note but no I50.x in claims
- **Undercoded conditions** — note supports a more specific code than what's billed
- **Historical conditions** — resolved conditions mentioned in notes that may still qualify for HCC recapture

Each extraction includes the exact quote from the clinical note, the suggested code, and the RAF/dollar impact.

### Autonomous Discovery

The system doesn't wait for questions — it runs **six continuous scan types** after every data load:

- **Anomaly scans** — statistical outliers in cost, utilization, coding patterns
- **Opportunity scans** — missed HCC captures, care gaps, AWV scheduling gaps
- **Temporal scans** — trends worsening or improving over time
- **Provider comparison** — performance variation across your network
- **Revenue cycle scans** — denial patterns, timely filing risks
- **Cross-module scans** — connections between cost and quality that no single report would surface

Claude AI synthesizes all findings into ranked, actionable insights — not raw data, but specific recommendations with dollar impact.

---

## What You See

### Population Dashboard
One view of your entire attributed population: total members, aggregate RAF, open suspects, care gap closure rates, cost hotspots, and AI-generated insights. Everything drill-downable to the provider, group, or member level.

### RAF & Revenue Optimization
- **3-Tier Comparison**: Tuva confirmed vs AQSoft confirmed vs AQSoft projected — the gap is your revenue opportunity
- **Population chase lists**: Every open suspect across all members, sorted by dollar impact, grouped by provider
- **Member detail**: Click any member to see exactly which HCCs each engine found, where they disagree, and what the capture opportunity is — with code ladders and evidence trails

### Provider & Group Scorecards
Compare providers and practice groups on: HCC capture rate, recapture rate, care gap closure, cost efficiency (PMPM), panel size, and quality measures. AI coaching identifies what top performers do differently and generates playbooks for underperformers.

### Quality & Stars
39 HEDIS/Stars quality measures tracked with real-time gap detection. Stars rating simulator shows the impact of closing specific gaps. Triple-weighted measures flagged for priority action.

### Cost Intelligence
Expenditure drill-downs by service category (inpatient, ED, pharmacy, SNF, professional, DME), facility benchmarking against CMS county rates, avoidable admission analysis, and AI-generated cost reduction recommendations.

### Financial Analytics
P&L by plan and group, IBNR estimates, revenue forecasting, risk corridor monitoring, stop-loss tracking, and ROI measurement tied to specific interventions.

### Care Management
Clinical overlay for point-of-care: visit prep cards, care plan builder, TCM tracking, case management workflows, prior auth management — all informed by the AI layer's population-level intelligence.

---

## How It Gets Smarter

The platform runs **eight self-learning feedback loops**:

| What It Learns | How |
|---------------|-----|
| Your data formats | After 2-3 uploads from the same source, column mapping becomes automatic |
| Which suspects get captured | Boosts confidence on suspect types your providers act on |
| Which care gaps close | Recommends proven closure procedures based on your network's success |
| Which AI insights drive action | Stops generating noise, amplifies findings users consistently act on |
| Alert threshold effectiveness | Auto-tightens rules that produce false positives |
| Which discovery scans are useful | Skips low-value scans, expands high-value ones |
| Query patterns | Learns from corrections to improve the conversational AI |
| Provider behavior | Studies what top performers do and generates replicable playbooks |

**Goal: the platform gets quieter over time.** First week = lots of questions and suggestions. First month = mostly automated. After three months = runs silently, surfaces only what matters.

---

## Real Numbers, Not Estimates

Every dollar value in the platform is based on **actual CMS-published data**:

- **3,248 county-level benchmark rates** from the 2026 MA Rate Book
- Pinellas County FL (5-star plan): $1,310.10/month per 1.0 RAF
- That means a RAF point captured in Pinellas is worth $15,721/year — 19% more than the $13,200 national average most platforms use
- **Quality bonus tiers** applied per office: 0%, 3.5% (4+ stars), 5% (5 stars)
- **HCC V28 model** with 7,793+ ICD-10 codes and real RAF coefficients

When the platform says "capturing this HCC is worth $4,800 annually for this member," that number is based on their county rate, their plan's star bonus, and the actual CMS V28 RAF coefficient — not an industry average.

---

## The Ecosystem

The Health Platform is the intelligence hub connecting:

| Product | What It Does |
|---------|-------------|
| **AQSoft Health Platform** | The AI intelligence layer (this product) |
| **AQTracker** | Hospital billing and encounter management |
| **AQCoder** | AI-powered CPT + ICD-10 coding engine |
| **SNF Admit Assist** | HCC coding optimizer for complex clinical documents |
| **Tuva Health** | Community-validated analytics baseline (open source) |
| **redact.health** | PHI de-identification for AI processing |

Plus direct integrations with: eClinicalWorks, Humana, Availity, Florida Blue, Optimum Healthcare, Freedom Health, Bamboo Health, and Metriport HIE.

---

## Current Status

- **Platform built**: 60+ backend services, 45+ frontend pages, 8 self-learning loops
- **Tuva integrated**: 18 analytics data marts running on DuckDB
- **Clinical NLP**: Operational with Claude AI for note extraction
- **Demo available**: Interactive demo with synthetic data at [aqhealth.ai/demo](https://aqhealth.ai/demo/?demo=true)
- **First clients**: Preparing for Pinellas County, Pasco County, and Miami-Dade FL practices
- **Next**: Real MSO data ingestion, eCW sandbox testing, partner pilot

---

## What This Means for Your Practice

Less time digging through reports. More time acting on what matters.

The platform tells you:
- **Which members** to see next and what to document (chase lists ranked by dollar impact)
- **Which providers** need coaching and what specifically to improve
- **Which quality measures** are at risk and exactly which patients to target
- **Where money is leaking** and which facilities/categories to address first
- **What changed** since last week and whether trends are getting better or worse

All with evidence trails, dollar impact, and confidence scores — so you can trust the recommendations and move fast.

---

*AQSoft LLC | aqhealth.ai | Proprietary & Confidential*
