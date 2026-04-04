"""
Metriport HIE Adapter — cross-network patient data via Carequality + CommonWell.

Metriport provides a single API to query Health Information Exchanges (HIEs)
across 300M+ patient records. Returns C-CDA documents and FHIR R4 resources
from hospitals, specialists, and facilities OUTSIDE the MSO's EMR network.

Key use case for AQSoft:
  Patient admitted to outside hospital → Metriport pulls discharge summary
  → NLP extraction finds diagnoses → flag HCCs the PCP should recapture

Architecture:
  Metriport API (REST) → C-CDA documents + FHIR resources
  → FHIR_inferno (C-CDA → flat CSV, optional)
  → clinical_nlp_service (note extraction)
  → Tuva pipeline (claims/clinical data)
  → HCC analysis + gap detection

Metriport API docs: https://docs.metriport.com
Self-hosted (AGPL) or cloud-hosted.

NOTE: This adapter is a skeleton. Full implementation requires:
  1. Metriport API key (from their dashboard)
  2. Facility registration (NPI + organization details)
  3. Patient matching (demographics → Metriport patient ID)
  4. Document query + retrieval
"""

import logging
from datetime import date
from typing import Any

import httpx

from app.services.payer_api_service import PayerAdapter

logger = logging.getLogger(__name__)

# Metriport API base URLs
_SANDBOX_URL = "https://api.sandbox.metriport.com"
_PRODUCTION_URL = "https://api.metriport.com"


