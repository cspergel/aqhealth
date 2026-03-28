# Humana Data Exchange — Setup & Connection Guide

Step-by-step guide to connect AQSoft Health Platform to Humana's FHIR APIs.

---

## Overview

Humana Data Exchange (HDX) provides free FHIR R4 APIs that give us direct access to:
- Member demographics, eligibility, and coverage
- Medical and pharmacy claims (Explanation of Benefits)
- Diagnoses and conditions (ICD-10 codes for HCC analysis)
- Provider directory and care team information
- Lab results, medications, and clinical documents

**Cost:** Free. No charges for any API access.

**What we get:** Real-time data pull replacing manual CSV exports.

---

## Step 1: Create a Humana Developer Account

1. Go to **https://developers.humana.com/account/signup**
2. Create an account with your email
3. Verify your email address
4. Log in to the Humana Developer Portal

**Note:** This is the HDX portal account, separate from the FHIR Sandbox registration.

---

## Step 2: Register Your Application (Sandbox)

1. Go to **https://developers.humana.com/apis/registerapp**
2. Fill in:
   - **Application Name:** `AQSoft Health Platform` (or your preferred name)
   - **Redirect URL:** Must be **HTTPS** (Humana won't accept http://localhost)
     - For local development: use **ngrok** or similar tunnel:
       1. Run: `ngrok http 8090`
       2. Copy the `https://xxxx.ngrok-free.app` URL
       3. Register redirect as: `https://xxxx.ngrok-free.app/api/payer/callback`
       4. Note: ngrok URLs change each restart on free tier — use a paid plan or reserve a subdomain for stable testing
     - For production: `https://api.aqhealth.ai/api/payer/callback` (or your hosted domain)
     - **You can update the redirect URL later** in the Humana portal if it changes
3. Submit the registration
4. **Save the credentials you receive:**
   - `Client ID` — your app's unique identifier
   - `Client Secret` — your app's secret key (keep this safe!)

**Important:** This registers you for the **Sandbox** environment with synthetic test data. Production access is a separate step (see Step 5).

---

## Step 3: Test with the FHIR Sandbox

The sandbox has synthetic (fake) data that mirrors Humana's production format. This lets you verify everything works before touching real patient data.

**Sandbox URLs:**
- Auth: `https://sandbox-fhir.humana.com/auth/authorize`
- Token: `https://sandbox-fhir.humana.com/auth/token`
- FHIR: `https://sandbox-fhir.humana.com/api/{Resource}`

### Test the OAuth Flow:

1. In the AQSoft platform, go to **Data Management → Connected Payers**
2. Click **"Connect Humana"**
3. Enter your Client ID and Client Secret
4. Select **"Sandbox"** environment
5. Click **"Connect"** — this redirects to Humana's authorization page
6. Authorize the connection — Humana redirects back with an auth code
7. The platform automatically exchanges the code for access tokens

### Test Data Sync:

1. After connecting, click **"Sync Now"**
2. The platform pulls synthetic data:
   - Patient demographics
   - Coverage/eligibility
   - Claims (ExplanationOfBenefit)
   - Conditions (diagnoses)
   - Providers
   - Medications
3. Verify data appears in the platform:
   - Members list should show synthetic members
   - HCC analysis should find suspects in the synthetic data
   - Dashboard should populate with metrics

### What to Check:

- [ ] OAuth redirect works (you see Humana's auth page)
- [ ] Tokens are received (connection shows "Connected" status)
- [ ] Members load (check Members page)
- [ ] Claims load (check Expenditure page)
- [ ] Diagnoses load (check HCC suspects)
- [ ] Provider data loads (check Providers page)
- [ ] HCC analysis runs automatically after sync

---

## Step 4: Understand the Data Format

### Key Humana-Specific Quirks

**Claims (ExplanationOfBenefit):**
- Uses **CARIN Blue Button** profile, not standard FHIR EOB
- Adjudication amounts are in a `total[]` array with category codes like "benefit" (paid), "submitted" (billed)
- Pharmacy claims have `type.coding.code = "pharmacy"` with NDC codes
- Some claims may have item-level adjudication instead of totals

**Coverage:**
- Returns ALL coverage types: dental, vision, HIP, MA, MAPD
- Our platform filters to only MA/MAPD/HMO/PPO/SNP plan types
- Coverage period dates indicate enrollment windows

**Conditions:**
- Each condition may have multiple coding systems: SNOMED CT, ICD-10-CM, ICD-9
- We only extract ICD-10-CM codes (system: `http://hl7.org/fhir/sid/icd-10-cm`)
- Conditions with only SNOMED codes are logged but skipped for HCC analysis

**Member Identifiers:**
- Humana uses multiple identifier types: MBI (Medicare Beneficiary ID), Humana member ID, Medicaid ID
- We prioritize MBI as the `member_id`, falling back to Humana's internal ID
- The FHIR resource ID is stored separately for cross-referencing between resources

---

## Step 5: Request Production Access

**This is where you'll need Humana's involvement.** Production access requires:

1. **Contact Humana Developer Support** through the HDX portal
   - Or reach out to your Humana network representative
2. **Demonstrate sandbox testing** — show that your app works correctly with synthetic data
3. **Complete any required agreements:**
   - Data Use Agreement (DUA)
   - Business Associate Agreement (BAA) for PHI
   - Possibly a technical review of your application
4. **Receive production credentials:**
   - New Client ID and Client Secret for production
   - These are different from sandbox credentials

**Production URLs:**
- Auth: `https://fhir.humana.com/auth/authorize`
- Token: `https://fhir.humana.com/auth/token`
- FHIR: `https://fhir.humana.com/api/{Resource}`

5. In the AQSoft platform:
   - Go to Data Management → Connected Payers → Humana
   - Update credentials to production Client ID / Client Secret
   - Change environment from "Sandbox" to "Production"
   - Run initial sync

---

## Step 6: Configure Ongoing Sync

After production access is established:

1. **Initial full sync** — pulls all historical data (may take 5-10 minutes for 1,400 members)
2. **Configure sync schedule:**
   - Daily: recommended for claims and eligibility (catches new claims quickly)
   - Weekly: acceptable for provider directory and conditions
   - On-demand: clinical documents and care plans
3. **Monitor sync status** in Data Management dashboard:
   - Last sync timestamp
   - Records synced per resource type
   - Any errors or auth issues

---

## Troubleshooting

### "Connection Failed" during OAuth
- Verify Client ID and Client Secret are correct
- **Redirect URL must be HTTPS** — Humana rejects http://localhost
- For local dev, use ngrok: `ngrok http 8090` then register the `https://xxxx.ngrok-free.app/api/payer/callback` URL
- Check that the Redirect URL in Humana's portal matches **exactly** what your app sends (no trailing slash differences)
- Ensure you're using the right environment (sandbox vs production)
- If using ngrok free tier, the URL changes on restart — update it in both Humana's portal and your .env

### "401 Unauthorized" during sync
- Token may have expired — the platform auto-refreshes, but if the refresh token is also expired, you need to re-authorize
- Production credentials may have been revoked — check with Humana
- Click "Reconnect" in the payer status panel

### "No data returned" after sync
- Sandbox may have limited synthetic data — this is normal
- In production: verify the member is actually enrolled in a Humana MA plan
- Check if the member's coverage dates include the current period

### Partial data (some resources empty)
- Some resources may have 0 records legitimately (e.g., no allergies recorded)
- Check the sync log for specific resource errors
- Ensure your OAuth scopes include all required permissions

### Slow sync (takes > 10 minutes)
- Normal for initial sync of 1,000+ members
- Subsequent syncs are faster (only new/updated records)
- Consider scheduling syncs during off-hours

---

## API Scopes Reference

Our application requests these OAuth scopes:

```
internal openid launch/patient offline_access
patient/Patient.read
patient/Coverage.read
patient/ExplanationOfBenefit.read
patient/Condition.read
patient/CarePlan.read
patient/CareTeam.read
patient/AllergyIntolerance.read
patient/DocumentReference.read
patient/Goal.read
patient/Immunization.read
patient/Procedure.read
patient/Observation.read
patient/Medication.read
patient/MedicationRequest.read
patient/Practitioner.read
patient/PractitionerRole.read
```

The `offline_access` scope is critical — it enables refresh tokens so we can maintain access without requiring re-authorization every hour.

---

## Security Notes

- All credentials are encrypted at rest in the tenant configuration
- Access tokens expire after 1 hour and are auto-refreshed
- PHI (Protected Health Information) is handled per HIPAA requirements
- Data is stored in the tenant's isolated database schema
- No PHI is transmitted to third-party AI services without tenant-specific safety guards (via llm_guard)

---

## Contact & Resources

- **Humana Developer Portal:** https://developers.humana.com
- **API Marketplace:** https://developers.humana.com/apis/marketplace
- **Register App:** https://developers.humana.com/apis/registerapp
- **OAuth Docs:** https://developers.humana.com/apis/oauth
- **Interoperability Info:** https://provider.humana.com/working-with-us/interoperability
