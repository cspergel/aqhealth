"""
Payer Adapter Registry.

Maps payer names to their adapter classes. To add a new payer integration,
implement a PayerAdapter subclass and register it here.
"""

from app.services.payer_api_service import PayerAdapter
from app.services.payer_adapters.humana import HumanaAdapter
from app.services.payer_adapters.ecw import EcwAdapter
from app.services.payer_adapters.availity import AvailityAdapter

# Metriport adapter removed from registry — register when API integration lands.
# The file backend/app/services/payer_adapters/metriport.py still contains
# unwired helper code (create_patient, start_document_query,
# get_consolidated_fhir) that can be revived when we wire the HIE flow into
# a router/worker. Leaving it in ADAPTERS was actively harmful because the
# inherited `fetch_*` methods return `[]`, making `sync_payer_data` appear
# successful while pulling no data. See reviews/readiness-external-apis.md
# (B6) for background.

# Registry of available payer adapters.
# Keys are lowercase payer names used in API calls and tenant config.
ADAPTERS: dict[str, type[PayerAdapter]] = {
    "humana": HumanaAdapter,
    "ecw": EcwAdapter,
    "availity": AvailityAdapter,
}


def get_adapter(payer_name: str) -> PayerAdapter:
    """Instantiate and return the adapter for a given payer.

    Raises
    ------
    ValueError
        If no adapter is registered for the requested payer. The message
        surfaces the list of currently-registered adapters so callers can
        tell the difference between "unsupported payer" and "adapter exists
        but is not wired yet" (e.g., Metriport).
    """
    adapter_cls = ADAPTERS.get(payer_name.lower())
    if not adapter_cls:
        available = ", ".join(sorted(ADAPTERS.keys()))
        if payer_name.lower() == "metriport":
            raise ValueError(
                "Metriport is not yet supported through the generic payer "
                "sync path. Its adapter returns empty data for every "
                "fetch_* call because the HIE integration is document-"
                "based, not OAuth-FHIR. See "
                "reviews/readiness-external-apis.md B6. "
                f"Currently registered: {available}"
            )
        raise ValueError(
            f"No adapter registered for payer '{payer_name}'. "
            f"Available: {available}"
        )
    return adapter_cls()
