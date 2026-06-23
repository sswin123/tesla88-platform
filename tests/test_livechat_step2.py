from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup

from bot.keyboards.livechat import (
    build_livechat_cancel_keyboard,
    build_livechat_request_keyboard,
)
from bot.handlers.user.livechat import LiveChatStates, _message_preview


# ── Keyboard builders ─────────────────────────────────────────────────────────


def test_cancel_keyboard_returns_inline_markup():
    kb = build_livechat_cancel_keyboard()
    assert isinstance(kb, InlineKeyboardMarkup)


def test_cancel_keyboard_single_button():
    kb = build_livechat_cancel_keyboard()
    assert len(kb.inline_keyboard) == 1
    assert len(kb.inline_keyboard[0]) == 1


def test_cancel_keyboard_callback_data():
    kb = build_livechat_cancel_keyboard()
    btn = kb.inline_keyboard[0][0]
    assert btn.callback_data == "lc_cancel"
    assert btn.text == "🔚 取消"


def test_request_keyboard_returns_inline_markup():
    kb = build_livechat_request_keyboard(7)
    assert isinstance(kb, InlineKeyboardMarkup)


def test_request_keyboard_two_buttons_in_one_row():
    kb = build_livechat_request_keyboard(7)
    assert len(kb.inline_keyboard) == 1
    assert len(kb.inline_keyboard[0]) == 2


def test_request_keyboard_accept_callback():
    kb = build_livechat_request_keyboard(42)
    accept_btn = kb.inline_keyboard[0][0]
    assert accept_btn.callback_data == "lc_accept:42"
    assert accept_btn.text == "✅ 接受"


def test_request_keyboard_ignore_callback():
    kb = build_livechat_request_keyboard(42)
    ignore_btn = kb.inline_keyboard[0][1]
    assert ignore_btn.callback_data == "lc_ignore:42"
    assert ignore_btn.text == "❌ 忽略"


def test_request_keyboard_session_id_embedded():
    for sid in (1, 99, 1000):
        kb = build_livechat_request_keyboard(sid)
        assert kb.inline_keyboard[0][0].callback_data == f"lc_accept:{sid}"
        assert kb.inline_keyboard[0][1].callback_data == f"lc_ignore:{sid}"


# ── FSM States ────────────────────────────────────────────────────────────────


def test_livechat_states_exist():
    assert LiveChatStates.waiting_initial_message is not None
    assert LiveChatStates.in_session is not None


def test_livechat_states_are_distinct():
    assert LiveChatStates.waiting_initial_message != LiveChatStates.in_session


# ── _message_preview helper ───────────────────────────────────────────────────


class _FakeMessage:
    """Minimal stub for aiogram Message used in _message_preview tests."""

    def __init__(self, **kwargs):
        self.text = kwargs.get("text")
        self.caption = kwargs.get("caption")
        self.photo = kwargs.get("photo")
        self.document = kwargs.get("document")
        self.voice = kwargs.get("voice")
        self.sticker = kwargs.get("sticker")


class _FakeDocument:
    def __init__(self, file_name=None):
        self.file_name = file_name


class _FakeSticker:
    def __init__(self, emoji=None):
        self.emoji = emoji


def test_preview_text_message():
    msg = _FakeMessage(text="Hello world")
    msg_type, preview = _message_preview(msg)
    assert msg_type == "TEXT"
    assert preview == "Hello world"


def test_preview_text_truncated():
    long_text = "A" * 400
    msg = _FakeMessage(text=long_text)
    _, preview = _message_preview(msg)
    assert len(preview) == 300


def test_preview_photo_no_caption():
    msg = _FakeMessage(photo=["fake_photo"])
    msg_type, preview = _message_preview(msg)
    assert msg_type == "PHOTO"
    assert preview == "[图片]"


def test_preview_photo_with_caption():
    msg = _FakeMessage(photo=["fake_photo"], caption="nice pic")
    _, preview = _message_preview(msg)
    assert "[图片]" in preview
    assert "nice pic" in preview


def test_preview_document():
    msg = _FakeMessage(document=_FakeDocument(file_name="report.pdf"))
    msg_type, preview = _message_preview(msg)
    assert msg_type == "DOCUMENT"
    assert "report.pdf" in preview


def test_preview_voice():
    msg = _FakeMessage(voice=True)
    msg_type, preview = _message_preview(msg)
    assert msg_type == "VOICE"
    assert "[语音消息]" in preview


def test_preview_sticker():
    msg = _FakeMessage(sticker=_FakeSticker(emoji="😎"))
    msg_type, preview = _message_preview(msg)
    assert msg_type == "STICKER"
    assert "😎" in preview


def test_preview_other():
    msg = _FakeMessage()
    msg_type, preview = _message_preview(msg)
    assert msg_type == "OTHER"
    assert "[其他消息]" in preview
