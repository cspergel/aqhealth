"""
HTTP client for the SNF Admit Assist microservice.

Uses httpx for async HTTP calls with connection pooling.
All methods gracefully handle connection failures -- the SNF service may be
down or unreachable, so callers always get a usable (possibly empty) result
rather than an exception.

Endpoint paths are configurable via constructor kwargs so the client can
adapt if the SNF service API changes.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Default endpoint paths (relative to snf_assist_url)
_DEFAULT_VALIDATE_PATH = "/api/validate"
_DEFAULT_OPTIMIZE_PATH = "/api/optimize"
_DEFAULT_RAF_PATH = "/api/raf"
_DEFAULT_HEALTH_PATH = "/health"


class SNFClient:
    """Async HTTP client for the SNF Admit Assist microservice."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float = 30.0,
        validate_path: str = _DEFAULT_VALIDATE_PATH,
        optimize_path: str = _DEFAULT_OPTIMIZE_PATH,
        raf_path: str = _DEFAULT_RAF_PATH,
        health_path: str = _DEFAULT_HEALTH_PATH,
    ) -> None:
        self.base_url = (base_url or settings.snf_assist_url).rstrip("/")
        self.timeout = timeout

        # Configurable endpoint paths
        self.validate_path = validate_path
        self.optimize_path = optimize_path
        self.raf_path = raf_path
        self.health_path = health_path

        self._client: httpx.AsyncClient | None = None

    # -- lifecycle ------------------------------------------------------------

    def _get_client(self) -> httpx.AsyncClient:
        """Return the shared httpx.AsyncClient, creating it lazily."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=httpx.Timeout(self.timeout),
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=10,
                ),
            )
        return self._client

    async def close(self) -> None:
        """Close the underlying connection pool."""
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # -- private helpers ------------------------------------------------------

    async def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        """POST JSON to *path* and return the parsed response, or ``None`` on failure."""
        try:
            client = self._get_client()
            response = await client.post(path, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.warning("SNF Admit Assist unreachable at %s%s", self.base_url, path)
        except httpx.TimeoutException:
            logger.warning("SNF Admit Assist request timed out: %s%s", self.base_url, path)
        except httpx.HTTPStatusError as exc:
            logger.error(
                "SNF Admit Assist returned %s for %s%s: %s",
                exc.response.status_code,
                self.base_url,
                path,
                exc.response.text[:500],
            )
        except Exception:
            logger.exception("Unexpected error calling SNF Admit Assist %s%s", self.base_url, path)
        return None

    async def _get(self, path: str) -> dict[str, Any] | None:
        """GET *path* and return the parsed response, or ``None`` on failure."""
        try:
            client = self._get_client()
            response = await client.get(path)
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.warning("SNF Admit Assist unreachable at %s%s", self.base_url, path)
        except httpx.TimeoutException:
            logger.warning("SNF Admit Assist health check timed out: %s%s", self.base_url, path)
        except httpx.HTTPStatusError as exc:
            logger.error(
                "SNF Admit Assist returned %s for %s%s",
                exc.response.status_code,
                self.base_url,
                path,
            )
        except Exception:
            logger.exception("Unexpected error calling SNF Admit Assist %s%s", self.base_url, path)
        return None

    # -- public API -----------------------------------------------------------

    async def validate_codes(self, diagnosis_codes: list[str]) -> dict[str, Any] | None:
        """Validate ICD-10 codes and return HCC enrichment data.

        POST ``{base}/api/validate``

        Request body::

            {"codes": ["E11.65", "I50.9", ...]}

        Expected response::

            {
                "validated_codes": [
                    {
                        "code": "E11.65",
                        "valid": true,
                        "description": "Type 2 diabetes mellitus with hyperglycemia",
                        "hcc": 37,
                        "hcc_description": "Diabetes with Chronic Complications",
                        "raf": 0.302
                    },
                    ...
                ],
                "invalid_codes": [
                    {"code": "Z99.999", "valid": false, "suggestions": [...]}
                ]
            }

        Returns ``None`` if the service is unreachable.
        """
        if not diagnosis_codes:
            return {"validated_codes": [], "invalid_codes": []}

        return await self._post(self.validate_path, {"codes": diagnosis_codes})

    async def optimize_codes(
        self,
        diagnosis_codes: list[str],
        medications: list[str] | None = None,
    ) -> dict[str, Any] | None:
        """Run the code optimizer for specificity upgrades and gap detection.

        POST ``{base}/api/optimize``

        Request body::

            {
                "codes": ["E11.9", "I10", ...],
                "medications": ["metformin", "lisinopril", ...]   // optional
            }

        Expected response::

            {
                "optimized_codes": [
                    {
                        "original_code": "E11.9",
                        "suggested_code": "E11.65",
                        "reason": "specificity_upgrade",
                        "description": "Type 2 diabetes mellitus with hyperglycemia",
                        "evidence": "Patient on insulin + metformin suggests complications",
                        "hcc": 37,
                        "raf": 0.302
                    },
                    ...
                ],
                "med_dx_gaps": [
                    {
                        "medication": "metformin",
                        "missing_diagnosis": "Type 2 diabetes mellitus",
                        "suggested_codes": ["E11.9", "E11.65"],
                        "evidence": "Metformin prescribed without diabetes diagnosis"
                    },
                    ...
                ],
                "non_billable_fixes": [
                    {
                        "original_code": "E11",
                        "suggested_code": "E11.9",
                        "reason": "non_billable",
                        "description": "Header code replaced with billable code"
                    },
                    ...
                ]
            }

        Returns ``None`` if the service is unreachable.
        """
        if not diagnosis_codes:
            return {"optimized_codes": [], "med_dx_gaps": [], "non_billable_fixes": []}

        payload: dict[str, Any] = {"codes": diagnosis_codes}
        if medications:
            payload["medications"] = medications

        return await self._post(self.optimize_path, payload)

    async def calculate_raf(
        self,
        diagnosis_codes: list[str],
        age: int,
        sex: str,
        medicaid: bool = False,
        disabled: bool = False,
        institutional: bool = False,
    ) -> dict[str, Any] | None:
        """Calculate full RAF score with demographic base, disease, and interactions.

        POST ``{base}/api/raf``

        Request body::

            {
                "codes": ["E11.65", "I50.22", ...],
                "age": 72,
                "sex": "M",
                "medicaid": false,
                "disabled": false,
                "institutional": true
            }

        Expected response::

            {
                "total_raf": 2.456,
                "demographic_raf": 0.395,
                "disease_raf": 1.884,
                "interaction_raf": 0.177,
                "hcc_list": [
                    {"hcc": 37, "description": "...", "raf": 0.302, "codes": ["E11.65"]},
                    ...
                ],
                "interactions": [
                    {"name": "Diabetes + CHF", "bonus_raf": 0.121},
                    ...
                ],
                "near_misses": [
                    {
                        "name": "Diabetes + CHF + CKD5",
                        "potential_raf": 0.177,
                        "missing": "CKD Stage 5 / ESRD (HCC 326)"
                    },
                    ...
                ]
            }

        Returns ``None`` if the service is unreachable.
        """
        if not diagnosis_codes:
            return {
                "total_raf": 0.0,
                "demographic_raf": 0.0,
                "disease_raf": 0.0,
                "interaction_raf": 0.0,
                "hcc_list": [],
                "interactions": [],
                "near_misses": [],
            }

        payload: dict[str, Any] = {
            "codes": diagnosis_codes,
            "age": age,
            "sex": sex,
            "medicaid": medicaid,
            "disabled": disabled,
            "institutional": institutional,
        }

        return await self._post(self.raf_path, payload)

    async def check_health(self) -> bool:
        """Check whether the SNF Admit Assist service is reachable.

        GET ``{base}/health``

        Returns ``True`` if the service responds with a 2xx status.
        """
        result = await self._get(self.health_path)
        return result is not None


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_instance: SNFClient | None = None


def get_snf_client() -> SNFClient:
    """Return (or create) the module-level :class:`SNFClient` singleton."""
    global _instance
    if _instance is None:
        _instance = SNFClient()
    return _instance
