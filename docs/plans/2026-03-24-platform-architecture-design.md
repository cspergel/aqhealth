# AQSoft Health Platform — Architecture Design
## EMR-Agnostic Managed Care Intelligence Platform

**Date:** 2026-03-24
**Status:** Validated design, ready for implementation planning

---

## 1. Architecture Overview

**What it is:** An EMR-agnostic managed care intelligence platform. It ingests population data (rosters, claims, eligibility) via batch upload, runs AI-driven analytics across two axes — revenue optimization (HCC capture, RAF maximization) and cost intelligence (expenditure analysis, facility/provider benchmarking, pharmacy optimization) — and produces actionable outputs (chase lists, provider scorecards, AI-generated cost recommendations).

**Positioning:** "The Palantir of MSOs" — turns the mountains of claims data every MSO sits on into real-time actionable intelligence. Two value pillars:
- **Revenue optimization** — maximize HCC capture, RAF scores, and recapture rates
- **Cost intelligence** — identify and act on expenditure inefficiencies across every category

**Deployment model:** Two modes:
1. **Standalone web app** — MSO admins, analysts, and billing company staff log in for population analytics, chase lists, expenditure intelligence, provider scorecards.
2. **EMR overlay** — PCP offices under MSO contracts use the platform alongside their existing EMR. Provider sees suspect HCCs, care gaps, RAF uplift, and coding suggestions at point of care. Delivered as a lightweight web app (separate tab or embedded) that pulls patient context from the EMR via FHIR or manual patient selection.

Mode 1 works from day one with batch data. Mode 2 requires FHIR integration or manual patient lookup, phased in after core analytics are live.

**Three customer segments:**
1. **Billing company** — operational analytics on their provider clients via AQTracker data feed
2. **Provider groups / PCP offices** (under MSO) — EMR overlay for point-of-care HCC capture, care gap closure, coding assistance
3. **MSOs** (including internal MSO) — population-level intelligence across all provider groups and attributed members

**Design philosophy:** The AI is a "little bee in the ear" — actively surfacing recommendations, not waiting to be asked. Intelligence is invisible in the UI (no "AI-POWERED" badges), but the platform is constantly analyzing and whispering actionable insights.

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 19 + Vite | Modern SPA, fast builds, component-driven |
| UI Components | Tailwind CSS + Radix UI primitives | Premium aesthetic with accessible building blocks |
| Backend | FastAPI (Python) | Same stack as SNF Admit Assist, natural for AI/analytics workloads |
| Database | PostgreSQL (schema-per-tenant) | Strong analytics, JSONB for flexible data, row-level security |
| Cache / Queue | Redis | Dashboard caching, background job processing for batch ingestion |
| AI Services | SNF Admit Assist (microservice) | HCC coding pipeline — code_optimizer, raf_service, coding_service |
| AI Services | AutoCoder (AQSoft.AI) | Additional coding intelligence layer |
| AI Services | LLMs (Claude/GPT) | Insight generation, data mapping, narrative summaries |
| Data Source | AQTracker (microservice) | Encounter data, billing, patient tracking, provider scheduling |
| Data Source | AQCoder (via AQTracker) | AI-coded encounters with CPT/ICD-10, MIPS, MDM, RAF |
| External APIs | AIClaim (future) | Denial prevention, claim scrubbing (no access yet) |
| External APIs | redact.health | PHI de-identification |

### Key Architectural Decisions

1. **EMR-agnostic** — No OpenEMR fork. Platform connects to existing EMRs via FHIR (future) or works standalone from batch data. Defers the EHR build to v2+.
2. **Microservices** — SNF Admit Assist stays as an independent service. Platform calls it via internal API. No code absorption.
3. **Schema-per-tenant** — Each MSO client gets their own PostgreSQL schema. Strong data isolation without the operational overhead of separate databases.
4. **Batch-first, real-time later** — MVP works from uploaded files (rosters, claims, eligibility). FHIR real-time integration is a future upgrade.
5. **Full RAF calculation** — Demographic coefficients (age, sex, Medicaid status, disability, institutional status) + disease HCCs + disease interactions. Not just the disease component.
6. **Dual coding engines** — SNF Admit Assist pipeline (deterministic, auditable, 2800+ lines of rules) for primary HCC detection + AutoCoder as an enhancement layer.

