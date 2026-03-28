"""
Humana Payer Adapter.

Implements OAuth 2.0 Authorization Code Flow and FHIR R4 data retrieval
against Humana's Patient Access API (CARIN Blue Button profile).

Handles Humana-specific quirks:
- CARIN Blue Button EOB adjudication structure
- Coverage type filtering (skip dental/vision/HIP, keep MA plans)
- Multi-code-system Conditions (extract ICD-10 only, ignore SNOMED/ICD-9)
- _count/_skip pagination with Bundle.link "next" URLs
- Adaptive rate limiting with exponential backoff on 429 responses
- Full extraction of all available FHIR data points across 7 resource types
"""

import asyncio
import base64
import logging
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from app.services.payer_api_service import PayerAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Humana API endpoints
# ---------------------------------------------------------------------------

_ENVIRONMENTS = {
    "sandbox": {
        "auth_url": "https://sandbox-fhir.humana.com/auth/authorize",
        "token_url": "https://sandbox-fhir.humana.com/auth/token",
        "fhir_base": "https://sandbox-fhir.humana.com/api",
    },
    "production": {
        "auth_url": "https://fhir.humana.com/auth/authorize",
        "token_url": "https://fhir.humana.com/auth/token",
        "fhir_base": "https://fhir.humana.com/api",
    },
}

_SCOPES = (
    "internal openid launch/patient offline_access "
    "patient/Patient.read patient/Coverage.read "
    "patient/ExplanationOfBenefit.read patient/Condition.read "
    "patient/Practitioner.read patient/MedicationRequest.read "
    "patient/Observation.read"
)

# Rate limiting defaults
_DEFAULT_RATE_LIMIT = 10  # requests per second
_MAX_RETRIES = 3
_REQUEST_TIMEOUT = 30.0  # seconds
_PAGE_SIZE = 50


# ---------------------------------------------------------------------------
# Adapter implementation
# ---------------------------------------------------------------------------

