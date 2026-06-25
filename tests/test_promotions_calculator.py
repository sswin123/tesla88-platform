from __future__ import annotations

from decimal import Decimal

from bot.handlers.user.promotions import calculate_bonus


# ─────────────────────────────────────────────────────────────────────────────
# BONUS turnover (standard) — turnover = total_credit × multiplier
# ─────────────────────────────────────────────────────────────────────────────

# P1 — 50% Welcome Bonus, min RM30, no max, ×3
def test_p1_deposit_30():
    bonus, total, turnover = calculate_bonus(
        Decimal("30"), "PERCENTAGE", Decimal("50"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("15.00")
    assert total == Decimal("45.00")
    assert turnover == Decimal("135.00")


def test_p1_deposit_100():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("50"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("50.00")
    assert total == Decimal("150.00")
    assert turnover == Decimal("450.00")


def test_p1_deposit_200():
    bonus, total, turnover = calculate_bonus(
        Decimal("200"), "PERCENTAGE", Decimal("50"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("100.00")
    assert total == Decimal("300.00")
    assert turnover == Decimal("900.00")


# P2 — Daily 20% Reload, min RM30, no max, ×2
def test_p2_deposit_30():
    bonus, total, turnover = calculate_bonus(
        Decimal("30"), "PERCENTAGE", Decimal("20"), None, Decimal("2"), "BONUS"
    )
    assert bonus == Decimal("6.00")
    assert total == Decimal("36.00")
    assert turnover == Decimal("72.00")


def test_p2_deposit_100():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("20"), None, Decimal("2"), "BONUS"
    )
    assert bonus == Decimal("20.00")
    assert total == Decimal("120.00")
    assert turnover == Decimal("240.00")


# P3 — Unlimited 10%, min RM30, no max, ×3
def test_p3_deposit_30():
    bonus, total, turnover = calculate_bonus(
        Decimal("30"), "PERCENTAGE", Decimal("10"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("3.00")
    assert total == Decimal("33.00")
    assert turnover == Decimal("99.00")


def test_p3_deposit_100():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("10"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("10.00")
    assert total == Decimal("110.00")
    assert turnover == Decimal("330.00")


# P4 — Weekly 30% Welcome Back, min RM30, no max, ×3
def test_p4_deposit_30():
    bonus, total, turnover = calculate_bonus(
        Decimal("30"), "PERCENTAGE", Decimal("30"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("9.00")
    assert total == Decimal("39.00")
    assert turnover == Decimal("117.00")


def test_p4_deposit_100():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("30"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("30.00")
    assert total == Decimal("130.00")
    assert turnover == Decimal("390.00")


# ─────────────────────────────────────────────────────────────────────────────
# DEPOSIT turnover — P5 Buy 1 Free 1 (100%, max RM500, ×7, turnover_type=DEPOSIT)
# turnover = deposit × multiplier  (NOT total)
# ─────────────────────────────────────────────────────────────────────────────

def test_p5_buy1free1_deposit_5():
    bonus, total, turnover = calculate_bonus(
        Decimal("5"), "PERCENTAGE", Decimal("100"), Decimal("500"), Decimal("7"), "DEPOSIT"
    )
    assert bonus == Decimal("5.00")
    assert total == Decimal("10.00")
    assert turnover == Decimal("35.00")   # 5 × 7, NOT 10 × 7


def test_p5_buy1free1_deposit_100():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("100"), Decimal("500"), Decimal("7"), "DEPOSIT"
    )
    assert bonus == Decimal("100.00")
    assert total == Decimal("200.00")
    assert turnover == Decimal("700.00")  # 100 × 7, NOT 200 × 7


def test_p5_buy1free1_deposit_500():
    bonus, total, turnover = calculate_bonus(
        Decimal("500"), "PERCENTAGE", Decimal("100"), Decimal("500"), Decimal("7"), "DEPOSIT"
    )
    assert bonus == Decimal("500.00")
    assert total == Decimal("1000.00")
    assert turnover == Decimal("3500.00")  # 500 × 7


def test_p5_buy1free1_max_bonus_cap():
    # deposit RM1000: 100% = RM1000 → capped at RM500
    # turnover = deposit × 7 = 1000 × 7 = 7000 (deposit, not capped total)
    bonus, total, turnover = calculate_bonus(
        Decimal("1000"), "PERCENTAGE", Decimal("100"), Decimal("500"), Decimal("7"), "DEPOSIT"
    )
    assert bonus == Decimal("500.00")
    assert total == Decimal("1500.00")
    assert turnover == Decimal("7000.00")  # 1000 × 7


# ── max_bonus cap (BONUS turnover) ───────────────────────────────────────────

def test_max_bonus_cap_bonus_turnover():
    bonus, total, turnover = calculate_bonus(
        Decimal("1000"), "PERCENTAGE", Decimal("50"), Decimal("300"), Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("300.00")
    assert total == Decimal("1300.00")
    assert turnover == Decimal("3900.00")  # 1300 × 3


# ── FIXED bonus ───────────────────────────────────────────────────────────────

def test_fixed_bonus_rm88():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "FIXED", Decimal("88"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("88.00")
    assert total == Decimal("188.00")
    assert turnover == Decimal("564.00")


# ── Decimal precision (rounding) ─────────────────────────────────────────────

def test_decimal_precision_rounding():
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("33.33"), None, Decimal("3"), "BONUS"
    )
    assert bonus == Decimal("33.33")
    assert total == Decimal("133.33")
    assert turnover == Decimal("399.99")


# ── default turnover_type is BONUS ───────────────────────────────────────────

def test_default_turnover_type_is_bonus():
    # calling without turnover_type should behave as BONUS
    bonus, total, turnover = calculate_bonus(
        Decimal("100"), "PERCENTAGE", Decimal("50"), None, Decimal("3")
    )
    assert turnover == total * Decimal("3")


# ── DEPOSIT vs BONUS diverge on same inputs ───────────────────────────────────

def test_deposit_vs_bonus_turnover_differ():
    deposit = Decimal("100")
    args = ("PERCENTAGE", Decimal("50"), None, Decimal("3"))
    _, total_b, turnover_bonus = calculate_bonus(deposit, *args, "BONUS")
    _, total_d, turnover_deposit = calculate_bonus(deposit, *args, "DEPOSIT")
    # Both totals should be the same
    assert total_b == total_d == Decimal("150.00")
    # But turnover differs
    assert turnover_bonus == Decimal("450.00")   # 150 × 3
    assert turnover_deposit == Decimal("300.00")  # 100 × 3
