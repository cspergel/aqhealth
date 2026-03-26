# Data Flow Audit — Where Everything Connects

## The Core Data Flow

```
DATA IN                           PROCESSING                      INSIGHTS OUT
─────────                         ──────────                      ────────────

Roster CSV ──┐                                                    Dashboard
Claims CSV ──┤                    ┌─────────────┐                 Suspect HCCs
Pharmacy CSV ┤──→ Ingestion ──→   │ Data Quality │──→ Clean DB    Expenditure
Eligibility ─┤    Pipeline        │   Gate       │                Providers
Lab Results ─┤    (AI mapping)    │ - Validate   │                Care Gaps
Auth Data ───┤                    │ - Entity Res │                Stars Sim
Cap Payments ┤                    │ - Quarantine │                RADV Ready
Risk Scores ─┘                    │ - Lineage    │                Financial
                                  └──────┬──────┘                Risk Acct
AQTracker ───→ Encounter Sync            │                        AWV Track
ADT Feeds ───→ Census/Alerts             │                        TCM Cases
                                         ▼                        Predictions
                                  ┌─────────────┐                Scenarios
                                  │ HCC Engine   │                Time Machine
                                  │ - Med-Dx     │                Alert Rules
                                  │ - Specificity│                Data Exchange
                                  │ - Recapture  │                BOI/ROI
                                  │ - Near-miss  │                Practice Costs
                                  │ - Patterns   │                Education
                                  └──────┬──────┘                Journey
                                         │                        Cohorts
                                         ▼                        Ask Bar
                                  ┌─────────────┐
                                  │ Discovery    │
                                  │ Engine       │
                                  │ (6 scans)    │
                                  └──────┬──────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │ AI Insight   │──→ Every Page
                                  │ Engine       │
                                  │ (Claude)     │
                                  └──────┬──────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │ Learning     │──→ Improves
                                  │ System       │    Over Time
                                  └─────────────┘
```

## Connection Audit — What Talks to What

### DATA QUALITY should feed into:
- [x] Ingestion pipeline (validates before insert)
- [x] Entity resolution (matches members/providers)
- [ ] **GAP: Data quality scores should appear on Dashboard**
- [ ] **GAP: Data quality should trigger alerts when quality drops**
- [ ] **GAP: Lineage should be queryable from any data point in the UI**

### HCC ENGINE should feed into:
- [x] Suspect chase lists
- [x] Dashboard metrics (suspect count, RAF)
- [x] Clinical patient view (suspects at point of care)
- [x] Provider scorecards (capture rate)
- [x] Group scorecards (group capture rate)
- [x] Discovery engine (cross-module scan)
- [x] Stars simulator (recapture feeds into Stars)
- [ ] **GAP: HCC captures should feed into BOI (intervention ROI tracking)**
- [ ] **GAP: HCC suspects should connect to clinical exchange (auto-package evidence)**
- [ ] **GAP: Risk accounting should use RAF for revenue projections**

### EXPENDITURE should feed into:
- [x] Dashboard (cost hotspots)
- [x] Discovery engine
- [x] Provider scorecards (PMPM)
- [x] Group scorecards
- [ ] **GAP: Expenditure should connect to practice costs (operational vs medical spend)**
- [ ] **GAP: Expenditure trends should feed into risk corridor analysis**
- [ ] **GAP: High-cost claims should auto-trigger stop-loss alerts**

### CARE GAPS should feed into:
- [x] Dashboard
- [x] Clinical patient view
- [x] Provider scorecards
- [x] Stars simulator
- [x] AWV tracking (AWV-related gaps)
- [ ] **GAP: Care gap closure should feed into BOI (which interventions closed which gaps)**
- [ ] **GAP: Care gaps should auto-create action items when critical**

### FINANCIAL / RISK ACCOUNTING should connect to:
- [x] P&L (confirmed vs projected)
- [x] IBNR estimation
- [x] Risk corridor
- [x] Reconciliation
- [ ] **GAP: Cap payments should auto-calculate per-plan profitability using claims data**
- [ ] **GAP: RAF changes should auto-update revenue projections in risk accounting**
- [ ] **GAP: Practice costs should be included in the full P&L (operational overhead)**

### ADT / CENSUS should feed into:
- [x] Care alerts
- [x] TCM tracking
- [x] Estimated costs (signal tier)
- [ ] **GAP: ADT admits should auto-check for HCC capture opportunities**
- [ ] **GAP: ADT discharges should auto-trigger AWV scheduling**
- [ ] **GAP: Census data should connect to expenditure (real-time cost accrual)**

### AI INSIGHT ENGINE should have access to:
- [x] HCC suspects
- [x] Expenditure patterns
- [x] Care gaps
- [x] Provider performance
- [x] Learning context (past accuracy)
- [ ] **GAP: Should also analyze practice costs for operational insights**
- [ ] **GAP: Should analyze risk accounting for financial risk alerts**
- [ ] **GAP: Should analyze BOI data for intervention recommendations**
- [ ] **GAP: Should analyze clinical exchange for documentation quality patterns**

## IDENTIFIED GAPS (17 total)

### Cross-Module Data Connections Missing:
1. Data quality scores not visible on Dashboard
2. Data quality drops don't trigger alert rules
3. HCC captures don't feed into BOI tracking
4. HCC suspects don't auto-connect to clinical exchange evidence
5. Risk accounting doesn't use RAF for revenue projections
6. Expenditure doesn't connect to practice costs
7. Expenditure trends don't feed risk corridor
8. High-cost claims don't auto-trigger stop-loss
9. Care gap closure doesn't feed BOI
10. Care gaps don't auto-create action items
11. Cap payments don't auto-calculate per-plan P&L from claims
12. RAF changes don't update risk accounting revenue projections
13. Practice costs missing from full P&L
14. ADT admits don't auto-check HCC opportunities
15. ADT discharges don't auto-trigger AWV scheduling
16. AI insight engine doesn't analyze practice costs, risk accounting, BOI, exchange data

### AI Coverage Gaps:
17. Data quality validation should use AI for ambiguous cases (not just rules)
