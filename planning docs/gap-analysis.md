# Platform Gap Analysis — What We Haven't Built Yet

## What We've Covered (13 deliverables so far)
✅ Risk Adjustment (RAF/HCC capture, AutoCoder, suspect detection, near-misses, disease interactions)
✅ Clinical Documentation (SNF Admit Assist, AI note compilation, screening score extraction)
✅ Billing/RCM (AIClaim integration, denial prevention, claim scrubbing)
✅ Quality (Stars, HEDIS, MIPS, care gaps)
✅ Expenditure Analytics (deep drill-downs by category with AI optimization)
✅ Data Ingestion (universal format intake, AI column mapping)
✅ EMR Overlay (FHIR client, PCC Chrome extension, smart highlighter)
✅ MSO Multi-tenant Analytics (client dashboards, provider scorecards)
✅ OpenEMR Fork Scope (what to keep/gut/build)

## What's Missing — Organized by Who Needs It

---

## SECTION A: MSO Operations Gaps

### 1. Care Management / Case Management Module
**Why it matters:** This is the #1 operational function of every MSO. Managing high-risk members across the care continuum — transitional care, chronic disease management, complex case coordination. Without this, the platform is analytics-only, not operational.

**What's needed:**
- **Member risk stratification engine** — auto-tiers members into risk categories (rising risk, high risk, complex/catastrophic) based on claims, RAF, utilization patterns, SDoH data
- **Care plan builder** — templated care plans per condition/risk tier with goals, interventions, responsible parties, and timelines
- **Task management** — assign follow-up tasks to care managers, nurses, social workers with due dates and escalation rules
- **Outreach tracking** — log every member touchpoint (calls, letters, home visits, portal messages) with outcomes
- **Transitions of care** — track hospital admits, SNF stays, ED visits in near-real-time. Trigger care manager alerts on ADT events (this is where HL7 ADT feeds become critical)
- **Care manager workbench** — a dedicated view for care management staff showing their assigned members, open tasks, upcoming outreach, and risk scores
- **Program enrollment tracking** — which members are enrolled in which care management programs (CHF program, diabetes management, behavioral health, etc.)

**AI opportunity:** LLM summarizes a member's entire care history into a 2-paragraph brief when the care manager opens their record. Predictive model flags members likely to be hospitalized in the next 30 days based on claims patterns.

### 2. Utilization Management (UM) / Authorization Tracking
**Why it matters:** MSOs doing delegated UM need to track prior authorizations, concurrent reviews, and retrospective reviews. Even non-delegated MSOs need visibility into auth status for their members.

**What's needed:**
- **Authorization request tracking** — log all prior auth requests with status (pending, approved, denied, partial), requesting provider, service type, dates
- **Auth-to-claim matching** — reconcile authorizations against actual claims to find services rendered without auth (compliance risk) or auths that were never used (waste)
- **Turnaround time tracking** — CMS requires urgent auths in 24-72hrs, standard in 14 days. Track compliance with these timelines
- **Denial/appeal tracking** — when auths are denied, track the appeal process, peer-to-peer reviews, and outcomes
- **Referral management** — track specialist referrals from PCPs, completion rates, and outcomes. Flag "leakage" (members going out-of-network)

**AI opportunity:** Auto-classify auth requests by urgency. Predict which auths are likely to be denied based on historical patterns with that payer/service combo. Auto-draft appeal letters.

### 3. Credentialing & Provider Network Management
**Why it matters:** MSOs manage provider credentialing, contracting, and network adequacy. This is foundational infrastructure.

**What's needed:**
- **Provider directory** — NPI, specialty, TIN, practice locations, panel capacity, accepting new patients
- **Credentialing tracker** — application status, expiration dates, required documents, CAQH integration
- **Contract management** — fee schedules per payer, cap rates, value-based contract terms, performance guarantees
- **Network adequacy monitoring** — time/distance standards, specialty coverage, CMS network adequacy requirements
- **Provider communication portal** — secure messaging between MSO and provider practices for quality initiatives, alerts, education

**AI opportunity:** Auto-flag credentialing expirations 90 days out. Analyze provider performance data to identify under/over-performers for network optimization.

### 4. Member Engagement & Outreach
**Why it matters:** Closing care gaps and driving quality scores requires getting members into the office. This is the operational arm that turns analytics into action.

**What's needed:**
- **Outreach campaign manager** — create targeted campaigns (e.g., "all diabetics without eye exam in CY2026") with call lists, letter templates, and tracking
- **Multi-channel communication** — phone, SMS, email, portal messaging, postal mail. Track delivery and response rates
- **Appointment scheduling integration** — when outreach succeeds, book the appointment directly (integrate with calendar/scheduling)
- **Member portal** (basic) — secure login for members to view care gaps, upcoming appointments, care plan goals, and communicate with care team
- **SDoH screening** — social determinants of health assessment (food security, housing, transportation) with referral to community resources. This ties into the new EHO4all Star Ratings measure coming in 2027
- **Language/accessibility tracking** — member preferred language, communication preferences, accessibility needs

