from __future__ import annotations

from bot.keyboards.livechat import build_livechat_end_keyboard


def test_end_keyboard_callback_data():
    kb = build_livechat_end_keyboard(5)
    btn = kb.inline_keyboard[0][0]
    assert btn.callback_data == "lc_end:5"
    assert btn.text == "⏹ 结束会话"


def test_end_keyboard_single_button():
    kb = build_livechat_end_keyboard(99)
    assert len(kb.inline_keyboard) == 1
    assert len(kb.inline_keyboard[0]) == 1


def test_end_keyboard_session_id_embedded():
    for sid in (1, 42, 1000):
        kb = build_livechat_end_keyboard(sid)
        assert kb.inline_keyboard[0][0].callback_data == f"lc_end:{sid}"