class HumanaAdapter(PayerAdapter):
    """Humana FHIR R4 API adapter."""

    def get_scopes(self) -> str:
        return _SCOPES

    def get_authorization_url(self, credentials: dict) -> str:
        """Build the Humana OAuth authorization URL for browser redirect."""
        env = credentials.get("environment", "sandbox")
        urls = _ENVIRONMENTS[env]
        params = {
            "response_type": "code",
            "client_id": credentials["client_id"],
            "redirect_uri": credentials["redirect_uri"],
            "scope": _SCOPES,
            "state": credentials.get("state", ""),
        }
        return f"{urls['auth_url']}?{urlencode(params)}"

    async def authenticate(self, credentials: dict) -> dict:
        """Exchange authorization code for tokens via Humana's token endpoint."""
        env = credentials.get("environment", "sandbox")
        urls = _ENVIRONMENTS[env]

        client_auth = base64.b64encode(
            f"{credentials['client_id']}:{credentials['client_secret']}".encode()
        ).decode()

        data = {
            "grant_type": "authorization_code",
            "code": credentials["code"],
            "redirect_uri": credentials["redirect_uri"],
        }

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.post(
                urls["token_url"],
                headers={
                    "Authorization": f"Basic {client_auth}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data=data,
            )
            response.raise_for_status()
            token_data = response.json()

        return {
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token", ""),
            "expires_in": token_data.get("expires_in", 3600),
            "token_type": token_data.get("token_type", "Bearer"),
        }

    async def refresh_token(self, credentials: dict) -> dict:
        """Use refresh token to obtain a new access token."""
        env = credentials.get("environment", "sandbox")
        urls = _ENVIRONMENTS[env]

        client_auth = base64.b64encode(
            f"{credentials['client_id']}:{credentials['client_secret']}".encode()
        ).decode()

        data = {
            "grant_type": "refresh_token",
            "refresh_token": credentials["refresh_token"],
        }

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.post(
                urls["token_url"],
                headers={
                    "Authorization": f"Basic {client_auth}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data=data,
            )
            response.raise_for_status()
            token_data = response.json()

        return {
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token", credentials["refresh_token"]),
            "expires_in": token_data.get("expires_in", 3600),
        }

    # -------------------------------------------------------------------
    # FHIR resource fetchers
    # -------------------------------------------------------------------

    async def fetch_patients(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Patient resources into platform-normalized dicts."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/Patient")
        return [self._parse_patient(r) for r in raw_resources]

    async def fetch_claims(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse ExplanationOfBenefit (CARIN Blue Button) resources."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/ExplanationOfBenefit")
        parsed = []
        for r in raw_resources:
            claim = self._parse_eob(r)
            if claim:
                parsed.append(claim)
        return parsed

    async def fetch_conditions(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Condition resources (ICD-10 only)."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/Condition")
        parsed = []
        for r in raw_resources:
            cond = self._parse_condition(r)
            if cond:
                parsed.append(cond)
        return parsed

    async def fetch_coverage(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Coverage resources (MA plans only)."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/Coverage")
        parsed = []
        for r in raw_resources:
            cov = self._parse_coverage(r)
            if cov:
                parsed.append(cov)
        return parsed

    async def fetch_providers(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Practitioner resources."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/Practitioner")
        parsed = []
        for r in raw_resources:
            prov = self._parse_practitioner(r)
            if prov:
                parsed.append(prov)
        return parsed

    async def fetch_medications(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse MedicationRequest resources."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/MedicationRequest")
        parsed = []
        for r in raw_resources:
            med = self._parse_medication_request(r)
            if med:
                parsed.append(med)
        return parsed

    async def fetch_observations(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Observation resources (lab results, vitals)."""
        env = params.get("environment", "sandbox")
        raw_resources = await self._fetch_all_pages(token, env, "/Observation")
        parsed = []
        for r in raw_resources:
            obs = self._parse_observation(r)
            if obs:
                parsed.append(obs)
        return parsed

    # -------------------------------------------------------------------
    # Paginated FHIR fetch with retry + rate limiting
    # -------------------------------------------------------------------

    async def _fetch_all_pages(
        self,
        token: str,
        environment: str,
        resource_path: str,
    ) -> list[dict]:
        """Fetch all pages of a FHIR Bundle, following 'next' links.

        Implements:
        - _count/_skip pagination
        - Retry with exponential backoff on 429 / 5xx
        - Adaptive rate limiting (starts at 10 req/s, slows on 429)
        """
        urls = _ENVIRONMENTS[environment]
        base_url = urls["fhir_base"]
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }

        all_resources: list[dict] = []
        # First page URL includes _count
        next_url: str | None = f"{base_url}{resource_path}?_count={_PAGE_SIZE}"
        delay = 1.0 / _DEFAULT_RATE_LIMIT  # seconds between requests

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            while next_url:
                # Rate limit
                await asyncio.sleep(delay)

                response = await self._request_with_retry(
                    client, next_url, headers
                )
                if response is None:
                    break

                bundle = response.json()

                # Extract resources from Bundle entries
                for entry in bundle.get("entry", []):
                    resource = entry.get("resource", entry)
                    if resource.get("resourceType"):
                        all_resources.append(resource)

                # Find next page link
                next_url = None
                for link in bundle.get("link", []):
                    if link.get("relation") == "next":
                        next_url = link.get("url")
                        break

        logger.info(
            "Fetched %d %s resources from Humana (%s)",
            len(all_resources), resource_path.strip("/"), environment,
        )
        return all_resources

    async def _request_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict,
    ) -> httpx.Response | None:
        """Make an HTTP GET with retry logic and exponential backoff."""
        for attempt in range(_MAX_RETRIES):
            try:
                response = await client.get(url, headers=headers)

                if response.status_code == 200:
                    return response

                if response.status_code == 429:
                    # Rate limited: exponential backoff
                    retry_after = int(response.headers.get("Retry-After", 2 ** (attempt + 1)))
                    logger.warning(
                        "Humana 429 rate limit on %s, backing off %ds (attempt %d/%d)",
                        url, retry_after, attempt + 1, _MAX_RETRIES,
                    )
                    await asyncio.sleep(retry_after)
                    continue

                if response.status_code >= 500:
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        "Humana %d on %s, retrying in %ds (attempt %d/%d)",
                        response.status_code, url, wait, attempt + 1, _MAX_RETRIES,
                    )
                    await asyncio.sleep(wait)
                    continue

                # 4xx (not 429) -- don't retry
                logger.error(
                    "Humana %d on %s: %s",
                    response.status_code, url, response.text[:500],
                )
                return None

            except httpx.TimeoutException:
                wait = 2 ** (attempt + 1)
                logger.warning(
                    "Humana timeout on %s, retrying in %ds (attempt %d/%d)",
                    url, wait, attempt + 1, _MAX_RETRIES,
                )
                await asyncio.sleep(wait)
            except httpx.HTTPError as e:
                logger.error("Humana HTTP error on %s: %s", url, e)
                return None

        logger.error("Humana request failed after %d retries: %s", _MAX_RETRIES, url)
        return None

    # -------------------------------------------------------------------
    # FHIR resource parsers — Humana-specific mapping (full extraction)
    # -------------------------------------------------------------------

    def _parse_patient(self, resource: dict) -> dict:
        """Map FHIR Patient to platform Member dict.

        Extracts ALL available data points:
        - Core demographics (name, DOB, gender)
        - Full address (street, city, state, zip)
        - Telecom (phone, email)
        - Race/ethnicity from US Core extensions
        - Language from communication array
        - All identifiers (MBI, Medicaid, member ID)
        """
        fhir_id = resource.get("id", "")

        # ------ Identifiers ------
        member_id = fhir_id
        mbi = None
        medicaid_id = None
        identifiers: dict[str, str] = {}
        for ident in resource.get("identifier", []):
            system = ident.get("system", "")
            value = ident.get("value", "")
            # Categorize by system
            system_lower = system.lower()
            if "mbi" in system_lower or "medicare" in system_lower:
                mbi = value
                identifiers["mbi"] = value
                if not member_id or member_id == fhir_id:
                    member_id = value
            elif "medicaid" in system_lower:
                medicaid_id = value
                identifiers["medicaid"] = value
            elif "member" in system_lower:
                member_id = value
                identifiers["member_id"] = value
            elif value:
                # Store any other identifier by its system suffix
                key = system.rsplit("/", 1)[-1] if "/" in system else system
                identifiers[key] = value

        # ------ Name ------
        first_name = ""
        last_name = ""
        names = resource.get("name", [])
        if names:
            name_obj = names[0]
            first_name = " ".join(name_obj.get("given", []))
            last_name = name_obj.get("family", "")

        # ------ Demographics ------
        birth_date_str = resource.get("birthDate")
        birth_date = date.fromisoformat(birth_date_str) if birth_date_str else None

        gender_raw = resource.get("gender", "")
        gender = gender_raw[0].upper() if gender_raw else "U"

        # ------ Full Address ------
        street = None
        city = None
        state = None
        zip_code = None
        for addr in resource.get("address", []):
            lines = addr.get("line", [])
            street = ", ".join(lines) if lines else street
            city = addr.get("city") or city
            state = addr.get("state") or state
            zip_code = addr.get("postalCode") or zip_code
            if zip_code:
                break  # Use first address with a zip

        # ------ Telecom (phone, email) ------
        phone = None
        email = None
        for telecom in resource.get("telecom", []):
            sys = telecom.get("system", "")
            val = telecom.get("value", "")
            if sys == "phone" and not phone:
                phone = val
            elif sys == "email" and not email:
                email = val

        # ------ Race (US Core extension) ------
        race = None
        ethnicity = None
        for ext in resource.get("extension", []):
            url = ext.get("url", "")
            if "us-core-race" in url:
                race = self._extract_extension_text_or_coding(ext)
            elif "us-core-ethnicity" in url:
                ethnicity = self._extract_extension_text_or_coding(ext)

        # ------ Language (communication array) ------
        language = None
        for comm in resource.get("communication", []):
            lang_block = comm.get("language", {})
            language = lang_block.get("text")
            if not language:
                codings = lang_block.get("coding", [])
                if codings:
                    language = codings[0].get("display") or codings[0].get("code")
            if comm.get("preferred"):
                break  # Prefer the preferred language
            if language:
                break

        # ------ Medicaid status ------
        medicaid_status = medicaid_id is not None

        return {
            "member_id": member_id,
            "first_name": first_name,
            "last_name": last_name,
            "date_of_birth": birth_date,
            "gender": gender,
            "zip_code": zip_code,
            "medicaid_status": medicaid_status,
            "fhir_id": fhir_id,
            # Extra fields -> stored in Member.extra JSONB
            "extra": {
                "street": street,
                "city": city,
                "state": state,
                "phone": phone,
                "email": email,
                "race": race,
                "ethnicity": ethnicity,
                "language": language,
                "mbi": mbi,
                "medicaid_id": medicaid_id,
                "identifiers": identifiers,
            },
        }

    def _parse_coverage(self, resource: dict) -> dict | None:
        """Map FHIR Coverage to eligibility fields.

        Extracts ALL available data points:
        - Core: member, period, plan name, status
        - Subscriber ID, group number, contract ID
        - Network type, relationship, status reason
        - Filters out dental, vision, and HIP plans
        """
        # Filter: skip non-MA coverage types
        coverage_type = self._extract_coverage_type(resource)
        ma_types = {"ma", "mapd", "medicare advantage", "hmo", "ppo", "snp", "pffs"}
        if coverage_type and coverage_type.lower() not in ma_types:
            skip_types = {"dental", "vision", "hip", "medicaid"}
            if coverage_type.lower() in skip_types:
                logger.debug("Skipping non-MA coverage type: %s", coverage_type)
                return None

        # Extract subscriber/member reference
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        # Coverage period
        period = resource.get("period", {})
        coverage_start = None
        coverage_end = None
        if period.get("start"):
            try:
                coverage_start = date.fromisoformat(period["start"][:10])
            except ValueError:
                pass
        if period.get("end"):
            try:
                coverage_end = date.fromisoformat(period["end"][:10])
            except ValueError:
                pass

        # ------ Subscriber ID ------
        subscriber_id = None
        subscriber_ref = resource.get("subscriber", {})
        if isinstance(subscriber_ref, dict):
            ref = subscriber_ref.get("reference", "")
            if "/" in ref:
                subscriber_id = ref.split("/")[-1]
            ident = subscriber_ref.get("identifier", {})
            if ident.get("value"):
                subscriber_id = ident["value"]
        # Also check subscriberId field
        if not subscriber_id:
            subscriber_id = resource.get("subscriberId")

        # ------ Class array: plan name, group number, contract IDs ------
        health_plan = None
        plan_product = coverage_type
        group_number = None
        contract_id = None
        for cls in resource.get("class", []):
            cls_type_code = cls.get("type", {}).get("coding", [{}])[0].get("code", "")
            cls_value = cls.get("value")
            cls_name = cls.get("name")
            if cls_type_code == "plan":
                health_plan = cls_name or cls_value
            elif cls_type_code == "group":
                group_number = cls_value
                if not health_plan:
                    health_plan = cls_name or cls_value
            elif cls_type_code in ("rxbin", "rxgrp", "rxid"):
                contract_id = cls_value

        # Fallback: payor display
        if not health_plan:
            payors = resource.get("payor", [])
            if payors:
                health_plan = payors[0].get("display", "Humana")

        # ------ Network type ------
        network = resource.get("network")

        # ------ Relationship to subscriber ------
        relationship = None
        rel_block = resource.get("relationship", {})
        for coding in rel_block.get("coding", []):
            relationship = coding.get("code")
            if relationship:
                break
        if not relationship:
            relationship = rel_block.get("text")

        # ------ Status reason ------
        status = resource.get("status")
        status_reason = None
        # FHIR Coverage doesn't have a standard statusReason, but some payers
        # include it in extensions
        for ext in resource.get("extension", []):
            if "status-reason" in ext.get("url", "").lower():
                status_reason = (
                    ext.get("valueString")
                    or ext.get("valueCodeableConcept", {}).get("text")
                )
                break

        return {
            "member_id": member_id,
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
            "health_plan": health_plan or "Humana",
            "plan_product": plan_product,
            "status": status,
            # Extra fields -> stored in Member.extra JSONB
            "extra": {
                "subscriber_id": subscriber_id,
                "group_number": group_number,
                "contract_id": contract_id,
                "network": network,
                "relationship": relationship,
                "status_reason": status_reason,
            },
        }

    def _parse_eob(self, resource: dict) -> dict | None:
        """Map FHIR ExplanationOfBenefit (CARIN Blue Button) to Claim dict.

        Extracts ALL available data points:
        - Core: member, claim ID, type, dates, diagnosis, procedure, financials
        - paid_date, facility_name, facility_npi, drg_code
        - pos_code, quantity, days_supply, revenue_code
        - modifier_1, modifier_2, admission/discharge dates
        - discharge_status, admit_type, LOS
        - billing_tin, billing_npi
        """
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        # Claim identifier
        claim_id = None
        for ident in resource.get("identifier", []):
            claim_id = ident.get("value")
            if claim_id:
                break

        # Claim type (professional, institutional, pharmacy)
        claim_type = "professional"
        type_codings = resource.get("type", {}).get("coding", [])
        for coding in type_codings:
            code = coding.get("code", "").lower()
            if code in ("pharmacy", "oral"):
                claim_type = "pharmacy"
                break
            elif code in ("institutional",):
                claim_type = "institutional"
                break

        # Service dates from billablePeriod
        billable = resource.get("billablePeriod", {})
        service_date = None
        service_end_date = None
        if billable.get("start"):
            try:
                service_date = date.fromisoformat(billable["start"][:10])
            except ValueError:
                pass
        if billable.get("end"):
            try:
                service_end_date = date.fromisoformat(billable["end"][:10])
            except ValueError:
                pass
        if not service_date:
            service_date = date.today()

        # ------ Paid date ------
        paid_date = None
        payment_block = resource.get("payment", {})
        if payment_block.get("date"):
            try:
                paid_date = date.fromisoformat(payment_block["date"][:10])
            except ValueError:
                pass

        # Diagnosis codes — ICD-10 only + DRG extraction
        diagnosis_codes: list[str] = []
        drg_code = None
        for diag in resource.get("diagnosis", []):
            # Check for DRG type
            diag_types = diag.get("type", [])
            is_drg = False
            for dt in diag_types:
                for coding in dt.get("coding", []):
                    if coding.get("code", "").lower() in ("drg", "ms-drg"):
                        is_drg = True
                        break

            diag_cc = diag.get("diagnosisCodeableConcept", {})
            for coding in diag_cc.get("coding", []):
                system = coding.get("system", "")
                code_val = coding.get("code")
                if not code_val:
                    continue
                if is_drg or "drg" in system.lower() or "ms-drg" in system.lower():
                    drg_code = code_val
                elif "icd-10" in system.lower() or system == "http://hl7.org/fhir/sid/icd-10-cm":
                    if code_val not in diagnosis_codes:
                        diagnosis_codes.append(code_val)

        # ------ DRG from supportingInfo fallback ------
        admission_date = None
        discharge_date = None
        discharge_status = None
        admit_type = None
        for si in resource.get("supportingInfo", []):
            si_category = ""
            cat_block = si.get("category", {})
            for coding in cat_block.get("coding", []):
                si_category = coding.get("code", "").lower()
                if si_category:
                    break

            if si_category in ("drg", "ms-drg") and not drg_code:
                si_code = si.get("code", {})
                for coding in si_code.get("coding", []):
                    drg_code = coding.get("code")
                    if drg_code:
                        break

            # Admission period
            if si_category in ("admissionperiod", "admission-period"):
                si_period = si.get("timingPeriod", {})
                if si_period.get("start"):
                    try:
                        admission_date = date.fromisoformat(si_period["start"][:10])
                    except ValueError:
                        pass
                if si_period.get("end"):
                    try:
                        discharge_date = date.fromisoformat(si_period["end"][:10])
                    except ValueError:
                        pass

            # Discharge status
            if si_category in ("discharge-status", "dischargestatus"):
                ds_code = si.get("code", {})
                for coding in ds_code.get("coding", []):
                    discharge_status = coding.get("code")
                    if discharge_status:
                        break
                if not discharge_status:
                    discharge_status = ds_code.get("text")

            # Admit type / type of bill
            if si_category in ("typeofbill", "admtype", "admit-type", "type-of-bill"):
                at_code = si.get("code", {})
                for coding in at_code.get("coding", []):
                    admit_type = coding.get("code")
                    if admit_type:
                        break
                if not admit_type:
                    admit_type = at_code.get("text")

        # ------ LOS (computed) ------
        los = None
        if admission_date and discharge_date:
            los = (discharge_date - admission_date).days

        # ------ Provider NPI from careTeam ------
        provider_npi = None
        for ct in resource.get("careTeam", []):
            provider_ref = ct.get("provider", {})
            for ident in provider_ref.get("identifier", []):
                if "npi" in ident.get("system", "").lower():
                    provider_npi = ident.get("value")
                    break
            if provider_npi:
                break

        # ------ Billing TIN / NPI from provider reference ------
        billing_tin = None
        billing_npi = None
        provider_block = resource.get("provider", {})
        for ident in provider_block.get("identifier", []):
            sys = ident.get("system", "").lower()
            id_type = ident.get("type", {})
            type_text = ""
            for coding in id_type.get("coding", []):
                type_text = coding.get("code", "").lower()
                break
            val = ident.get("value", "")
            if "npi" in sys or "2.16.840.1.113883.4.6" in sys:
                billing_npi = val
            elif "tax" in sys or "tax" in type_text or "tin" in sys or "ein" in sys:
                billing_tin = val
        # Fallback: use careTeam NPI as billing NPI
        if not billing_npi and provider_npi:
            billing_npi = provider_npi

        # ------ Facility ------
        facility_name = None
        facility_npi = None
        facility_block = resource.get("facility", {})
        if facility_block:
            facility_name = facility_block.get("display")
            # Check identifier
            fac_ident = facility_block.get("identifier", {})
            if isinstance(fac_ident, dict):
                facility_npi = fac_ident.get("value")
            elif isinstance(fac_ident, list):
                for fi in fac_ident:
                    if "npi" in fi.get("system", "").lower():
                        facility_npi = fi.get("value")
                        break
            # Check extension or reference
            if not facility_name:
                ref = facility_block.get("reference", "")
                if ref:
                    facility_name = ref.split("/")[-1] if "/" in ref else ref

        # ------ Financial: extract from CARIN Blue Button adjudication ------
        paid_amount = None
        allowed_amount = None
        billed_amount = None
        member_liability = None

        # Top-level total (CARIN BB uses total array)
        for total in resource.get("total", []):
            category_code = self._get_adjudication_category(total.get("category", {}))
            amount = total.get("amount", {}).get("value")
            if category_code in ("benefit", "paidtoprovider", "paidtopatient"):
                paid_amount = amount
            elif category_code in ("submitted", "billedamount"):
                billed_amount = amount
            elif category_code in ("eligible", "allowed"):
                allowed_amount = amount
            elif category_code in ("deductible", "copay", "coinsurance"):
                if member_liability is None:
                    member_liability = amount
                else:
                    member_liability += amount

        # ------ Item-level extraction ------
        procedure_code = None
        ndc_code = None
        drug_name = None
        pos_code = None
        quantity = None
        days_supply = None
        revenue_code = None
        modifier_1 = None
        modifier_2 = None

        for item in resource.get("item", []):
            # Item-level adjudication fallback for financials
            if paid_amount is None:
                for adj in item.get("adjudication", []):
                    cat = self._get_adjudication_category(adj.get("category", {}))
                    amt = adj.get("amount", {}).get("value")
                    if cat in ("benefit", "paidtoprovider", "paidtopatient") and amt is not None:
                        paid_amount = (paid_amount or 0) + amt
                    elif cat in ("submitted",) and amt is not None:
                        billed_amount = (billed_amount or 0) + amt
                    elif cat in ("eligible",) and amt is not None:
                        allowed_amount = (allowed_amount or 0) + amt

            # CPT/HCPCS / NDC from productOrService
            prod_or_svc = item.get("productOrService", {})
            for coding in prod_or_svc.get("coding", []):
                system = coding.get("system", "")
                if "cpt" in system.lower() or "hcpcs" in system.lower():
                    if not procedure_code:
                        procedure_code = coding.get("code")
                elif "ndc" in system.lower():
                    if not ndc_code:
                        ndc_code = coding.get("code")
                        drug_name = drug_name or coding.get("display")

            # Place of service
            loc_cc = item.get("locationCodeableConcept", {})
            if not pos_code:
                for coding in loc_cc.get("coding", []):
                    pos_code = coding.get("code")
                    if pos_code:
                        break

            # Quantity
            qty_block = item.get("quantity", {})
            if qty_block.get("value") is not None:
                item_qty = qty_block.get("value")
                if claim_type == "pharmacy" and days_supply is None:
                    days_supply = int(item_qty) if item_qty else None
                elif quantity is None:
                    quantity = float(item_qty) if item_qty is not None else None

            # Revenue code
            rev_block = item.get("revenue", {})
            if not revenue_code:
                for coding in rev_block.get("coding", []):
                    revenue_code = coding.get("code")
                    if revenue_code:
                        break

            # Modifiers
            for mod in item.get("modifier", []):
                for coding in mod.get("coding", []):
                    mod_code = coding.get("code")
                    if mod_code:
                        if modifier_1 is None:
                            modifier_1 = mod_code
                        elif modifier_2 is None:
                            modifier_2 = mod_code
                        break

        # Service category from claim type
        service_category = claim_type
        if claim_type == "institutional":
            service_category = "inpatient"

        # ------ Claim status ------
        status = resource.get("status")  # active, cancelled, draft, entered-in-error
        outcome = resource.get("outcome")  # queued, complete, error, partial

        return {
            "member_id": member_id,
            "claim_id": claim_id,
            "claim_type": claim_type,
            "service_date": service_date,
            "paid_date": paid_date,
            "diagnosis_codes": diagnosis_codes or None,
            "procedure_code": procedure_code,
            "drg_code": drg_code,
            "ndc_code": ndc_code,
            "drug_name": drug_name,
            "provider_npi": provider_npi,
            "billing_tin": billing_tin,
            "billing_npi": billing_npi,
            "facility_name": facility_name,
            "facility_npi": facility_npi,
            "paid_amount": paid_amount,
            "allowed_amount": allowed_amount,
            "billed_amount": billed_amount,
            "member_liability": member_liability,
            "service_category": service_category,
            "pos_code": pos_code,
            "quantity": quantity,
            "days_supply": days_supply,
            "los": los,
            "status": status,
            "payer": "humana",
            # Extra fields -> stored in Claim.extra JSONB
            "extra": {
                "revenue_code": revenue_code,
                "modifier_1": modifier_1,
                "modifier_2": modifier_2,
                "admission_date": admission_date.isoformat() if admission_date else None,
                "discharge_date": discharge_date.isoformat() if discharge_date else None,
                "discharge_status": discharge_status,
                "admit_type": admit_type,
                "service_end_date": service_end_date.isoformat() if service_end_date else None,
                "outcome": outcome,
            },
        }

    def _parse_condition(self, resource: dict) -> dict | None:
        """Map FHIR Condition to ICD-10 diagnosis dict.

        Extracts ALL available data points:
        - ICD-10-CM codes (ignores SNOMED/ICD-9)
        - Clinical status (active, recurrence, remission, resolved)
        - Verification status (confirmed, provisional, differential)
        - Category (encounter-diagnosis, problem-list-item)
        - Severity
        - Onset date + abatement date
        """
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        # Extract ICD-10-CM codes ONLY
        icd_codes: list[str] = []
        code_block = resource.get("code", {})
        code_display = code_block.get("text")
        for coding in code_block.get("coding", []):
            system = coding.get("system", "")
            # Strict match: only ICD-10-CM
            if system == "http://hl7.org/fhir/sid/icd-10-cm":
                code_val = coding.get("code")
                if code_val and code_val not in icd_codes:
                    icd_codes.append(code_val)
                if not code_display:
                    code_display = coding.get("display")

        if not icd_codes:
            return None

        # Onset date
        onset_str = resource.get("onsetDateTime") or resource.get("recordedDate")
        onset_date = None
        if onset_str:
            try:
                onset_date = date.fromisoformat(onset_str[:10])
            except ValueError:
                pass

        # ------ Abatement date (when condition resolved) ------
        abatement_str = resource.get("abatementDateTime")
        abatement_date = None
        if abatement_str:
            try:
                abatement_date = date.fromisoformat(abatement_str[:10])
            except ValueError:
                pass

        # ------ Clinical status ------
        clinical_status = None
        cs_block = resource.get("clinicalStatus", {})
        for coding in cs_block.get("coding", []):
            clinical_status = coding.get("code")
            if clinical_status:
                break

        # ------ Verification status ------
        verification_status = None
        vs_block = resource.get("verificationStatus", {})
        for coding in vs_block.get("coding", []):
            verification_status = coding.get("code")
            if verification_status:
                break

        # ------ Category (encounter-diagnosis, problem-list-item) ------
        category = None
        for cat in resource.get("category", []):
            for coding in cat.get("coding", []):
                category = coding.get("code")
                if category:
                    break
            if category:
                break

        # ------ Severity ------
        severity = None
        sev_block = resource.get("severity", {})
        severity = sev_block.get("text")
        if not severity:
            for coding in sev_block.get("coding", []):
                severity = coding.get("display") or coding.get("code")
                if severity:
                    break

        return {
            "member_id": member_id,
            "icd_codes": icd_codes,
            "onset_date": onset_date or date.today(),
            "clinical_status": clinical_status,
            # Extra fields -> stored in Claim.extra JSONB (conditions become signal claims)
            "extra": {
                "code_display": code_display,
                "abatement_date": abatement_date.isoformat() if abatement_date else None,
                "verification_status": verification_status,
                "category": category,
                "severity": severity,
            },
        }

    def _parse_practitioner(self, resource: dict) -> dict | None:
        """Map FHIR Practitioner to Provider dict.

        Extracts ALL available data points:
        - NPI and other identifiers
        - Name, specialty
        - Telecom (phone, fax, email)
        - Address (practice address)
        - Active status
        - Qualification details
        """
        # NPI from identifiers
        npi = None
        tin = None
        for ident in resource.get("identifier", []):
            system = ident.get("system", "")
            if "npi" in system.lower() or "2.16.840.1.113883.4.6" in system:
                npi = ident.get("value")
            elif "tax" in system.lower() or "tin" in system.lower() or "ein" in system.lower():
                tin = ident.get("value")

        if not npi:
            return None

        # Name
        first_name = ""
        last_name = ""
        names = resource.get("name", [])
        if names:
            name_obj = names[0]
            first_name = " ".join(name_obj.get("given", []))
            last_name = name_obj.get("family", "")

        # ------ Telecom (phone, fax, email) ------
        phone = None
        fax = None
        email = None
        for telecom in resource.get("telecom", []):
            sys = telecom.get("system", "")
            val = telecom.get("value", "")
            if sys == "phone" and not phone:
                phone = val
            elif sys == "fax" and not fax:
                fax = val
            elif sys == "email" and not email:
                email = val

        # ------ Address ------
        practice_address = None
        practice_city = None
        practice_state = None
        practice_zip = None
        for addr in resource.get("address", []):
            lines = addr.get("line", [])
            practice_address = ", ".join(lines) if lines else None
            practice_city = addr.get("city")
            practice_state = addr.get("state")
            practice_zip = addr.get("postalCode")
            if practice_zip:
                break

        # ------ Active status ------
        active = resource.get("active")

        # ------ Specialty from qualification ------
        specialty = None
        qualifications: list[dict] = []
        for qual in resource.get("qualification", []):
            code_block = qual.get("code", {})
            qual_text = code_block.get("text")
            qual_code = None
            qual_display = None
            codings = code_block.get("coding", [])
            if codings:
                qual_code = codings[0].get("code")
                qual_display = codings[0].get("display")
            if not specialty:
                specialty = qual_text or qual_display
            # Collect all qualifications
            if qual_text or qual_code:
                qualifications.append({
                    "code": qual_code,
                    "display": qual_display,
                    "text": qual_text,
                    "issuer": qual.get("issuer", {}).get("display"),
                    "period_start": qual.get("period", {}).get("start"),
                    "period_end": qual.get("period", {}).get("end"),
                })

        # Build full practice name from address if available
        practice_name = None
        if practice_city and practice_state:
            practice_name = f"{practice_city}, {practice_state}"

        return {
            "npi": npi,
            "first_name": first_name,
            "last_name": last_name,
            "specialty": specialty,
            "tin": tin,
            "practice_name": practice_name,
            # Extra fields -> stored in Provider.extra JSONB
            "extra": {
                "phone": phone,
                "fax": fax,
                "email": email,
                "practice_address": practice_address,
                "practice_city": practice_city,
                "practice_state": practice_state,
                "practice_zip": practice_zip,
                "active": active,
                "qualifications": qualifications if qualifications else None,
            },
        }

    def _parse_medication_request(self, resource: dict) -> dict | None:
        """Map FHIR MedicationRequest to medication dict.

        Extracts ALL available data points:
        - Drug name, NDC code
        - Dosage instructions
        - Prescriber NPI (from requester reference)
        - Pharmacy (from dispenseRequest.performer)
        - Refill count, days supply
        - DAW code (from substitution)
        - Status (active, completed, cancelled)
        """
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        drug_name = None
        ndc_code = None
        med_concept = resource.get("medicationCodeableConcept", {})
        if med_concept:
            drug_name = med_concept.get("text")
            for coding in med_concept.get("coding", []):
                system = coding.get("system", "")
                if "ndc" in system.lower():
                    ndc_code = coding.get("code")
                if not drug_name:
                    drug_name = coding.get("display") or coding.get("code")

        authored_str = resource.get("authoredOn")
        service_date = None
        if authored_str:
            try:
                service_date = date.fromisoformat(authored_str[:10])
            except ValueError:
                pass

        # ------ Dosage instructions ------
        dosage_text = None
        dosage_instructions = resource.get("dosageInstruction", [])
        if dosage_instructions:
            dosage_text = dosage_instructions[0].get("text")
            if not dosage_text:
                # Build from structured dosage
                parts = []
                dose = dosage_instructions[0].get("doseAndRate", [{}])
                if dose:
                    dose_qty = dose[0].get("doseQuantity", {})
                    if dose_qty.get("value"):
                        parts.append(f"{dose_qty['value']} {dose_qty.get('unit', '')}")
                timing = dosage_instructions[0].get("timing", {})
                repeat = timing.get("repeat", {})
                if repeat.get("frequency") and repeat.get("period"):
                    parts.append(
                        f"{repeat['frequency']}x per {repeat['period']} {repeat.get('periodUnit', '')}"
                    )
                if parts:
                    dosage_text = " ".join(parts).strip()

        # ------ Prescriber NPI ------
        prescriber_npi = None
        requester = resource.get("requester", {})
        if requester:
            # Check identifier directly
            req_ident = requester.get("identifier", {})
            if isinstance(req_ident, dict) and "npi" in req_ident.get("system", "").lower():
                prescriber_npi = req_ident.get("value")
            # Check reference
            if not prescriber_npi:
                ref = requester.get("reference", "")
                if "Practitioner/" in ref:
                    prescriber_npi = ref.split("Practitioner/")[-1]

        # ------ Dispense request details ------
        refill_count = None
        days_supply = None
        pharmacy = None
        dispense_req = resource.get("dispenseRequest", {})
        if dispense_req:
            refill_count = dispense_req.get("numberOfRepeatsAllowed")
            # Days supply from expectedSupplyDuration
            duration = dispense_req.get("expectedSupplyDuration", {})
            if duration.get("value"):
                days_supply = int(duration["value"])
            # Pharmacy
            performer = dispense_req.get("performer", {})
            if performer:
                pharmacy = performer.get("display")
                if not pharmacy:
                    ref = performer.get("reference", "")
                    if ref:
                        pharmacy = ref.split("/")[-1] if "/" in ref else ref

        # ------ DAW code (from substitution) ------
        daw_code = None
        substitution = resource.get("substitution", {})
        if substitution:
            allowed = substitution.get("allowedBoolean")
            if allowed is not None:
                daw_code = "0" if allowed else "1"  # 0=substitution allowed, 1=not
            reason = substitution.get("reason", {})
            for coding in reason.get("coding", []):
                daw_code = coding.get("code") or daw_code
                break

        # ------ Status ------
        status = resource.get("status")  # active, on-hold, cancelled, completed, etc.

        return {
            "member_id": member_id,
            "drug_name": drug_name,
            "ndc_code": ndc_code,
            "service_date": service_date or date.today(),
            "days_supply": days_supply,
            "status": status,
            # Extra fields -> stored in Claim.extra JSONB
            "extra": {
                "dosage_instructions": dosage_text,
                "prescriber_npi": prescriber_npi,
                "pharmacy": pharmacy,
                "refill_count": refill_count,
                "daw_code": daw_code,
            },
        }

    def _parse_observation(self, resource: dict) -> dict | None:
        """Map FHIR Observation to lab result / vital sign dict.

        Extracts ALL available data points:
        - Test code (LOINC), test name
        - Result value (numeric or string), units
        - Reference range, abnormal flag
        - Date, status, ordering provider
        """
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        # ------ Test code (LOINC) and name ------
        test_code = None
        test_name = None
        code_block = resource.get("code", {})
        test_name = code_block.get("text")
        for coding in code_block.get("coding", []):
            system = coding.get("system", "")
            if "loinc" in system.lower():
                test_code = coding.get("code")
                if not test_name:
                    test_name = coding.get("display")
            elif not test_code:
                test_code = coding.get("code")
                if not test_name:
                    test_name = coding.get("display")

        if not test_code and not test_name:
            return None

        # ------ Result value ------
        result_value = None
        result_units = None
        result_string = None

        # valueQuantity (numeric results)
        val_qty = resource.get("valueQuantity", {})
        if val_qty.get("value") is not None:
            result_value = val_qty["value"]
            result_units = val_qty.get("unit") or val_qty.get("code")

        # valueString (text results)
        if result_value is None:
            result_string = resource.get("valueString")

        # valueCodeableConcept (coded results like pos/neg)
        if result_value is None and result_string is None:
            val_cc = resource.get("valueCodeableConcept", {})
            result_string = val_cc.get("text")
            if not result_string:
                for coding in val_cc.get("coding", []):
                    result_string = coding.get("display") or coding.get("code")
                    if result_string:
                        break

        # ------ Reference range ------
        reference_range_low = None
        reference_range_high = None
        reference_range_text = None
        ref_ranges = resource.get("referenceRange", [])
        if ref_ranges:
            rr = ref_ranges[0]
            reference_range_text = rr.get("text")
            low = rr.get("low", {})
            high = rr.get("high", {})
            if low.get("value") is not None:
                reference_range_low = low["value"]
            if high.get("value") is not None:
                reference_range_high = high["value"]

        # ------ Abnormal flag (interpretation) ------
        abnormal_flag = None
        for interp in resource.get("interpretation", []):
            for coding in interp.get("coding", []):
                abnormal_flag = coding.get("code")
                if abnormal_flag:
                    break
            if abnormal_flag:
                break

        # ------ Date ------
        obs_date = None
        date_str = resource.get("effectiveDateTime") or resource.get("issued")
        if date_str:
            try:
                obs_date = date.fromisoformat(date_str[:10])
            except ValueError:
                pass

        # ------ Status ------
        status = resource.get("status")  # registered, preliminary, final, amended

        # ------ Ordering provider ------
        ordering_provider = None
        for performer in resource.get("performer", []):
            ref = performer.get("reference", "")
            if "Practitioner" in ref:
                ordering_provider = ref.split("/")[-1] if "/" in ref else ref
                break
            if not ordering_provider:
                ordering_provider = performer.get("display")

        # ------ Category (laboratory, vital-signs, etc.) ------
        obs_category = None
        for cat in resource.get("category", []):
            for coding in cat.get("coding", []):
                obs_category = coding.get("code")
                if obs_category:
                    break
            if obs_category:
                break

        return {
            "member_id": member_id,
            "observation_date": obs_date or date.today(),
            "test_code": test_code,
            "test_name": test_name,
            "result_value": result_value,
            "result_string": result_string,
            "result_units": result_units,
            "abnormal_flag": abnormal_flag,
            "status": status,
            "category": obs_category,
            "extra": {
                "reference_range_low": reference_range_low,
                "reference_range_high": reference_range_high,
                "reference_range_text": reference_range_text,
                "ordering_provider": ordering_provider,
            },
        }

    # -------------------------------------------------------------------
    # Shared helpers
    # -------------------------------------------------------------------

    def _extract_member_ref(self, resource: dict) -> str | None:
        """Extract member/patient ID from various FHIR reference patterns."""
        # Try patient reference (most resources)
        patient_ref = resource.get("patient", resource.get("subject", resource.get("beneficiary", {})))
        if isinstance(patient_ref, dict):
            ref = patient_ref.get("reference", "")
            if "/" in ref:
                return ref.split("/")[-1]
            # Try identifier inside reference
            ident = patient_ref.get("identifier", {})
            if ident.get("value"):
                return ident["value"]
        return None

    def _extract_coverage_type(self, resource: dict) -> str | None:
        """Extract the coverage type string from a Coverage resource."""
        type_block = resource.get("type", {})
        for coding in type_block.get("coding", []):
            display = coding.get("display", "")
            if display:
                return display
            code = coding.get("code", "")
            if code:
                return code

        # Try class array
        for cls in resource.get("class", []):
            cls_type = cls.get("type", {}).get("coding", [{}])[0].get("code", "")
            if cls_type == "plan":
                return cls.get("value") or cls.get("name")

        return None

    def _get_adjudication_category(self, category: dict) -> str:
        """Extract the adjudication category code from a CodeableConcept."""
        for coding in category.get("coding", []):
            code = coding.get("code", "")
            if code:
                return code.lower()
        return ""

    def _extract_extension_text_or_coding(self, extension: dict) -> str | None:
        """Extract text or display from a US Core extension (race/ethnicity).

        US Core race/ethnicity extensions have nested sub-extensions:
        - ombCategory (coded value)
        - text (human-readable string)
        """
        # First check for a text sub-extension
        for sub_ext in extension.get("extension", []):
            if sub_ext.get("url") == "text":
                return sub_ext.get("valueString")

        # Fall back to ombCategory coding display
        for sub_ext in extension.get("extension", []):
            if sub_ext.get("url") == "ombCategory":
                coding = sub_ext.get("valueCoding", {})
                return coding.get("display") or coding.get("code")

        # Direct valueString or valueCoding on the extension itself
        if extension.get("valueString"):
            return extension["valueString"]
        val_coding = extension.get("valueCoding", {})
        return val_coding.get("display") or val_coding.get("code")
