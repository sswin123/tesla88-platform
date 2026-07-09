from __future__ import annotations

import pytest

from bot.keyboards.livechat import build_livechat_end_keyboard
from bot.handlers.user.livechat import _message_preview, _detect_msg_type


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


# ── Bug #2: initial media must trigger copy_message (msg_type != TEXT) ───────


class _FakeMsg:
    def __init__(self, **kwargs):
        self.text = kwargs.get("text")
        self.photo = kwargs.get("photo")
        self.video = kwargs.get("video")
        self.video_note = kwargs.get("video_note")
        self.audio = kwargs.get("audio")
        self.animation = kwargs.get("animation")
        self.document = kwargs.get("document")
        self.voice = kwargs.get("voice")
        self.sticker = kwargs.get("sticker")
        self.caption = kwargs.get("caption")


class _FakeDoc:
    file_name = "report.pdf"


class _FakeSticker:
    emoji = "😎"


def test_initial_photo_requires_copy():
    """Photo initial message must NOT be TEXT → copy_message path executes."""
    msg = _FakeMsg(photo=["x"])
    assert _detect_msg_type(msg) != "TEXT"


def test_initial_document_requires_copy():
    msg = _FakeMsg(document=_FakeDoc())
    assert _detect_msg_type(msg) != "TEXT"


def test_initial_voice_requires_copy():
    msg = _FakeMsg(voice=True)
    assert _detect_msg_type(msg) != "TEXT"


def test_initial_sticker_requires_copy():
    msg = _FakeMsg(sticker=_FakeSticker())
    assert _detect_msg_type(msg) != "TEXT"


def test_initial_text_no_copy():
    """Plain-text initial message is already embedded in notification; no extra copy needed."""
    msg = _FakeMsg(text="help me")
    assert _detect_msg_type(msg) == "TEXT"


def test_photo_preview_placeholder():
    """Notification text shows [图片] placeholder, not the real file."""
    _, preview = _message_preview(_FakeMsg(photo=["x"]))
    assert "[图片]" in preview


def test_photo_with_caption_in_preview():
    _, preview = _message_preview(_FakeMsg(photo=["x"], caption="my screenshot"))
    assert "my screenshot" in preview
