from __future__ import annotations

from bot.constants import PROVIDERS


def test_providers_has_six_entries():
    assert len(PROVIDERS) == 6


def test_providers_exact_names():
    assert PROVIDERS == [
        "918Kiss", "Mega888", "Pussy888", "Newtown", "Ace333", "Live22"
    ]


def test_providers_no_duplicates():
    assert len(PROVIDERS) == len(set(PROVIDERS))
