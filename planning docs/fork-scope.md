# AQSoft.AI Health Platform — OpenEMR Fork Scope

## The Thesis

Fork OpenEMR 8.0 as the open-source chassis. Gut the PHP frontend entirely. Keep the data model, FHIR APIs, and billing infrastructure. Rebuild the UI as a modern React SPA with AI embedded at every step of the clinical workflow. Integrate AutoCoder (HCC engine), SNF Admit Assist (note compilation), AIClaim (denial prevention), and ScrubGate (PHI de-ID) as service modules. Ship it as both a standalone EMR for small groups/SNFs and an overlay platform for existing EHRs.

---

## 1. What to KEEP from OpenEMR 8.0

These are battle-tested, boring-in-a-good-way components with 15+ years of production use. Don't rewrite them.

### 1.1 Database Schema (MySQL/MariaDB)
- `patient_data` — demographics, insurance, contacts
- `lists` — problem list (diagnoses, medications, allergies, surgeries)
- `form_encounter` — encounter records linking patient + provider + date + facility
- `billing` — CPT/ICD-10 line items per encounter
- `prescriptions` — medication management
- `immunizations` — vaccine records
- `procedure_order` / `procedure_result` — lab orders and results
- `pnotes` — patient notes
- `documents` — uploaded files (PDFs, images)
- `users` — providers, staff, admin with role-based access
- `facility` — multi-site support
- `insurance_companies` + `insurance_data` — payer configuration
- `openemr_postcalendar_events` — scheduling

**Action:** Keep the schema as-is. Add new tables for platform-specific features (HCC tracking, RAF history, MSO analytics, AIClaim integration). Never modify core OpenEMR tables — extend only.

### 1.2 FHIR R4 API Layer
OpenEMR 8.0 has a certified FHIR R4 API with OAuth2/OIDC:
- Patient, Condition, MedicationRequest, Observation, Encounter, AllergyIntolerance
- SMART-on-FHIR launch support
- Swagger documentation
- US Core alignment

**Action:** Keep the entire API layer. This is how the overlay mode connects to other EMRs AND how the platform exposes data. Add custom endpoints for HCC/RAF data.

### 1.3 Billing Infrastructure
- X12 837P claim generation (professional claims)
- ERA/835 remittance parsing
- Claim status tracking
- Insurance eligibility verification hooks
- Fee schedules

**Action:** Keep and enhance. AIClaim sits between the claim generator and the clearinghouse as a scrub layer. The 837P output feeds directly into AIClaim's API for pre-submission analysis.

### 1.4 ACL / RBAC System
- Role-based access control (phpGACL-based, modernized)
- Provider, admin, billing, clinical staff roles
- Per-facility permissions
- Audit logging

**Action:** Keep. Extend with MSO-specific roles (MSO admin, client viewer, population health analyst).

### 1.5 HL7v2 Interface
- ADT (admit/discharge/transfer) message handling
- ORU (lab results) inbound
- Middleware compatibility (Mirth Connect)

**Action:** Keep for legacy integrations. New integrations use FHIR.

### 1.6 Document Management
- PDF upload/storage
- Document categorization
- Patient-linked file storage

**Action:** Keep. SNF Admit Assist ingests documents from this store.

---

## 2. What to GUT

These components are replaced entirely by modern equivalents.

### 2.1 The Entire PHP Frontend (ALL of it)
OpenEMR's UI is PHP-rendered HTML with jQuery, Bootstrap 4, and a mix of legacy JavaScript. It looks like 2012. Every page is a server-rendered PHP template.

**Replace with:** React 19 SPA (Vite build). The prototype UI I built shows the target. The PHP backend becomes a pure API server — it still handles routing, auth, and database queries, but returns JSON instead of HTML.

**Technical approach:**
- Keep all existing PHP API endpoints (`/apis/` directory)
- Add a catch-all route that serves the React SPA for non-API paths
- React app calls PHP API endpoints for data
- Gradually migrate PHP API logic to FastAPI/Python for AI-heavy routes

### 2.2 Legacy Calendar / Scheduling
OpenEMR uses PostCalendar (a PHP calendar component from the early 2000s).

**Replace with:** AI-prioritized worklist (as shown in the prototype). The scheduling system becomes an intelligent queue that sorts patients by RAF uplift potential, care gaps, and clinical urgency — not just appointment times.

