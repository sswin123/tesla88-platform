from __future__ import annotations

import re


def normalize_bank_account(account: str) -> str:
    """Remove spaces, dashes, and dots from bank account numbers.

    Matches the TypeScript normalizeBankAccount() in website/erp/src/lib/bank.ts.
    """
    return re.sub(r'[\s\-\.]', '', account.strip())
