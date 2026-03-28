"""
Payer API Integration Service.

Provides a unified interface for connecting to health plan (payer) APIs,
authenticating via OAuth, and syncing FHIR R4 data into the platform.

Uses an adapter pattern so each payer's quirks are isolated in a dedicated
adapter class while the top-level functions remain payer-agnostic.

Data flow:  Payer FHIR API -> payer_api_service -> fhir_service (parse) -> DB upsert
"""

import base64
import json
import logging
from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.claim import Claim
from app.models.member import Member
from app.models.provider import Provider
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abstract Payer Adapter
# ---------------------------------------------------------------------------

class PayerAdapter(ABC):
    """Base class for payer-specific API adapters.

    Each payer (Humana, Florida Blue, UHC, etc.) implements this interface
    to handle its unique OAuth flow, FHIR profile, and API quirks.
    """

    @abstractmethod
    async def authenticate(self, credentials: dict) -> dict:
        """Exchange authorization code for access + refresh tokens.

        Parameters
        ----------
        credentials : dict
            Must include ``client_id``, ``client_secret``, ``code``,
            and ``redirect_uri``.

        Returns
        -------
        dict with keys: access_token, refresh_token, expires_in, token_type
        """
        ...

    @abstractmethod
    async def refresh_token(self, credentials: dict) -> dict:
        """Use a refresh token to obtain a new access token.

        Parameters
        ----------
        credentials : dict
            Must include ``client_id``, ``client_secret``, ``refresh_token``.

        Returns
        -------
        dict with keys: access_token, refresh_token, expires_in
        """
        ...

    @abstractmethod
    async def fetch_patients(self, token: str, params: dict) -> list[dict]:
        """Fetch Patient (member demographics) resources."""
        ...

    @abstractmethod
    async def fetch_claims(self, token: str, params: dict) -> list[dict]:
        """Fetch ExplanationOfBenefit (claims) resources."""
        ...

    @abstractmethod
    async def fetch_conditions(self, token: str, params: dict) -> list[dict]:
        """Fetch Condition (diagnosis) resources."""
        ...

    @abstractmethod
    async def fetch_coverage(self, token: str, params: dict) -> list[dict]:
        """Fetch Coverage (eligibility) resources."""
        ...

    @abstractmethod
    async def fetch_providers(self, token: str, params: dict) -> list[dict]:
        """Fetch Practitioner + PractitionerRole resources."""
        ...

    @abstractmethod
    async def fetch_medications(self, token: str, params: dict) -> list[dict]:
        """Fetch Medication + MedicationRequest resources."""
        ...

    @abstractmethod
    async def fetch_observations(self, token: str, params: dict) -> list[dict]:
        """Fetch Observation resources (lab results, vitals)."""
        ...

    # -------------------------------------------------------------------
    # Optional resource fetchers (not all payers support these)
    # Subclasses override as needed; defaults return empty lists.
    # -------------------------------------------------------------------

    async def fetch_practitioner_roles(self, token: str, params: dict) -> list[dict]:
        """Fetch PractitionerRole resources (network, specialty, acceptance)."""
        return []

    async def fetch_care_plans(self, token: str, params: dict) -> list[dict]:
        """Fetch CarePlan resources."""
        return []

    async def fetch_care_teams(self, token: str, params: dict) -> list[dict]:
        """Fetch CareTeam resources (PCP attribution)."""
        return []

    async def fetch_allergy_intolerances(self, token: str, params: dict) -> list[dict]:
        """Fetch AllergyIntolerance resources."""
        return []

    async def fetch_document_references(self, token: str, params: dict) -> list[dict]:
        """Fetch DocumentReference resources (clinical notes)."""
        return []

    async def fetch_immunizations(self, token: str, params: dict) -> list[dict]:
        """Fetch Immunization resources (vaccine records)."""
        return []

    async def fetch_procedures(self, token: str, params: dict) -> list[dict]:
        """Fetch Procedure resources (supplements EOB data)."""
        return []

    @abstractmethod
    def get_authorization_url(self, credentials: dict) -> str:
        """Build the OAuth authorization URL for browser redirect."""
        ...

    @abstractmethod
    def get_scopes(self) -> str:
        """Return the required OAuth scopes as a space-delimited string."""
        ...


# ---------------------------------------------------------------------------
# Credential encryption helpers
# ---------------------------------------------------------------------------

def _encrypt_value(value: str) -> str:
    """Encode a credential value for storage.

    Production should use Fernet or AWS KMS. For now we use base64
    as a placeholder that keeps plain text out of DB dumps.
    """
    return base64.b64encode(value.encode()).decode()


def _decrypt_value(value: str) -> str:
    """Decode a stored credential value."""
    try:
        return base64.b64decode(value.encode()).decode()
    except Exception:
        # Fallback: value may not be encoded (e.g., during tests)
        return value