### 2.3 Clinical Decision Support
OpenEMR has minimal CDS. What exists is rule-based alerts from the early 2010s.

**Replace with:** AutoCoder HCC Engine + SNF Admit Assist. Every encounter gets real-time HCC suspect detection, MEAT evidence validation, disease interaction analysis, and care gap identification. This isn't CDS bolted on — it IS the encounter workflow.

### 2.4 Reporting Module
OpenEMR has basic PHP-rendered reports.

**Replace with:** MSO Analytics dashboard (React + charting library). Population-level RAF tracking, recapture rates, provider scorecards, revenue projections, gap analysis across the entire attributed panel.

### 2.5 Patient Portal
OpenEMR has a basic patient portal.

**Decision:** Deprioritize. This platform is provider/MSO-facing. Patient portal is a future phase if needed.

---

## 3. What to BUILD NEW

### 3.1 AI Workflow Engine (the core differentiator)

The six-step workflow shown in the prototype, each with AI embedded:

#### Step 1: Schedule → AI Worklist
- Pull today's patients from the calendar/census
- For each patient, calculate: current RAF, suspect HCCs (from AutoCoder analysis of existing data), open care gaps, days since last recapture visit
- Sort by composite priority score (RAF uplift × urgency × gap count)
- Display with clear visual hierarchy and the "WHY" chip explaining prioritization
- **AI component:** Priority scoring algorithm that weights financial impact against clinical need

#### Step 2: Chart Prep → AI Pre-Population
- When provider selects a patient, automatically trigger data ingestion from all available sources:
  - OpenEMR database (existing problems, meds, labs, prior notes)
  - PCC scraper (if SNF patient — meds, vitals, diagnoses, screening scores)
  - Hospital discharge PDFs (SNF Admit Assist extraction pipeline)
  - Prior year claims data (from health plan 837/834 feeds)
  - Lab interfaces (HL7 ORU messages)
- SNF Admit Assist runs its multi-pass extraction → synthesis pipeline
- AutoCoder runs against the synthesized data to identify HCCs and suspects
- Output: pre-built note sections (HPI, A&P, PE template, med reconciliation) with confidence scores
- **AI component:** The entire SNF Admit Assist pipeline + AutoCoder + med-dx gap detection

#### Step 3: Encounter → AI-Assisted Documentation
- Provider reviews pre-built note in an editor
- Real-time coding sidebar shows:
  - Confirmed HCCs from the note content
  - Suspect HCCs with evidence and confidence
  - Disease interaction bonuses being triggered
  - Care gaps that can be addressed during this visit
  - Near-miss interactions (one dx away from a bonus)
- As the provider edits, coding updates in real-time
- "Capture" button on each suspect adds the dx to the problem list + note
- Screening score extraction from note text (BIMS, PHQ-9, etc.) feeds suspect detection
- **AI component:** AutoCoder real-time coding, LLM-assisted documentation, screening score parsing

#### Step 4: Coding → AutoCoder Validation
- After note is signed, AutoCoder runs final validation pass:
  - All ICD-10 codes validated against CMS reference data
  - Non-billable codes auto-fixed (the code_optimizer 2800-line engine)
  - Specificity upgrades suggested (E11.9 → E11.65 when evidence supports)
  - MEAT evidence linked to each HCC code (audit trail)
  - Hierarchy applied (CMS-HCC V28 trumping rules)
  - Disease interactions calculated
  - RAF summary with before/after comparison
- Coding review screen shows the full picture with status badges
- **AI component:** AutoCoder HCC Engine (full pipeline)

