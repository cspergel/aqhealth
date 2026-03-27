# Onboarding & Organization Management Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Seamless AI-assisted onboarding that creates org structure, loads data, and produces a working dashboard with minimal manual effort.

**Architecture:** Wizard for first-time onboarding, dashboard for ongoing management. AI proposes at every step, human confirms before anything executes. One tenant per MSO, offices separated by practice_group_id within that tenant.

**Core Principle:** AI does all the work, but nothing is committed until a human says "yes."

---

## 1. Data Model Changes

### PracticeGroup — add fields

| Field | Type | Purpose |
|-------|------|---------|
| `relationship_type` | String(20) | "owned" or "affiliated" — drives module visibility |
| `tin` | String(20) | Tax ID — key identifier for auto-routing uploaded data |
| `phone` | String(20) | Office phone |
| `fax` | String(20) | Office fax |
| `contact_email` | String(255) | Primary contact |
| `county_code` | String(10) | CMS county code — auto-set from ZIP |
| `bonus_pct` | Numeric(3,1) | Star bonus tier (0, 3.5, or 5) — inherited from parent if not set |
| `npi` | String(20) | Group/organizational NPI |

### Tenant.config JSONB — store settings

```json
{
  "default_bonus_pct": 5.0,
  "default_payment_year": 2026,
  "onboarding_status": {
    "wizard_completed": false,
    "steps_completed": ["organization", "first_upload"],
    "steps_remaining": ["org_structure", "data_review", "analysis"]
  },
  "payer_mix": ["Humana", "UHC"],
  "primary_state": "FL",
  "primary_county_code": "10510"
}
```

### User — add field

| Field | Type | Purpose |
|-------|------|---------|
| `practice_group_id` | Integer FK, nullable | Scopes user to specific office. NULL = sees all offices in tenant. |

### Module visibility by relationship_type

| Module | Owned | Affiliated |
|--------|-------|-----------|
| HCC suspects & RAF | Yes | Yes |
| Care gaps & Stars | Yes | Yes |
| Financial (P&L, MLR) | Yes | Yes |
| Expenditure analytics | Yes | Yes |
| ADT / census alerts | Yes | Yes |
| Discovery & insights | Yes | Yes |
| Practice expenses | Yes | No |
| Staffing / hiring | Yes | No |
| Overhead allocation | Yes | No |

---

## 2. Data Requirements Checklist

Shown during onboarding and on the Data Management Dashboard. Updates status as files are uploaded.

### Required (core platform functionality)

| Data | Why | Where to Find It | Status Tracking |
|------|-----|-------------------|-----------------|
| Member Roster | Demographics, PCP assignment, RAF baseline | Health plan portal → Member Reports, or eligibility file from plan | members table row count |
| Medical Claims (12+ mo) | HCC detection, expenditure, utilization | Health plan portal → Claims Extract, or clearinghouse (Availity, Change Healthcare) | claims table row count + date range |
| Provider Roster | NPI, specialty, office assignment | Internal HR/credentialing, or CAQH | providers table row count |

### Strongly Recommended (unlocks major features)

| Data | What It Unlocks | Where to Find It |
|------|----------------|-------------------|
| Eligibility/Enrollment | Accurate member-months, coverage gaps, churn | Health plan → Eligibility Reports, 834 files |
| Pharmacy Claims | Medication-diagnosis gaps, PDC quality measures | PBM portal (CVS Caremark, Express Scripts, OptumRx) |
| Prior Year HCC Captures | Recapture gap detection (biggest revenue opportunity) | Prior year RAF report from health plan, or risk adjustment vendor |

### Enhances Analytics (load when available)

| Data | What It Unlocks | Where to Find It |
|------|----------------|-------------------|
| Capitation/Premium Data | P&L, MLR, financial dashboards | Monthly capitation statements from health plan |
| ADT Feed Config | Real-time admit/discharge alerts | Bamboo Health, Availity Patient Alerts |
| Historical Claims (24-36 mo) | Trending, seasonal patterns, YoY comparison | Same as medical claims, broader date range |
| Lab Results | Clinical decision support, condition monitoring | Reference lab portal (Quest, LabCorp) or EMR extract |

### AI Payer-Specific Guidance

The system stores common payer portal paths and provides contextual tips:
- "Your members are primarily Humana MA. In the Humana portal, go to Availity → Reports → Claims Detail → select 'All Claims' and date range of last 24 months."
- "For Pharmacy claims with Express Scripts, go to the PBM portal → Claims Reports → Export → CSV format."

Each checklist item shows:
- Status: Not loaded / Partial / Complete
- Impact: "Without this, these features won't work: [list]"
- Freshness: "Last updated 3 days ago" or "Claims data is 45 days old — consider refreshing"

---

## 3. Onboarding Wizard (First-Time)

### Screen 1: Welcome & Organization

- Input: Organization name, type (MSO / ACO / IPA / Health System), primary state
- AI auto-suggests: county, star rating, MOOP tier from state/county selection
- User confirms or edits
- **Confirm gate:** "I'll create '[Name]' as an MSO in Florida. Proceed?"
- On confirm: creates tenant, schema, tables, seeds quality measures

### Screen 2: Data Requirements & First Upload

