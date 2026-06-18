from __future__ import annotations

import re


def normalize_phone(phone: str) -> str | None:
    """Normalize Malaysian phone to 60xxxxxxxxx. Returns None if format invalid."""
    cleaned = phone.strip().replace(" ", "").replace("-", "")

    if cleaned.startswith("+60"):
        normalized = "60" + cleaned[3:]
    elif cleaned.startswith("60"):
        normalized = cleaned
    elif cleaned.startswith("0"):
        normalized = "60" + cleaned[1:]
    else:
        return None

    if not re.fullmatch(r"60\d{8,10}", normalized):
        return None

    return normalized


def is_valid_phone(phone: str) -> bool:
    return normalize_phone(phone) is not None