**AI opportunity:** Personalized outreach messaging generated per member. Predictive model identifies which outreach method (call vs text vs mail) works best for each member based on demographics and past response patterns.

### 5. Financial Management / Capitation Accounting
**Why it matters:** Risk-bearing MSOs receive capitated payments and need to track the flow of funds — what's coming in from plans, what's going out to providers, and what's left (surplus/deficit).

**What's needed:**
- **Capitation payment tracking** — record monthly cap payments by plan, reconcile against enrollment
- **Subcapitation management** — if the MSO subcaps to specialists or facilities, track those payments
- **IBNR estimation** — Incurred But Not Reported claims estimation (actuarial function). Critical for financial reporting
- **Surplus/deficit tracking** — per plan, per product line, per provider group. Is the MSO making or losing money?
- **Provider compensation modeling** — calculate provider payments under different arrangements (FFS, cap, shared savings, quality bonuses)
- **Financial dashboards** — P&L by plan, MLR tracking, per-member cost trending, budget vs actual
- **Risk pool accounting** — track withholds, incentive pools, and surplus distributions

**AI opportunity:** Anomaly detection on claims patterns that suggest emerging cost spikes. Predictive IBNR modeling. Automated financial reporting.

### 6. Compliance & Audit Readiness
**Why it matters:** Delegated MSOs are audited by health plans and CMS. RADV audits specifically target risk adjustment coding accuracy.

**What's needed:**
- **RADV audit preparation** — maintain audit-ready documentation for every HCC code captured. The MEAT evidence trail from AutoCoder is the foundation, but needs a dedicated audit module
- **Compliance calendar** — track filing deadlines, attestation requirements, regulatory submissions
- **Internal audit tools** — sample charts for pre-audit review, over/under-coding detection
- **FWA (Fraud, Waste, Abuse) monitoring** — flag suspicious patterns (e.g., same provider coding every patient with the same HCCs)
- **Delegation oversight tracking** — if MSO delegates functions to sub-entities, track compliance at each level
- **CMS regulatory change tracking** — monitor for V28 model changes, Star methodology updates, new HEDIS measures. AI could scan Federal Register updates

**AI opportunity:** Auto-generate audit response packages. LLM reviews coding patterns for compliance risk. Predictive model identifies which charts are most likely to be selected for RADV audit.

---

## SECTION B: Provider-Facing Gaps (for practices using the platform)

### 7. Referral Management with Network Intelligence
**Why it matters:** When a provider refers to a specialist, the MSO cares about cost, quality, and network status. The platform should guide referral decisions.

**What's needed:**
- **In-network directory** with quality/cost scoring per specialist
- **eConsult capability** — provider-to-provider async consult before sending a referral (reduces unnecessary specialist visits by 30-40%)
- **Referral loop closure** — track whether the specialist visit happened, get the consult note back, and close the loop
- **Steerage analytics** — which providers are referring in-network vs out-of-network, leakage rates by specialty

**AI opportunity:** Recommend the optimal specialist for each referral based on condition, cost, quality scores, wait times, and network status. Auto-draft eConsult questions from the clinical note.

### 8. Prior Authorization Automation
**Why it matters:** Prior auth is the #1 provider frustration. If the platform can reduce auth burden, adoption skyrockets.

**What's needed:**
- **Auto-determination** — for common services, check criteria automatically and issue instant approval (the platform has the clinical data to do this)
- **Auth requirement lookup** — by payer + service type, tell the provider before they order whether auth is needed
- **Electronic submission** — submit auth requests to payers electronically (many payers now accept via FHIR under CMS-0057-F)
- **Status tracking** — real-time auth status visible in the encounter workflow
- **Gold card / auto-approval** — providers with high approval rates get automatic approval for routine services (some payers support this)

**AI opportunity:** Auto-populate auth request forms from encounter documentation. Predict approval likelihood. Flag orders that will require auth before the provider places them.

### 9. Chronic Care Management (CCM) / Remote Patient Monitoring (RPM) Integration
**Why it matters:** CCM (CPT 99490/99491) and RPM (CPT 99453-99458) are billable services that also improve outcomes. MSOs and providers want to track time spent and bill appropriately.

