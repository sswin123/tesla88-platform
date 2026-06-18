import pytest
from bot.utils.phone import normalize_phone, is_valid_phone


@pytest.mark.parametrize("raw,expected", [
    ("0123456789",   "60123456789"),
    ("60123456789",  "60123456789"),
    ("+60123456789", "60123456789"),
    ("0112345678",   "60112345678"),
    ("60112345678",  "60112345678"),
    ("+60112345678", "60112345678"),
    (" 0123456789 ", "60123456789"),   # leading/trailing spaces
    ("012-345-6789", "60123456789"),   # dashes
])
def test_normalize_phone_valid(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", [
    "123456789",       # no leading 0 or 60
    "abc",
    "",
    "0123456",         # too short
    "012345678901234", # too long
    "70123456789",     # wrong prefix
])
def test_normalize_phone_invalid(raw):
    assert normalize_phone(raw) is None


def test_is_valid_phone_true():
    assert is_valid_phone("0123456789") is True


def test_is_valid_phone_false():
    assert is_valid_phone("abc") is False