#### Step 5: Billing → AIClaim Denial Prevention
- Claim generated from encounter data (X12 837P from OpenEMR's billing engine)
- Before submission, 837 passes through AIClaim API for pre-submission scrub:
  - CPT/ICD-10 pairing validation
  - Medical necessity checks (LCD/NCD)
  - Payer-specific edit rules
  - Credential/NPI validation
  - Duplicate detection
  - Timely filing verification
  - Modifier appropriateness
- Denial probability score + expected payment timeline
- If issues found: flagged for human review with specific fix recommendations
- If clean: auto-submit to clearinghouse
- Post-submission: AIClaim monitors for denials, auto-generates appeal recommendations
- **AI component:** AIClaim engine (white-labeled via API integration)

#### Step 6: Analytics → MSO Population Dashboard
- Multi-tenant dashboard for MSO operators
- Per-client views: attributed lives, avg RAF, recapture rate, suspect HCC inventory, projected revenue uplift
- Provider scorecards: capture rate, visits completed vs target, RAF performance vs peers
- Gap analysis: top suspect HCC categories across the population, estimated $ value, prioritized chase lists
- Trending: month-over-month RAF movement, recapture curves, denial rates
- Exportable reports for health plan partners
- **AI component:** Predictive RAF modeling, population stratification, automated gap prioritization

### 3.2 New Database Tables

```sql
-- HCC tracking per patient per payment year
CREATE TABLE hcc_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT, payment_year YEAR,
  hcc_code INT, icd10_code VARCHAR(10),
  raf_value DECIMAL(6,3),
  status ENUM('confirmed','suspect','dismissed','expired'),
  capture_date DATE, capture_encounter_id INT,
  evidence_text TEXT, evidence_source VARCHAR(100),
  meat_status ENUM('complete','partial','insufficient'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAF history for trending
CREATE TABLE raf_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT, calculation_date DATE,
  total_raf DECIMAL(6,3), base_raf DECIMAL(6,3),
  interaction_raf DECIMAL(6,3),
  hcc_count INT, payment_year YEAR
);

-- MSO client management
CREATE TABLE mso_clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200), contact_info JSON,
  contract_type ENUM('pmpm','per_capture','revenue_share','hybrid'),
  rate_config JSON, status ENUM('active','onboarding','pipeline'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MSO member attribution
CREATE TABLE mso_attributed_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mso_client_id INT, patient_id INT,
  health_plan VARCHAR(200), member_id VARCHAR(50),
  attribution_start DATE, attribution_end DATE,
  pcp_provider_id INT
);

-- AIClaim integration log
CREATE TABLE claim_scrub_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  encounter_id INT, claim_id VARCHAR(50),
  scrub_timestamp TIMESTAMP, pass_rate DECIMAL(5,2),
  denial_probability DECIMAL(5,2),
  issues_found JSON, status ENUM('clean','warning','reject'),
  submitted_at TIMESTAMP NULL, paid_at TIMESTAMP NULL,
  paid_amount DECIMAL(10,2) NULL, denial_codes JSON NULL
);

-- Screening score tracking
CREATE TABLE screening_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  patient_id INT, encounter_id INT,
  score_type ENUM('bims','phq9','phq2','cam','braden','fall_risk','pain','mmse','moca'),
  score_value DECIMAL(5,1), score_date DATE,
  source VARCHAR(100), extracted_by VARCHAR(50)
);
```

### 3.3 Integration Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    REACT 19 SPA (Vite)                   │
│   Schedule → Chart Prep → Encounter → Coding → Billing  │
│              → Analytics (MSO Dashboard)                 │
└────────────────────────┬────────────────────────────────┘
                         │ REST API calls
         ┌───────────────┼───────────────┐
         │               │               │
┌────────┴────────┐ ┌────┴─────┐ ┌───────┴───────┐
│  OpenEMR PHP    │ │ FastAPI  │ │  AIClaim API  │
│  API Layer      │ │ (Python) │ │  (External)   │
│                 │ │          │ │               │
│ • Auth/RBAC     │ │ • SNF    │ │ • 837 scrub   │
│ • FHIR R4       │ │   Assist │ │ • Denial pred │
│ • Scheduling    │ │ • Auto   │ │ • Appeal mgmt │
│ • Demographics  │ │   Coder  │ │ • Payer rules │
│ • Encounters    │ │ • OCC    │ └───────────────┘
│ • Billing/837   │ │   Parser │
│ • Documents     │ │ • LLM    │
│ • Labs/Orders   │ │   Triage │
│                 │ │ • RAF    │
│                 │ │   Calc   │
│                 │ │ • Scrub  │
│                 │ │   Gate   │
└────────┬────────┘ └────┬─────┘
         │               │
         └───────┬───────┘
                 │
         ┌───────┴───────┐
         │  MySQL/MariaDB │
         │  (OpenEMR +    │
         │   new tables)  │
         └───────────────┘
```

**Key architectural decisions:**
1. OpenEMR PHP handles auth, FHIR, billing, scheduling, core CRUD — proven, stable, keep it
2. FastAPI (Python) handles all AI workloads — SNF Admit Assist, AutoCoder, OCC parser, LLM calls, RAF calculation. This is where the intelligence lives. It shares the same MySQL database.
3. AIClaim is an external API called during the billing step. White-labeled, no code in our repo.
4. React SPA is the single frontend. It doesn't care whether data comes from PHP or Python endpoints.

### 3.4 Deployment

**Docker Compose (development + small deployments):**
```yaml
services:
  openemr-php:    # Apache + PHP 8.x + OpenEMR backend
  fastapi:        # Python AI services
  mysql:          # Shared database
  redis:          # Session cache + job queue
  react-app:      # Nginx serving built React SPA
```

**Kubernetes (production + multi-tenant MSO):**
- Separate namespaces per MSO client
- Shared AutoCoder/RAF services (stateless, horizontally scalable)
- Per-tenant database instances for PHI isolation
- AIClaim API calls go through egress gateway with rate limiting

---

## 4. Build Phases

### Phase 1: Foundation (Weeks 1-4)
- Fork OpenEMR 8.0, strip PHP frontend templates
- Set up React SPA with Vite, routing, auth integration
- Build shared API client that talks to both PHP and FastAPI backends
- Port SNF Admit Assist services into the FastAPI container
- Implement the Schedule (worklist) and Chart Prep views
- Basic patient CRUD through the React UI

### Phase 2: Encounter + Coding (Weeks 3-8)
- Build the encounter documentation editor (rich text with real-time coding sidebar)
- Integrate AutoCoder for live HCC detection during documentation
- Wire up screening score extraction from note content
- Implement the Coding Review view with MEAT evidence display
- Connect to OpenEMR's problem list and billing tables for write-back

### Phase 3: Billing + AIClaim (Weeks 6-10)
- Build AIClaim API integration (837 submission → scrub → results)
- Pre-submission check display with pass/fail per rule
- Denial probability scoring
- Claim submission workflow (scrub → approve → submit → track)
- Post-submission denial monitoring webhook

### Phase 4: Analytics + MSO (Weeks 8-12)
- Multi-tenant data model for MSO clients
- Population RAF dashboard with client-level views
- Provider scorecards
- Gap analysis engine (prioritized suspect chase lists)
- Exportable reports (PDF/CSV)

### Phase 5: Overlay Mode (Weeks 10-14)
- SMART-on-FHIR app registration for Epic/Cerner
- Overlay sidebar React component (embeddable)
- FHIR data pull → AutoCoder pipeline → overlay result
- Write-back (FHIR POST Condition) for captured HCCs
- PCC Chrome extension (already built) enhanced with platform connection

### Phase 6: Polish + Launch (Weeks 12-16)
- Design system refinement (the "looks NICE" requirement)
- Onboarding flows for new MSO clients
- Documentation and training materials
- Security audit (HIPAA, penetration testing)
- Pilot with own hospitalist group / SNF patients

---

## 5. What Makes This Different

| Traditional EMR | This Platform |
|---|---|
| Scheduling by time slot | AI-prioritized by RAF impact |
| Blank note, start typing | 85% pre-built from ingested sources |
| Code after the visit | Code during the visit, real-time |
| Manual claim scrub | AIClaim auto-scrub with denial prediction |
| Retrospective chart review for HCCs | Prospective capture at point of care |
| Per-practice analytics | Population-level MSO dashboard |
| Embedded clinical staff (Vatica model) | Fully autonomous AI (no headcount) |
| $200K+ enterprise EMR | Open-source base, SaaS pricing |

The platform doesn't compete with Epic on general EHR features. It competes with Vatica on risk adjustment outcomes — but at a fraction of the cost because AI replaces embedded nurses. And it competes with AthenaHealth on workflow — but purpose-built for managed care instead of adapted from fee-for-service.

---

## 6. Revenue Opportunity

For a 5,000-life MSO client at $3 PMPM:
- Platform license: $180K/year
- Per-capture fees (est. 2,000 new HCCs/year × $20): $40K/year
- SNF admit processing (est. 300 admits × $60): $18K/year
- AIClaim pass-through (markup on denial prevention): $24K/year
- **Total per client: ~$262K/year**

At 5 MSO clients with avg 3,000 lives: **~$790K ARR**
At 15 clients: **~$2.4M ARR**

This doesn't include revenue share models on RAF uplift, which for larger groups could be significantly higher.
