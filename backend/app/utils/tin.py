"""TIN (Tax ID / EIN) normalization and validation."""
import re


def normalize_tin(raw: str | None) -> str | None:
    """Normalize a TIN to 9-digit format. Returns None if invalid.
    Strips hyphens, spaces. Accepts "12-3456789" or "123456789".
    """
    if not raw:
        return None
    digits = re.sub(r"[\s\-]", "", raw.strip())
    if not re.match(r"^\d{9}$", digits):
        return None
    return digits


def format_tin(tin: str | None) -> str | None:
    """Format as XX-XXXXXXX for display."""
    if not tin or len(tin) != 9:
        return tin
    return f"{tin[:2]}-{tin[2:]}"


def mask_tin(tin: str | None) -> str | None:
    """Mask for non-admin display: ***-***6789."""
    if not tin or len(tin) < 4:
        return tin
    return f"***-***{tin[-4:]}"
