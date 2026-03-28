# Payer API Integration — Technical Specifications

## Humana Data Exchange (Primary — build first)

### Authentication
- **OAuth 2.0 Authorization Code Flow**
- Auth URL: `https://sandbox-fhir.humana.com/auth/authorize` (sandbox) / `https://fhir.humana.com/auth/authorize` (prod)
- Token URL: `https://sandbox-fhir.humana.com/auth/token` (sandbox) / `https://fhir.humana.com/auth/token` (prod)
- Client auth: `Basic base64(client_id:client_secret)` in Authorization header
- Token lifetime: 3600 seconds (1 hour)
- Refresh tokens: Supported
- Scopes: `internal openid launch/patient offline_access patient/Patient.read patient/Coverage.read patient/ExplanationOfBenefit.read patient/Condition.read` (plus resource-specific scopes)

### FHIR Version
- **FHIR R4** with US Core STU3 Implementation Guide (Patient, Condition, etc.)
- **CARIN Blue Button STU1** Implementation Guide (ExplanationOfBenefit)

### Base URLs
| Environment | Base URL |
|------------|---------|
| Sandbox | `https://sandbox-fhir.humana.com/api` |
| Production | `https://fhir.humana.com/api` |

### Required Headers (all requests)
```
Accept: application/json
Authorization: Bearer {ACCESS_TOKEN}
```

### Pagination
- `_count` — results per page (default varies, example shows 10)
- `_skip` — offset for pagination
- `_total=accurate` — request accurate total count
- Response includes `link` array with `next`/`self` URLs

### Key APIs