# ---------------------------------------------------------------------------
# Top-level payer connection management
# ---------------------------------------------------------------------------

async def connect_payer(
    db: AsyncSession,
    payer_name: str,
    credentials: dict,
    tenant_schema: str,
) -> dict:
    """Authenticate with a payer API and store encrypted tokens in tenant config.

    Parameters
    ----------
    db : AsyncSession
        Platform-level DB session.
    payer_name : str
        Adapter key, e.g. ``"humana"``.
    credentials : dict
        Must include ``client_id``, ``client_secret``, ``code`` (auth code),
        ``redirect_uri``, and optionally ``environment`` (sandbox/production).
    tenant_schema : str
        The calling tenant's schema name.

    Returns
    -------
    dict with ``status``, ``payer``, ``message``.
    """
    from app.services.payer_adapters import get_adapter

    adapter = get_adapter(payer_name)
    environment = credentials.get("environment", "sandbox")

    # Exchange authorization code for tokens
    token_response = await adapter.authenticate(credentials)

    now = datetime.now(timezone.utc)
    expires_in = token_response.get("expires_in", 3600)

    # Build connection record with encrypted secrets
    connection = {
        "client_id": _encrypt_value(credentials["client_id"]),
        "client_secret": _encrypt_value(credentials["client_secret"]),
        "access_token": _encrypt_value(token_response["access_token"]),
        "refresh_token": _encrypt_value(token_response.get("refresh_token", "")),
        "token_expires_at": (
            now.timestamp() + expires_in
        ),
        "environment": environment,
        "last_sync": None,
        "sync_status": "connected",
        "connected_at": now.isoformat(),
    }

    # Persist adapter-specific fields (practice_code for eCW, etc.)
    for key in ("practice_code",):
        if credentials.get(key):
            connection[key] = credentials[key]

    # Cache discovered endpoints from token response (eCW avoids re-discovery)
    if token_response.get("cached_endpoints"):
        connection["cached_endpoints"] = token_response["cached_endpoints"]

    # Persist into tenant config JSONB
    await _upsert_payer_connection(db, tenant_schema, payer_name, connection)

    logger.info(
        "Payer %s connected for tenant %s (env=%s)",
        payer_name, tenant_schema, environment,
    )
    return {
        "status": "connected",
        "payer": payer_name,
        "environment": environment,
        "message": f"Successfully connected to {payer_name}",
    }