---

## 2. Multi-Tenancy Model

**Pattern:** Schema-per-tenant in PostgreSQL.

Each MSO client gets a dedicated schema (e.g., `sunstate.*`, `gulfcoast.*`). A shared `platform` schema holds cross-tenant data (user accounts, tenant config, platform metadata).

**Tenant isolation:**
- Middleware extracts tenant context from authenticated session
- All queries scoped to tenant schema
- PostgreSQL RLS as a safety net
- No cross-tenant data access except for platform superadmin

**Onboarding flow:**
1. Platform admin creates new tenant → provisions schema with migrations
2. MSO admin account created
3. First data upload triggers ingestion pipeline
4. Dashboards populate as data processes

---

## 3. Module Design

### 3.1 Data Ingestion

**The entry point for everything.**

**Approach:** Generic intelligent ingestion — not hardcoded file types. The AI analyzer:
1. Reads headers + sample rows
2. Identifies what kind of data this is (clinical, financial, enrollment, pharmacy, provider, quality, authorizations, or unknown)
3. Maps columns to known platform concepts
4. For unrecognized data: flags it, asks the user, stores in semi-structured JSONB with AI-generated metadata
5. Learns over time — user corrections become rules for future uploads

**Ingestion workflow:**
1. Drag-and-drop file upload (CSV, Excel, flat files)
2. AI auto-detects data type and proposes column mappings
3. Admin reviews/corrects mappings, saves as reusable template
4. Validation: missing fields, invalid codes, duplicates, date ranges
5. Background processing (Redis queue): normalize, load into tenant schema, trigger downstream recalculations
6. Status dashboard: row counts, errors, rejected row review

**Learnable rules system:**
- User corrections accumulate as rules per client, per data source
- "When column X from Humana, treat as Y"
- Rules are user-editable and exportable
- System improves with every upload — second import from same source is one-click

**Key principle:** Not hardcoded perfection. Configurable, correctable, learns over time.

### 3.2 Population Dashboard (Home Screen)

**At-a-glance health of the entire attributed population.**

**Top-level metric cards:**
- Total attributed lives (trend vs prior month)
- Average RAF score (trend + benchmark comparison)
- Recapture rate (% prior-year HCCs recaptured)
- Suspect HCC inventory (total suspects, estimated RAF uplift)
- Total medical spend PMPM (trend)
- MLR (Medical Loss Ratio)

**Drill-down sections:**
- **RAF distribution** — histogram of member RAF scores
- **Revenue opportunity** — top suspect HCC categories by aggregate dollar impact
- **Cost hotspots** — top expenditure categories trending above benchmark with AI-generated plain-English explanations
- **Provider performance summary** — mini leaderboard, top/bottom performers
- **Care gap summary** — open gaps by measure, closure rate trends

**AI insight panel:** 3-5 AI-generated insights refreshed on data update. Specific to this client's data with dollar estimates and recommended actions.

### 3.3 Suspect HCC Engine & Chase Lists

**The revenue generator.**

**How suspects are identified (from batch claims/diagnosis data):**
- Historical claims run through the coding pipeline (code_optimizer, raf_service, coding_service from SNF Admit Assist)
- **Med-dx gap detection** — member on insulin but no diabetes coded, member on Eliquis but no AFib coded (100+ drug mappings)
- **Specificity upgrades** — unspecified codes (E11.9) when evidence supports complication-specific codes (E11.319)
- **Recapture gaps** — HCC coded last payment year but not yet this year
- **Near-miss interactions** — 2 of 3 diagnoses present for a disease interaction bonus
- **Historical pattern analysis** — conditions coded 2+ years ago that dropped off, likely still clinically present
- AutoCoder as an additional layer

