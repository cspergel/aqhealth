# MSO Readiness Audit — Risk Practice Completeness Check

## What a Risk-Bearing MSO Does Daily (and What We Have)

### 1. CONTRACTING & NETWORK
| Function | Status | Notes |
|----------|--------|-------|
| Track health plan contracts (rates, terms, corridors) | Partial | Risk accounting has cap payments but no contract terms management |
| Rate adequacy modeling ("is this contract profitable?") | Built | Scenario modeling covers this |
| Provider credentialing & expiration tracking | NOT BUILT | Critical for delegated MSOs |
| Network adequacy reporting (time/distance, specialty coverage) | NOT BUILT | CMS requirement |
| Provider recruitment & onboarding | NOT BUILT | Nice-to-have |

### 2. ENROLLMENT & ATTRIBUTION
| Function | Status | Notes |
|----------|--------|-------|
| Member attribution tracking | Built | Attribution page with churn risk |
| Retroactive enrollment changes | NOT BUILT | Plans send retro adds/terms that affect everything |
| Enrollment reconciliation with plans | NOT BUILT | Monthly reconciliation of who's attributed |
| Member eligibility verification | NOT BUILT | Real-time eligibility check |

### 3. RISK ADJUSTMENT (HCC/RAF)
| Function | Status | Notes |
|----------|--------|-------|
| Prospective HCC suspect detection | Built | HCC engine with real V28 data |
| Med-Dx gap detection | Built | 33+ medication mappings |
| Specificity upgrades | Built | Detects unspecified → specific |
| Recapture gap tracking | Built | Prior-year HCCs not yet coded |
| Near-miss interaction detection | Built | Disease interaction bonuses |
| RAF calculation (full demographic + disease) | Built | Real CMS V28 coefficients |
| Chase list generation & export | Built | Filterable, sortable, exportable |
| Capture workflow (at point of care) | Built | Clinical view with capture buttons |
| RADV audit readiness | Built | MEAT scoring per HCC |

### 4. QUALITY & STARS
| Function | Status | Notes |
|----------|--------|-------|
| HEDIS measure tracking | Built | 39 measures with cutpoints |
| Stars rating tracking & simulation | Built | Interactive intervention builder |
| Care gap identification & closure | Built | Population + member level |
| Medication adherence (PDC) | Built | In care gap engine |
| AWV tracking & scheduling | Built | Completion rates, revenue opportunity |
| Stars quality bonus projection | Built | In Stars simulator |
| Triple-weighted measure prioritization | Built | Highlighted throughout |

### 5. CARE MANAGEMENT
| Function | Status | Notes |
|----------|--------|-------|
| Risk stratification (tiers) | Built | Low/rising/high/complex |
| Member risk scoring | Built | Hospitalization prediction |
| Care alerts from ADT events | Built | Real-time admit/discharge/ER alerts |
| TCM tracking (post-discharge) | Built | Phone contact + visit deadlines |
| Care plan builder (goals, interventions, timelines) | NOT BUILT | Care managers need this daily |
| Case assignment & caseload management | NOT BUILT | Who manages which members |
| Disease management program enrollment | NOT BUILT | CHF program, diabetes program, etc. |
| SDoH screening (PRAPARE, AHC-HRSN) | NOT BUILT | Increasingly required for Stars |
| Member outreach tracking | Partial | Annotations exist but no campaign tool |

### 6. UTILIZATION MANAGEMENT
| Function | Status | Notes |
|----------|--------|-------|
| Prior authorization tracking | NOT BUILT | Delegated MSOs MUST have this |
| Auth status lifecycle (pending/approved/denied/appealed) | NOT BUILT | |
| Turnaround time compliance (urgent 24-72hr, standard 14 days) | NOT BUILT | CMS requirement |
| Concurrent review | NOT BUILT | |
| Denial/appeal management | NOT BUILT | |
| Auth-to-claim reconciliation | NOT BUILT | |

### 7. COST MANAGEMENT
| Function | Status | Notes |
|----------|--------|-------|
| Medical expenditure analysis (all categories) | Built | Deep drill-downs |
| Facility benchmarking | Built | Cross-facility comparison |
| Pharmacy optimization | Built | Brand→generic, adherence |
| Stop-loss monitoring | Built | High-cost member tracking |
| IBNR estimation | Built | With confidence levels |
| Practice operational costs | Built | Staff, supplies, efficiency |
| Risk corridor tracking | Built | Position visualization |

### 8. FINANCIAL
| Function | Status | Notes |
|----------|--------|-------|
| Capitation payment tracking | Built | By plan/month |
| Subcapitation to providers | Built | By group/specialty |
| Risk pool accounting | Built | Withholds, bonuses, settlements |
| P&L by plan and by group | Built | Confirmed vs projected |
| Revenue forecasting | Built | 12-month projection |
| Reconciliation (signal vs record) | Built | Dual data tiers |
| ROI tracking per intervention | Built | BOI analytics |

### 9. REPORTING & COMPLIANCE
| Function | Status | Notes |
|----------|--------|-------|
| Auto-generated reports | Built | AI narratives, 4 templates |
| RADV audit packages | Built | Evidence packaging |
| Clinical data exchange | Built | Auto-respond to payer requests |
| Regulatory calendar (deadlines, attestations) | NOT BUILT | |
| CMS submission tracking | NOT BUILT | |
| Compliance dashboard | NOT BUILT | |

### 10. DATA & ANALYTICS
| Function | Status | Notes |
|----------|--------|-------|
| Multi-source data ingestion | Built | 14 data types, AI mapping |
| Data quality & validation | Built | Quality gate, entity resolution |
| Autonomous discovery engine | Built | 6 scan types |
| Self-learning AI | Built | Tracks accuracy, improves |
| Conversational AI query | Built | Ask Bar on every page |
| Predictive analytics | Built | Risk scoring, cost projection |
| Scenario modeling | Built | 6 what-if types |
| Temporal analytics | Built | Time machine |
| Knowledge graph | PLANNED | Needs real data first |

---

## GAPS THAT MATTER FOR RISK MSOs (Priority Order)

### MUST HAVE for delegated risk operations:
1. **Care Plan Builder** — care managers create and track formal care plans with goals, interventions, responsible parties, timelines, and status tracking. This is their daily workflow tool.
2. **Case Management / Caseload** — assign members to care managers, balance workloads, track touch points, manage transitions between care managers.
3. **UM / Prior Authorization** — track auth requests through lifecycle (requested → reviewed → approved/denied → appealed). CMS-mandated turnaround times. Denial management.

### SHOULD HAVE for full operations:
4. **Credentialing Tracker** — provider credential expiration dates, required documents, CAQH integration, auto-alerts 90 days before expiration.
5. **Regulatory Calendar** — CMS filing deadlines, attestation requirements, audit dates, submission tracking.
6. **SDoH Screening** — increasingly required for Stars (EHO4all coming 2027). Z-code capture, community resource referrals.
7. **Enrollment Reconciliation** — monthly reconciliation of attributed members with health plan data.

### NICE TO HAVE:
8. **Network Adequacy Reporting** — time/distance calculations, specialty coverage
9. **Disease Management Program Enrollment** — formal program tracking
10. **Compliance Dashboard** — aggregated compliance status across all requirements
