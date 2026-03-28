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
"""

import asyncio
import base64
import logging
from datetime import date, datetime
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
    "patient/ExplanationOfBenefit.read patient/Condition.read"
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
        return [self._parse_practitioner(r) for r in raw_resources if self._parse_practitioner(r)]

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
    # FHIR resource parsers — Humana-specific mapping
    # -------------------------------------------------------------------

    def _parse_patient(self, resource: dict) -> dict:
        """Map FHIR Patient to platform Member dict."""
        fhir_id = resource.get("id", "")

        # Extract member ID from identifiers
        member_id = fhir_id
        for ident in resource.get("identifier", []):
            system = ident.get("system", "")
            if "mbi" in system.lower() or "member" in system.lower():
                member_id = ident.get("value", fhir_id)
                break

        # Name
        first_name = ""
        last_name = ""
        names = resource.get("name", [])
        if names:
            name_obj = names[0]
            first_name = " ".join(name_obj.get("given", []))
            last_name = name_obj.get("family", "")

        # Demographics
        birth_date_str = resource.get("birthDate")
        birth_date = date.fromisoformat(birth_date_str) if birth_date_str else None

        gender_raw = resource.get("gender", "")
        gender = gender_raw[0].upper() if gender_raw else "U"

        # Address / zip
        zip_code = None
        for addr in resource.get("address", []):
            zip_code = addr.get("postalCode")
            if zip_code:
                break

        return {
            "member_id": member_id,
            "first_name": first_name,
            "last_name": last_name,
            "date_of_birth": birth_date,
            "gender": gender,
            "zip_code": zip_code,
            "fhir_id": fhir_id,
        }

    def _parse_coverage(self, resource: dict) -> dict | None:
        """Map FHIR Coverage to eligibility fields.

        Filters out dental, vision, and HIP plans -- keeps only MA plan types.
        """
        # Filter: skip non-MA coverage types
        coverage_type = self._extract_coverage_type(resource)
        ma_types = {"ma", "mapd", "medicare advantage", "hmo", "ppo", "snp", "pffs"}
        if coverage_type and coverage_type.lower() not in ma_types:
            # Check if it looks like dental/vision/HIP
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

        # Plan name from class array
        health_plan = None
        plan_product = coverage_type
        for cls in resource.get("class", []):
            cls_type = cls.get("type", {}).get("coding", [{}])[0].get("code", "")
            if cls_type == "plan":
                health_plan = cls.get("name") or cls.get("value")
            elif cls_type == "group":
                if not health_plan:
                    health_plan = cls.get("name") or cls.get("value")

        # Fallback: payor display
        if not health_plan:
            payors = resource.get("payor", [])
            if payors:
                health_plan = payors[0].get("display", "Humana")

        return {
            "member_id": member_id,
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
            "health_plan": health_plan or "Humana",
            "plan_product": plan_product,
            "status": resource.get("status"),
        }

    def _parse_eob(self, resource: dict) -> dict | None:
        """Map FHIR ExplanationOfBenefit (CARIN Blue Button) to Claim dict.

        Handles Humana's CARIN BB adjudication structure where the
        adjudication category uses "benefit" and amounts are nested
        differently than standard FHIR.
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
        if billable.get("start"):
            try:
                service_date = date.fromisoformat(billable["start"][:10])
            except ValueError:
                pass
        if not service_date:
            service_date = date.today()

        # Diagnosis codes — ICD-10 only
        diagnosis_codes: list[str] = []
        for diag in resource.get("diagnosis", []):
            diag_cc = diag.get("diagnosisCodeableConcept", {})
            for coding in diag_cc.get("coding", []):
                system = coding.get("system", "")
                if "icd-10" in system.lower() or system == "http://hl7.org/fhir/sid/icd-10-cm":
                    code_val = coding.get("code")
                    if code_val and code_val not in diagnosis_codes:
                        diagnosis_codes.append(code_val)

        # Provider NPI from careTeam
        provider_npi = None
        for ct in resource.get("careTeam", []):
            provider_ref = ct.get("provider", {})
            for ident in provider_ref.get("identifier", []):
                if "npi" in ident.get("system", "").lower():
                    provider_npi = ident.get("value")
                    break
            if provider_npi:
                break

        # Financial: extract from CARIN Blue Button adjudication
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

        # Item-level adjudication fallback
        if paid_amount is None:
            for item in resource.get("item", []):
                for adj in item.get("adjudication", []):
                    cat = self._get_adjudication_category(adj.get("category", {}))
                    amt = adj.get("amount", {}).get("value")
                    if cat in ("benefit", "paidtoprovider", "paidtopatient") and amt is not None:
                        paid_amount = (paid_amount or 0) + amt
                    elif cat in ("submitted",) and amt is not None:
                        billed_amount = (billed_amount or 0) + amt
                    elif cat in ("eligible",) and amt is not None:
                        allowed_amount = (allowed_amount or 0) + amt

        # Procedure code from item
        procedure_code = None
        ndc_code = None
        drug_name = None
        for item in resource.get("item", []):
            # CPT/HCPCS
            prod_or_svc = item.get("productOrService", {})
            for coding in prod_or_svc.get("coding", []):
                system = coding.get("system", "")
                if "cpt" in system.lower() or "hcpcs" in system.lower():
                    procedure_code = coding.get("code")
                elif "ndc" in system.lower():
                    ndc_code = coding.get("code")
                    drug_name = coding.get("display")
            if procedure_code:
                break

        # Service category from claim type
        service_category = claim_type
        if claim_type == "institutional":
            service_category = "inpatient"

        return {
            "member_id": member_id,
            "claim_id": claim_id,
            "claim_type": claim_type,
            "service_date": service_date,
            "diagnosis_codes": diagnosis_codes or None,
            "procedure_code": procedure_code,
            "ndc_code": ndc_code,
            "drug_name": drug_name,
            "provider_npi": provider_npi,
            "paid_amount": paid_amount,
            "allowed_amount": allowed_amount,
            "billed_amount": billed_amount,
            "member_liability": member_liability,
            "service_category": service_category,
            "payer": "humana",
        }

    def _parse_condition(self, resource: dict) -> dict | None:
        """Map FHIR Condition to ICD-10 diagnosis dict.

        ONLY extracts ICD-10-CM codes. Ignores SNOMED CT and ICD-9.
        """
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        # Extract ICD-10-CM codes ONLY
        icd_codes: list[str] = []
        code_block = resource.get("code", {})
        for coding in code_block.get("coding", []):
            system = coding.get("system", "")
            # Strict match: only ICD-10-CM
            if system == "http://hl7.org/fhir/sid/icd-10-cm":
                code_val = coding.get("code")
                if code_val and code_val not in icd_codes:
                    icd_codes.append(code_val)

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

        return {
            "member_id": member_id,
            "icd_codes": icd_codes,
            "onset_date": onset_date or date.today(),
            "clinical_status": resource.get("clinicalStatus", {}).get("coding", [{}])[0].get("code"),
        }

    def _parse_practitioner(self, resource: dict) -> dict | None:
        """Map FHIR Practitioner to Provider dict."""
        # NPI from identifiers
        npi = None
        for ident in resource.get("identifier", []):
            system = ident.get("system", "")
            if "npi" in system.lower() or "2.16.840.1.113883.4.6" in system:
                npi = ident.get("value")
                break

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

        # Specialty from qualification
        specialty = None
        for qual in resource.get("qualification", []):
            code_block = qual.get("code", {})
            specialty = code_block.get("text")
            if not specialty:
                codings = code_block.get("coding", [])
                if codings:
                    specialty = codings[0].get("display")
            if specialty:
                break

        return {
            "npi": npi,
            "first_name": first_name,
            "last_name": last_name,
            "specialty": specialty,
        }

    def _parse_medication_request(self, resource: dict) -> dict | None:
        """Map FHIR MedicationRequest to medication dict."""
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

        return {
            "member_id": member_id,
            "drug_name": drug_name,
            "ndc_code": ndc_code,
            "service_date": service_date or date.today(),
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