**Full RAF calculation includes:** demographic base (age/sex/Medicaid/disability/institutional status) + disease HCCs + disease interactions. Published CMS coefficient tables incorporated.

**Chase list output:**
- Ranked by estimated RAF dollar value (highest opportunity first)
- Filterable by: provider/PCP, HCC category, risk tier, plan, suspect type
- Per-member row: name, DOB, PCP, current RAF, projected RAF, top suspects with evidence
- Expandable detail: full suspect list, MEAT evidence, medication list, relevant claims
- **Export to CSV/Excel** — clean enough to hand directly to a provider office

**Tracking workflow:**
- Suspects: open → captured (confirmed via claims) or dismissed
- Platform tracks capture rate over time per provider, per HCC category
- AI flags suspects open 60+ days with no activity — "these are aging out"

### 3.4 Expenditure Analytics & Cost Intelligence

**The cost control side. Where the platform earns its fee multiple times over.**

**Top-level — Expenditure Overview:**
- Total medical spend, PMPM, trend
- MLR tracking
- Category breakdown: inpatient, outpatient, ED/observation, professional/specialist, SNF/post-acute, pharmacy, home health, DME
- Per category: total spend, PMPM, % of total, trend, benchmark comparison

**Category drill-downs:**
- **Inpatient** — facility spend, top DRGs, avg cost/admit, readmission rates, LOS comparison across facilities
- **ED/Observation** — avoidable ED visits, obs vs inpatient conversion, frequent utilizers, 2-midnight rule
- **Specialist/Professional** — spend by specialty, referral rates per PCP, high-cost outliers, network leakage
- **SNF/Post-Acute** — facility quality comparison, LOS, rehospitalization per facility, discharge disposition (home vs SNF vs LTACH)
- **Pharmacy** — drug class spend, generic vs brand rate, top cost drugs, therapeutic alternatives, PDC adherence
- **Home Health / DME** — utilization rates, cost per episode, vendor comparison

**AI Optimization Engine:**
Not just dashboards — actionable recommendations per category with estimated dollar impact:
- Facility redirection opportunities
- Generic substitution savings
- Discharge disposition optimization
- Network steerage recommendations
- High-cost outlier intervention suggestions

Each recommendation: plain English, dollar estimate, affected members/providers, confidence level, recommended action.

### 3.5 Provider Scorecards

**Driving behavior change through visibility.**

**Per-provider metrics:**
- Panel size (attributed lives)
- RAF performance — capture rate, recapture rate, average panel RAF
- Open suspects — count and dollar value sitting uncaptured
- Cost efficiency — panel PMPM vs peer average, referral rate, ED utilization
- Quality — HEDIS gap closure rate, Stars-impacting measures
- Trend lines — quarter-over-quarter trajectory

**Configurable benchmarks:**
- MSO sets their own targets/goals per metric
- Thresholds are adjustable — not hardcoded industry benchmarks
- Performance measured against MSO-defined goals

**Peer benchmarking:**
- Anonymized comparison within the network
- Percentile ranking
- High performers highlighted (positive reinforcement, not just flagging laggards)
- **Comparative insights** — AI analyzes what high performers do differently and surfaces anonymized best practices: "Providers in your network with 80%+ diabetes capture rates tend to use complication-specific coding 3x more frequently. Here are the top patterns."
- Community-level patterns without breaking HIPAA or identifying individuals

**MSO admin view:**
- Sortable/filterable provider table
- Color-coded performance tiers against configurable targets
- Drill into any provider for full scorecard
- Exportable for quarterly provider meetings

**AI coaching:**
- Per-provider suggestions with dollar impact estimates
- Identifies highest-ROI providers for education interventions
- Pattern-based recommendations from anonymized peer analysis

### 3.6 Care Gap Tracking

**Closing gaps drives Stars ratings, which drives plan payments.**

