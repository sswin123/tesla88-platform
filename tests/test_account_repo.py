from __future__ import annotations
from db.repositories.account_repo import parse_account_csv, AccountImportResult
import pytest

def _csv(text: str) -> bytes:
    return text.encode("utf-8")

def test_parse_account_csv_basic():
    content = _csv("username,password\n918001,Aaaa1111\n918002,Aaaa1111\n")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111"), ("918002", "Aaaa1111")]

def test_parse_account_csv_strips_whitespace():
    content = _csv("username,password\n  918001 , Aaaa1111 \n")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111")]

def test_parse_account_csv_skips_empty_rows():
    content = _csv("username,password\n918001,Aaaa1111\n,\n918002,Aaaa1111\n")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111"), ("918002", "Aaaa1111")]

def test_parse_account_csv_utf8_bom():
    content = "﻿username,password\n918001,Aaaa1111\n".encode("utf-8-sig")
    result = parse_account_csv(content)
    assert result == [("918001", "Aaaa1111")]

def test_parse_account_csv_empty():
    content = _csv("username,password\n")
    result = parse_account_csv(content)
    assert result == []

def test_import_result_dataclass():
    r = AccountImportResult(total=10, inserted=8, duplicates=2, failed=0)
    assert r.total == 10
    assert r.inserted == 8
