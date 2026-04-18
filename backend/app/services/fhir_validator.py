"""
FHIR R4 Bundle validator.

Minimal schema validation performed before we hand a payload to the ingestion
layer. The goal is to reject malformed/garbage payloads at the HTTP boundary
so `fhir_service.ingest_fhir_bundle` can assume "this is a structurally valid
Bundle".

Checks performed:
  1. Top-level `resourceType == "Bundle"`.
  2. `type` is one of the FHIR-defined Bundle types (if present).
  3. Each `entry.resource.resourceType` is present and known to FHIR R4.
  4. No circular `fullUrl` self-references (an entry cannot reference itself
     via its own `fullUrl` inside any nested `reference` field).

Anything beyond structural validity (code-system checks, cardinality,
cross-resource referential integrity) is intentionally out of scope — let
the ingestion layer log and skip unknown codes, don't reject the bundle.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

from fastapi import HTTPException


# FHIR R4 resource types we explicitly support (ingest or safely ignore).
# This is not the full FHIR R4 resource list — it's the set we're willing
# to receive. Unknown resource types are rejected so a typo like
# "Medicationreqest" can't silently go missing.
SUPPORTED_RESOURCE_TYPES: frozenset[str] = frozenset(
    {
        # Clinical
        "Patient",
        "Condition",
        "Encounter",
        "Observation",
        "Procedure",
        "MedicationRequest",
        "Medication",
        "AllergyIntolerance",
        "Immunization",
        "CarePlan",
        "CareTeam",
        "Goal",
        "DocumentReference",
        "DiagnosticReport",
        # Financial
        "Coverage",
        "ExplanationOfBenefit",
        "Claim",
        # Provider / admin
        "Practitioner",
        "PractitionerRole",
        "Organization",
        "Location",
        # Meta
        "Bundle",
        "OperationOutcome",
    }
)


# Bundle.type values defined by FHIR R4. Kept as a frozenset for O(1) lookup.
_BUNDLE_TYPES: frozenset[str] = frozenset(
    {
        "document",
        "message",
        "transaction",
        "transaction-response",
        "batch",
        "batch-response",
        "history",
        "searchset",
        "collection",
    }
)


def _fail(msg: str) -> None:
    """Raise a FastAPI 400 with a consistent error envelope."""
    raise HTTPException(status_code=400, detail=msg)


def _iter_references(node: Any) -> Iterable[str]:
    """Yield every `reference` string inside a nested FHIR resource.

    A FHIR reference can look like:
      {"reference": "Patient/123"}
    or
      {"reference": "urn:uuid:…"}
    We walk the tree and surface all `reference` values.
    """
    if isinstance(node, dict):
        ref = node.get("reference")
        if isinstance(ref, str):
            yield ref
        for v in node.values():
            yield from _iter_references(v)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_references(item)


def validate_bundle(bundle: Any) -> dict:
    """Validate a FHIR R4 Bundle. Return the bundle on success, else raise 400.

    Parameters
    ----------
    bundle : dict-like payload as received from the HTTP body.

    Raises
    ------
    fastapi.HTTPException
        400 on any structural violation.
    """
    # 0. Must be a dict. `POST /api/fhir/ingest` declares `bundle: dict`, so
    #    FastAPI would 422 a non-object — but double-check if this is called
    #    directly from other code paths.
    if not isinstance(bundle, dict):
        _fail("FHIR payload must be a JSON object")

    # Defensive size cap — fail fast on pathologically huge bundles rather
    # than letting the downstream ingest chew on 500MB of garbage.
    try:
        approx_bytes = len(json.dumps(bundle))
    except (TypeError, ValueError):
        _fail("FHIR payload is not JSON-serializable")
    # 50MB is absurdly generous for a clinical bundle; beyond this is abuse.
    if approx_bytes > 50 * 1024 * 1024:
        _fail("FHIR Bundle exceeds 50MB size limit")

    # 1. Top-level resourceType.
    rt = bundle.get("resourceType")
    if rt != "Bundle":
        _fail(f"resourceType must be 'Bundle', got {rt!r}")

    # 2. Optional Bundle.type — if present, must be a defined value.
    bundle_type = bundle.get("type")
    if bundle_type is not None and bundle_type not in _BUNDLE_TYPES:
        _fail(f"Unknown Bundle.type: {bundle_type!r}")

    # 3. entry array — must be a list if present.
    entries = bundle.get("entry")
    if entries is None:
        # Empty bundle is structurally valid; nothing more to check.
        return bundle
    if not isinstance(entries, list):
        _fail("Bundle.entry must be an array")

    # 4. Per-entry validation.
    seen_full_urls: set[str] = set()
    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            _fail(f"Bundle.entry[{i}] must be an object")

        # Some clients POST `{resourceType: "Patient", ...}` directly inside
        # the entry instead of nesting under `resource`. Accept both.
        resource = entry.get("resource")
        if resource is None:
            if "resourceType" in entry:
                resource = entry
            else:
                _fail(f"Bundle.entry[{i}] is missing `resource`")

        if not isinstance(resource, dict):
            _fail(f"Bundle.entry[{i}].resource must be an object")

        resource_type = resource.get("resourceType")
        if not isinstance(resource_type, str) or not resource_type:
            _fail(f"Bundle.entry[{i}].resource.resourceType is required")

        if resource_type not in SUPPORTED_RESOURCE_TYPES:
            _fail(
                f"Bundle.entry[{i}] has unsupported resourceType "
                f"{resource_type!r}. Supported: "
                f"{', '.join(sorted(SUPPORTED_RESOURCE_TYPES))}"
            )

        # Track fullUrl for circular-reference detection below.
        full_url = entry.get("fullUrl")
        if isinstance(full_url, str) and full_url:
            if full_url in seen_full_urls:
                _fail(f"Duplicate Bundle.entry.fullUrl: {full_url}")
            seen_full_urls.add(full_url)

            # Circular-reference check: resource cannot reference its own
            # fullUrl. This is rare but indicates a generation bug on the
            # client side and we want to surface it loudly.
            for ref in _iter_references(resource):
                if ref == full_url:
                    _fail(
                        f"Circular reference: Bundle.entry[{i}] references "
                        f"its own fullUrl {full_url!r}"
                    )

    return bundle
