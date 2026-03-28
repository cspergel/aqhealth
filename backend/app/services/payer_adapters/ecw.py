"""
eClinicalWorks (eCW) FHIR R4 Adapter.

Implements SMART on FHIR OAuth 2.0 and FHIR R4 data retrieval against
eClinicalWorks EHR instances (US Core 3.1.1 / 6.1.0).

Key differences from payer adapters (e.g., Humana):
- eCW is an EHR (provider view), not a payer — data is clinical, not claims-based
- No ExplanationOfBenefit — no claims data (claims come from the payer side)
- HAS Encounter resource (visit data with diagnoses, dates, providers)
- HAS real problem list via Condition with category=problem-list-item
- Condition has BOTH encounter-diagnosis and problem-list-item categories
- Practice code is per-practice embedded in the FHIR base URL path
- MRN (Medical Record Number) is the primary patient identifier (not MBI)
- DocumentReference contains full clinical notes from the EHR chart
- Observation covers labs (LOINC), vitals, social history, SDOH

Data flow:  eCW FHIR API -> ecw adapter (parse) -> DB upsert
  - Problem list conditions -> HCC analysis (chronic conditions captured yearly)
  - Encounters -> signal-tier claims (visits, not billed)
  - Observations -> labs / vitals / social history
  - DocumentReference -> member extra JSONB (clinical notes)

Rate limit: 250 requests/minute per base URL. HTTP 429 blocks for remainder of minute.
"""

import asyncio
import base64
import hashlib
import logging
import secrets
import time
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx

from app.services.payer_api_service import PayerAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# eCW FHIR endpoints
# ---------------------------------------------------------------------------

_SANDBOX_HOST = "https://staging-fhir.ecwcloud.com"
_PRODUCTION_HOST = "https://fhir.ecwcloud.com"

# eCW token lifetime is only 300 seconds (5 minutes!), not the 3600s default.
# Refresh buffer must be small enough to not expire before the token is usable.
_DEFAULT_TOKEN_LIFETIME = 300  # 5 minutes
_REFRESH_BUFFER_SECONDS = 60  # refresh 60s before expiry

_SCOPES = (
    "launch launch/patient openid fhirUser offline_access "
    "patient/Patient.read patient/Condition.read patient/Encounter.read "
    "patient/Observation.read patient/MedicationRequest.read "
    "patient/DocumentReference.read patient/AllergyIntolerance.read "
    "patient/Immunization.read patient/Procedure.read "
    "patient/Coverage.read patient/CarePlan.read patient/CareTeam.read "
    "patient/Goal.read patient/Practitioner.read"
)

# Rate limiting: 250 requests/minute = ~4.17 req/sec
_RATE_LIMIT_PER_MINUTE = 250
_MIN_REQUEST_INTERVAL = 60.0 / _RATE_LIMIT_PER_MINUTE  # ~0.24s
_MAX_RETRIES = 3
_REQUEST_TIMEOUT = 30.0
_PAGE_SIZE = 50
_RATE_LIMIT_BACKOFF = 60.0  # eCW blocks for remainder of minute on 429


# ---------------------------------------------------------------------------
# Adapter implementation
# ---------------------------------------------------------------------------

