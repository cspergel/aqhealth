"""PHI scrubber — regex-based de-identification for LLM prompts.

This is a **first line of defense**, not a vendored DeID library. It catches
the common, structured identifiers that leak through clinical notes and
free-text fields before they land in a third-party inference provider.

It does NOT handle:
- Names, organisations, addresses (requires NER)
- Device serial numbers, account numbers
- Full-face photos, biometrics
- Certificate/license numbers

For production PHI minimisation post-BAA, wire a proper DeID service
(Philter, Microsoft Presidio + custom recognisers, or a vendor) behind
`scrub_strict`.

Example inputs / outputs (informal test cases):

1. "Patient SSN: 123-45-6789 DOB: 01/15/1950"
   -> "Patient SSN: [SSN] DOB: [DATE]"

2. "Call patient at (555) 123-4567 or email john.doe@example.com"
   -> "Call patient at [PHONE] or email [EMAIL]"

3. "MRN 123456 admitted on 2025-03-14. See mrn: 987654321."
   -> "[MRN] admitted on [DATE]. See [MRN]."

4. "No identifiers in this sentence about hypertension."
   -> "No identifiers in this sentence about hypertension."   (unchanged)

5. "Reach me: 555.867.5309 / DOB 1/5/55 / ssn 123456789"
   -> "Reach me: [PHONE] / DOB [DATE] / ssn [SSN]"
"""

from __future__ import annotations

import re


# ----- regex patterns --------------------------------------------------------
# Order matters: run MRN before generic digit-heavy patterns, and SSN before
# raw 9-digit numbers.

# SSN: 123-45-6789 or 123 45 6789 or 123456789 (word-bounded)
_SSN_RE = re.compile(
    r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b"
)

# Phone: (555) 123-4567, 555-123-4567, 555.123.4567, +1 555 123 4567
_PHONE_RE = re.compile(
    r"(?:\+?1[-.\s]?)?\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
)

# Email
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)

# MRN: "MRN 123456", "MRN: 123456", "mrn#987654321", "Medical Record Number 12345"
# Loose by design; we accept false positives over false negatives for PHI.
_MRN_RE = re.compile(
    r"\b(?:MRN|mrn|Medical Record(?: Number)?)[#:\s]*\d{5,}\b"
)

# Dates: US slash format, ISO. Intentionally loose — DOB is PHI, dates of
# service are also often PHI-adjacent for re-identification.
_DATE_SLASH_RE = re.compile(
    r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"
)
_DATE_ISO_RE = re.compile(
    r"\b\d{4}-\d{2}-\d{2}\b"
)


def scrub(text: str) -> str:
    """Replace common PHI identifiers with typed placeholder tokens.

    Safe to call on any string. Returns the input unchanged if it contains
    no matches. Empty/None input returns "".
    """
    if not text:
        return ""

    # MRN must come before SSN — "MRN: 123456789" looks like an SSN.
    out = _MRN_RE.sub("[MRN]", text)
    out = _SSN_RE.sub("[SSN]", out)
    out = _EMAIL_RE.sub("[EMAIL]", out)
    out = _PHONE_RE.sub("[PHONE]", out)
    out = _DATE_SLASH_RE.sub("[DATE]", out)
    out = _DATE_ISO_RE.sub("[DATE]", out)
    return out


def scrub_strict(text: str) -> str:
    """Stricter scrub — currently aliases `scrub`.

    This hook exists so callers that demand tighter de-identification (names,
    addresses, free-text NER) can switch paths without changing call sites.
    Today it just calls `scrub`. When a vendor DeID is integrated (e.g.
    Presidio, a BAA'd cloud de-ID service), wire it here.
    """
    # TODO: integrate NER-based scrubber post-BAA. For now, regex is the
    # floor; it is NOT sufficient for a public-LLM contract without a BAA.
    return scrub(text)