**Gap identification:**
- HEDIS measures from claims data (A1c, screenings, adherence, etc.)
- Stars-impacting measures flagged with weight (triple-weighted measures highlighted)
- Custom gaps defined by the MSO — fully configurable

**Views:**
- **Population level** — closure rates by measure, trends, comparison to Stars cutpoints (3/4/5-star)
- **Member level** — all open gaps per member with due dates and responsible provider
- **Provider level** — feeds into scorecards, gaps per panel

**Actionable outputs:**
- Gap-driven chase lists (like HCC chase lists but for quality)
- Exportable member lists per gap type for outreach
- AI prioritization tied to Stars impact: "Closing these 40 statin gaps moves D12 from 3.5 to 4 stars — triple-weighted, highest ROI this quarter"

**Configurable and updateable:**
- MSO defines custom gap types beyond standard HEDIS
- Adjustable targets per measure per client
- Measure definitions updatable as CMS changes Stars methodology annually
- Future: auto-update from CMS publications

### 3.7 Auth & Multi-Tenancy

**Roles (per tenant):**
- **MSO Admin** — full access, user management, configuration, data upload
- **Analyst** — read access to dashboards, chase lists, exports. No config changes.
- **Provider** — own scorecard and panel data only. No org-wide financials.
- **Read-only / Auditor** — time-limited view access for compliance reviews

**Authentication:**
- Email/password with MFA (TOTP)
- OAuth2/OIDC session management
- JWT with refresh rotation

**Platform superadmin** (AQSoft team) — cross-tenant access for support and internal analytics.

### 3.8 AI Insight Engine

**Embedded across the entire platform, not a separate screen.**

**How it works:**
- Batch analysis on data refresh — analyzes full tenant dataset
- LLM processes structured findings into plain-English insights with dollar estimates
- Insights tagged: revenue opportunity, cost alert, quality risk, provider action, trend warning
- Each insight: title, narrative, dollar impact, affected members/providers, recommended action, confidence level

**Where insights surface:**
- **Population dashboard** — top 3-5 highest-impact insights
- **Expenditure views** — cost recommendations inline with drill-downs
- **Provider scorecards** — per-provider coaching suggestions
- **Chase lists** — "why this member is high priority" context
- **Care gaps** — ROI-ranked closure recommendations

**Feedback loop:**
- Users dismiss, bookmark, or mark insights as "acted on"
- Platform tracks which insights drive action
- Dismissed patterns deprioritized over time
- System learns which insight types are most useful per client

---

## 4. Design Direction

**Aesthetic:** Warm, approachable, professional. Feels like Linear or Stripe, not a hacker terminal. Based on the **design-reset** prototype (NOT the older dark-mode ai-health-platform prototype).

### Design Token System (from design-reset.jsx)

```javascript
// CANONICAL — use these exact values
const tokens = {
  // Backgrounds
  bg:          "#fafaf9",   // Page background — warm stone
  surface:     "#ffffff",   // Cards, panels
  surfaceAlt:  "#f5f5f4",   // Sidebar, secondary surfaces

  // Borders
  border:      "#e7e5e4",   // Standard borders
  borderSoft:  "#f0eeec",   // Subtle dividers within cards

  // Text
  text:        "#1c1917",   // Primary text — warm black
  textSecondary: "#57534e", // Supporting text
  textMuted:   "#a8a29e",   // Labels, captions, placeholders

  // Accent — green is the ONLY primary accent
  accent:      "#16a34a",   // Buttons, positive actions, confirmations
  accentSoft:  "#dcfce7",   // Accent backgrounds
  accentText:  "#15803d",   // Accent text on light bg

  // Semantic colors — used sparingly
  blue:        "#2563eb",   // Informational
  blueSoft:    "#dbeafe",
  amber:       "#d97706",   // Warnings, caution
  amberSoft:   "#fef3c7",
  red:         "#dc2626",   // Errors, true alerts only
  redSoft:     "#fee2e2",
};
```

### Typography