**What's needed:**
- **CCM time tracking** — log care coordination time per patient per month (20 min threshold for 99490, 60 min for 99491)
- **RPM device integration** — blood pressure cuffs, glucose monitors, pulse oximeters. Receive readings, alert on abnormals
- **Auto-billing for CCM/RPM** — when time thresholds are met, auto-generate the billing codes
- **Patient consent tracking** — CCM requires documented verbal consent
- **Care plan integration** — CCM activities tie back to the care plan

**AI opportunity:** Auto-categorize logged activities as CCM-eligible time. Alert when a patient is close to the billing threshold ("5 more minutes of coordination this month = billable 99490").

### 10. Patient Attribution & Panel Management
**Why it matters:** Knowing which patients are attributed to which provider — and keeping that attribution — is foundational for everything else.

**What's needed:**
- **Attribution file ingestion** — from health plan 834s or roster files, map members to PCPs
- **Attribution change tracking** — alert when members move to a different PCP or dis-enroll
- **Panel size management** — optimal panel size per provider, capacity tracking
- **Empanelment outreach** — identify unattributed members who should be in your panel based on claims history
- **Attribution dispute resolution** — when the plan's attribution is wrong, track the dispute and resolution

**AI opportunity:** Predict which members are at risk of dis-enrolling (no recent visits, changed address, etc.). Identify "orphaned" members who haven't seen any provider in 12+ months.

### 11. Telehealth / Virtual Visit Integration
**Why it matters:** Post-COVID, telehealth is standard. The platform needs to support virtual visits natively, especially for follow-ups, CCM check-ins, and care gap closure.

**What's needed:**
- **Video visit capability** (or integration with Zoom/Doxy.me)
- **Telehealth-specific documentation templates**
- **Telehealth billing rules** — different POS codes, modifier requirements per payer
- **Virtual AWV support** — Annual Wellness Visits can be done virtually, important for RAF recapture
- **Async telehealth** — store-and-forward for dermatology, wound photos, etc.

### 12. Social Determinants of Health (SDoH) Module
**Why it matters:** CMS is adding SDoH measures to Star Ratings (EHO4all in 2027). Plans are investing heavily in SDoH data. This will differentiate forward-looking platforms.

**What's needed:**
- **SDoH screening tools** — PRAPARE, AHC-HRSN, or custom screening instruments
- **Z-code capture** — ICD-10 Z codes for SDoH (Z59 housing, Z63 family, Z55 education, etc.) — some of these map to HCCs or affect risk adjustment
- **Community resource directory** — findhelp.org / 211 integration for connecting members to resources
- **SDoH data in risk models** — food insecurity, transportation barriers, social isolation as risk factors
- **Closed-loop referral tracking** — did the member actually connect with the food bank / housing assistance?

### 13. Provider Performance Management & Education
**Why it matters:** Changing provider behavior is how MSOs improve quality and reduce cost. The platform needs to show providers how they compare to peers and educate them.

**What's needed:**
- **Individual provider dashboards** — your RAF capture rate vs peers, your HEDIS compliance rates, your referral patterns, your cost per member
- **Peer benchmarking** — anonymized comparisons across the network
- **Provider education content** — coding tips, quality measure updates, clinical pathways. Ideally in-app, not separate email blasts
- **Incentive/bonus tracking** — show providers how they're tracking toward quality bonuses or shared savings targets
- **CME integration** — risk adjustment and quality coding education as trackable CME

**AI opportunity:** Personalized coaching suggestions per provider ("Dr. Smith, your DM patients are coded at E11.9 72% of the time — peer average for complication-specific coding is 58%. Here are the top 3 complications to evaluate.").

### 14. Discharge Planning & Transitions of Care
**Why it matters:** The moment between hospital discharge and SNF admission (or home) is where HCCs get missed, meds get lost, and readmissions happen. Your SNF Admit Assist covers part of this, but the full transition workflow is broader.

**What's needed:**
- **ADT feed monitoring** — real-time alerts when attributed members are admitted to or discharged from hospitals
- **Discharge checklist automation** — medication reconciliation, follow-up appointment scheduled within 7 days, SNF placement (if needed), home health ordered
- **30-day post-discharge follow-up tracking** — HEDIS measure for follow-up after hospitalization for chronic conditions (FMC)
- **Readmission risk scoring** — at discharge, predict likelihood of readmission within 30 days
- **SNF placement optimization** — based on facility quality scores, cost, proximity, and clinical capability (ties into your SNF expenditure analytics)

**AI opportunity:** Auto-generate discharge summary → SNF admission note (this is literally your SNF Admit Assist). Predict optimal post-acute setting (home + HH vs SNF vs LTACH) based on clinical factors.

### 15. Prescription Drug Management (Part D Alignment)
**Why it matters:** Part D is half the Star Ratings formula. Medication adherence measures (D12-D14) are triple-weighted. The platform needs to track and improve adherence.