class MetriportAdapter(PayerAdapter):
    """Metriport HIE adapter for cross-network patient data."""

    def __init__(self, environment: str = "sandbox"):
        self.base_url = _SANDBOX_URL if environment == "sandbox" else _PRODUCTION_URL
        self.api_key: str | None = None
        self.facility_id: str | None = None

    @property
    def payer_name(self) -> str:
        return "metriport"

    @property
    def display_name(self) -> str:
        return "Metriport HIE (Carequality + CommonWell)"

    # -------------------------------------------------------------------
    # Connection management
    # -------------------------------------------------------------------

    async def connect(self, credentials: dict) -> dict:
        """Register with Metriport using API key.

        credentials should include:
        - api_key: Metriport API key
        - facility_id: registered facility ID (from Metriport dashboard)
        - environment: "sandbox" or "production"
        """
        self.api_key = credentials.get("api_key")
        self.facility_id = credentials.get("facility_id")
        env = credentials.get("environment", "sandbox")
        self.base_url = _SANDBOX_URL if env == "sandbox" else _PRODUCTION_URL

        if not self.api_key:
            return {"status": "error", "message": "api_key is required"}

        # Verify connection by hitting the organization endpoint
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/medical/v1/organization",
                    headers=self._headers(),
                    timeout=10,
                )
                if resp.status_code == 200:
                    org = resp.json()
                    return {
                        "status": "connected",
                        "organization": org.get("name"),
                        "facility_id": self.facility_id,
                    }
                else:
                    return {"status": "error", "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key or "",
            "Content-Type": "application/json",
        }

    # -------------------------------------------------------------------
    # Patient management
    # -------------------------------------------------------------------

    async def create_patient(
        self,
        first_name: str,
        last_name: str,
        dob: str,
        gender: str,
        zip_code: str | None = None,
    ) -> dict | None:
        """Create or match a patient in Metriport.

        Metriport uses demographics to find the patient across HIE networks.
        Returns the Metriport patient ID for subsequent queries.
        """
        body = {
            "firstName": first_name,
            "lastName": last_name,
            "dob": dob,  # YYYY-MM-DD
            "genderAtBirth": "M" if gender.upper().startswith("M") else "F",
        }
        if zip_code:
            body["address"] = [{"zip": zip_code, "country": "US"}]

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.base_url}/medical/v1/patient",
                    headers=self._headers(),
                    json=body,
                    params={"facilityId": self.facility_id} if self.facility_id else {},
                    timeout=30,
                )
                if resp.status_code in (200, 201):
                    return resp.json()
                logger.warning("Metriport create_patient failed: %d %s", resp.status_code, resp.text[:200])
                return None
        except Exception as e:
            logger.error("Metriport create_patient error: %s", e)
            return None

    # -------------------------------------------------------------------
    # Document query — triggers HIE network search
    # -------------------------------------------------------------------

    async def start_document_query(self, patient_id: str) -> dict | None:
        """Start a document query across HIE networks for a patient.

        This triggers Carequality/CommonWell to search for documents.
        Results arrive asynchronously — poll or use webhook.
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.base_url}/medical/v1/document/query",
                    headers=self._headers(),
                    params={
                        "patientId": patient_id,
                        "facilityId": self.facility_id or "",
                    },
                    timeout=30,
                )
                if resp.status_code == 200:
                    return resp.json()
                logger.warning("Metriport document query failed: %d", resp.status_code)
                return None
        except Exception as e:
            logger.error("Metriport document query error: %s", e)
            return None

    async def get_documents(self, patient_id: str) -> list[dict]:
        """Get all available documents for a patient.

        Call after start_document_query has completed.
        Returns list of document metadata with download URLs.
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/medical/v1/document",
                    headers=self._headers(),
                    params={"patientId": patient_id},
                    timeout=30,
                )
                if resp.status_code == 200:
                    return resp.json().get("documents", [])
                return []
        except Exception as e:
            logger.error("Metriport get_documents error: %s", e)
            return []

    async def download_document(self, doc_url: str) -> str | None:
        """Download a document's content (C-CDA XML or plain text)."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(doc_url, headers=self._headers(), timeout=60)
                if resp.status_code == 200:
                    return resp.text
                return None
        except Exception as e:
            logger.error("Metriport download error: %s", e)
            return None

    # -------------------------------------------------------------------
    # FHIR consolidated data
    # -------------------------------------------------------------------

    async def get_consolidated_fhir(self, patient_id: str) -> dict | None:
        """Get consolidated FHIR data for a patient.

        Metriport deduplicates and consolidates data from all HIE sources
        into a single FHIR Bundle. This is the cleanest data format.
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.base_url}/medical/v1/patient/{patient_id}/consolidated",
                    headers=self._headers(),
                    params={"resources": "Condition,Encounter,Observation,MedicationRequest,Procedure"},
                    timeout=60,
                )
                if resp.status_code == 200:
                    return resp.json()
                return None
        except Exception as e:
            logger.error("Metriport consolidated FHIR error: %s", e)
            return None

    # -------------------------------------------------------------------
    # Full pipeline: patient → query → documents → NLP → gaps
    # -------------------------------------------------------------------

    async def process_patient(
        self,
        first_name: str,
        last_name: str,
        dob: str,
        gender: str,
        zip_code: str | None = None,
        member_id: str | None = None,
    ) -> dict[str, Any]:
        """Full Metriport pipeline for a single patient.

        1. Create/match patient in Metriport
        2. Start document query across HIE networks
        3. Retrieve consolidated FHIR data
        4. Run through clinical NLP for HCC extraction
        5. Return extracted conditions + gaps

        Note: Document queries are asynchronous — this may need to be
        called in two phases (start query, then retrieve results later).
        """
        # Step 1: Create patient
        patient = await self.create_patient(first_name, last_name, dob, gender, zip_code)
        if not patient:
            return {"status": "error", "message": "Could not create/match patient in Metriport"}

        patient_id = patient.get("id")

        # Step 2: Start document query
        query_result = await self.start_document_query(patient_id)

        # Step 3: Get consolidated FHIR (may not be ready yet if query is async)
        fhir_bundle = await self.get_consolidated_fhir(patient_id)

        # Step 4: Get documents
        documents = await self.get_documents(patient_id)

        return {
            "status": "ok",
            "metriport_patient_id": patient_id,
            "documents_found": len(documents),
            "fhir_bundle": fhir_bundle,
            "documents": documents,
            "member_id": member_id,
        }

    # -------------------------------------------------------------------
    # Required PayerAdapter interface methods (stubs)
    # -------------------------------------------------------------------

    async def get_authorization_url(self, params: dict) -> dict:
        """Metriport uses API key, not OAuth. Return direct connection."""
        return {"auth_type": "api_key", "message": "Use connect() with api_key credential"}

    async def exchange_code(self, params: dict) -> dict:
        """Not applicable for API key auth."""
        return await self.connect(params)

    async def fetch_patients(self, token: str, params: dict) -> list[dict]:
        """Patients are created/matched, not fetched in bulk from Metriport."""
        return []

    async def fetch_conditions(self, token: str, params: dict) -> list[dict]:
        """Conditions come from consolidated FHIR, not a separate endpoint."""
        return []

    async def fetch_claims(self, token: str, params: dict) -> list[dict]:
        """Metriport is clinical data, not claims."""
        return []

    async def fetch_medications(self, token: str, params: dict) -> list[dict]:
        return []

    async def fetch_observations(self, token: str, params: dict) -> list[dict]:
        return []