```
Headings:  "Instrument Sans", "General Sans", "Plus Jakarta Sans", system-ui, sans-serif
Body:      "Inter", system-ui, sans-serif
Numbers/Codes: "Berkeley Mono", "SF Mono", "JetBrains Mono", monospace
```

- Headings: 700 weight, tight letter-spacing (-0.02em to -0.03em)
- Body: 400-500 weight, 13-14px for content
- Numbers: monospace ONLY for RAF scores, dollar amounts, ICD-10 codes, percentages — never for prose

### Component Patterns (from design-reset prototype)

- **Cards:** `border-radius: 10px`, `border: 1px solid border`, white background, no heavy shadows
- **Tags/Badges:** Small (11px font, 2px 8px padding), 5px radius, soft colored backgrounds with matching border. Variants: green (confirmed), amber (warning/suspect), red (alert), blue (info), default (neutral)
- **Metric displays:** Muted label (12px) above, large monospace number below, optional green sub-text for trends
- **Buttons:** Primary = green accent bg, white text, 6px radius. Secondary = surfaceAlt bg, border, textSecondary color
- **Layout:** Max content width 1440px, centered. Generous padding (24-28px). Grid layouts with clear hierarchy.
- **Sidebar pattern:** Right sidebar (380px) on surfaceAlt background for contextual information (RAF summary, HCC list, care gaps)
- **Top navigation:** Sticky header, white background, simple text links with active indicator (green underline)
- **Tables/Lists:** Subtle row dividers (borderSoft), hover state with light shadow, no zebra striping

### What NOT to Do

- No "AI-POWERED" badges or "machine learning" labels anywhere
- No purple glow effects or pulsing AI chip indicators
- No dark mode as default (the old `#09090b` prototype is deprecated)
- No rainbow of status colors — green/amber/red only, used semantically
- No animations that don't serve a purpose
- No feature labels referencing technology ("LLM Triage" → just "Smart Notes")
- No AiChip components — the AI is invisible, the results just appear

### Deprecated Prototypes

The following JSX files use the OLD dark-mode design and should NOT be used as implementation reference:
- `ai-health-platform.jsx` (dark bg `#09090b`, AiChip components, purple accents)
- `quality-dashboard.jsx` (dark theme)
- `expenditure-drilldown.jsx` (dark theme)

Use instead:
- `design-reset.jsx` — canonical design tokens + encounter view
- `design-reset-full.jsx` — full 6-step workflow in the correct aesthetic

**Inspiration:** Linear, Vercel, Stripe, Mercury, Notion

---

## 5. Integration Points — Microservice Ecosystem

Everything is a microservice. The Health Platform is the intelligence hub that connects them all.

### AQTracker (Encounter Management System)
- **What it does:** Full revenue cycle — rounding sheet intake (OCR), document upload, medical coding, billing, query management, audit trail. Has AI agent pipeline for automated email ingestion of rounding sheets.
- **Status:** Actively being built (21-day dev sprint). FastAPI + React + SQL Server + Keycloak.
- **Data it provides to the Platform:**
  - Real-time encounter data (patient, provider, facility, DOS, diagnosis codes, CPT codes, billing status)
  - Provider scheduling and location data (from QGenda integration)
  - Patient tracking across hospital systems (TGH, HCA, Baycare, Advent, Encompass, Kindred, etc.)
  - Billing completion data and query resolution tracking
  - Multi-client support (ISG, FMG, TPSG, GI provider groups)
- **Integration:** REST API or database-level sync. AQTracker is a first-class data source alongside batch file uploads — not a future integration, but a core pipeline.

### AQCoder (AI Coding Engine)
- **What it does:** AI-powered CPT + ICD-10 assignment, MIPS quality measures, MDM complexity scoring, RAF scoring. Integrated into AQTracker's coding workflow.
- **Status:** Being built alongside AQTracker.
- **Data it provides:** Coded encounters with confidence scores, AI suggestions vs coder selections, MIPS metrics, RAF opportunities.
- **Integration:** Called by AQTracker directly. Platform consumes the output (coded encounters) via AQTracker's data feed.

