"""
Availity Payer Adapter (basic implementation).

Availity brokers access to dozens of payers via a single FHIR R4 gateway at
``https://api.availity.com/availity/v1/``. Unlike Humana (browser-based
authorization code flow) Availity uses **OAuth 2.0 client credentials** —
server-to-server with no user redirect. A client_id / client_secret pair is
provisioned by Availity for each integrator; there is no `code` exchange.

What this adapter covers today:
  - `authenticate`  : POST /v1/token (grant_type=client_credentials)
  - `refresh_token` : re-run authenticate (client creds don't issue a
                       refresh token; you ask for a new access token)
  - `fetch_patients`, `fetch_conditions`, `fetch_claims`, `fetch_coverage`
    : FHIR R4 search against the gateway with `_lastUpdated` filter when a
      high-water-mark is supplied in params["since"].

What it does NOT cover (raises `NotImplementedError` if called):
  - `get_authorization_url`  : no browser redirect for client credentials
  - `fetch_providers`, `fetch_medications`, `fetch_observations`
    : endpoints vary per downstream payer; implement when a specific payer
      is onboarded through Availity.

Every fetch routes through one helper with retry-on-429 / 5xx and
exponential backoff so Availity's rate limits don't fail an entire sync.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

import httpx

from app.services.payer_api_service import PayerAdapter

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Availity endpoints
# ---------------------------------------------------------------------------

_ENVIRONMENTS = {
    # Availity exposes a test environment at api.availity.com/test. Real
    # sandbox credentials are provisioned on request, so this mirrors the
    # production URL — a caller sets `environment="test"` to target it.
    "test": {
        "token_url": "https://api.availity.com/availity/v1/token",
        "fhir_base": "https://api.availity.com/availity/v1/fhir",
    },
    "production": {
        "token_url": "https://api.availity.com/availity/v1/token",
        "fhir_base": "https://api.availity.com/availity/v1/fhir",
    },
}

# Minimum scope set for the FHIR R4 search endpoints we use. Callers may
# override via credentials["scope"] if Availity grants additional rights.
_DEFAULT_SCOPE = "hipaa"

_REQUEST_TIMEOUT = 30.0
_PAGE_SIZE = 50
_MAX_RETRIES = 3
_BACKOFF_BASE = 1.5


class AvailityAdapter(PayerAdapter):
    """Availity FHIR R4 gateway adapter using OAuth2 client credentials."""

    # ---- OAuth ----------------------------------------------------------

    def get_scopes(self) -> str:
        return _DEFAULT_SCOPE

    def get_authorization_url(self, credentials: dict) -> str:
        """Availity does NOT use the authorization code flow.

        The PayerAdapter contract requires this method. We raise clearly so
        a caller who tries to treat Availity like Humana sees a loud error
        rather than an empty URL / silent failure.
        """
        raise NotImplementedError(
            "Availity uses OAuth client_credentials, not the authorization "
            "code flow. Call `authenticate(credentials)` directly with "
            "client_id + client_secret."
        )

    async def authenticate(self, credentials: dict) -> dict:
        """Exchange client_id + client_secret for an access token.

        Expected credentials keys:
          - client_id
          - client_secret
          - environment ("test" or "production"; default "production")
          - scope (optional; default "hipaa")
        """
        env = credentials.get("environment", "production")
        urls = _ENVIRONMENTS.get(env) or _ENVIRONMENTS["production"]

        client_id = credentials.get("client_id")
        client_secret = credentials.get("client_secret")
        if not client_id or not client_secret:
            raise ValueError("Availity authenticate requires client_id and client_secret")

        data = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": credentials.get("scope", _DEFAULT_SCOPE),
        }

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.post(
                urls["token_url"],
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data=data,
            )
            response.raise_for_status()
            token_data = response.json()

        # Client-credentials grants don't return a refresh_token. We return
        # empty string so the rest of the platform's token-storage logic
        # treats the field as absent instead of crashing on missing key.
        return {
            "access_token": token_data["access_token"],
            "refresh_token": "",
            "expires_in": token_data.get("expires_in", 3600),
            "token_type": token_data.get("token_type", "Bearer"),
        }

    async def refresh_token(self, credentials: dict) -> dict:
        """Client-credentials tokens don't refresh — just re-authenticate."""
        return await self.authenticate(credentials)

    # ---- Helpers --------------------------------------------------------

    @staticmethod
    def _since_param(params: dict) -> dict[str, str]:
        since = params.get("since")
        if not since:
            return {}
        return {"_lastUpdated": f"gt{since}"}

    async def _search(
        self,
        token: str,
        env: str,
        resource_path: str,
        extra_params: dict[str, str] | None = None,
    ) -> list[dict]:
        """Run a FHIR R4 search with page-following + basic retry.

        Returns the raw FHIR resources (unwrapped from Bundle.entry[].resource).
        """
        urls = _ENVIRONMENTS.get(env) or _ENVIRONMENTS["production"]
        base_url = urls["fhir_base"]
        qs = {"_count": _PAGE_SIZE, **(extra_params or {})}
        next_url = f"{base_url}{resource_path}?{urlencode(qs)}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/fhir+json",
        }

        results: list[dict] = []
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            while next_url:
                bundle = await self._request_with_retry(client, next_url, headers)
                if bundle is None:
                    logger.warning(
                        "Availity: giving up on %s — partial result (%d resources)",
                        resource_path, len(results),
                    )
                    break
                for entry in bundle.get("entry", []):
                    resource = entry.get("resource")
                    if resource:
                        results.append(resource)
                next_url = self._next_link(bundle)
        return results

    @staticmethod
    def _next_link(bundle: dict) -> str | None:
        for link in bundle.get("link", []):
            if link.get("relation") == "next":
                return link.get("url")
        return None

    async def _request_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict[str, str],
    ) -> dict | None:
        """GET with exponential backoff on 429 / 5xx. Returns parsed JSON or None."""
        for attempt in range(_MAX_RETRIES):
            try:
                response = await client.get(url, headers=headers)
            except (httpx.TimeoutException, httpx.HTTPError) as exc:
                logger.warning(
                    "Availity transient error on %s (attempt %d): %s",
                    url, attempt + 1, exc,
                )
                await asyncio.sleep(_BACKOFF_BASE ** attempt)
                continue

            if response.status_code == 200:
                return response.json()
            if response.status_code == 429:
                retry_after = float(response.headers.get("Retry-After", _BACKOFF_BASE ** attempt))
                logger.info("Availity 429 on %s — sleeping %.1fs", url, retry_after)
                await asyncio.sleep(retry_after)
                continue
            if 500 <= response.status_code < 600:
                logger.warning(
                    "Availity %d on %s — retrying", response.status_code, url,
                )
                await asyncio.sleep(_BACKOFF_BASE ** attempt)
                continue
            # Non-retryable error (4xx other than 429). Log and give up.
            logger.error(
                "Availity %d on %s: %s",
                response.status_code, url, response.text[:200],
            )
            return None
        return None

    # ---- Fetchers (minimal mapping) ------------------------------------

    async def fetch_patients(self, token: str, params: dict) -> list[dict]:
        env = params.get("environment", "production")
        raw = await self._search(token, env, "/Patient", extra_params=self._since_param(params))
        return [self._parse_patient(r) for r in raw]

    async def fetch_conditions(self, token: str, params: dict) -> list[dict]:
        env = params.get("environment", "production")
        raw = await self._search(token, env, "/Condition", extra_params=self._since_param(params))
        parsed: list[dict] = []
        for r in raw:
            cond = self._parse_condition(r)
            if cond:
                parsed.append(cond)
        return parsed

    async def fetch_claims(self, token: str, params: dict) -> list[dict]:
        env = params.get("environment", "production")
        raw = await self._search(
            token, env, "/ExplanationOfBenefit",
            extra_params=self._since_param(params),
        )
        parsed: list[dict] = []
        for r in raw:
            c = self._parse_eob(r)
            if c:
                parsed.append(c)
        return parsed

    async def fetch_coverage(self, token: str, params: dict) -> list[dict]:
        env = params.get("environment", "production")
        return await self._search(
            token, env, "/Coverage", extra_params=self._since_param(params),
        )

    # ---- Not yet implemented -------------------------------------------

    async def fetch_providers(self, token: str, params: dict) -> list[dict]:
        raise NotImplementedError(
            "Availity fetch_providers not yet implemented — see "
            "reviews/readiness-external-apis.md for scope decisions."
        )

    async def fetch_medications(self, token: str, params: dict) -> list[dict]:
        raise NotImplementedError(
            "Availity fetch_medications not yet implemented — see "
            "reviews/readiness-external-apis.md for scope decisions."
        )

    async def fetch_observations(self, token: str, params: dict) -> list[dict]:
        raise NotImplementedError(
            "Availity fetch_observations not yet implemented — see "
            "reviews/readiness-external-apis.md for scope decisions."
        )

    # ---- Parsers (keep thin; match Humana's output shape) --------------

    @staticmethod
    def _parse_patient(resource: dict) -> dict:
        names = resource.get("name") or []
        first = ""
        last = ""
        if names:
            n = names[0]
            first = " ".join(n.get("given", []))
            last = n.get("family", "")

        zip_code = None
        for addr in resource.get("address") or []:
            zip_code = addr.get("postalCode")
            if zip_code:
                break

        member_id = resource.get("id", "")
        for ident in resource.get("identifier") or []:
            system = (ident.get("system") or "").lower()
            if "mbi" in system or "member" in system:
                member_id = ident.get("value", member_id)
                break

        return {
            "fhir_id": resource.get("id"),
            "member_id": member_id,
            "first_name": first,
            "last_name": last,
            "date_of_birth": resource.get("birthDate"),
            "gender": (resource.get("gender") or "U")[0].upper(),
            "zip_code": zip_code,
        }

    @staticmethod
    def _parse_condition(resource: dict) -> dict | None:
        codes: list[str] = []
        for coding in (resource.get("code") or {}).get("coding") or []:
            system = (coding.get("system") or "").lower()
            if "icd" in system:
                code = coding.get("code")
                if code:
                    codes.append(code)
        if not codes:
            for coding in (resource.get("code") or {}).get("coding") or []:
                code = coding.get("code")
                if code:
                    codes.append(code)
        if not codes:
            return None
        subject_ref = (resource.get("subject") or {}).get("reference", "")
        return {
            "fhir_id": resource.get("id"),
            "member_id": subject_ref.split("/")[-1] if "/" in subject_ref else subject_ref,
            "diagnosis_codes": codes,
            "onset": resource.get("onsetDateTime") or resource.get("recordedDate"),
            "clinical_status": (resource.get("clinicalStatus") or {}).get("text"),
        }

    @staticmethod
    def _parse_eob(resource: dict) -> dict | None:
        patient_ref = (resource.get("patient") or {}).get("reference", "")
        member_id = patient_ref.split("/")[-1] if "/" in patient_ref else patient_ref
        if not member_id:
            return None
        diag_codes: list[str] = []
        for diag in resource.get("diagnosis") or []:
            for coding in (diag.get("diagnosisCodeableConcept") or {}).get("coding") or []:
                code = coding.get("code")
                if code:
                    diag_codes.append(code)
        billing_period = resource.get("billablePeriod") or {}
        return {
            "fhir_id": resource.get("id"),
            "claim_id": resource.get("id"),
            "member_id": member_id,
            "service_date": billing_period.get("start"),
            "diagnosis_codes": diag_codes,
            "status": resource.get("status"),
            "type": (resource.get("type") or {}).get("text"),
        }
