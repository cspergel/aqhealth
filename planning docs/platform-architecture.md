# OpenEMR|HCC Platform Architecture
## AQSoft.AI + Spergel Health AI — Managed Care Risk Adjustment Platform

*Draft v0.1 — March 2026*

---

## Executive Summary

A managed care risk adjustment platform built on three layers: the **AutoCoder HCC Engine** (AQSoft.AI's core coding intelligence), a **clinical application layer** (SNF Admit Assistant, EMR overlay, MSO analytics), and an **optional full EHR chassis** (OpenEMR 8.0 fork). The platform serves provider groups taking risk across ambulatory, post-acute, and institutional settings — replacing the labor-intensive models used by competitors like Vatica Health with an AI-first approach requiring no embedded clinical staff.

---

## 1. What Already Exists (Inventory)

### 1.1 SNF Admit Assistant (github.com/cspergel/SNF_Admit_Assist)

**Status:** Production-ready, 66 commits, full test suite

**Architecture:**
- Backend: Python / FastAPI / Uvicorn
- Frontend: React 19 / Vite
- AI: Claude (Haiku for speed, Sonnet for detail) with OpenAI GPT fallback
- PDF: pdfplumber → PyMuPDF → Tesseract OCR (hierarchical fallback)
- Reference Data: CMS-HCC V28 2025 Midyear

**Pipeline (multi-pass):**
```
Upload PDFs → Auto-Classify by Doc Type → Pass 1: Per-Document Extraction
    → Pass 2: Synthesize HPI + A&P → ICD-10 Coding (LLM) → Code Optimizer 
    (deterministic, 2800+ lines) → RAF Calculation → HCC Summary + Near-Misses
```

**Key Components Already Built:**
- `code_optimizer.py` — 2,826-line deterministic post-processing engine: medication-to-diagnosis gap detection (100+ drug mappings), non-billable code fixes, specificity upgrades for HCC capture, MEAT evidence matching from source documents, lab/imaging finding correlation
- `raf_service.py` — Full CMS-HCC V28 hierarchy engine with 11 disease interaction bonus calculations and near-miss detection
- `coding_service.py` — ICD-10 validation against 25MB reference dataset + HCC enrichment
- `hpi_service.py` — Multi-pass extraction-synthesis pipeline (Pass 1 extracts per-document, Pass 2 synthesizes narrative + structured A&P)
- `pcc-helper-extension/` — Chrome extension that injects into PointClickCare's Document Manager for batch PDF download (THIS IS ALREADY AN OVERLAY)
- Batch processing queue for multi-patient workflows
- Clinical safety extraction (code status, allergies, emergency contact)
- Source document audit trail (diagnosis → source document + page number)
- PE template generator + ROS generator (on-demand from cached extractions)

**Phase 3 (in progress):** HCC Maximization & Audit Trail — dedicated HCC audit panel, enhanced evidence matching, specificity suggestions

### 1.2 AutoCoder HCC Engine (AQSoft.AI)

- Core coding intelligence (proprietary to AQSoft.AI partnership)
- ICD-10 to HCC mapping and RAF scoring
- Craig holds 20% ownership

### 1.3 ScrubGate

- PHI de-identification pipeline
- Required for any data flowing through analytics or overlay layers

---

## 2. Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT PRESENTATION LAYER                       │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│  │ EMR Overlay   │  │ SNF Admit    │  │ MSO Analytics │  │ Full   │ │
│  │ (FHIR/HL7    │  │ Assistant    │  │ Dashboard     │  │ EHR    │ │
│  │  Sidebar)     │  │ (Standalone) │  │ (Multi-tenant)│  │ (Fork) │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───┬────┘ │
│         │                  │                  │              │       │
│         └──────────────────┴──────────────────┴──────────────┘       │
│                                    │                                 │
├────────────────────────────────────┼─────────────────────────────────┤
│                     SHARED SERVICES LAYER                            │
│                                    │                                 │
│  ┌─────────────┐  ┌──────────────┐│┌──────────────┐  ┌───────────┐ │
│  │ AutoCoder    │  │ Code         │││ RAF          │  │ ScrubGate │ │
│  │ HCC Engine   │  │ Optimizer    │││ Calculator   │  │ PHI De-ID │ │
│  │ (AQSoft.AI)  │  │ (2826 lines) │││ (V28+Interact│  │ Pipeline  │ │
│  └──────────────┘  └──────────────┘│└──────────────┘  └───────────┘ │
│                                    │                                 │
│  ┌─────────────┐  ┌──────────────┐│┌──────────────┐                │
│  │ OCC/MDS     │  │ Document     │││ Audit Trail  │                │
│  │ Parser      │  │ Classifier   │││ Engine       │                │
│  │ (NEW)       │  │ (Exists)     │││ (Exists)     │                │
│  └─────────────┘  └──────────────┘│└──────────────┘                │
├────────────────────────────────────┼─────────────────────────────────┤
│                     DATA / INTEGRATION LAYER                         │
│                                    │                                 │
│  ┌─────────────┐  ┌──────────────┐│┌──────────────┐  ┌───────────┐ │
│  │ FHIR R4 API │  │ HL7v2 Bridge │││ PCC Extension│  │ Direct DB │ │
│  │ (Epic,Cerner │  │ (AllScripts, │││ (Chrome,     │  │ (OpenEMR  │ │
│  │  athena,eCW) │  │  legacy EMRs)│││  exists!)    │  │  fork)    │ │
│  └─────────────┘  └──────────────┘│└──────────────┘  └───────────┘ │
│                                    │                                 │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ CMS-HCC V28 Reference Data (ICD-10 25MB + HCC Mappings 2MB  │   │
│  │ + HCC Groups 20KB + Medication-Dx Map + Disease Interactions)│   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. SNF Admit Assistant → Platform Integration

The SNF Admit Assistant is the most mature piece and becomes the **post-acute module**. Here's what needs to change vs. what stays the same.

### 3.1 What Stays Exactly As-Is

- The entire FastAPI backend pipeline (upload → classify → extract → synthesize → code → optimize → RAF)
- The React frontend for standalone use
- The PCC Chrome extension
- The code_optimizer.py deterministic engine
- The raf_service.py with disease interactions
- The batch processing queue
- All CMS-HCC V28 reference data

### 3.2 What Gets Extracted Into Shared Services

These components currently live inside SNF Admit Assist but are **universally useful** across the platform:

| Component | Current Location | Shared Service Role |
|---|---|---|
| `code_optimizer.py` | `backend/app/services/` | Runs after ANY coding step (ambulatory, SNF, overlay) |
| `raf_service.py` | `backend/app/services/` | RAF calculation for any encounter type |
| `coding_service.py` | `backend/app/services/` | ICD-10 validation + HCC enrichment for any source |
| `MEDICATION_DIAGNOSIS_MAP` | `code_optimizer.py` lines 22-350+ | Med-to-dx gap detection for any medication list |
| `HCC_DISEASE_INTERACTIONS` | `raf_service.py` lines 37-104 | Disease interaction bonuses for any patient panel |
| Reference data (`data/`) | `backend/data/` | Single source of truth for all modules |

**Extraction approach:** Create a `shared/` package that both SNF Admit Assistant and the overlay import from. Don't break the existing standalone deploy — SNF Admit can still run solo by importing from shared.

### 3.3 New: OCC/MDS Parser Module

This is the **key new component** that doesn't exist yet. It transforms OCC (OASIS) assessment data from post-acute settings into structured clinical data that feeds the coding pipeline.

**What OCC/MDS contains:**
- Functional status scores (GG items: self-care, mobility)
- Cognitive status (BIMS, CAM, PHQ-9)
- Diagnoses from the transferring facility
- Skin integrity assessments (pressure ulcer staging)
- Medication reconciliation data
- Nutritional status
- Fall risk scores

**What the parser would do:**

```
Input Sources:
  ├── PCC Document Export (via Chrome extension — ALREADY EXISTS)
  ├── Hospital discharge summary PDFs (ALREADY HANDLED)
  ├── HL7 ADT messages (from hospital → SNF)
  └── Direct OCC/MDS data entry (new UI form)
        │
        ▼
OCC Parser Pipeline:
  1. Extract OCC item values (A0310F, B0100, C0100, D0300, GG items, etc.)
  2. Map OCC items → clinical significance:
     - B0100=1 (coma) → F03.90 (dementia) → HCC 52
     - GG0130a=01 (dependent self-care) → R26.89 (gait abnormality) → functional status
     - M0300B=2 (Stage 2 pressure ulcer) → L89.xxx → HCC 381/382
     - D0300≥10 (PHQ-9 moderate+) → F33.1 (MDD recurrent) → HCC 59
  3. Cross-reference with hospital discharge diagnoses (already extracted by Pass 1)
  4. Identify:
     - Confirmed HCCs (documented in both hospital + OCC)
     - Suspect HCCs (clinical evidence in OCC but not yet coded)
     - Near-misses (one component away from disease interaction bonus)
     - Specificity upgrades (unspecified codes that OCC data can specify)
  5. Feed enriched diagnosis list → existing code_optimizer → raf_service
        │
        ▼
Output:
  - Pre-populated SNF admission note (HPI + A&P) — ALREADY WORKS
  - HCC-enriched problem list with evidence chains
  - RAF projection with interaction bonuses
  - Care gap alerts (missing screenings, overdue labs)
  - Copy-to-PCC formatted output — ALREADY WORKS
```

**Implementation priority:** This is the highest-value new development. The SNF Admit Assistant already handles hospital discharge documents. Adding OCC parsing means the tool captures HCCs from BOTH the hospital stay AND the post-acute assessment — something no competitor does.

---

## 4. EMR Overlay Architecture

### 4.1 Integration Modes (by EMR)

| EMR | Integration Method | Data Available | Overlay Delivery |
|---|---|---|---|
| Epic | FHIR R4 + SMART-on-FHIR | Full: demographics, encounters, problems, meds, labs, vitals | Embedded iframe within Epic (SMART launch) |
| Cerner/Oracle | FHIR R4 | Full: same as Epic | SMART-on-FHIR embedded app |
| athenahealth | REST API + Marketplace | Demographics, encounters, problems, meds | Marketplace embedded widget |
| eClinicalWorks | API + FHIR (partial) | Demographics, encounters, problems | Sidebar widget |
| PointClickCare | Chrome Extension (EXISTS) + FHIR (limited) | Document download, demographics | Chrome extension overlay + standalone |
| OpenEMR | Direct DB + FHIR R4 | Full native access | Native module |
| Legacy / Other | HL7v2 ADT/ORU feeds | Admit/discharge events, lab results | Standalone web app with patient context |

### 4.2 Overlay Data Flow

```
EMR Patient Chart Opened
        │
        ▼
FHIR Query (or PCC Extension scrape):
  GET /Patient/{id}
  GET /Condition?patient={id}         → Active problem list
  GET /MedicationRequest?patient={id} → Active medications  
  GET /Observation?patient={id}       → Recent labs/vitals
  GET /Encounter?patient={id}         → Recent encounters
        │
        ▼
ScrubGate (if data leaves provider network)
        │
        ▼
AutoCoder HCC Engine:
  - Map current problems → ICD-10 → HCC
  - Identify UNDOCUMENTED suspects from:
    · Medication-diagnosis gaps (code_optimizer MEDICATION_DIAGNOSIS_MAP)
    · Lab abnormalities suggesting undiagnosed conditions
    · Historical claims data (if available from health plan)
  - Calculate current RAF + projected RAF with suspects
  - Find disease interaction near-misses
        │
        ▼
Overlay UI renders in sidebar:
  ┌─────────────────────────────────┐
  │  Margaret Chen, 72F             │
  │  RAF: 1.847 → 2.312 (+0.465)   │
  │                                 │
  │  ⚠ SUSPECT HCCs                │
  │  ┌─────────────────────────────┐│
  │  │ HCC 108 Vascular Disease    ││
  │  │ E: PVD in vascular consult  ││
  │  │ Confidence: 92%  [Capture]  ││
  │  └─────────────────────────────┘│
  │  ┌─────────────────────────────┐│
  │  │ HCC 22 Morbid Obesity      ││
  │  │ E: BMI 41.2 in vitals      ││
  │  │ Confidence: 88%  [Capture]  ││
  │  └─────────────────────────────┘│
  │                                 │
  │  ✓ CONFIRMED HCCs (3)          │
  │  ⊘ CARE GAPS (2)               │
  │  ↗ NEAR-MISS INTERACTIONS (1)  │
  └─────────────────────────────────┘
```

### 4.3 "Capture" Action

When the provider clicks [Capture] on a suspect HCC:

**In overlay mode (Epic/Cerner/athena):**
1. Writes the ICD-10 code back to the EMR's problem list via FHIR `POST /Condition`
2. Generates a MEAT-compliant addendum snippet for the encounter note
3. Logs the capture event for audit trail

**In standalone/PCC mode:**
1. Adds to the copy-to-PCC output (already works in SNF Admit Assistant)
2. Generates the documentation snippet
3. Logs the capture event

**In OpenEMR fork mode:**
1. Writes directly to `lists` table (problem list)
2. Creates a billing entry in the encounter
3. Updates the RAF dashboard in real-time

---

## 5. MSO Client Architecture (Multi-Tenant)

### 5.1 Data Model

```
MSO_Client (Sunstate, Gulf Coast, etc.)
  ├── attributed_members[]
  │     ├── demographics (from health plan 834/eligibility feed)
  │     ├── historical_claims[] (from health plan — prior year HCCs)
  │     ├── current_encounters[] (from EMR via FHIR or overlay captures)
  │     ├── current_hccs[] (confirmed this payment year)
  │     ├── suspect_hccs[] (identified by AutoCoder, awaiting capture)
  │     └── care_gaps[] (screenings, recapture needs)
  ├── providers[]
  │     ├── panel_assignment
  │     ├── capture_rate
  │     └── RAF_performance
  └── financials
        ├── projected_revenue (total RAF × PMPM benchmark)
        ├── captured_uplift (new HCCs this year × $ value)
        └── recapture_rate (% of prior-year HCCs recaptured)
```

### 5.2 Revenue Model Options

| Model | Pricing | Best For |
|---|---|---|
| Platform License | $2-4 PMPM | Large groups wanting predictable costs |
| Per-Capture Fee | $15-25 per new HCC captured | Groups wanting pay-for-performance |
| SNF Admit Processing | $50-75 per admission | Post-acute focused groups |
| Revenue Share | 8-12% of documented RAF uplift | Aligned incentive for large panels |
| Hybrid | Base PMPM + per-capture bonus | Most common expected structure |

---

## 6. Competitive Positioning

| Competitor | Their Model | Our Advantage |
|---|---|---|
| Vatica Health (3x Best in KLAS) | Embedded licensed nurses + software at point of care | No headcount needed — AI-first. Same prospective, point-of-care approach but at 10x the scale per dollar |
| Episource / Cotiviti | Retrospective chart review | Prospective capture at point of care. Catches HCCs before the encounter closes, not months later |
| RAAPID | AI-driven retrospective + prospective | We cover SNF/post-acute — they don't. OCC parsing is unique |
| Optum | Enterprise AI + UHG data | Open-source base, no vendor lock-in, no UHG conflicts of interest |
| Solventum (3M) | Enterprise coding tools | Purpose-built for risk adjustment, not adapted from inpatient coding |
| Signify Health | In-home HRAs | Point-of-care with the treating physician, not drive-by assessments |

**Unique moat:** No competitor combines prospective AI-driven HCC capture + post-acute/SNF pipeline + EMR overlay + open-source EHR option in a single platform.

---

## 7. Build Sequence

### Phase 1: Foundation (Weeks 1-4)
- Extract shared services from SNF Admit Assist into `shared/` package
- Ensure SNF Admit Assist still runs standalone
- Deploy shared `code_optimizer`, `raf_service`, `coding_service` as importable modules
- Set up multi-tenant data model (even if just 1 tenant initially)

### Phase 2: OCC Parser (Weeks 3-6)
- Build OCC item → clinical significance mapping
- Map OCC functional scores → ICD-10 codes → HCCs
- Integrate with existing Pass 1 extraction pipeline
- Cross-reference OCC data with hospital discharge diagnoses
- Add OCC-derived suspects to HCC summary panel

### Phase 3: Overlay MVP (Weeks 5-10)
- FHIR R4 client for Epic/Cerner (read patient data)
- SMART-on-FHIR launch configuration
- Overlay React sidebar consuming shared services
- Write-back: FHIR POST for captured conditions
- PCC overlay enhanced (extend existing Chrome extension)

### Phase 4: MSO Dashboard (Weeks 8-12)
- Multi-tenant client management
- Aggregate RAF analytics across panels
- Provider scorecards (capture rate, RAF performance)
- Revenue projection and uplift tracking
- Client onboarding flow

### Phase 5: OpenEMR Fork (Weeks 10-14, parallel)
- Minimal fork: encounters, problem lists, meds, billing, scheduling
- Native HCC module (direct DB integration, not overlay)
- SNF-specific workflow screens
- Deploy as Docker container for demo + small group use

---

## 8. Technical Decisions

**Backend:** Python/FastAPI (already proven in SNF Admit Assist). Shared services remain Python. No rewrite.

**Frontend:** React 19 (already proven). Overlay sidebar is a lightweight React app. MSO dashboard is a separate React app. Both consume the same API.

**Database:** PostgreSQL for platform data (tenants, members, captures, analytics). CMS reference data stays as JSON files (fast, no ORM overhead, already working).

**Auth:** OAuth2/OIDC for multi-tenant. SMART-on-FHIR for EMR overlay authentication.

**Deployment:** Docker Compose for dev. Kubernetes for production multi-tenant. Vercel for frontend (already configured in SNF Admit Assist).

**PHI Handling:** ScrubGate pipeline for any data leaving provider network. All analytics on de-identified data. Overlay mode keeps PHI within provider's EMR environment.