async def sync_payer_data(
    db: AsyncSession,
    payer_name: str,
    tenant_schema: str,
    data_types: list[str] | None = None,
) -> dict:
    """Pull data from a connected payer API, parse FHIR, and upsert to DB.

    Parameters
    ----------
    db : AsyncSession
        Tenant-scoped DB session.
    payer_name : str
        Adapter key.
    tenant_schema : str
        Tenant schema name (used to retrieve stored credentials).
    data_types : list[str] | None
        Which resource types to sync. Defaults to all 14:
        ``["patients", "coverage", "claims", "conditions", "providers",
        "medications", "observations", "practitioner_roles", "care_plans",
        "care_teams", "allergy_intolerances", "document_references",
        "immunizations", "procedures"]``

    Returns
    -------
    dict with counts of synced resources and any errors.
    """
    from app.services.payer_adapters import get_adapter

    adapter = get_adapter(payer_name)

    # Retrieve and decrypt stored credentials
    connection = await _get_payer_connection(db, tenant_schema, payer_name)
    if not connection:
        return {"status": "error", "message": f"No connection found for {payer_name}"}

    access_token = _decrypt_value(connection["access_token"])
    token_expires_at = connection.get("token_expires_at", 0)

    # Refresh token if expired or about to expire (5-minute buffer)
    now = datetime.now(timezone.utc).timestamp()
    if now >= (token_expires_at - 300):
        logger.info("Access token expired for %s, refreshing...", payer_name)
        refresh_creds = {
            "client_id": _decrypt_value(connection["client_id"]),
            "client_secret": _decrypt_value(connection["client_secret"]),
            "refresh_token": _decrypt_value(connection["refresh_token"]),
            "environment": connection.get("environment", "sandbox"),
        }
        # Pass through adapter-specific fields needed for endpoint discovery
        for key in ("practice_code", "cached_endpoints"):
            if connection.get(key):
                refresh_creds[key] = connection[key]
        try:
            token_response = await adapter.refresh_token(refresh_creds)
            access_token = token_response["access_token"]
            # Update stored tokens
            connection["access_token"] = _encrypt_value(access_token)
            if token_response.get("refresh_token"):
                connection["refresh_token"] = _encrypt_value(token_response["refresh_token"])
            connection["token_expires_at"] = now + token_response.get("expires_in", 3600)
            # Update cached endpoints if returned (eCW endpoint caching)
            if token_response.get("cached_endpoints"):
                connection["cached_endpoints"] = token_response["cached_endpoints"]
            await _upsert_payer_connection(db, tenant_schema, payer_name, connection)
        except Exception as e:
            logger.error("Token refresh failed for %s: %s", payer_name, e)
            return {"status": "error", "message": f"Token refresh failed: {e}"}

    # Determine what to sync
    all_types = [
        "patients", "coverage", "claims", "conditions", "providers",
        "medications", "observations", "practitioner_roles", "care_plans",
        "care_teams", "allergy_intolerances", "document_references",
        "immunizations", "procedures",
    ]
    sync_types = data_types or all_types

    results = {
        "status": "completed",
        "payer": payer_name,
        "synced": {},
        "errors": [],
    }

    params = {"environment": connection.get("environment", "sandbox")}
    # Pass through adapter-specific params (practice_code for eCW, etc.)
    for key in ("practice_code", "client_id", "client_secret", "cached_endpoints"):
        if connection.get(key):
            params[key] = _decrypt_value(connection[key]) if key in ("client_id", "client_secret") else connection[key]

    # Sync each data type
    for data_type in sync_types:
        try:
            if data_type == "patients":
                resources = await adapter.fetch_patients(access_token, params)
                count = await _upsert_patients(db, resources)
                results["synced"]["patients"] = count

            elif data_type == "coverage":
                resources = await adapter.fetch_coverage(access_token, params)
                count = await _upsert_coverage(db, resources)
                results["synced"]["coverage"] = count

            elif data_type == "claims":
                resources = await adapter.fetch_claims(access_token, params)
                count = await _upsert_claims(db, resources)
                results["synced"]["claims"] = count

            elif data_type == "conditions":
                resources = await adapter.fetch_conditions(access_token, params)
                count = await _upsert_conditions(db, resources)
                results["synced"]["conditions"] = count

            elif data_type == "providers":
                resources = await adapter.fetch_providers(access_token, params)
                count = await _upsert_providers(db, resources)
                results["synced"]["providers"] = count

            elif data_type == "medications":
                resources = await adapter.fetch_medications(access_token, params)
                count = await _upsert_medications(db, resources)
                results["synced"]["medications"] = count

            elif data_type == "observations":
                resources = await adapter.fetch_observations(access_token, params)
                count = await _upsert_observations(db, resources)
                results["synced"]["observations"] = count

            elif data_type == "practitioner_roles":
                resources = await adapter.fetch_practitioner_roles(access_token, params)
                count = await _upsert_practitioner_roles(db, resources)
                results["synced"]["practitioner_roles"] = count

            elif data_type == "care_plans":
                resources = await adapter.fetch_care_plans(access_token, params)
                count = await _upsert_care_plans(db, resources)
                results["synced"]["care_plans"] = count

            elif data_type == "care_teams":
                resources = await adapter.fetch_care_teams(access_token, params)
                count = await _upsert_care_teams(db, resources)
                results["synced"]["care_teams"] = count

            elif data_type == "allergy_intolerances":
                resources = await adapter.fetch_allergy_intolerances(access_token, params)
                count = await _upsert_allergy_intolerances(db, resources)
                results["synced"]["allergy_intolerances"] = count

            elif data_type == "document_references":
                resources = await adapter.fetch_document_references(access_token, params)
                count = await _upsert_document_references(db, resources)
                results["synced"]["document_references"] = count

            elif data_type == "immunizations":
                resources = await adapter.fetch_immunizations(access_token, params)
                count = await _upsert_immunizations(db, resources)
                results["synced"]["immunizations"] = count

            elif data_type == "procedures":
                resources = await adapter.fetch_procedures(access_token, params)
                count = await _upsert_procedures(db, resources)
                results["synced"]["procedures"] = count

        except Exception as e:
            logger.error("Error syncing %s from %s: %s", data_type, payer_name, e, exc_info=True)
            results["errors"].append({"type": data_type, "error": str(e)})

    # Update last sync timestamp
    connection["last_sync"] = datetime.now(timezone.utc).isoformat()
    connection["sync_status"] = "active" if not results["errors"] else "partial"
    await _upsert_payer_connection(db, tenant_schema, payer_name, connection)

    await db.commit()

    # Trigger post-sync HCC analysis if patients or claims were synced
    synced_keys = set(results.get("synced", {}).keys())
    if synced_keys & {"patients", "claims", "conditions"}:
        try:
            from app.services.hcc_engine import analyze_population
            logger.info("Triggering post-sync HCC analysis for %s", tenant_schema)
            hcc_results = await analyze_population(tenant_schema, db)
            results["hcc_analysis"] = {
                "members_analyzed": hcc_results.get("members_analyzed", 0),
                "suspects_found": hcc_results.get("total_suspects", 0),
            }
        except Exception as e:
            logger.warning("Post-sync HCC analysis failed (non-fatal): %s", e)
            results["hcc_analysis"] = {"error": str(e)}

    logger.info("Payer sync completed for %s/%s: %s", tenant_schema, payer_name, results["synced"])
    return results