**What's needed:**
- **PDC (Proportion of Days Covered) tracking** — for the 3 Star measures: diabetes meds, RAS antagonists, statins
- **Adherence intervention tracking** — log pharmacist outreach, MTM sessions, 90-day supply conversions
- **Formulary awareness** — when prescribing, show whether the med is on the patient's plan formulary and suggest alternatives if not
- **Medication Therapy Management (MTM)** — track CMR (Comprehensive Medication Review) completion rates, which is a Star measure
- **Drug interaction checking** — integrated with the encounter workflow
- **Mail-order / 90-day supply prompts** — auto-suggest conversion from 30-day retail to 90-day mail order for chronic meds (improves PDC scores)

### 16. Reporting & Regulatory Submissions
**Why it matters:** MSOs have reporting obligations to health plans, CMS, and state regulators. The platform needs to generate these reports, not just internal dashboards.

**What's needed:**
- **Health plan report generation** — monthly/quarterly reports to contracted plans showing risk adjustment performance, quality metrics, utilization data
- **CMS regulatory reports** — RADV documentation packages, encounter data submissions (837 to CMS), quality data submissions
- **State reporting** — Florida-specific requirements for risk-bearing entities
- **Board/governance reports** — financial performance, quality metrics, membership trends for MSO board meetings
- **Ad-hoc report builder** — drag-and-drop report builder for custom analysis
- **Scheduled report delivery** — auto-generate and email reports on schedule

### 17. Contract Modeling & Scenario Analysis
**Why it matters:** Before an MSO signs a new health plan contract, they need to model whether they can be profitable at the proposed rates.

**What's needed:**
- **Contract terms input** — cap rates, risk corridors, quality bonuses, stop-loss thresholds
- **P&L projection** — given this member population and their risk profile, will we make or lose money at these rates?
- **What-if scenarios** — "if we improve recapture from 68% to 80%, how does that change the P&L?" or "if we reduce SNF admits by 20%, what's the savings?"
- **Rate adequacy analysis** — is the PMPM sufficient to cover expected medical costs for this population?

---

## SECTION C: Technical Infrastructure Gaps

### 18. Audit Trail / Compliance Logging
- Every data change, every code capture, every user action logged with timestamp and user ID
- Immutable audit log (append-only, cannot be deleted or modified)
- Required for HIPAA, RADV, and health plan delegation audits

### 19. Role-Based Access Control (Granular)
- Beyond basic RBAC: per-client data isolation in multi-tenant MSO mode
- PHI access logging per user per patient
- Provider-level vs staff-level vs MSO-admin-level permissions
- Time-limited access grants (e.g., auditor access for 30 days)

### 20. Notifications & Alerting Engine
- Configurable alerts: ADT events, care gap deadlines, credentialing expirations, financial anomalies, quality measure falling below threshold
- Multi-channel delivery: in-app, email, SMS, Slack/Teams webhook
- Escalation rules: if alert not acknowledged in X hours, escalate to supervisor

### 21. API for Third-Party Integration
- Public REST API so MSO clients can pull data into their own BI tools
- Webhook support for real-time event notifications
- API documentation and developer portal
- Rate limiting, API key management, usage analytics

---

## Priority Ranking for Build Sequence

| Priority | Module | Why First |
|----------|--------|-----------|
| P0 | Care Management / Case Mgmt | Core MSO operational requirement. Can't sell to MSOs without it. |
| P0 | Member Attribution & Panels | Foundation for everything else — who's in the panel? |
| P0 | Audit Trail / Compliance | Non-negotiable for healthcare. Build it into everything from day 1. |
| P1 | Outreach & Campaign Mgmt | Turns analytics into action. How gaps actually get closed. |
| P1 | Referral Management | Provider-facing sticky feature. Drives adoption. |
| P1 | Transitions of Care / ADT | Links to SNF Admit Assist. High clinical + financial value. |
| P1 | Financial Mgmt / Cap Accounting | MSOs need to know if they're making money. |
| P2 | UM / Auth Tracking | Important for delegated MSOs. Can start with basic tracking. |
| P2 | Provider Performance Dashboards | Drives behavior change. Big MSO selling point. |
| P2 | SDoH Module | Ahead of 2027 EHO4all. Differentiator. |
| P2 | Credentialing & Network Mgmt | Important but many MSOs already have separate tools. |
| P2 | Rx / Part D Adherence | Triple-weighted Star measures. High ROI. |
| P3 | CCM/RPM Billing | Revenue opportunity but complex to implement. |
| P3 | Telehealth | Many free standalone options exist. |
| P3 | Contract Modeling | High value but low frequency use. |
| P3 | Reporting / Reg Submissions | Can start with exports, build custom reports later. |
