# AQSoft Health Platform — Master Product Plan
### Managed Care Intelligence Platform Built on OpenEMR

**Version 0.1 Draft — March 2026**
**Prepared by: Craig Spergel, MD + Claude (Anthropic)**
**For: AQSoft.AI Partnership Review**

---

## Part 1: Vision

### What This Is
A managed care intelligence platform that combines a full EHR (forked from OpenEMR 8.0) with AI-driven risk adjustment, quality measurement, expenditure optimization, and population health operations. Deployable as a standalone EMR for small groups/SNFs or as a lightweight overlay on existing EHRs (Epic, Cerner, athena, PointClickCare) via FHIR R4 and Chrome extensions.

### What It Replaces
- Manual HCC chart review (Vatica Health's embedded nurse model — we automate it)
- Retrospective risk adjustment (Episource, Cotiviti — we do it prospectively at point of care)
- Disconnected quality tracking (spreadsheets, plan portal downloads — we unify it)
- Separate care management platforms (GuidingCare, Medecision — we integrate it with the clinical workflow)
- Multiple vendor logins (plan portals, clearinghouses, analytics tools — one platform)

### Who Uses It
1. **Providers** (physicians, NPs, PAs) — encounter workflow, documentation, coding
2. **Care managers** (RN, SW) — caseload management, outreach, transitions
3. **MSO administrators** — population analytics, financial tracking, reporting
4. **Billing staff** — claim submission, denial management, authorization tracking
5. **Quality/compliance teams** — HEDIS, Stars, MIPS, audit preparation

### Design Principles
1. **Intelligence is invisible.** The AI does the work. The UI presents results cleanly. No "AI-powered" badges, no "machine learning detected this" labels. The note is just correct. The gaps are just surfaced. The RAF is just calculated.
2. **Warm, approachable, professional.** Light mode default. Clean typography. Generous whitespace. Feels like Linear or Stripe, not a hacker terminal. Physicians should feel calm using it, not overwhelmed.
3. **One accent color.** Green for positive actions and confirmations. Amber for warnings. Red only for true alerts. No rainbow dashboards.
4. **Progressive disclosure.** Show what matters first. Details available on click. Don't vomit every data point onto one screen.
5. **Works on day one.** A new MSO client uploads a CSV roster and starts seeing insights immediately. No 6-month implementation. No IT integration required for v1.

---

## Part 2: Product Architecture

### Technology Stack
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 19 + Vite | Modern SPA, fast builds, component-driven |
| Design System | Custom (Tailwind utility classes) | Warm, premium aesthetic. Not shadcn/ui defaults. |
| Backend (core) | OpenEMR 8.0 PHP | Auth, FHIR R4, billing/837, scheduling, patient CRUD |
| Backend (AI) | FastAPI (Python) | SNF Admit Assist, AutoCoder, OCC parser, RAF calc, LLM calls |
| Backend (claims) | AIClaim API (external) | White-label denial prevention, claim scrubbing |
| Database | MySQL/MariaDB | OpenEMR's existing schema + new platform tables |
| Cache | Redis | Sessions, job queues, real-time ADT processing |
| Search | (future) OpenSearch | Patient search, document search across panel |
| Deployment | Docker Compose → Kubernetes | Dev → production multi-tenant |
| PHI Security | ScrubGate pipeline | De-identification for data leaving provider network |
| CDN / Frontend Hosting | Vercel or Cloudflare | React SPA deployment |

### Existing Codebases Being Integrated
| Codebase | Status | Role in Platform |
|----------|--------|------------------|
| OpenEMR 8.0 (github.com/openemr/openemr) | Fork | EHR chassis — schema, FHIR, billing, auth |
| SNF Admit Assist (github.com/cspergel/SNF_Admit_Assist) | 66 commits, production-ready | Note compilation, PDF extraction, HCC coding, RAF calculation |
| AutoCoder HCC Engine (AQSoft.AI) | Proprietary | Core coding intelligence |
| PCC Helper Extension | In SNF Admit Assist repo | PointClickCare document download + dashboard scraping |
| ScrubGate | Existing | PHI de-identification pipeline |
| AIClaim (aiclaim.com) | External API | Denial prevention, claim scrubbing, X12 837 analysis |

### Integration Architecture (simplified)
```
React SPA ←→ OpenEMR PHP API (auth, FHIR, billing, scheduling)
React SPA ←→ FastAPI Python (AI services, analytics, care mgmt)
FastAPI ←→ AIClaim API (claim scrubbing on billing step)
FastAPI ←→ AutoCoder (HCC engine)
Both backends ←→ MySQL/MariaDB (shared database)
Chrome Extension ←→ FastAPI (PCC chart prep endpoint)
FHIR Overlay ←→ External EMRs (Epic, Cerner, athena)
```

---

## Part 3: Module Inventory

### Clinical Workflow (Provider-Facing)
| Module | Description | Status |
|--------|-------------|--------|
| Smart Schedule | AI-prioritized worklist sorted by RAF uplift + care gaps | Prototyped |
| Chart Prep | Auto-ingests data from all sources, pre-builds note sections | Prototyped, partially built (SNF Admit Assist) |
| Encounter Editor | Rich text note editor with real-time coding sidebar | Prototyped |
| AutoCoder Integration | ICD-10 validation, HCC mapping, MEAT evidence, specificity upgrades | Built (code_optimizer, raf_service, coding_service) |
| Billing / AIClaim | Pre-submission claim scrub, denial prediction, 837 generation | Prototyped, AIClaim API available |
| PCC Chrome Extension | Dashboard scraper, document downloader, smart highlighter, LLM triage | Partially built (doc downloader exists, scraper/highlighter designed) |

### Quality & Performance
| Module | Description | Status |
|--------|-------------|--------|
| Star Ratings Dashboard | Overall rating, Part C/D breakdown, measure-level performance | Prototyped |
| HEDIS Measures | 12+ measures with rates, targets, benchmarks, trends, weights | Prototyped |
| MIPS Tracking | 4 categories, individual measures, composite scoring | Prototyped |
| Care Gap Engine | Population-level gap identification with member-level chase lists | Prototyped |

### Financial Intelligence
| Module | Description | Status |
|--------|-------------|--------|
| Expenditure Overview | Total PMPM, MLR, category breakdown, trend comparison | Prototyped |
| Inpatient Drill-Down | Facility performance, DRG analysis, readmission tracking | Prototyped |
| ED/Observation Analysis | Obs vs inpatient status, avoidable ED visits, 2-midnight rule | Prototyped |
| Professional/Specialist | Specialist utilization by specialty, referral rate analysis | Prototyped |
| SNF/Post-Acute | Facility quality comparison, LOS, rehospitalization rates | Prototyped |
| Pharmacy | Drug class spend, generic rate, PDC adherence, brand→generic opps | Prototyped |
| AI Optimization Engine | Per-category actionable recommendations with $ impact | Prototyped |

### Operations (MSO-Facing)
| Module | Description | Status |
|--------|-------------|--------|
| Care Management Workbench | Risk stratification, caseload, tasks, timeline, AI member briefs | Prototyped |
| Member Attribution | Plan-level attribution, provider panels, churn tracking | Prototyped |
| Transitions of Care | ADT feed monitoring, discharge checklists, SNF Admit Assist trigger | Prototyped |
| Outreach Campaigns | Gap-driven campaigns, funnel tracking, channel optimization | Prototyped |
| Data Ingestion Portal | Universal format intake, AI column mapping, feed management | Prototyped |

### Infrastructure (Not Yet Built)
| Module | Description | Priority |
|--------|-------------|----------|
| UM / Authorization Tracking | Prior auth requests, status, turnaround, denial/appeal | P2 |
| Credentialing & Network | Provider directory, credentialing tracker, network adequacy | P2 |
| Financial / Cap Accounting | Capitation tracking, IBNR, surplus/deficit, P&L by plan | P1 |
| Compliance / RADV Audit | Audit prep packages, FWA monitoring, regulatory calendar | P2 |
| Referral Management | In-network directory, eConsult, loop closure, steerage | P1 |
| Prior Auth Automation | Auto-determination, requirement lookup, electronic submission | P2 |
| CCM/RPM Integration | Time tracking, device integration, auto-billing | P3 |
| SDoH Module | Screening tools, Z-codes, community resources, closed-loop referrals | P2 |
| Provider Performance | Individual dashboards, peer benchmarking, education, incentive tracking | P2 |
| Part D / Pharmacy Mgmt | PDC tracking, adherence interventions, formulary awareness, MTM | P2 |
| Reporting Engine | Health plan reports, CMS submissions, board reports, ad-hoc builder | P2 |
| Contract Modeling | P&L projection, what-if scenarios, rate adequacy analysis | P3 |
| Telehealth | Video visits, telehealth templates, virtual AWV | P3 |
| Patient Portal | Basic member-facing view (care gaps, appointments, care plan) | P3 |

---

## Part 4: Build Phases

### Phase 0: Foundation (Weeks 1-3)
- Fork OpenEMR 8.0, strip PHP frontend templates
- Set up React SPA with Vite, design system, auth integration
- Establish shared API client (PHP endpoints + FastAPI endpoints)
- Port SNF Admit Assist services into FastAPI container
- Set up MySQL with new platform tables (hcc_tracking, raf_history, mso_clients, etc.)
- Implement audit trail infrastructure (append-only logging from day 1)
- Docker Compose development environment

### Phase 1: Core Clinical Workflow (Weeks 3-8)
- **Schedule/Worklist** — AI-sorted patient list
- **Chart Prep** — data source ingestion, pre-built note sections
- **Encounter Editor** — note editing with coding sidebar
- **AutoCoder Integration** — real-time HCC detection, RAF calculation
- **Member Attribution** — roster upload, plan-level tracking, PCP assignment
- **Basic Care Management** — risk tiers, caseload assignment, task list

### Phase 2: Billing + Quality (Weeks 6-12)
- **AIClaim Integration** — 837 generation → scrub → submission
- **HEDIS/Stars Dashboard** — measure tracking, gap identification
- **MIPS Tracking** — category scores, measure performance
- **Care Gap Engine** — population-level gap lists
- **Outreach Campaigns** — gap-driven campaign creation, funnel tracking

### Phase 3: Financial Intelligence (Weeks 10-16)
- **Expenditure Analytics** — PMPM, category breakdowns, drill-downs
- **Facility/Provider/Rx Analysis** — per-entity cost analysis
- **AI Optimization Engine** — actionable recommendations per category
- **Financial Management** — capitation tracking, basic P&L
- **Transitions of Care** — ADT monitoring, discharge coordination

### Phase 4: Overlay + Advanced Operations (Weeks 14-20)
- **FHIR Overlay** — SMART-on-FHIR for Epic/Cerner
- **PCC Chrome Extension v2** — dashboard scraper, smart highlighter, LLM triage
- **Referral Management** — network directory, loop closure
- **UM/Auth Tracking** — authorization lifecycle management
- **Provider Performance** — individual dashboards, benchmarking

### Phase 5: Data Platform + Scale (Weeks 18-24)
- **Data Ingestion Portal** — universal format intake, AI mapping, feed scheduling
- **Multi-tenant MSO Architecture** — per-client data isolation, Kubernetes deployment
- **Reporting Engine** — health plan reports, regulatory submissions
- **SDoH Module** — screening, Z-codes, community resources
- **Part D / Adherence** — PDC tracking, pharmacist outreach workflows

### Phase 6: Polish + Launch (Weeks 22-28)
- Design system refinement (the premium, invisible-AI aesthetic)
- Onboarding flow for new MSO clients
- Documentation, training materials, in-app guidance
- Security audit (HIPAA, penetration testing, BAA templates)
- Pilot with own hospitalist group / SNF patients
- Pilot with first MSO client (Sunstate/FMG)

---

## Part 5: Design Direction

### Aesthetic
- **Palette:** Warm stone/sand neutrals (#fafaf9 bg, #ffffff surfaces). Not dark mode.
- **Accent:** Single green (#16a34a) for positive actions. Amber for warnings. Red for alerts only.
- **Typography:** Clean sans-serif (Inter or similar) for body. Monospace (Berkeley Mono) for numbers/codes only.
- **Layout:** Generous whitespace. Max content width ~1440px. Nothing edge-to-edge.
- **Components:** Rounded corners (10px), subtle borders, no heavy shadows. Cards are containers, not decoration.
- **Icons:** Minimal. Text labels over icons. When icons are needed, simple outlined style.

### What NOT to Do
- No "AI-POWERED" badges
- No purple glow effects
- No pulsing dots next to features
- No dark hacker-terminal aesthetic
- No rainbow of status colors
- No "powered by machine learning" anywhere in the UI
- No animations that don't serve a purpose
- No feature labels that reference the technology ("LLM Triage" → just "Smart Notes")

### Inspiration
- Linear (app.linear.app) — issue tracking with invisible AI
- Vercel dashboard — deployment complexity made calm
- Stripe dashboard — financial complexity made clear
- Mercury (mercury.com) — banking made beautiful
- Notion — information architecture done right

---

## Part 6: Revenue Model

### For MSO Clients
| Revenue Stream | Pricing | Annual Revenue per 5K-Life Client |
|---------------|---------|----------------------------------|
| Platform License | $2-4 PMPM | $120-240K |
| Per-HCC Capture Fee | $15-25 per new capture | $30-50K (est. 2,000/yr) |
| SNF Admit Processing | $50-75 per admission | $15-23K (est. 300/yr) |
| AIClaim Pass-Through | Markup on denial prevention | $12-24K |
| Revenue Share (optional) | 8-12% of documented RAF uplift | Variable, potentially $200K+ |

### For Provider Groups (Direct EMR)
| Revenue Stream | Pricing |
|---------------|---------|
| EMR Subscription | $199-399/provider/month |
| AutoCoder Add-On | $99/provider/month |
| Quality Module | $49/provider/month |
| AIClaim Billing | Per-claim fee |

### Revenue Projections
| Milestone | Timeline | ARR |
|-----------|----------|-----|
| Pilot (own group + 1 MSO client) | Months 1-6 | $50-100K |
| 3 MSO clients (avg 3K lives) | Months 6-12 | $300-500K |
| 8 MSO clients + 5 direct groups | Months 12-18 | $800K-1.2M |
| 15 MSO clients + 10 direct groups | Months 18-24 | $2-3M |

---

## Part 7: Competitive Landscape

| Competitor | Model | Our Advantage |
|-----------|-------|---------------|
| Vatica Health (3× Best in KLAS) | Embedded nurses + software | No headcount. Same outcomes, 10× lower cost structure. |
| Episource / Cotiviti | Retrospective chart review | Prospective at point of care. Catches HCCs before encounter closes. |
| RAAPID | AI retrospective + prospective | We cover SNF/post-acute. OCC parsing is unique. |
| Optum / Solventum (3M) | Enterprise tools | Open-source base. No vendor lock-in. No UHG conflicts. |
| Signify Health | In-home HRAs | Point-of-care with treating physician, not drive-by assessments. |
| GuidingCare / Medecision | Care management platforms | We integrate CM with the clinical workflow and HCC engine. Not separate. |
| QuickCap / MedVision | MSO admin platforms | We add clinical intelligence — not just admin/claims processing. |
| athenahealth | EHR + RCM | Purpose-built for managed care, not adapted from FFS. |

### Unique Combination
No competitor combines:
- Prospective AI HCC capture at point of care
- SNF/post-acute admission pipeline (SNF Admit Assist)
- Denial prevention (AIClaim integration)
- Quality/Stars/HEDIS tracking
- Expenditure drill-down analytics
- Care management operations
- EMR overlay (works with existing EHRs) AND standalone EHR option
- Open-source base with proprietary intelligence layer

---

## Part 8: Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenEMR fork maintenance burden | High | Keep fork minimal. Don't try to be a general EHR. Only use what's needed. |
| AIClaim dependency (external API) | Medium | Abstract behind interface. Could build internal claim scrub if needed. |
| RADV audit scrutiny on AI-captured HCCs | High | MEAT evidence trail baked into every capture. Physician review required. Never auto-submit without human confirmation. |
| Provider adoption resistance | Medium | Overlay mode = no workflow change. Start with documentation value (SNF Admit Assist), earn trust, then expand. |
| Data quality from MSO ingestion | High | AI column mapping + validation rules + human review for first import. Quality improves over time. |
| HIPAA/PHI security | Critical | ScrubGate pipeline. BAA with every client. Annual penetration testing. Audit logging from day 1. |
| CMS V28 model changes | Medium | Reference data is modular. RAF service already built for V28. Update data files when CMS publishes new coefficients. |
| Competition from well-funded incumbents | Medium | Speed + specialization. We serve managed care specifically, not the general EHR market. |

---

## Part 9: Immediate Next Steps

1. **Share this document + design prototype with AQSoft.AI partners** — get alignment on vision, scope, and resource commitment
2. **Deploy SNF Admit Assist as-is for own patient panel** — start generating value and clinical validation immediately
3. **PCC Chrome Extension v2** — add dashboard scraper and chart prep endpoint. Test on real PCC pages. Tune DOM selectors.
4. **OpenEMR fork setup** — clone 8.0, strip frontend, set up React SPA scaffold with auth
5. **Design system** — build the component library matching the design reset (warm, clean, no AI-slop)
6. **First MSO data ingestion** — get Sunstate/FMG roster + claims data into the platform. Prove the analytics work on real data.
7. **Define AQSoft.AI ↔ Platform API contract** — how does AutoCoder get called? What's the input/output schema? What's hosted where?