class EcwAdapter(PayerAdapter):
    """eClinicalWorks FHIR R4 adapter (SMART on FHIR).

    Each instance targets a single eCW practice identified by ``practice_code``.
    The practice code is embedded in the FHIR base URL path:
        ``/fhir/r4/{practice_code}/*``

    Unlike payer adapters, eCW provides *clinical* data (EHR) not claims data.
    Encounters are stored as signal-tier claims; problem list Conditions are
    the highest-value data for HCC capture analysis.
    """

    def __init__(self) -> None:
        super().__init__()
        # Sliding-window rate limiter: track timestamps of recent requests
        self._request_timestamps: list[float] = []
        # PKCE state — eCW requires Proof Key for Code Exchange (S256)
        self._code_verifier: str | None = None
        self._code_challenge: str | None = None

    # -------------------------------------------------------------------
    # PKCE helpers — eCW requires S256 code challenge
    # -------------------------------------------------------------------

    def _generate_pkce(self) -> tuple[str, str]:
        """Generate PKCE code_verifier and code_challenge (S256).

        Returns (code_verifier, code_challenge).
        """
        code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
        challenge_bytes = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(challenge_bytes).decode().rstrip("=")
        self._code_verifier = code_verifier
        self._code_challenge = code_challenge
        return code_verifier, code_challenge

    @staticmethod
    def is_token_expired(issued_at: datetime, expires_in: int = _DEFAULT_TOKEN_LIFETIME) -> bool:
        """Check if an eCW token needs refresh.

        eCW tokens live only 300s (5 min). We refresh 60s before expiry
        to avoid mid-request failures, but NOT 300s (which would be the
        entire token lifetime).
        """
        expiry = issued_at + timedelta(seconds=expires_in)
        return datetime.utcnow() >= (expiry - timedelta(seconds=_REFRESH_BUFFER_SECONDS))

    # -------------------------------------------------------------------
    # SMART on FHIR endpoint discovery
    # -------------------------------------------------------------------

    async def _discover_endpoints(self, fhir_base: str) -> dict[str, str]:
        """Discover OAuth endpoints from SMART configuration or /metadata.

        Tries ``.well-known/smart-configuration`` first (preferred), then
        falls back to ``/metadata`` CapabilityStatement.

        Returns dict with ``authorize`` and ``token`` URLs.
        """
        # Try .well-known/smart-configuration first
        smart_url = f"{fhir_base}/.well-known/smart-configuration"
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            try:
                resp = await client.get(smart_url, headers={"Accept": "application/json"})
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        "authorize": data["authorization_endpoint"],
                        "token": data["token_endpoint"],
                    }
            except (httpx.HTTPError, KeyError):
                logger.debug("SMART config not found at %s, trying /metadata", smart_url)

            # Fallback: parse CapabilityStatement /metadata
            try:
                resp = await client.get(
                    f"{fhir_base}/metadata",
                    headers={"Accept": "application/fhir+json"},
                )
                resp.raise_for_status()
                cap = resp.json()
                # Navigate: rest[0].security.extension[oauth-uris]
                for rest in cap.get("rest", []):
                    security = rest.get("security", {})
                    for ext in security.get("extension", []):
                        if "oauth-uris" in ext.get("url", ""):
                            auth_url = None
                            token_url = None
                            for sub_ext in ext.get("extension", []):
                                if sub_ext.get("url") == "authorize":
                                    auth_url = sub_ext.get("valueUri")
                                elif sub_ext.get("url") == "token":
                                    token_url = sub_ext.get("valueUri")
                            if auth_url and token_url:
                                return {"authorize": auth_url, "token": token_url}
            except (httpx.HTTPError, KeyError) as e:
                logger.error("Failed to discover SMART endpoints from %s: %s", fhir_base, e)

        raise RuntimeError(
            f"Could not discover SMART on FHIR endpoints from {fhir_base}. "
            "Ensure the eCW server supports .well-known/smart-configuration or /metadata."
        )

    # -------------------------------------------------------------------
    # URL helpers
    # -------------------------------------------------------------------

    def _build_fhir_base(self, credentials_or_params: dict) -> str:
        """Build the FHIR base URL from practice_code and environment.

        URL pattern: ``{host}/fhir/r4/{practice_code}``
        """
        practice_code = credentials_or_params.get("practice_code", "")
        if not practice_code:
            raise ValueError("practice_code is required for eCW adapter")
        env = credentials_or_params.get("environment", "sandbox")
        host = _PRODUCTION_HOST if env == "production" else _SANDBOX_HOST
        return f"{host}/fhir/r4/{practice_code}"

    # -------------------------------------------------------------------
    # OAuth — SMART on FHIR
    # -------------------------------------------------------------------

    def get_scopes(self) -> str:
        return _SCOPES

    def get_authorization_url(self, credentials: dict) -> str:
        """Build the SMART on FHIR authorization URL for browser redirect.

        Requires ``practice_code``, ``client_id``, ``redirect_uri`` in credentials.
        Discovers the authorize endpoint dynamically at connection time; for the
        synchronous URL builder we require ``auth_url`` in credentials (discovered
        via _discover_endpoints or the .well-known/smart-configuration).

        NOTE: eCW OAuth server is SEPARATE from the FHIR server.
        - FHIR server: staging-fhir.ecwcloud.com / fhir.ecwcloud.com
        - OAuth server: staging-oauthserver.ecwcloud.com / oauthserver.ecwcloud.com
        The fallback ``{fhir_base}/oauth2/authorize`` is WRONG for eCW.
        Always discover via .well-known/smart-configuration first.
        """
        fhir_base = self._build_fhir_base(credentials)
        auth_url = credentials.get("auth_url")
        if not auth_url:
            logger.warning(
                "No auth_url provided for eCW — OAuth server is separate from FHIR server. "
                "Use _discover_endpoints() first. Falling back to pattern that may not work."
            )
            auth_url = f"{fhir_base}/oauth2/authorize"

        # Generate PKCE challenge — eCW requires S256
        code_verifier, code_challenge = self._generate_pkce()

        params = {
            "response_type": "code",
            "client_id": credentials["client_id"],
            "redirect_uri": credentials["redirect_uri"],
            "scope": _SCOPES,
            "state": credentials.get("state", ""),
            "aud": fhir_base,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{auth_url}?{urlencode(params)}"

    async def authenticate(self, credentials: dict) -> dict:
        """Exchange authorization code for tokens via SMART on FHIR token endpoint.

        Supports both Authorization Code and Client Credentials flows.

        PKCE: eCW requires the ``code_verifier`` in the token exchange.
        The verifier is stored on the adapter instance by ``get_authorization_url()``
        or can be passed explicitly in ``credentials["code_verifier"]``.
        """
        fhir_base = self._build_fhir_base(credentials)
        endpoints = await self._discover_endpoints(fhir_base)
        token_url = endpoints["token"]

        client_auth = base64.b64encode(
            f"{credentials['client_id']}:{credentials['client_secret']}".encode()
        ).decode()

        grant_type = credentials.get("grant_type", "authorization_code")

        if grant_type == "client_credentials":
            data: dict[str, str] = {
                "grant_type": "client_credentials",
                "scope": _SCOPES,
            }
        else:
            # PKCE: include code_verifier from instance state or credentials
            code_verifier = credentials.get("code_verifier") or self._code_verifier
            if not code_verifier:
                logger.warning(
                    "No PKCE code_verifier available for eCW token exchange. "
                    "eCW requires PKCE — this request may fail."
                )
            data = {
                "grant_type": "authorization_code",
                "code": credentials["code"],
                "redirect_uri": credentials["redirect_uri"],
            }
            if code_verifier:
                data["code_verifier"] = code_verifier

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.post(
                token_url,
                headers={
                    "Authorization": f"Basic {client_auth}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data=data,
            )
            response.raise_for_status()
            token_data = response.json()

        # eCW tokens expire in 300s (5 min), NOT the typical 3600s
        return {
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token", ""),
            "expires_in": token_data.get("expires_in", _DEFAULT_TOKEN_LIFETIME),
            "token_type": token_data.get("token_type", "Bearer"),
            "patient": token_data.get("patient", ""),
        }

    async def refresh_token(self, credentials: dict) -> dict:
        """Use refresh token to obtain a new access token."""
        fhir_base = self._build_fhir_base(credentials)
        endpoints = await self._discover_endpoints(fhir_base)
        token_url = endpoints["token"]

        client_auth = base64.b64encode(
            f"{credentials['client_id']}:{credentials['client_secret']}".encode()
        ).decode()

        data = {
            "grant_type": "refresh_token",
            "refresh_token": credentials["refresh_token"],
        }

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.post(
                token_url,
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
            "expires_in": token_data.get("expires_in", _DEFAULT_TOKEN_LIFETIME),
        }

    # -------------------------------------------------------------------
    # FHIR resource fetchers
    # -------------------------------------------------------------------

    async def fetch_patients(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Patient resources into platform-normalized dicts."""
        raw_resources = await self._fetch_all_pages(token, params, "/Patient")
        return [self._parse_patient(r) for r in raw_resources]

    async def fetch_claims(self, token: str, params: dict) -> list[dict]:
        """eCW is an EHR — no ExplanationOfBenefit resource.

        Returns empty list. Use ``fetch_encounters`` for visit-level data
        which gets stored as signal-tier claims.
        """
        return []

    async def fetch_conditions(self, token: str, params: dict) -> list[dict]:
        """Fetch Condition resources — both problem list and encounter diagnoses.

        Runs TWO queries:
        1. ``?category=problem-list-item`` — chronic conditions (key for HCC)
        2. ``?category=encounter-diagnosis`` — per-visit diagnoses

        Deduplicates by FHIR resource ID.
        """
        # Fetch both categories in parallel
        problem_list_task = self._fetch_all_pages(
            token, params, "/Condition",
            extra_params={"category": "problem-list-item"},
        )
        encounter_dx_task = self._fetch_all_pages(
            token, params, "/Condition",
            extra_params={"category": "encounter-diagnosis"},
        )
        problem_list, encounter_dx = await asyncio.gather(
            problem_list_task, encounter_dx_task
        )

        # Deduplicate by resource ID
        seen_ids: set[str] = set()
        all_conditions: list[dict] = []

        for r in problem_list:
            rid = r.get("id", "")
            if rid not in seen_ids:
                seen_ids.add(rid)
                parsed = self._parse_condition(r, source="problem-list")
                if parsed:
                    all_conditions.append(parsed)

        for r in encounter_dx:
            rid = r.get("id", "")
            if rid not in seen_ids:
                seen_ids.add(rid)
                parsed = self._parse_condition(r, source="encounter-diagnosis")
                if parsed:
                    all_conditions.append(parsed)

        logger.info(
            "eCW Conditions: %d problem-list, %d encounter-diagnosis, %d total",
            len(problem_list), len(encounter_dx), len(all_conditions),
        )
        return all_conditions

    async def fetch_encounters(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Encounter resources (visit data).

        eCW-specific: provides visit history that payer adapters lack.
        Encounters are stored as signal-tier claims (visit occurred, not yet billed).
        """
        raw_resources = await self._fetch_all_pages(token, params, "/Encounter")
        parsed = []
        for r in raw_resources:
            enc = self._parse_encounter(r)
            if enc:
                parsed.append(enc)
        return parsed

    async def fetch_observations(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Observation resources (labs, vitals, social history).

        Queries by category for better coverage:
        - laboratory: HbA1c, eGFR, lipid panels (LOINC)
        - vital-signs: BP, BMI, weight
        - social-history: smoking status, SDOH
        """
        # Fetch all categories in parallel
        lab_task = self._fetch_all_pages(
            token, params, "/Observation",
            extra_params={"category": "laboratory"},
        )
        vitals_task = self._fetch_all_pages(
            token, params, "/Observation",
            extra_params={"category": "vital-signs"},
        )
        social_task = self._fetch_all_pages(
            token, params, "/Observation",
            extra_params={"category": "social-history"},
        )
        labs, vitals, social = await asyncio.gather(lab_task, vitals_task, social_task)

        # Deduplicate
        seen_ids: set[str] = set()
        all_obs: list[dict] = []
        for category_label, resources in [
            ("laboratory", labs),
            ("vital-signs", vitals),
            ("social-history", social),
        ]:
            for r in resources:
                rid = r.get("id", "")
                if rid not in seen_ids:
                    seen_ids.add(rid)
                    obs = self._parse_observation(r, category_hint=category_label)
                    if obs:
                        all_obs.append(obs)

        return all_obs

    async def fetch_medications(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse MedicationRequest resources (active prescriptions)."""
        raw_resources = await self._fetch_all_pages(token, params, "/MedicationRequest")
        parsed = []
        for r in raw_resources:
            med = self._parse_medication_request(r)
            if med:
                parsed.append(med)
        return parsed

    async def fetch_providers(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Practitioner resources."""
        raw_resources = await self._fetch_all_pages(token, params, "/Practitioner")
        parsed = []
        for r in raw_resources:
            prov = self._parse_practitioner(r)
            if prov:
                parsed.append(prov)
        return parsed

    async def fetch_coverage(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Coverage resources (insurance info from the EHR)."""
        raw_resources = await self._fetch_all_pages(token, params, "/Coverage")
        parsed = []
        for r in raw_resources:
            cov = self._parse_coverage(r)
            if cov:
                parsed.append(cov)
        return parsed

    async def fetch_document_references(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse DocumentReference resources (clinical notes, lab reports)."""
        raw_resources = await self._fetch_all_pages(token, params, "/DocumentReference")
        parsed = []
        for r in raw_resources:
            doc = self._parse_document_reference(r)
            if doc:
                parsed.append(doc)
        return parsed

    async def fetch_care_plans(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse CarePlan resources."""
        raw_resources = await self._fetch_all_pages(token, params, "/CarePlan")
        parsed = []
        for r in raw_resources:
            plan = self._parse_care_plan(r)
            if plan:
                parsed.append(plan)
        return parsed

    async def fetch_care_teams(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse CareTeam resources."""
        raw_resources = await self._fetch_all_pages(token, params, "/CareTeam")
        parsed = []
        for r in raw_resources:
            team = self._parse_care_team(r)
            if team:
                parsed.append(team)
        return parsed

    async def fetch_allergy_intolerances(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse AllergyIntolerance resources."""
        raw_resources = await self._fetch_all_pages(token, params, "/AllergyIntolerance")
        parsed = []
        for r in raw_resources:
            allergy = self._parse_allergy_intolerance(r)
            if allergy:
                parsed.append(allergy)
        return parsed

    async def fetch_immunizations(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Immunization resources."""
        raw_resources = await self._fetch_all_pages(token, params, "/Immunization")
        parsed = []
        for r in raw_resources:
            imm = self._parse_immunization(r)
            if imm:
                parsed.append(imm)
        return parsed

    async def fetch_procedures(self, token: str, params: dict) -> list[dict]:
        """Fetch and parse Procedure resources."""
        raw_resources = await self._fetch_all_pages(token, params, "/Procedure")
        parsed = []
        for r in raw_resources:
            proc = self._parse_procedure(r)
            if proc:
                parsed.append(proc)
        return parsed

    # -------------------------------------------------------------------
    # Paginated FHIR fetch with rate limiting (250/min) + retry
    # -------------------------------------------------------------------

    async def _enforce_rate_limit(self) -> None:
        """Sliding-window rate limiter: max 250 requests per 60 seconds.

        Waits if we would exceed the limit. Also enforces a minimum interval
        between individual requests.
        """
        now = time.monotonic()

        # Prune timestamps older than 60 seconds
        cutoff = now - 60.0
        self._request_timestamps = [
            ts for ts in self._request_timestamps if ts > cutoff
        ]

        if len(self._request_timestamps) >= _RATE_LIMIT_PER_MINUTE:
            # Wait until the oldest request in the window expires
            oldest = self._request_timestamps[0]
            wait = 60.0 - (now - oldest) + 0.1  # small buffer
            if wait > 0:
                logger.info("eCW rate limit: waiting %.1fs (at %d requests/min)", wait, len(self._request_timestamps))
                await asyncio.sleep(wait)

        # Also enforce minimum interval between requests
        if self._request_timestamps:
            elapsed = time.monotonic() - self._request_timestamps[-1]
            if elapsed < _MIN_REQUEST_INTERVAL:
                await asyncio.sleep(_MIN_REQUEST_INTERVAL - elapsed)

        self._request_timestamps.append(time.monotonic())

    async def _fetch_all_pages(
        self,
        token: str,
        params: dict,
        resource_path: str,
        extra_params: dict[str, str] | None = None,
    ) -> list[dict]:
        """Fetch all pages of a FHIR Bundle, following 'next' links.

        Implements:
        - _count pagination with Bundle.link "next" URLs
        - Sliding-window rate limit (250/min)
        - Retry with exponential backoff on 429 / 5xx
        - Practice-code-aware URL construction
        """
        fhir_base = self._build_fhir_base(params)
        headers = {
            "Accept": "application/fhir+json",
            "Authorization": f"Bearer {token}",
        }

        all_resources: list[dict] = []
        # Build first page URL
        query_params = {"_count": str(_PAGE_SIZE)}
        if extra_params:
            query_params.update(extra_params)
        query_string = "&".join(f"{k}={v}" for k, v in query_params.items())
        next_url: str | None = f"{fhir_base}{resource_path}?{query_string}"

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            while next_url:
                await self._enforce_rate_limit()

                response = await self._request_with_retry(client, next_url, headers)
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
            "Fetched %d %s resources from eCW (%s)",
            len(all_resources),
            resource_path.strip("/"),
            params.get("practice_code", "?"),
        )
        return all_resources

    async def _request_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict,
    ) -> httpx.Response | None:
        """Make an HTTP GET with retry logic and exponential backoff.

        On 429: eCW blocks for the remainder of the minute, so we back off
        for up to 60 seconds.
        """
        for attempt in range(_MAX_RETRIES):
            try:
                response = await client.get(url, headers=headers)

                if response.status_code == 200:
                    return response

                if response.status_code == 429:
                    # eCW blocks for remainder of minute
                    retry_after = int(
                        response.headers.get("Retry-After", _RATE_LIMIT_BACKOFF)
                    )
                    logger.warning(
                        "eCW 429 rate limit on %s, backing off %ds (attempt %d/%d)",
                        url, retry_after, attempt + 1, _MAX_RETRIES,
                    )
                    await asyncio.sleep(retry_after)
                    # Reset our sliding window since we were blocked
                    self._request_timestamps.clear()
                    continue

                if response.status_code >= 500:
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        "eCW %d on %s, retrying in %ds (attempt %d/%d)",
                        response.status_code, url, wait, attempt + 1, _MAX_RETRIES,
                    )
                    await asyncio.sleep(wait)
                    continue

                if response.status_code in (401, 403):
                    logger.error(
                        "eCW auth failure %d on %s: %s",
                        response.status_code, url, response.text[:500],
                    )
                    raise httpx.HTTPStatusError(
                        f"Authentication failed ({response.status_code})",
                        request=response.request,
                        response=response,
                    )

                # Other 4xx — don't retry
                logger.error(
                    "eCW %d on %s: %s",
                    response.status_code, url, response.text[:500],
                )
                return None

            except httpx.TimeoutException:
                wait = 2 ** (attempt + 1)
                logger.warning(
                    "eCW timeout on %s, retrying in %ds (attempt %d/%d)",
                    url, wait, attempt + 1, _MAX_RETRIES,
                )
                await asyncio.sleep(wait)
            except httpx.HTTPStatusError:
                raise  # Auth failures propagate immediately
            except httpx.HTTPError as e:
                logger.error("eCW HTTP error on %s: %s", url, e)
                return None

        logger.error("eCW request failed after %d retries: %s", _MAX_RETRIES, url)
        return None

    # -------------------------------------------------------------------
    # FHIR resource parsers — eCW-specific mapping
    # -------------------------------------------------------------------

    def _parse_patient(self, resource: dict) -> dict:
        """Map FHIR Patient to platform Member dict.

        eCW-specific: uses MRN (Medical Record Number) as primary identifier
        instead of MBI. MRN is stored in member.extra for cross-referencing
        with payer member_id.
        """
        fhir_id = resource.get("id", "")

        # ------ Identifiers: MRN is primary for eCW ------
        member_id = fhir_id
        mrn = None
        mbi = None
        ssn = None
        identifiers: dict[str, str] = {}
        for ident in resource.get("identifier", []):
            system = ident.get("system", "")
            value = ident.get("value", "")
            system_lower = system.lower()

            if "mrn" in system_lower or "medical-record" in system_lower:
                mrn = value
                identifiers["mrn"] = value
                member_id = value  # MRN is primary for eCW
            elif "mbi" in system_lower or "medicare" in system_lower:
                mbi = value
                identifiers["mbi"] = value
            elif "member" in system_lower:
                identifiers["member_id"] = value
            elif "ssn" in system_lower or "social" in system_lower:
                # Do NOT store SSN as member_id. Keep in extra for matching only.
                ssn = value
                identifiers["ssn_last4"] = value[-4:] if len(value) >= 4 else value
            elif value:
                key = system.rsplit("/", 1)[-1] if "/" in system else system
                identifiers[key] = value

        # Fallback: if no MRN found, use first identifier
        if not mrn and identifiers:
            first_val = next(iter(identifiers.values()))
            member_id = first_val

        # ------ Name ------
        first_name = ""
        last_name = ""
        names = resource.get("name", [])
        if names:
            # Prefer official name
            name_obj = names[0]
            for n in names:
                if n.get("use") == "official":
                    name_obj = n
                    break
            first_name = " ".join(name_obj.get("given", []))
            last_name = name_obj.get("family", "")

        # ------ Demographics ------
        birth_date_str = resource.get("birthDate")
        birth_date = None
        if birth_date_str:
            try:
                birth_date = date.fromisoformat(birth_date_str[:10])
            except ValueError:
                pass

        gender_raw = resource.get("gender", "")
        gender = gender_raw[0].upper() if gender_raw else "U"

        # ------ Address ------
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
                break

        # ------ Telecom ------
        phone = None
        email = None
        for telecom in resource.get("telecom", []):
            sys = telecom.get("system", "")
            val = telecom.get("value", "")
            if sys == "phone" and not phone:
                phone = val
            elif sys == "email" and not email:
                email = val

        # ------ Race / ethnicity (US Core) ------
        race = None
        ethnicity = None
        for ext in resource.get("extension", []):
            url = ext.get("url", "")
            if "us-core-race" in url:
                race = self._extract_extension_text_or_coding(ext)
            elif "us-core-ethnicity" in url:
                ethnicity = self._extract_extension_text_or_coding(ext)

        # ------ Language ------
        language = None
        for comm in resource.get("communication", []):
            lang_block = comm.get("language", {})
            language = lang_block.get("text")
            if not language:
                codings = lang_block.get("coding", [])
                if codings:
                    language = codings[0].get("display") or codings[0].get("code")
            if comm.get("preferred"):
                break
            if language:
                break

        # ------ PCP reference (generalPractitioner) ------
        pcp_ref = None
        pcp_display = None
        for gp in resource.get("generalPractitioner", []):
            pcp_ref = gp.get("reference", "")
            pcp_display = gp.get("display", "")
            break

        return {
            "member_id": member_id,
            "first_name": first_name,
            "last_name": last_name,
            "date_of_birth": birth_date,
            "gender": gender,
            "zip_code": zip_code,
            "medicaid_status": False,  # eCW doesn't indicate payer status
            "fhir_id": fhir_id,
            "extra": {
                "source": "ecw",
                "mrn": mrn,
                "mbi": mbi,
                "street": street,
                "city": city,
                "state": state,
                "phone": phone,
                "email": email,
                "race": race,
                "ethnicity": ethnicity,
                "language": language,
                "identifiers": identifiers,
                "pcp_reference": pcp_ref,
                "pcp_display": pcp_display,
            },
        }

    def _parse_condition(self, resource: dict, source: str = "unknown") -> dict | None:
        """Map FHIR Condition to platform condition dict.

        eCW-specific:
        - Extracts BOTH problem-list-item and encounter-diagnosis categories
        - Problem list items are the MOST valuable for HCC — chronic conditions
          that should be recaptured annually
        - Extracts ICD-10-CM codes (system: http://hl7.org/fhir/sid/icd-10-cm)
        - Tracks clinical status: active, recurrence, remission, resolved
        - Tracks onset and abatement dates for condition timeline
        """
        # Determine category from the resource (override the hint if present)
        categories: list[str] = []
        for cat in resource.get("category", []):
            for coding in cat.get("coding", []):
                categories.append(coding.get("code", ""))

        is_problem_list = "problem-list-item" in categories
        is_encounter_dx = "encounter-diagnosis" in categories

        # Extract ICD-10-CM codes only
        icd10_code = None
        icd10_display = None
        snomed_code = None
        snomed_display = None
        code_block = resource.get("code", {})
        for coding in code_block.get("coding", []):
            system = coding.get("system", "")
            code_val = coding.get("code", "")
            display = coding.get("display", "")
            if "icd-10" in system.lower() or system == "http://hl7.org/fhir/sid/icd-10-cm":
                icd10_code = code_val
                icd10_display = display
            elif "snomed" in system.lower():
                snomed_code = code_val
                snomed_display = display

        # Must have at least an ICD-10 code to be useful for HCC
        if not icd10_code:
            # Still store SNOMED conditions for reference but flag them
            if not snomed_code:
                return None

        # Patient reference
        member_id = self._extract_member_ref(resource)

        # Clinical status
        clinical_status = None
        cs_block = resource.get("clinicalStatus", {})
        for coding in cs_block.get("coding", []):
            clinical_status = coding.get("code")
            if clinical_status:
                break

        # Verification status
        verification_status = None
        vs_block = resource.get("verificationStatus", {})
        for coding in vs_block.get("coding", []):
            verification_status = coding.get("code")
            if verification_status:
                break

        # Onset / abatement dates
        onset_date = self._extract_date(resource.get("onsetDateTime"))
        if not onset_date:
            onset_period = resource.get("onsetPeriod", {})
            onset_date = self._extract_date(onset_period.get("start"))

        abatement_date = self._extract_date(resource.get("abatementDateTime"))
        if not abatement_date:
            abatement_period = resource.get("abatementPeriod", {})
            abatement_date = self._extract_date(abatement_period.get("start"))

        # Encounter reference (which visit this diagnosis came from)
        encounter_ref = None
        enc_block = resource.get("encounter", {})
        if enc_block.get("reference"):
            encounter_ref = enc_block["reference"].split("/")[-1]

        # Recorded date
        recorded_date = self._extract_date(resource.get("recordedDate"))

        return {
            "fhir_id": resource.get("id", ""),
            "member_id": member_id,
            "icd10_code": icd10_code,
            "icd10_display": icd10_display,
            "clinical_status": clinical_status,
            "verification_status": verification_status,
            "onset_date": onset_date,
            "abatement_date": abatement_date,
            "recorded_date": recorded_date,
            "extra": {
                "source": "ecw",
                "category": source if source != "unknown" else (
                    "problem-list" if is_problem_list else
                    "encounter-diagnosis" if is_encounter_dx else "other"
                ),
                "is_problem_list": is_problem_list,
                "is_encounter_diagnosis": is_encounter_dx,
                "snomed_code": snomed_code,
                "snomed_display": snomed_display,
                "encounter_ref": encounter_ref,
                "code_text": code_block.get("text", ""),
            },
        }

    def _parse_encounter(self, resource: dict) -> dict | None:
        """Map FHIR Encounter to a signal-tier Claim dict.

        eCW-specific: Encounters represent *visits* — not billed claims.
        Stored as signal-tier claims so the platform tracks visit data
        alongside (but distinguished from) payer claims.

        Extracts:
        - Visit type: office, telehealth, inpatient, emergency, etc.
        - Status: planned, arrived, in-progress, finished, cancelled
        - Diagnosis codes from encounter.diagnosis
        - Performing provider from encounter.participant
        - Visit dates from encounter.period
        """
        fhir_id = resource.get("id", "")

        # Patient reference
        member_id = None
        subject = resource.get("subject", {})
        ref = subject.get("reference", "")
        if "/" in ref:
            member_id = ref.split("/")[-1]

        if not member_id:
            return None

        # Status
        status = resource.get("status", "unknown")

        # Visit class (AMB=ambulatory, EMER=emergency, IMP=inpatient, etc.)
        visit_class = None
        class_block = resource.get("class", {})
        if isinstance(class_block, dict):
            visit_class = class_block.get("code")
        # FHIR R4 may also have class as a list in some profiles
        elif isinstance(class_block, list) and class_block:
            visit_class = class_block[0].get("code")

        # Visit type (more specific: office visit, telehealth, etc.)
        visit_type = None
        visit_type_display = None
        for t in resource.get("type", []):
            for coding in t.get("coding", []):
                visit_type = coding.get("code")
                visit_type_display = coding.get("display")
                if visit_type:
                    break
            if visit_type:
                break
        if not visit_type_display:
            visit_type_display = resource.get("type", [{}])[0].get("text", "") if resource.get("type") else ""

        # Period (visit dates)
        period = resource.get("period", {})
        service_date = self._extract_date(period.get("start"))
        service_end_date = self._extract_date(period.get("end"))
        if not service_date:
            service_date = date.today()

        # Diagnosis codes from encounter
        diagnosis_codes: list[str] = []
        diagnosis_displays: list[str] = []
        for diag in resource.get("diagnosis", []):
            condition_ref = diag.get("condition", {})
            # Some eCW instances inline the code; others reference Condition
            if isinstance(condition_ref, dict):
                # Inline CodeableConcept
                for coding in condition_ref.get("coding", []):
                    system = coding.get("system", "")
                    code_val = coding.get("code", "")
                    if code_val and ("icd-10" in system.lower() or system == "http://hl7.org/fhir/sid/icd-10-cm"):
                        if code_val not in diagnosis_codes:
                            diagnosis_codes.append(code_val)
                            diagnosis_displays.append(coding.get("display", ""))
                # Also handle reference to Condition resource
                ref = condition_ref.get("reference", "")
                if ref and not diagnosis_codes:
                    # Store the reference for later resolution
                    pass

        # Reason codes (may contain diagnosis codes too)
        for reason in resource.get("reasonCode", []):
            for coding in reason.get("coding", []):
                system = coding.get("system", "")
                code_val = coding.get("code", "")
                if code_val and ("icd-10" in system.lower() or system == "http://hl7.org/fhir/sid/icd-10-cm"):
                    if code_val not in diagnosis_codes:
                        diagnosis_codes.append(code_val)
                        diagnosis_displays.append(coding.get("display", ""))

        # Performing provider from participants
        provider_npi = None
        provider_name = None
        for participant in resource.get("participant", []):
            individual = participant.get("individual", {})
            provider_name = individual.get("display")
            indiv_ref = individual.get("reference", "")
            if "/" in indiv_ref:
                provider_npi = indiv_ref.split("/")[-1]
            if provider_npi:
                break

        # Facility / location
        facility_name = None
        for loc in resource.get("location", []):
            loc_ref = loc.get("location", {})
            facility_name = loc_ref.get("display")
            if facility_name:
                break

        # Map visit class to a claim type analog
        claim_type = "professional"  # default
        if visit_class in ("IMP", "ACUTE", "NONAC"):
            claim_type = "institutional"
        elif visit_class == "EMER":
            claim_type = "institutional"

        return {
            "claim_id": f"ecw-enc-{fhir_id}",
            "member_id": member_id,
            "claim_type": claim_type,
            "service_date": service_date,
            "service_end_date": service_end_date,
            "diagnosis_codes": diagnosis_codes,
            "primary_diagnosis": diagnosis_codes[0] if diagnosis_codes else None,
            "provider_npi": provider_npi,
            "paid_amount": None,  # Not a billed claim
            "allowed_amount": None,
            "billed_amount": None,
            "data_tier": "signal",  # Visit occurred but not yet in claims
            "extra": {
                "source": "ecw",
                "resource_type": "Encounter",
                "fhir_id": fhir_id,
                "status": status,
                "visit_class": visit_class,
                "visit_type": visit_type,
                "visit_type_display": visit_type_display,
                "provider_name": provider_name,
                "facility_name": facility_name,
                "diagnosis_displays": diagnosis_displays,
            },
        }

    def _parse_observation(self, resource: dict, category_hint: str = "") -> dict | None:
        """Map FHIR Observation to platform observation dict.

        Handles:
        - Laboratory: HbA1c, eGFR, lipid panels (LOINC codes)
        - Vital signs: BP, BMI, weight
        - Social history: smoking status, SDOH assessments
        """
        fhir_id = resource.get("id", "")

        # Patient
        member_id = self._extract_member_ref(resource)

        # Status
        status = resource.get("status", "unknown")
        if status in ("cancelled", "entered-in-error"):
            return None

        # Category
        category = category_hint
        if not category:
            for cat in resource.get("category", []):
                for coding in cat.get("coding", []):
                    category = coding.get("code", "")
                    if category:
                        break
                if category:
                    break

        # Code (LOINC for labs/vitals, others for social history)
        loinc_code = None
        loinc_display = None
        code_text = None
        code_block = resource.get("code", {})
        code_text = code_block.get("text")
        for coding in code_block.get("coding", []):
            system = coding.get("system", "")
            if "loinc" in system.lower() or system == "http://loinc.org":
                loinc_code = coding.get("code")
                loinc_display = coding.get("display")
            elif not loinc_code:
                loinc_code = coding.get("code")
                loinc_display = coding.get("display")

        # Value — may be quantity, string, CodeableConcept, etc.
        value = None
        unit = None
        value_type = None

        if "valueQuantity" in resource:
            vq = resource["valueQuantity"]
            value = vq.get("value")
            unit = vq.get("unit") or vq.get("code")
            value_type = "quantity"
        elif "valueString" in resource:
            value = resource["valueString"]
            value_type = "string"
        elif "valueCodeableConcept" in resource:
            vcc = resource["valueCodeableConcept"]
            value = vcc.get("text")
            if not value:
                codings = vcc.get("coding", [])
                if codings:
                    value = codings[0].get("display") or codings[0].get("code")
            value_type = "codeable_concept"
        elif "valueBoolean" in resource:
            value = resource["valueBoolean"]
            value_type = "boolean"
        elif "valueInteger" in resource:
            value = resource["valueInteger"]
            value_type = "integer"

        # Component values (e.g., BP has systolic + diastolic as components)
        components = []
        for comp in resource.get("component", []):
            comp_code = None
            comp_display = None
            for coding in comp.get("code", {}).get("coding", []):
                comp_code = coding.get("code")
                comp_display = coding.get("display")
                break
            comp_value = None
            comp_unit = None
            if "valueQuantity" in comp:
                comp_value = comp["valueQuantity"].get("value")
                comp_unit = comp["valueQuantity"].get("unit")
            components.append({
                "code": comp_code,
                "display": comp_display,
                "value": comp_value,
                "unit": comp_unit,
            })

        # Effective date
        effective_date = self._extract_date(resource.get("effectiveDateTime"))
        if not effective_date:
            eff_period = resource.get("effectivePeriod", {})
            effective_date = self._extract_date(eff_period.get("start"))

        # Reference range (for labs)
        reference_range = None
        for rr in resource.get("referenceRange", []):
            low = rr.get("low", {}).get("value")
            high = rr.get("high", {}).get("value")
            rr_text = rr.get("text")
            if low is not None or high is not None:
                reference_range = f"{low or ''}-{high or ''}"
            elif rr_text:
                reference_range = rr_text
            break

        # Interpretation (H=high, L=low, N=normal, etc.)
        interpretation = None
        for interp in resource.get("interpretation", []):
            for coding in interp.get("coding", []):
                interpretation = coding.get("code")
                if interpretation:
                    break
            if interpretation:
                break

        # Encounter reference
        encounter_ref = None
        enc_block = resource.get("encounter", {})
        if enc_block.get("reference"):
            encounter_ref = enc_block["reference"].split("/")[-1]

        # Performer
        performer_ref = None
        performer_name = None
        for perf in resource.get("performer", []):
            performer_ref = perf.get("reference", "").split("/")[-1] if perf.get("reference") else None
            performer_name = perf.get("display")
            break

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "category": category,
            "loinc_code": loinc_code,
            "loinc_display": loinc_display,
            "value": value,
            "unit": unit,
            "effective_date": effective_date,
            "status": status,
            "extra": {
                "source": "ecw",
                "value_type": value_type,
                "code_text": code_text,
                "components": components if components else None,
                "reference_range": reference_range,
                "interpretation": interpretation,
                "encounter_ref": encounter_ref,
                "performer_ref": performer_ref,
                "performer_name": performer_name,
            },
        }

    def _parse_medication_request(self, resource: dict) -> dict | None:
        """Map FHIR MedicationRequest to platform medication dict."""
        fhir_id = resource.get("id", "")

        member_id = self._extract_member_ref(resource)

        # Status: active, completed, stopped, cancelled, etc.
        status = resource.get("status", "unknown")

        # Intent: order, plan, proposal
        intent = resource.get("intent", "order")

        # Medication — may be CodeableConcept or Reference
        medication_name = None
        rxnorm_code = None
        ndc_code = None
        med_cc = resource.get("medicationCodeableConcept", {})
        if med_cc:
            medication_name = med_cc.get("text")
            for coding in med_cc.get("coding", []):
                system = coding.get("system", "").lower()
                if "rxnorm" in system:
                    rxnorm_code = coding.get("code")
                    if not medication_name:
                        medication_name = coding.get("display")
                elif "ndc" in system:
                    ndc_code = coding.get("code")
                elif not medication_name:
                    medication_name = coding.get("display")
        elif resource.get("medicationReference"):
            med_ref = resource["medicationReference"]
            medication_name = med_ref.get("display")

        # Dosage instructions
        dosage_text = None
        dosage_route = None
        dosage_frequency = None
        dosages = resource.get("dosageInstruction", [])
        if dosages:
            d = dosages[0]
            dosage_text = d.get("text")
            route = d.get("route", {})
            dosage_route = route.get("text")
            if not dosage_route:
                for coding in route.get("coding", []):
                    dosage_route = coding.get("display")
                    break
            # Timing
            timing = d.get("timing", {})
            repeat = timing.get("repeat", {})
            if repeat:
                freq = repeat.get("frequency", "")
                period = repeat.get("period", "")
                period_unit = repeat.get("periodUnit", "")
                if freq and period:
                    dosage_frequency = f"{freq}x per {period} {period_unit}"

        # Authored date
        authored_date = self._extract_date(resource.get("authoredOn"))

        # Prescriber
        prescriber_ref = None
        prescriber_name = None
        requester = resource.get("requester", {})
        if requester.get("reference"):
            prescriber_ref = requester["reference"].split("/")[-1]
        prescriber_name = requester.get("display")

        # Dispense request (quantity, refills, supply duration)
        dispense = resource.get("dispenseRequest", {})
        quantity = None
        refills = dispense.get("numberOfRepeatsAllowed")
        supply_days = None
        if dispense.get("quantity"):
            quantity = dispense["quantity"].get("value")
        if dispense.get("expectedSupplyDuration"):
            supply_days = dispense["expectedSupplyDuration"].get("value")

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "medication_name": medication_name,
            "status": status,
            "authored_date": authored_date,
            "extra": {
                "source": "ecw",
                "intent": intent,
                "rxnorm_code": rxnorm_code,
                "ndc_code": ndc_code,
                "dosage_text": dosage_text,
                "dosage_route": dosage_route,
                "dosage_frequency": dosage_frequency,
                "prescriber_ref": prescriber_ref,
                "prescriber_name": prescriber_name,
                "quantity": quantity,
                "refills": refills,
                "supply_days": supply_days,
            },
        }

    def _parse_practitioner(self, resource: dict) -> dict | None:
        """Map FHIR Practitioner to platform Provider dict."""
        fhir_id = resource.get("id", "")

        # NPI
        npi = None
        identifiers: dict[str, str] = {}
        for ident in resource.get("identifier", []):
            system = ident.get("system", "")
            value = ident.get("value", "")
            if "npi" in system.lower() or system == "http://hl7.org/fhir/sid/us-npi":
                npi = value
                identifiers["npi"] = value
            elif value:
                key = system.rsplit("/", 1)[-1] if "/" in system else system
                identifiers[key] = value

        # Name
        first_name = ""
        last_name = ""
        names = resource.get("name", [])
        if names:
            name_obj = names[0]
            first_name = " ".join(name_obj.get("given", []))
            last_name = name_obj.get("family", "")

        # Qualifications / specialty
        specialty = None
        for qual in resource.get("qualification", []):
            code_block = qual.get("code", {})
            specialty = code_block.get("text")
            if not specialty:
                for coding in code_block.get("coding", []):
                    specialty = coding.get("display")
                    if specialty:
                        break
            if specialty:
                break

        # Telecom
        phone = None
        email = None
        for telecom in resource.get("telecom", []):
            sys = telecom.get("system", "")
            val = telecom.get("value", "")
            if sys == "phone" and not phone:
                phone = val
            elif sys == "email" and not email:
                email = val

        return {
            "npi": npi or fhir_id,
            "first_name": first_name,
            "last_name": last_name,
            "specialty": specialty,
            "fhir_id": fhir_id,
            "extra": {
                "source": "ecw",
                "phone": phone,
                "email": email,
                "identifiers": identifiers,
            },
        }

    def _parse_coverage(self, resource: dict) -> dict | None:
        """Map FHIR Coverage to eligibility fields.

        eCW Coverage shows which insurance the patient has on file in the EHR.
        Unlike Humana, we don't filter by plan type — all coverage info is
        useful for cross-referencing.
        """
        member_id = self._extract_member_ref(resource)
        if not member_id:
            return None

        # Period
        period = resource.get("period", {})
        coverage_start = self._extract_date(period.get("start"))
        coverage_end = self._extract_date(period.get("end"))

        # Subscriber
        subscriber_id = None
        subscriber_ref = resource.get("subscriber", {})
        if isinstance(subscriber_ref, dict):
            ref = subscriber_ref.get("reference", "")
            if "/" in ref:
                subscriber_id = ref.split("/")[-1]
            ident = subscriber_ref.get("identifier", {})
            if ident.get("value"):
                subscriber_id = ident["value"]
        if not subscriber_id:
            subscriber_id = resource.get("subscriberId")

        # Payor (insurance company)
        health_plan = None
        payor_ref = None
        for payor in resource.get("payor", []):
            health_plan = payor.get("display")
            payor_ref = payor.get("reference")
            if health_plan:
                break

        # Class array: plan name, group number
        group_number = None
        plan_name = None
        for cls in resource.get("class", []):
            cls_type_code = cls.get("type", {}).get("coding", [{}])[0].get("code", "")
            cls_value = cls.get("value")
            cls_name = cls.get("name")
            if cls_type_code == "plan":
                plan_name = cls_name or cls_value
            elif cls_type_code == "group":
                group_number = cls_value

        # Type (e.g., insurance type code)
        coverage_type = None
        type_block = resource.get("type", {})
        for coding in type_block.get("coding", []):
            coverage_type = coding.get("display") or coding.get("code")
            if coverage_type:
                break

        status = resource.get("status")
        network = resource.get("network")

        return {
            "member_id": member_id,
            "coverage_start": coverage_start,
            "coverage_end": coverage_end,
            "health_plan": health_plan or plan_name or "Unknown",
            "plan_product": coverage_type,
            "status": status,
            "extra": {
                "source": "ecw",
                "subscriber_id": subscriber_id,
                "group_number": group_number,
                "plan_name": plan_name,
                "network": network,
                "payor_ref": payor_ref,
            },
        }

    def _parse_document_reference(self, resource: dict) -> dict | None:
        """Map FHIR DocumentReference to platform document dict.

        eCW-specific: contains full clinical notes from the EHR chart,
        lab reports, referral letters. Content may be base64-encoded or
        a URL reference.
        """
        fhir_id = resource.get("id", "")
        member_id = self._extract_member_ref(resource)

        status = resource.get("status", "current")
        if status == "entered-in-error":
            return None

        # Type (document type: clinical note, lab report, etc.)
        doc_type = None
        doc_type_code = None
        type_block = resource.get("type", {})
        doc_type = type_block.get("text")
        for coding in type_block.get("coding", []):
            doc_type_code = coding.get("code")
            if not doc_type:
                doc_type = coding.get("display")

        # Category (e.g., clinical-note)
        doc_category = None
        for cat in resource.get("category", []):
            for coding in cat.get("coding", []):
                doc_category = coding.get("code")
                if doc_category:
                    break
            if doc_category:
                break

        # Date
        doc_date = self._extract_date(resource.get("date"))

        # Author
        author_name = None
        for author in resource.get("author", []):
            author_name = author.get("display")
            if author_name:
                break

        # Encounter reference
        encounter_ref = None
        for ctx in resource.get("context", {}).get("encounter", []):
            ref = ctx.get("reference", "")
            if "/" in ref:
                encounter_ref = ref.split("/")[-1]
            break

        # Content — may have multiple attachments
        content_entries = []
        for content in resource.get("content", []):
            attachment = content.get("attachment", {})
            content_type = attachment.get("contentType", "")
            url = attachment.get("url")
            data_b64 = attachment.get("data")  # base64 encoded
            title = attachment.get("title")
            size = attachment.get("size")

            entry: dict[str, Any] = {
                "content_type": content_type,
                "title": title,
                "size": size,
            }
            if url:
                entry["url"] = url
            if data_b64:
                # Store indicator, not the full base64 blob (can be large)
                entry["has_inline_data"] = True
                entry["data_length"] = len(data_b64)
                # For text content, decode and store
                if content_type and "text" in content_type.lower():
                    try:
                        entry["text_preview"] = base64.b64decode(data_b64).decode("utf-8")[:2000]
                    except Exception:
                        pass
            content_entries.append(entry)

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "doc_type": doc_type,
            "doc_type_code": doc_type_code,
            "doc_category": doc_category,
            "doc_date": doc_date,
            "status": status,
            "extra": {
                "source": "ecw",
                "author_name": author_name,
                "encounter_ref": encounter_ref,
                "content": content_entries,
            },
        }

    def _parse_care_plan(self, resource: dict) -> dict | None:
        """Map FHIR CarePlan to platform care plan dict."""
        fhir_id = resource.get("id", "")
        member_id = self._extract_member_ref(resource)
        status = resource.get("status")
        intent = resource.get("intent")

        # Title / description
        title = resource.get("title")
        description = resource.get("description")

        # Period
        period = resource.get("period", {})
        start_date = self._extract_date(period.get("start"))
        end_date = self._extract_date(period.get("end"))

        # Categories
        categories = []
        for cat in resource.get("category", []):
            for coding in cat.get("coding", []):
                categories.append(coding.get("display") or coding.get("code", ""))

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "status": status,
            "title": title,
            "extra": {
                "source": "ecw",
                "intent": intent,
                "description": description,
                "start_date": str(start_date) if start_date else None,
                "end_date": str(end_date) if end_date else None,
                "categories": categories,
            },
        }

    def _parse_care_team(self, resource: dict) -> dict | None:
        """Map FHIR CareTeam to platform care team dict."""
        fhir_id = resource.get("id", "")
        member_id = self._extract_member_ref(resource)
        status = resource.get("status")
        name = resource.get("name")

        # Participants
        participants = []
        for p in resource.get("participant", []):
            role = None
            for role_cc in p.get("role", []):
                for coding in role_cc.get("coding", []):
                    role = coding.get("display") or coding.get("code")
                    if role:
                        break
                if role:
                    break
            member_block = p.get("member", {})
            participants.append({
                "role": role,
                "name": member_block.get("display"),
                "reference": member_block.get("reference"),
            })

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "status": status,
            "name": name,
            "extra": {
                "source": "ecw",
                "participants": participants,
            },
        }

    def _parse_allergy_intolerance(self, resource: dict) -> dict | None:
        """Map FHIR AllergyIntolerance to platform dict."""
        fhir_id = resource.get("id", "")
        member_id = self._extract_member_ref(resource)

        clinical_status = None
        cs_block = resource.get("clinicalStatus", {})
        for coding in cs_block.get("coding", []):
            clinical_status = coding.get("code")
            if clinical_status:
                break

        verification_status = None
        vs_block = resource.get("verificationStatus", {})
        for coding in vs_block.get("coding", []):
            verification_status = coding.get("code")
            if verification_status:
                break

        # Substance / code
        substance = None
        code_block = resource.get("code", {})
        substance = code_block.get("text")
        if not substance:
            for coding in code_block.get("coding", []):
                substance = coding.get("display")
                if substance:
                    break

        # Type, category, criticality
        allergy_type = resource.get("type")  # allergy | intolerance
        categories = resource.get("category", [])  # food, medication, environment, biologic
        criticality = resource.get("criticality")  # low, high, unable-to-assess

        onset_date = self._extract_date(resource.get("onsetDateTime"))
        recorded_date = self._extract_date(resource.get("recordedDate"))

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "substance": substance,
            "clinical_status": clinical_status,
            "extra": {
                "source": "ecw",
                "verification_status": verification_status,
                "allergy_type": allergy_type,
                "categories": categories,
                "criticality": criticality,
                "onset_date": str(onset_date) if onset_date else None,
                "recorded_date": str(recorded_date) if recorded_date else None,
            },
        }

    def _parse_immunization(self, resource: dict) -> dict | None:
        """Map FHIR Immunization to platform dict."""
        fhir_id = resource.get("id", "")
        member_id = self._extract_member_ref(resource)
        status = resource.get("status")

        # Vaccine code
        vaccine_name = None
        cvx_code = None
        vaccine_block = resource.get("vaccineCode", {})
        vaccine_name = vaccine_block.get("text")
        for coding in vaccine_block.get("coding", []):
            system = coding.get("system", "").lower()
            if "cvx" in system:
                cvx_code = coding.get("code")
            if not vaccine_name:
                vaccine_name = coding.get("display")

        occurrence_date = self._extract_date(resource.get("occurrenceDateTime"))

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "vaccine_name": vaccine_name,
            "cvx_code": cvx_code,
            "occurrence_date": occurrence_date,
            "status": status,
            "extra": {
                "source": "ecw",
            },
        }

    def _parse_procedure(self, resource: dict) -> dict | None:
        """Map FHIR Procedure to platform dict."""
        fhir_id = resource.get("id", "")
        member_id = self._extract_member_ref(resource)
        status = resource.get("status")

        # Procedure code (CPT, SNOMED, HCPCS)
        procedure_code = None
        procedure_display = None
        code_system = None
        code_block = resource.get("code", {})
        for coding in code_block.get("coding", []):
            procedure_code = coding.get("code")
            procedure_display = coding.get("display")
            code_system = coding.get("system")
            if procedure_code:
                break
        if not procedure_display:
            procedure_display = code_block.get("text")

        # Performed date
        performed_date = self._extract_date(resource.get("performedDateTime"))
        if not performed_date:
            performed_period = resource.get("performedPeriod", {})
            performed_date = self._extract_date(performed_period.get("start"))

        # Performer
        performer_name = None
        for perf in resource.get("performer", []):
            actor = perf.get("actor", {})
            performer_name = actor.get("display")
            if performer_name:
                break

        return {
            "fhir_id": fhir_id,
            "member_id": member_id,
            "procedure_code": procedure_code,
            "procedure_display": procedure_display,
            "performed_date": performed_date,
            "status": status,
            "extra": {
                "source": "ecw",
                "code_system": code_system,
                "performer_name": performer_name,
            },
        }

    # -------------------------------------------------------------------
    # Shared helper methods
    # -------------------------------------------------------------------

    @staticmethod
    def _extract_member_ref(resource: dict) -> str | None:
        """Extract patient/member ID from subject or patient reference.

        eCW patient IDs are encrypted GUIDs (e.g. ``Lt2IFR5Ah76n4d8TFP5gBHFj5TnTm27O7XeimBF33lI``)
        not simple integers. This method handles both formats transparently.
        """
        for key in ("subject", "patient"):
            ref_block = resource.get(key, {})
            if isinstance(ref_block, dict):
                ref = ref_block.get("reference", "")
                if "/" in ref:
                    return ref.split("/")[-1]
                # Try identifier
                ident = ref_block.get("identifier", {})
                if ident.get("value"):
                    return ident["value"]
        # Beneficiary (Coverage resource)
        beneficiary = resource.get("beneficiary", {})
        if isinstance(beneficiary, dict):
            ref = beneficiary.get("reference", "")
            if "/" in ref:
                return ref.split("/")[-1]
        return None

    @staticmethod
    def _extract_date(value: str | None) -> date | None:
        """Safely parse a FHIR date or dateTime string to a Python date."""
        if not value:
            return None
        try:
            return date.fromisoformat(value[:10])
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _extract_extension_text_or_coding(ext: dict) -> str | None:
        """Extract text from a US Core race/ethnicity extension.

        Looks for the 'text' sub-extension first, then falls back to
        the first ombCategory coding display.
        """
        for sub in ext.get("extension", []):
            if sub.get("url") == "text":
                return sub.get("valueString")
        for sub in ext.get("extension", []):
            if sub.get("url") == "ombCategory":
                vc = sub.get("valueCoding", {})
                return vc.get("display") or vc.get("code")
        return None