async def get_payer_status(
    db: AsyncSession,
    payer_name: str,
    tenant_schema: str,
) -> dict:
    """Check connection status for a payer.

    Returns
    -------
    dict with ``connected``, ``environment``, ``last_sync``, ``sync_status``,
    ``token_valid``.
    """
    connection = await _get_payer_connection(db, tenant_schema, payer_name)
    if not connection:
        return {
            "payer": payer_name,
            "connected": False,
        }

    now = datetime.now(timezone.utc).timestamp()
    token_valid = now < connection.get("token_expires_at", 0)
    has_refresh = bool(connection.get("refresh_token"))

    return {
        "payer": payer_name,
        "connected": True,
        "environment": connection.get("environment", "sandbox"),
        "last_sync": connection.get("last_sync"),
        "sync_status": connection.get("sync_status", "unknown"),
        "token_valid": token_valid,
        "can_refresh": has_refresh,
        "connected_at": connection.get("connected_at"),
    }


async def disconnect_payer(
    db: AsyncSession,
    payer_name: str,
    tenant_schema: str,
) -> dict:
    """Remove stored credentials for a payer connection."""
    result = await db.execute(
        text(
            "SELECT config FROM platform.tenants WHERE schema_name = :schema"
        ),
        {"schema": tenant_schema},
    )
    row = result.fetchone()
    if not row or not row.config:
        return {"status": "ok", "message": "No connection to remove"}

    config = dict(row.config)
    connections = config.get("payer_connections", {})
    if payer_name in connections:
        del connections[payer_name]
        config["payer_connections"] = connections
        await db.execute(
            text(
                "UPDATE platform.tenants SET config = :config WHERE schema_name = :schema"
            ),
            {"config": json.dumps(config), "schema": tenant_schema},
        )
        await db.commit()

    logger.info("Payer %s disconnected for tenant %s", payer_name, tenant_schema)
    return {"status": "disconnected", "payer": payer_name}


async def get_available_payers(
    db: AsyncSession,
    tenant_schema: str,
) -> list[dict]:
    """List all available payer integrations with their connection status."""
    from app.services.payer_adapters import ADAPTERS

    payers = []
    for name in ADAPTERS:
        status = await get_payer_status(db, name, tenant_schema)
        payers.append({
            "name": name,
            "display_name": name.title(),
            "connected": status.get("connected", False),
            "environment": status.get("environment"),
            "last_sync": status.get("last_sync"),
            "sync_status": status.get("sync_status"),
        })
    return payers


# ---------------------------------------------------------------------------
# Internal: tenant config helpers
# ---------------------------------------------------------------------------

async def _get_payer_connection(
    db: AsyncSession,
    tenant_schema: str,
    payer_name: str,
) -> dict | None:
    """Read a payer connection record from tenant config JSONB."""
    result = await db.execute(
        text(
            "SELECT config FROM platform.tenants WHERE schema_name = :schema"
        ),
        {"schema": tenant_schema},
    )
    row = result.fetchone()
    if not row or not row.config:
        return None
    return row.config.get("payer_connections", {}).get(payer_name)


async def _upsert_payer_connection(
    db: AsyncSession,
    tenant_schema: str,
    payer_name: str,
    connection: dict,
) -> None:
    """Write a payer connection record into tenant config JSONB."""
    result = await db.execute(
        text(
            "SELECT config FROM platform.tenants WHERE schema_name = :schema"
        ),
        {"schema": tenant_schema},
    )
    row = result.fetchone()
    config = dict(row.config) if row and row.config else {}

    if "payer_connections" not in config:
        config["payer_connections"] = {}
    config["payer_connections"][payer_name] = connection

    await db.execute(
        text(
            "UPDATE platform.tenants SET config = :config WHERE schema_name = :schema"
        ),
        {"config": json.dumps(config), "schema": tenant_schema},
    )
    await db.commit()


# ---------------------------------------------------------------------------
# Internal: FHIR resource -> DB upsert helpers
# ---------------------------------------------------------------------------

