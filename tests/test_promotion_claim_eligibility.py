"""Tests for Promotion Claim Limit Logic — can_member_claim_promotion().

5 scenarios:
  1. No prior claims → eligible (FIRST_DEPOSIT)
  2. PENDING deposit_request with FIRST_DEPOSIT promo → not eligible
  3. APPROVED deposit_request with FIRST_DEPOSIT promo → not eligible
  4. REJECTED deposit_request → eligible again
  5. UNLIMITED promo → always eligible regardless of prior claims
"""
from __future__ import annotations

import pytest

from db.repositories.promotion_repo import can_member_claim_promotion


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
async def db(pool):
    """Wrap each test in a transaction that is rolled back on teardown."""
    tr = pool.transaction()
    await tr.start()
    yield pool
    await tr.rollback()


@pytest.fixture()
async def test_user(db):
    """Insert a throwaway user and return its id."""
    row = await db.fetchrow(
        """
        INSERT INTO users
            (telegram_id, first_name, phone, bank_name, bank_account, bank_holder_name, status)
        VALUES (9000000001, 'TestClaim', '+60199990001', 'TestBank', '9000000001', 'Test Holder', 'ACTIVE')
        RETURNING id
        """
    )
    return row["id"]


@pytest.fixture()
async def first_deposit_promo(db):
    """Insert a FIRST_DEPOSIT promotion and return its id."""
    row = await db.fetchrow(
        """
        INSERT INTO promotions
            (name, description, promotion_type, bonus_type, bonus_value,
             min_deposit, max_bonus, turnover_multiplier, allowed_games)
        VALUES
            ('Test 50% Welcome', 'Test only', 'FIRST_DEPOSIT', 'PERCENTAGE', 50,
             30, NULL, 3, '{}')
        RETURNING id
        """
    )
    return row["id"]


@pytest.fixture()
async def unlimited_promo(db):
    """Insert an UNLIMITED promotion and return its id."""
    row = await db.fetchrow(
        """
        INSERT INTO promotions
            (name, description, promotion_type, bonus_type, bonus_value,
             min_deposit, max_bonus, turnover_multiplier, allowed_games)
        VALUES
            ('Test 10% Reload', 'Test only', 'UNLIMITED', 'PERCENTAGE', 10,
             30, NULL, 3, '{}')
        RETURNING id
        """
    )
    return row["id"]


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_eligible_when_no_prior_claims(db, test_user, first_deposit_promo):
    """Scenario 1: member has no prior deposit — eligible for FIRST_DEPOSIT promo."""
    result = await can_member_claim_promotion(db, test_user, first_deposit_promo)
    assert result is True, "Member with no prior claims must be eligible"


@pytest.mark.asyncio
async def test_not_eligible_when_pending_deposit(db, test_user, first_deposit_promo):
    """Scenario 2: PENDING deposit_request with FIRST_DEPOSIT promo → not eligible."""
    await db.execute(
        """
        INSERT INTO deposit_requests
            (user_id, provider, game_username, deposit_amount, bonus_amount,
             credit_amount, payment_bank, receipt_file_id, promotion_id, status)
        VALUES ($1, '918Kiss', 'testuser', 100, 50, 150, 'TestBank', 'file123', $2, 'PENDING')
        """,
        test_user, first_deposit_promo,
    )
    result = await can_member_claim_promotion(db, test_user, first_deposit_promo)
    assert result is False, "PENDING deposit must block re-claim of FIRST_DEPOSIT promo"


@pytest.mark.asyncio
async def test_not_eligible_when_approved_deposit(db, test_user, first_deposit_promo):
    """Scenario 3: APPROVED deposit_request with FIRST_DEPOSIT promo → not eligible."""
    await db.execute(
        """
        INSERT INTO deposit_requests
            (user_id, provider, game_username, deposit_amount, bonus_amount,
             credit_amount, payment_bank, receipt_file_id, promotion_id, status)
        VALUES ($1, '918Kiss', 'testuser', 100, 50, 150, 'TestBank', 'file456', $2, 'APPROVED')
        """,
        test_user, first_deposit_promo,
    )
    result = await can_member_claim_promotion(db, test_user, first_deposit_promo)
    assert result is False, "APPROVED deposit must block re-claim of FIRST_DEPOSIT promo"


@pytest.mark.asyncio
async def test_eligible_again_after_rejected_deposit(db, test_user, first_deposit_promo):
    """Scenario 4: REJECTED deposit_request → member can try again."""
    await db.execute(
        """
        INSERT INTO deposit_requests
            (user_id, provider, game_username, deposit_amount, bonus_amount,
             credit_amount, payment_bank, receipt_file_id, promotion_id, status)
        VALUES ($1, '918Kiss', 'testuser', 100, 50, 150, 'TestBank', 'file789', $2, 'REJECTED')
        """,
        test_user, first_deposit_promo,
    )
    result = await can_member_claim_promotion(db, test_user, first_deposit_promo)
    assert result is True, "REJECTED deposit must allow retry — member is eligible again"


@pytest.mark.asyncio
async def test_unlimited_promo_always_eligible(db, test_user, unlimited_promo, first_deposit_promo):
    """Scenario 5: UNLIMITED promo is always eligible even after APPROVED first-deposit claim."""
    # Approved FIRST_DEPOSIT deposit exists (but for a different promo)
    await db.execute(
        """
        INSERT INTO deposit_requests
            (user_id, provider, game_username, deposit_amount, bonus_amount,
             credit_amount, payment_bank, receipt_file_id, promotion_id, status)
        VALUES ($1, '918Kiss', 'testuser', 100, 50, 150, 'TestBank', 'fileabc', $2, 'APPROVED')
        """,
        test_user, first_deposit_promo,
    )
    # UNLIMITED promo must still be eligible
    result = await can_member_claim_promotion(db, test_user, unlimited_promo)
    assert result is True, "UNLIMITED promo must always be eligible regardless of other claims"
