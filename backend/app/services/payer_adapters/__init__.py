"""
Payer Adapter Registry.

Maps payer names to their adapter classes. To add a new payer integration,
implement a PayerAdapter subclass and register it here.
"""

from app.services.payer_api_service import PayerAdapter
from app.services.payer_adapters.humana import HumanaAdapter
from app.services.payer_adapters.ecw import EcwAdapter

# Registry of available payer adapters.
# Keys are lowercase payer names used in API calls and tenant config.
ADAPTERS: dict[str, type[PayerAdapter]] = {
    "humana": HumanaAdapter,
    "ecw": EcwAdapter,
}


def get_adapter(payer_name: str) -> PayerAdapter:
    """Instantiate and return the adapter for a given payer.

    Raises
    ------
    ValueError
        If no adapter is registered for the requested payer.
    """
    adapter_cls = ADAPTERS.get(payer_name.lower())
    if not adapter_cls:
        available = ", ".join(sorted(ADAPTERS.keys()))
        raise ValueError(
            f"No adapter registered for payer '{payer_name}'. "
            f"Available: {available}"
        )
    return adapter_cls()