async def _upsert_patients(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed Patient dicts to Member rows."""
    count = 0
    for res in resources:
        member_id = res.get("member_id")
        if not member_id:
            continue

        existing_q = await db.execute(
            select(Member).where(Member.member_id == member_id)
        )
        existing = existing_q.scalar_one_or_none()

        # Fallback: check by fhir_id in extra (handles re-sync with different member_id)
        if not existing and res.get("fhir_id"):
            fhir_q = await db.execute(
                select(Member).where(
                    Member.extra["fhir_id"].astext == res["fhir_id"]
                )
            )
            existing = fhir_q.scalar_one_or_none()
            if existing:
                # Update member_id if we found a better one (MBI > FHIR ID)
                existing.member_id = member_id

        if existing:
            existing.first_name = res.get("first_name") or existing.first_name
            existing.last_name = res.get("last_name") or existing.last_name
            if res.get("date_of_birth"):
                existing.date_of_birth = res["date_of_birth"]
            if res.get("gender"):
                existing.gender = res["gender"]
            if res.get("zip_code"):
                existing.zip_code = res["zip_code"]
            if res.get("medicaid_status") is not None:
                existing.medicaid_status = res["medicaid_status"]
            # Merge extra data (preserve existing keys, add/update new ones)
            if res.get("extra"):
                merged = dict(existing.extra or {})
                merged.update({k: v for k, v in res["extra"].items() if v is not None})
                existing.extra = merged
        else:
            member = Member(
                member_id=member_id,
                first_name=res.get("first_name", ""),
                last_name=res.get("last_name", ""),
                date_of_birth=res.get("date_of_birth", date(1900, 1, 1)),
                gender=res.get("gender", "U"),
                zip_code=res.get("zip_code"),
                medicaid_status=res.get("medicaid_status", False),
                extra=res.get("extra"),
            )
            db.add(member)

        count += 1

    await db.flush()
    return count


async def _resolve_member(db: AsyncSession, member_id_str: str) -> "Member | None":
    """Resolve a member by member_id, falling back to fhir_id in extra JSONB.

    Payer FHIR APIs reference patients by FHIR resource ID (e.g. 'Patient/12345'),
    but the member_id stored in the DB may be an MBI or plan member ID.
    This fallback ensures data linkage works regardless.
    """
    # Primary lookup by member_id
    result = await db.execute(
        select(Member).where(Member.member_id == member_id_str)
    )
    member = result.scalar_one_or_none()
    if member:
        return member

    # Fallback: search by fhir_id in extra JSONB
    result = await db.execute(
        select(Member).where(
            Member.extra["fhir_id"].astext == member_id_str
        )
    )
    return result.scalar_one_or_none()


async def _upsert_coverage(db: AsyncSession, resources: list[dict]) -> int:
    """Apply Coverage data to existing Member records (eligibility fields)."""
    count = 0
    for res in resources:
        member_id = res.get("member_id")
        if not member_id:
            continue

        member = await _resolve_member(db, member_id)
        if not member:
            logger.warning("Coverage references unknown member: %s", member_id)
            continue

        if res.get("coverage_start"):
            member.coverage_start = res["coverage_start"]
        if res.get("coverage_end"):
            member.coverage_end = res["coverage_end"]
        if res.get("health_plan"):
            member.health_plan = res["health_plan"]
        if res.get("plan_product"):
            member.plan_product = res["plan_product"]
        # Merge coverage extra data into member extra
        if res.get("extra"):
            merged = dict(member.extra or {})
            merged["coverage"] = {k: v for k, v in res["extra"].items() if v is not None}
            member.extra = merged

        count += 1

    await db.flush()
    return count


def _decimal(val: Any) -> Decimal | None:
    """Parse a value to Decimal safely, returning None on failure."""
    if val is None:
        return None
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError):
        return None


async def _upsert_claims(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed EOB dicts to Claim rows."""
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        # Resolve member FK (with fhir_id fallback)
        member = await _resolve_member(db, member_id_str)
        if not member:
            logger.warning("Claim references unknown member: %s", member_id_str)
            continue

        # Check for duplicate claim_id — update existing if found
        claim_id = res.get("claim_id")
        if claim_id:
            dup_q = await db.execute(
                select(Claim).where(Claim.claim_id == claim_id)
            )
            existing_claim = dup_q.scalar_one_or_none()
            if existing_claim:
                # Update existing claim with newer data from payer
                if res.get("paid_amount") is not None:
                    existing_claim.paid_amount = _decimal(res["paid_amount"])
                if res.get("allowed_amount") is not None:
                    existing_claim.allowed_amount = _decimal(res["allowed_amount"])
                if res.get("status"):
                    existing_claim.status = res["status"]
                if res.get("paid_date"):
                    existing_claim.paid_date = res["paid_date"]
                if res.get("extra"):
                    merged_extra = dict(existing_claim.extra or {})
                    merged_extra.update({k: v for k, v in res["extra"].items() if v is not None})
                    existing_claim.extra = merged_extra
                count += 1
                continue

        # Compute primary_diagnosis from first diagnosis code
        diag_codes = res.get("diagnosis_codes")
        primary_diagnosis = diag_codes[0] if diag_codes else None

        claim = Claim(
            member_id=member.id,
            claim_id=claim_id,
            claim_type=res.get("claim_type", "professional"),
            service_date=res.get("service_date", date.today()),
            paid_date=res.get("paid_date"),
            diagnosis_codes=diag_codes,
            procedure_code=res.get("procedure_code"),
            drg_code=res.get("drg_code"),
            ndc_code=res.get("ndc_code"),
            billing_npi=res.get("billing_npi") or res.get("provider_npi"),
            billing_tin=res.get("billing_tin"),
            facility_name=res.get("facility_name"),
            facility_npi=res.get("facility_npi"),
            billed_amount=_decimal(res.get("billed_amount")),
            allowed_amount=_decimal(res.get("allowed_amount")),
            paid_amount=_decimal(res.get("paid_amount")),
            member_liability=_decimal(res.get("member_liability")),
            service_category=res.get("service_category", "professional"),
            pos_code=res.get("pos_code"),
            drug_name=res.get("drug_name"),
            quantity=res.get("quantity"),
            days_supply=res.get("days_supply"),
            los=res.get("los"),
            status=res.get("status", "paid"),
            primary_diagnosis=primary_diagnosis,
            extra=res.get("extra"),
            data_tier="record",
            is_estimated=False,
            signal_source=f"payer_api_{res.get('payer', 'unknown')}",
        )
        db.add(claim)
        count += 1

    await db.flush()
    return count


async def _upsert_conditions(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed Condition dicts to Claim rows (diagnosis signals)."""
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        icd_codes = res.get("icd_codes", [])
        if not icd_codes:
            continue

        claim = Claim(
            member_id=member.id,
            claim_type="professional",
            service_date=res.get("onset_date", date.today()),
            diagnosis_codes=icd_codes,
            primary_diagnosis=icd_codes[0] if icd_codes else None,
            service_category="professional",
            extra=res.get("extra"),
            data_tier="signal",
            is_estimated=False,
            signal_source="payer_api_condition",
        )
        db.add(claim)
        count += 1

    await db.flush()
    return count


async def _upsert_providers(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed Practitioner dicts to Provider rows."""
    count = 0
    for res in resources:
        npi = res.get("npi")
        if not npi:
            continue

        existing_q = await db.execute(
            select(Provider).where(Provider.npi == npi)
        )
        existing = existing_q.scalar_one_or_none()

        if existing:
            if res.get("first_name"):
                existing.first_name = res["first_name"]
            if res.get("last_name"):
                existing.last_name = res["last_name"]
            if res.get("specialty"):
                existing.specialty = res["specialty"]
            if res.get("tin"):
                existing.tin = res["tin"]
            if res.get("practice_name"):
                existing.practice_name = res["practice_name"]
            # Merge extra data
            if res.get("extra"):
                merged = dict(existing.extra or {})
                merged.update({k: v for k, v in res["extra"].items() if v is not None})
                existing.extra = merged
        else:
            provider = Provider(
                npi=npi,
                first_name=res.get("first_name", ""),
                last_name=res.get("last_name", ""),
                specialty=res.get("specialty"),
                tin=res.get("tin"),
                practice_name=res.get("practice_name"),
                extra=res.get("extra"),
            )
            db.add(provider)

        count += 1

    await db.flush()
    return count


async def _upsert_medications(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed Medication/MedicationRequest dicts to pharmacy Claims."""
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        claim = Claim(
            member_id=member.id,
            claim_type="pharmacy",
            service_date=res.get("service_date", date.today()),
            drug_name=res.get("drug_name"),
            ndc_code=res.get("ndc_code"),
            days_supply=res.get("days_supply"),
            status=res.get("status", "paid"),
            service_category="pharmacy",
            extra=res.get("extra"),
            data_tier="signal",
            is_estimated=False,
            signal_source="payer_api_medication",
        )
        db.add(claim)
        count += 1

    await db.flush()
    return count


async def _upsert_observations(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed Observation dicts to Claim rows (lab/vital signals).

    Observations are stored as signal-tier claims with service_category="lab"
    or "vital-signs". The structured observation data is preserved in
    Claim.extra JSONB for downstream analytics (e.g., A1C trending, eGFR
    monitoring for CKD HCC validation).
    """
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        # Build extra with all observation-specific fields
        obs_extra = dict(res.get("extra", {}) or {})
        obs_extra["test_code"] = res.get("test_code")
        obs_extra["test_name"] = res.get("test_name")
        obs_extra["result_value"] = res.get("result_value")
        obs_extra["result_string"] = res.get("result_string")
        obs_extra["result_units"] = res.get("result_units")
        obs_extra["abnormal_flag"] = res.get("abnormal_flag")
        obs_extra["observation_status"] = res.get("status")

        # Determine service category from observation category
        obs_cat = res.get("category", "laboratory")
        service_category = "lab" if obs_cat == "laboratory" else obs_cat or "lab"

        claim = Claim(
            member_id=member.id,
            claim_type="professional",
            service_date=res.get("observation_date", date.today()),
            procedure_code=res.get("test_code"),  # LOINC code as procedure
            service_category=service_category,
            extra=obs_extra,
            data_tier="signal",
            is_estimated=False,
            signal_source="payer_api_observation",
        )
        db.add(claim)
        count += 1

    await db.flush()
    return count


# ---------------------------------------------------------------------------
# Internal: NEW resource upsert helpers (7 additional FHIR resources)
# ---------------------------------------------------------------------------

async def _upsert_practitioner_roles(db: AsyncSession, resources: list[dict]) -> int:
    """Enrich existing Provider records with PractitionerRole data.

    Updates network_status, accepting_new_patients, specialty (if better),
    and merges role-specific data into Provider.extra JSONB.
    """
    count = 0
    for res in resources:
        npi = res.get("npi")
        if not npi:
            continue

        existing_q = await db.execute(
            select(Provider).where(Provider.npi == npi)
        )
        provider = existing_q.scalar_one_or_none()

        if not provider:
            # Create a minimal provider record from role data
            provider = Provider(
                npi=npi,
                first_name="",
                last_name="",
                specialty=res.get("specialty"),
                practice_name=res.get("organization_name"),
                extra={},
            )
            db.add(provider)

        # Update specialty if we got a better one from NUCC taxonomy
        if res.get("specialty") and not provider.specialty:
            provider.specialty = res["specialty"]

        # Update practice name from organization
        if res.get("organization_name") and not provider.practice_name:
            provider.practice_name = res["organization_name"]

        # Merge role-specific data into extra
        merged = dict(provider.extra or {})
        if res.get("network_name"):
            merged["network_name"] = res["network_name"]
            merged["network_status"] = "in_network"
        if res.get("accepting_new_patients") is not None:
            merged["accepting_new_patients"] = res["accepting_new_patients"]
        if res.get("active") is not None:
            merged["role_active"] = res["active"]
        # Merge the extra dict from parser
        role_extra = res.get("extra", {})
        if role_extra:
            for k, v in role_extra.items():
                if v is not None:
                    merged[k] = v
        provider.extra = merged

        count += 1

    await db.flush()
    return count


async def _upsert_care_plans(db: AsyncSession, resources: list[dict]) -> int:
    """Store CarePlan data in Member.extra JSONB as care_plans array."""
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        merged = dict(member.extra or {})
        care_plans = merged.get("care_plans", [])

        # Check for duplicate by fhir_id
        fhir_id = res.get("fhir_id")
        if fhir_id:
            care_plans = [cp for cp in care_plans if cp.get("fhir_id") != fhir_id]

        care_plans.append({
            "fhir_id": fhir_id,
            "status": res.get("status"),
            "intent": res.get("intent"),
            "title": res.get("title"),
            "description": res.get("description"),
            "categories": res.get("categories"),
            "period_start": res.get("period_start"),
            "period_end": res.get("period_end"),
            "conditions_addressed": res.get("conditions_addressed"),
            "notes": res.get("notes"),
            "activities": res.get("activities"),
        })

        merged["care_plans"] = care_plans
        member.extra = merged
        count += 1

    await db.flush()
    return count


async def _upsert_care_teams(db: AsyncSession, resources: list[dict]) -> int:
    """Store CareTeam data in Member.extra and update PCP attribution.

    If a CareTeam has a participant with role "primary", use their NPI
    to set member.pcp_provider_id (FK to Provider).
    """
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        # Store care team in extra
        merged = dict(member.extra or {})
        care_teams = merged.get("care_teams", [])

        fhir_id = res.get("fhir_id")
        if fhir_id:
            care_teams = [ct for ct in care_teams if ct.get("fhir_id") != fhir_id]

        care_teams.append({
            "fhir_id": fhir_id,
            "status": res.get("status"),
            "name": res.get("name"),
            "period_start": res.get("period_start"),
            "period_end": res.get("period_end"),
            "participants": res.get("participants"),
        })

        merged["care_teams"] = care_teams
        member.extra = merged

        # PCP attribution: if primary_npi found, link to provider
        primary_npi = res.get("primary_npi")
        if primary_npi:
            provider_q = await db.execute(
                select(Provider).where(Provider.npi == primary_npi)
            )
            provider = provider_q.scalar_one_or_none()
            if provider and hasattr(member, "pcp_provider_id"):
                member.pcp_provider_id = provider.id

        count += 1

    await db.flush()
    return count


async def _upsert_allergy_intolerances(db: AsyncSession, resources: list[dict]) -> int:
    """Store AllergyIntolerance data in Member.extra JSONB as allergies array.

    Useful for clinical decision support and drug interaction checking.
    """
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        merged = dict(member.extra or {})
        allergies = merged.get("allergies", [])

        # Deduplicate by fhir_id
        fhir_id = res.get("fhir_id")
        if fhir_id:
            allergies = [a for a in allergies if a.get("fhir_id") != fhir_id]

        allergies.append({
            "fhir_id": fhir_id,
            "allergen_name": res.get("allergen_name"),
            "allergen_code": res.get("allergen_code"),
            "allergen_system": res.get("allergen_system"),
            "clinical_status": res.get("clinical_status"),
            "verification_status": res.get("verification_status"),
            "allergy_type": res.get("allergy_type"),
            "categories": res.get("categories"),
            "criticality": res.get("criticality"),
            "onset_date": res.get("onset_date"),
            "reactions": res.get("reactions"),
            "notes": res.get("notes"),
        })

        merged["allergies"] = allergies
        member.extra = merged
        count += 1

    await db.flush()
    return count


async def _upsert_document_references(db: AsyncSession, resources: list[dict]) -> int:
    """Store DocumentReference data in Member.extra JSONB as clinical_documents array.

    The actual HTML content from Humana is preserved for AI analysis.
    """
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        merged = dict(member.extra or {})
        documents = merged.get("clinical_documents", [])

        # Deduplicate by fhir_id
        fhir_id = res.get("fhir_id")
        if fhir_id:
            documents = [d for d in documents if d.get("fhir_id") != fhir_id]

        documents.append({
            "fhir_id": fhir_id,
            "doc_type_code": res.get("doc_type_code"),
            "doc_type_display": res.get("doc_type_display"),
            "categories": res.get("categories"),
            "status": res.get("status"),
            "date": res.get("date"),
            "description": res.get("description"),
            "authors": res.get("authors"),
            "content": res.get("content"),
            "context": res.get("context"),
        })

        merged["clinical_documents"] = documents
        member.extra = merged
        count += 1

    await db.flush()
    return count


async def _upsert_immunizations(db: AsyncSession, resources: list[dict]) -> int:
    """Store Immunization data in Member.extra JSONB as immunizations array.

    Supports quality measures like flu vaccine administration tracking.
    """
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        merged = dict(member.extra or {})
        immunizations = merged.get("immunizations", [])

        # Deduplicate by fhir_id
        fhir_id = res.get("fhir_id")
        if fhir_id:
            immunizations = [i for i in immunizations if i.get("fhir_id") != fhir_id]

        immunizations.append({
            "fhir_id": fhir_id,
            "vaccine_code": res.get("vaccine_code"),
            "vaccine_system": res.get("vaccine_system"),
            "vaccine_name": res.get("vaccine_name"),
            "status": res.get("status"),
            "occurrence_date": res.get("occurrence_date"),
            "primary_source": res.get("primary_source"),
            "lot_number": res.get("lot_number"),
            "site": res.get("site"),
            "route": res.get("route"),
            "performers": res.get("performers"),
            "notes": res.get("notes"),
        })

        merged["immunizations"] = immunizations
        member.extra = merged
        count += 1

    await db.flush()
    return count


async def _upsert_procedures(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed Procedure dicts to Claim rows (supplements EOB data).

    Procedures that appear in the Procedure resource but not in EOB are
    stored as signal-tier claims to ensure complete procedure capture.
    """
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        member = await _resolve_member(db, member_id_str)
        if not member:
            continue

        # Build extra with procedure-specific fields
        proc_extra = {
            "fhir_id": res.get("fhir_id"),
            "procedure_display": res.get("procedure_display"),
            "procedure_system": res.get("procedure_system"),
            "performer_display": res.get("performer_display"),
            "category": res.get("category"),
            "body_sites": res.get("body_sites"),
            "reason_codes": res.get("reason_codes"),
            "encounter_ref": res.get("encounter_ref"),
            "performed_end": res.get("performed_end"),
            "notes": res.get("notes"),
        }

        service_date = res.get("performed_date") or date.today()

        claim = Claim(
            member_id=member.id,
            claim_type="professional",
            service_date=service_date,
            procedure_code=res.get("procedure_code"),
            billing_npi=res.get("performer_npi"),
            diagnosis_codes=res.get("reason_codes"),
            status=res.get("status", "completed"),
            service_category="procedure",
            extra=proc_extra,
            data_tier="signal",
            is_estimated=False,
            signal_source="payer_api_procedure",
        )
        db.add(claim)
        count += 1

    await db.flush()
    return count