- **Top section:** Data requirements checklist (prioritized table from Section 2)
- Shows what's needed, why, where to find it
- Each row has a status indicator (not loaded / partial / complete)
- **Bottom section:** Drag-and-drop upload zone
- AI identifies file type, proposes column mapping with confidence scores
- Detects offices (unique TINs) and providers (unique NPIs) from the data
- **Confirm gate:** "I identified this as a [type] file with [X] rows and [Y] offices. Here's my column mapping. Review and confirm."

### Screen 3: Organization Structure

- AI presents discovered org structure as visual tree: MSO → Office 1 → Providers
- Built from TINs, NPIs, and NPI Registry lookups in the uploaded data
- User can: rename offices, set relationship type (owned/affiliated), merge/split, add offices not in data
- Unmatched providers in sidebar for manual assignment
- **Confirm gate:** "Here's your organization structure. Edit anything, then confirm."

### Screen 4: Data Quality Review

- Validation results: X rows clean, Y warnings, Z errors
- Errors grouped by type (missing member_id, bad dates, unmatched providers)
- User can: fix rows, skip warnings, reject bad rows
- AI: "98.2% of rows passed. 12 rows have missing member IDs — skip or try to match?"
- **Confirm gate:** "Ready to load [X] rows. Proceed?"

### Screen 5: Processing & Results

- Progress bar with AI narration: "Analyzing 1,400 members... Found 312 HCC suspects worth $2.1M..."
- When complete: updated requirements checklist showing what's loaded, what's still missing
- AI suggests next steps: "Upload pharmacy claims to unlock 8 more quality measures"
- Link to dashboard

---

## 4. Data Management Dashboard (Post-Onboarding)

Replaces wizard after first onboarding. All sections collapsible, any order.

### Organization Panel
- Visual tree: MSO → offices → providers
- Click any node to edit
- "Add Office" / "Add Provider" buttons
- AI pending queue: "2 new NPIs found in latest upload. Add them?"

### Data Status Panel
- Requirements checklist with live status
- Last upload date, row count, freshness per data type
- AI nudges: "Pharmacy claims haven't been uploaded. This enables 8 more measures."

### Upload Zone
- Drag-and-drop, optionally pre-select target office or let AI auto-route
- Repeat uploads: AI remembers prior mapping — "Same Humana format as last month. Use same mapping?"
- Auto-routing logic: TIN match first → NPI match → manual queue for unmatched

### Analysis Status Panel
- Last run timestamps for: HCC analysis, scorecards, care gaps, insights
- Auto-runs after each upload
- Manual trigger available
- "Last analyzed: 2 hours ago. 3 new suspects found since last upload."

### User Management Panel (admin only)
- Add/invite users, assign roles, scope to office
- Role templates: "Invite as provider (sees own panel only)" / "Invite as analyst (read-only dashboards)"

---

## 5. Data Upload & Auto-Routing Flow

### File Identification
1. User drops file(s)
2. AI reads first 100 rows + headers
3. Proposes: file type, column mapping, confidence scores
4. User reviews and confirms

### Row Routing (for mixed files with multiple offices)
1. **TIN match:** If claim/row has a TIN, match to practice_group.tin → route to that office
2. **Provider NPI match:** If no TIN, match rendering/billing NPI → provider.practice_group_id → route to that office
3. **Manual queue:** Unmatched rows flagged for user assignment — "47 rows couldn't be matched to an office. Assign them."

### Repeat Upload Intelligence
- System stores the mapping profile for each (tenant + file_format) combination
- On repeat uploads: "This matches your previous Humana claims format. Same mapping?" → user confirms → skip the mapping step entirely
- Detects schema changes: "This file has 3 new columns vs last time. Want me to map them?"

---

## 6. Auto-Analysis Pipeline

After data is confirmed and loaded:

1. **Immediate (during upload):** Data quality checks, entity resolution, data lineage
2. **Post-upload (automatic):** HCC analysis → provider scorecards → care gap detection
3. **Background (async):** AI insight generation, discovery scans
4. **User-triggered:** Stars simulation, scenario modeling, report generation

Progress shown in the Analysis Status Panel. AI narrates key findings as they emerge.

---

## 7. Superadmin View (AQSoft Platform Team)

Separate from tenant views. Accessible only to superadmin role.

- **All Tenants dashboard:** List of all MSOs, onboarding status, data freshness, key metrics
- **Switch into any tenant:** View their data as if logged in as their admin
- **Cross-tenant analytics:** Aggregate stats, benchmark comparisons (anonymized)
- **Onboarding assistance:** See where a tenant is stuck, help them through it
- **System health:** Worker status, API latency, error rates

---

## 8. Implementation Priority

### Phase 1 (Before first real data load)
- PracticeGroup model additions (relationship_type, tin, bonus_pct, county_code)
- User.practice_group_id field
- Tenant.config onboarding_status tracking
- Data requirements checklist API + basic UI
- Upload flow with AI file identification and confirm gates
- Auto-routing by TIN → NPI → manual queue

### Phase 2 (After first MSO is onboarded)
- Full onboarding wizard (5 screens)
- NPI Registry integration for provider/org lookup
- Payer-specific data guidance
- Repeat upload intelligence (remembered mappings)

### Phase 3 (Polish)
- Data Management Dashboard (non-wizard ongoing view)
- Superadmin cross-tenant view
- AI onboarding assistant that learns from each onboarding
- Self-service MSO signup flow
