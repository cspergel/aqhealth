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
        Which resource types to sync. Defaults to all:
        ``["patients", "coverage", "claims", "conditions", "providers", "medications"]``

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

    # Refresh token if expired
    now = datetime.now(timezone.utc).timestamp()
    if now >= token_expires_at:
        logger.info("Access token expired for %s, refreshing...", payer_name)
        refresh_creds = {
            "client_id": _decrypt_value(connection["client_id"]),
            "client_secret": _decrypt_value(connection["client_secret"]),
            "refresh_token": _decrypt_value(connection["refresh_token"]),
            "environment": connection.get("environment", "sandbox"),
        }
        try:
            token_response = await adapter.refresh_token(refresh_creds)
            access_token = token_response["access_token"]
            # Update stored tokens
            connection["access_token"] = _encrypt_value(access_token)
            if token_response.get("refresh_token"):
                connection["refresh_token"] = _encrypt_value(token_response["refresh_token"])
            connection["token_expires_at"] = now + token_response.get("expires_in", 3600)
            await _upsert_payer_connection(db, tenant_schema, payer_name, connection)
        except Exception as e:
            logger.error("Token refresh failed for %s: %s", payer_name, e)
            return {"status": "error", "message": f"Token refresh failed: {e}"}

    # Determine what to sync
    all_types = ["patients", "coverage", "claims", "conditions", "providers", "medications"]
    sync_types = data_types or all_types

    results = {
        "status": "completed",
        "payer": payer_name,
        "synced": {},
        "errors": [],
    }

    params = {"environment": connection.get("environment", "sandbox")}

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

        except Exception as e:
            logger.error("Error syncing %s from %s: %s", data_type, payer_name, e, exc_info=True)
            results["errors"].append({"type": data_type, "error": str(e)})

    # Update last sync timestamp
    connection["last_sync"] = datetime.now(timezone.utc).isoformat()
    connection["sync_status"] = "active" if not results["errors"] else "partial"
    await _upsert_payer_connection(db, tenant_schema, payer_name, connection)

    await db.commit()

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

        if existing:
            existing.first_name = res.get("first_name") or existing.first_name
            existing.last_name = res.get("last_name") or existing.last_name
            if res.get("date_of_birth"):
                existing.date_of_birth = res["date_of_birth"]
            if res.get("gender"):
                existing.gender = res["gender"]
            if res.get("zip_code"):
                existing.zip_code = res["zip_code"]
        else:
            member = Member(
                member_id=member_id,
                first_name=res.get("first_name", ""),
                last_name=res.get("last_name", ""),
                date_of_birth=res.get("date_of_birth", date(1900, 1, 1)),
                gender=res.get("gender", "U"),
                zip_code=res.get("zip_code"),
            )
            db.add(member)

        count += 1

    await db.flush()
    return count


async def _upsert_coverage(db: AsyncSession, resources: list[dict]) -> int:
    """Apply Coverage data to existing Member records (eligibility fields)."""
    count = 0
    for res in resources:
        member_id = res.get("member_id")
        if not member_id:
            continue

        existing_q = await db.execute(
            select(Member).where(Member.member_id == member_id)
        )
        member = existing_q.scalar_one_or_none()
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

        count += 1

    await db.flush()
    return count


async def _upsert_claims(db: AsyncSession, resources: list[dict]) -> int:
    """Map payer-parsed EOB dicts to Claim rows."""
    count = 0
    for res in resources:
        member_id_str = res.get("member_id")
        if not member_id_str:
            continue

        # Resolve member FK
        member_q = await db.execute(
            select(Member).where(Member.member_id == member_id_str)
        )
        member = member_q.scalar_one_or_none()
        if not member:
            logger.warning("Claim references unknown member: %s", member_id_str)
            continue

        # Check for duplicate claim_id
        claim_id = res.get("claim_id")
        if claim_id:
            dup_q = await db.execute(
                select(Claim).where(Claim.claim_id == claim_id)
            )
            if dup_q.scalar_one_or_none():
                continue  # Skip duplicate

        # Parse amounts safely
        def _decimal(val: Any) -> Decimal | None:
            if val is None:
                return None
            try:
                return Decimal(str(val))
            except (InvalidOperation, ValueError):
                return None

        claim = Claim(
            member_id=member.id,
            claim_id=claim_id,
            claim_type=res.get("claim_type", "professional"),
            service_date=res.get("service_date", date.today()),
            paid_date=res.get("paid_date"),
            diagnosis_codes=res.get("diagnosis_codes"),
            procedure_code=res.get("procedure_code"),
            ndc_code=res.get("ndc_code"),
            billing_npi=res.get("provider_npi"),
            billed_amount=_decimal(res.get("billed_amount")),
            allowed_amount=_decimal(res.get("allowed_amount")),
            paid_amount=_decimal(res.get("paid_amount")),
            member_liability=_decimal(res.get("member_liability")),
            service_category=res.get("service_category", "professional"),
            drug_name=res.get("drug_name"),
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

        member_q = await db.execute(
            select(Member).where(Member.member_id == member_id_str)
        )
        member = member_q.scalar_one_or_none()
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
            service_category="professional",
            data_tier="signal",
            is_estimated=False,
            signal_source=f"payer_api_condition",
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
        else:
            provider = Provider(
                npi=npi,
                first_name=res.get("first_name", ""),
                last_name=res.get("last_name", ""),
                specialty=res.get("specialty"),
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

        member_q = await db.execute(
            select(Member).where(Member.member_id == member_id_str)
        )
        member = member_q.scalar_one_or_none()
        if not member:
            continue

        claim = Claim(
            member_id=member.id,
            claim_type="pharmacy",
            service_date=res.get("service_date", date.today()),
            drug_name=res.get("drug_name"),
            ndc_code=res.get("ndc_code"),
            service_category="pharmacy",
            data_tier="signal",
            is_estimated=False,
            signal_source="payer_api_medication",
        )
        db.add(claim)
        count += 1

    await db.flush()
    return count