### SNF Admit Assist (Microservice)
- Stays as independent service at its own URL
- Platform calls it via internal REST API for:
  - HCC coding pipeline (code_optimizer, raf_service, coding_service)
  - Document processing (when FHIR/document ingestion added later)
  - Med-dx gap detection
  - Near-miss interaction analysis
- No code merged into platform repo

### AutoCoder (AQSoft.AI)
- Called as an external API
- Additional coding intelligence layer on top of SNF Admit Assist pipeline
- Input: diagnosis list + clinical context → Output: validated HCCs with confidence

### AIClaim (Future)
- Denial prevention and claim scrubbing
- Craig does not have access to this system yet
- Will be integrated as a microservice when available
- Integration point: billing workflow

### redact.health
- PHI de-identification for any data leaving provider network
- Required when adding FHIR overlay or external data sharing

### Future: FHIR R4 Integration
- Real-time patient data pull from Epic, Cerner, athena, etc.
- Enables encounter-level workflows (chart prep, real-time coding sidebar)
- Upgrade path from batch-only to real-time

---

## 6. Revenue Model

**For MSO Clients:**

| Revenue Stream | Pricing | Est. Annual per 5K-Life Client |
|---------------|---------|-------------------------------|
| Platform License | $2-4 PMPM | $120-240K |
| Per-HCC Capture Fee | $15-25 per new capture | $30-50K |
| SNF Admit Processing | $50-75 per admission | $15-23K |
| Revenue Share (optional) | 8-12% of documented RAF uplift | Variable |

**Target:** 5 MSO clients avg 3K lives = ~$790K ARR

---

## 7. MVP Feature Set (Launch Checklist)

1. Data Ingestion — intelligent file upload with AI mapping and learnable rules
2. Population Dashboard — metrics, distributions, AI insights
3. Suspect HCC Engine — full coding pipeline with demographic RAF
4. Chase List Generator — ranked, filterable, exportable
5. Expenditure Analytics — category drill-downs with AI optimization recommendations
6. Provider Scorecards — configurable benchmarks, peer comparison, AI coaching
7. Care Gap Tracking — HEDIS/Stars, configurable measures and targets
8. Auth + Multi-Tenancy — schema-per-tenant, RBAC, MFA
9. AI Insight Engine — embedded across all modules, feedback loop

---

## 8. Post-MVP: EMR Overlay for PCP Offices

The clinical workflow screens from the design-reset prototypes (schedule/worklist → chart prep → encounter → coding sidebar → billing) are the **provider-facing overlay**. This is delivered as a web app that PCP offices under MSO contracts use alongside their existing EMR.

**How it works:**
- Provider opens the Platform in a browser tab (or embedded panel)
- Selects patient (manual search or FHIR context if integrated)
- Platform pulls patient data from its own database (claims history, suspects, gaps) + optionally from EMR via FHIR
- Shows: suspect HCCs with evidence, care gaps to close, RAF uplift, coding suggestions
- Provider captures suspects → flows back into Platform tracking
- This is the Vatica-replacement workflow, but AI-powered instead of embedded nurses

**Phasing:** Core analytics (Mode 1) launches first. Overlay (Mode 2) launches once the data foundation is solid and at least one PCP office is ready to pilot. FHIR integration adds real-time EMR data pull but the overlay works without it — patient context can come from the Platform's own claims/encounter data.

## 9. What's NOT in MVP (Deferred)

- OpenEMR fork / standalone EHR
- SMART-on-FHIR embedded app (marketplace approval)
- Care management / case management workbench
- UM / authorization tracking
- Outreach campaign management (beyond exportable lists)
- Credentialing & provider network management
- CCM/RPM billing integration
- Telehealth
- Patient portal
- Contract modeling
- Auto-updating CMS measure definitions
- AIClaim billing integration