#### Patient (Member Demographics)
- **GET** `/Patient`
- Returns: FHIR Bundle of Patient resources
- Fields: name, address, phone, DOB, gender, identifiers (member_id, Medicaid #)
- Search: `?patient={id}`, `?_count=10&_skip=0`

#### Coverage (Eligibility)
- **GET** `/Coverage`
- Returns: FHIR Bundle of Coverage resources
- Fields: subscriber ID, member identifiers, status (active/cancelled), plan type (dental, vision, HIP), coverage period dates, payor, classification (group, plan)
- Search: `?patient={id}`, `?_count=10&_skip=0`

#### ExplanationOfBenefit (Claims)
- **GET** `/ExplanationOfBenefit`
- Returns: FHIR Bundle of EOB resources (CARIN Blue Button format)
- Fields: claim identifiers, status, claim type, patient ref, billable period, provider, prescribed items (NDC codes), payment info, itemized adjudications
- Contains: ICD-10 diagnosis codes, procedure codes, drug NDCs, paid amounts
- Note: Includes pharmacy claims (claim_type = "pharmacy" with NDC codes)

#### Condition (Diagnoses)
- **GET** `/Condition`
- Returns: FHIR Bundle of Condition resources
- Fields: clinical status (active/inactive), category, code (SNOMED CT + ICD-10 + ICD-9), onset date
- Code systems: SNOMED CT, ICD-10-CM, ICD-9-CM
- Search: `?patient={id}`

#### Medication + MedicationRequest (Rx)
- **GET** `/Medication`, `/MedicationRequest`
- Drug codes, dosage, prescriber reference

#### Observation (Labs)
- **GET** `/Observation`
- Lab results, vitals, social history

#### Practitioner + PractitionerRole (Providers)
- **GET** `/Practitioner`, `/PractitionerRole`
- NPI, name, specialty, network status

### Signup Process
1. Go to developers.humana.com
2. Register an application (free)
3. Get client_id and client_secret
4. Test in sandbox with synthetic data
5. Request production access

---

## Florida Blue (BCBSFL)

### Available APIs
1. **Athena Care Gaps** (v1.0.1) — care gap data (HEDIS measures?)
2. **Patient Access** (v1.0.5) + Pharmacy (v1.0.4) — member + Rx data
3. **Payer2Payer Outbound** (v1.0.3) — cross-payer data exchange
4. **Provider Directory** (v1.0.12) — in-network providers

### Access
- Developer portal: https://developer.bcbsfl.com/interop/interop-developer-portal/product
- Registration required
- "Live Production APIs" noted for Provider Directory

### Notes
- **Athena Care Gaps is unique** — no other payer exposes care gaps via API. This could replace our care_gap_service detection with actual payer gap data.
- CMS Interoperability Metadata endpoints available (conformance/capability statements)

---

## AaNeel Connect (Optimum Healthcare + Freedom Health)

### Access
- Portal: https://developers.aaneelconnect.com
- Payer code parameter in URL identifies the plan
- Optimum: `?payerCode=5d1757ff-cbd5-4679-b07c-f337267567fe`
- Freedom Health: TBD (same platform, different payerCode)

### Notes
- JS-rendered portal — need to register to see full docs
- Likely FHIR R4 (CMS mandate)
- One integration covers multiple FL health plans
- Provider Directory endpoint confirmed at `/providerdirectory/endpoint-api`

---

## UHC (United Healthcare)

### Access
- API Marketplace: https://apimarketplace.uhcprovider.com/
- Claims Overview: https://apimarketplace.uhcprovider.com/#/knowledge-base/claims-overview
- Harder signup — may need UHC provider rep
- CMS-mandated FHIR APIs must be available

---

## Anthem / Elevance

### Access
- Developer portal: https://www.anthem.com/developers
- CMS-mandated FHIR APIs

---

## Devoted Health

### Access
- Developer portal: https://www.devoted.com/developers/

---

## Availity (Multi-Payer Clearinghouse)

### Covered Payers
- Humana, Simply Healthcare, UHC, Aetna, Anthem, and 100+ others
- Single integration point for eligibility, claims status, authorizations

### Access
- Provider portal with API access
- Used by Simply Healthcare as their primary platform

---

## Implementation Architecture

### Backend Service: `backend/app/services/payer_api_service.py`

```
┌─────────────────────────────────────┐
│        payer_api_service.py          │
│                                      │
│  connect(payer, credentials)         │
│  sync_members(payer, tenant_db)      │
│  sync_claims(payer, tenant_db)       │
│  sync_providers(payer, tenant_db)    │
│  sync_conditions(payer, tenant_db)   │
│  sync_all(payer, tenant_db)          │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  Payer Adapters (per payer)  │   │
│  │  ├── HumanaAdapter          │   │
│  │  ├── AaNeelAdapter          │   │
│  │  ├── BCBSFLAdapter          │   │
│  │  └── AvailityAdapter        │   │
│  └──────────────────────────────┘   │
│                                      │
│  FHIR Bundle → Our Models mapping    │
│  (reuses existing fhir_service.py)   │
└─────────────────────────────────────┘
```

### Data Flow
```
Payer FHIR API → payer_api_service → fhir_service (parse) → ingestion_service (upsert) → DB
                                                                    ↓
                                                          Same pipeline as CSV upload
                                                          (HCC analysis, scorecards, etc.)
```

### Payer Adapter Interface
Each adapter handles the specific quirks of that payer:
- OAuth flow differences (authorization_code vs client_credentials)
- Different FHIR profiles (CARIN Blue Button vs US Core)
- Pagination differences
- Rate limiting
- Sandbox vs production URLs
- Field mapping differences (some payers use different code systems)

### Tenant Config Storage
```json
{
  "payer_connections": {
    "humana": {
      "client_id": "encrypted...",
      "client_secret": "encrypted...",
      "access_token": "encrypted...",
      "refresh_token": "encrypted...",
      "token_expires_at": "2026-03-27T15:00:00Z",
      "environment": "sandbox",
      "last_sync": "2026-03-27T14:00:00Z",
      "sync_status": "active"
    }
  }
}
```

### Specific Payer Quirks to Handle
- **Humana EOB**: Uses CARIN Blue Button profile (not plain US Core) — adjudication structure is different
- **Humana Coverage**: Returns multiple coverage types (dental, vision, HIP) — filter to MA only
- **Humana Condition**: Uses SNOMED CT + ICD-10 + ICD-9 code systems — need to handle all three
- **Florida Blue Care Gaps**: Unique API — returns actual payer care gap data, could supplement our detection
- **AaNeel Connect**: Payer-specific payerCode parameter required in API calls
- **Pagination**: Humana uses `_count`/`_skip`, others may use `Link` header or `Bundle.link`
- **Rate limits**: Unknown for most — build adaptive rate limiting (start slow, speed up if no 429s)
