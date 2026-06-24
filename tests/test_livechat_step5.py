from __future__ import annotations

from bot.keyboards.livechat import build_livechat_end_keyboard


# ── Callback data isolation ───────────────────────────────────────────────────


def test_end_keyboard_session_1():
    kb = build_livechat_end_keyboard(1)
    assert kb.inline_keyboard[0][0].callback_data == "lc_end:1"


def test_end_keyboard_session_2():
    kb = build_livechat_end_keyboard(2)
    assert kb.inline_keyboard[0][0].callback_data == "lc_end:2"


def test_end_keyboard_session_3():
    kb = build_livechat_end_keyboard(3)
    assert kb.inline_keyboard[0][0].callback_data == "lc_end:3"


def test_end_keyboard_sessions_are_distinct():
    """Three concurrent sessions must have independent callback_data."""
    kb1 = build_livechat_end_keyboard(1)
    kb2 = build_livechat_end_keyboard(2)
    kb3 = build_livechat_end_keyboard(3)

    cb1 = kb1.inline_keyboard[0][0].callback_data
    cb2 = kb2.inline_keyboard[0][0].callback_data
    cb3 = kb3.inline_keyboard[0][0].callback_data

    assert cb1 != cb2
    assert cb2 != cb3
    assert cb1 != cb3


def test_end_button_text():
    kb = build_livechat_end_keyboard(99)
    assert kb.inline_keyboard[0][0].text == "⏹ 结束会话"


def test_end_keyboard_single_row_single_button():
    kb = build_livechat_end_keyboard(5)
    assert len(kb.inline_keyboard) == 1
    assert len(kb.inline_keyboard[0]) == 1


# ── Parse session_id from callback_data ──────────────────────────────────────


def _parse_session_id(data: str) -> int:
    return int(data.split(":", 1)[1])


def test_parse_session_id_from_lc_end_1():
    assert _parse_session_id("lc_end:1") == 1


def test_parse_session_id_from_lc_end_2():
    assert _parse_session_id("lc_end:2") == 2


def test_parse_session_id_from_lc_end_99():
    assert _parse_session_id("lc_end:99") == 99
