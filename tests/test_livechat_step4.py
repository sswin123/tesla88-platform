from __future__ import annotations

from bot.handlers.user.livechat import _MENU_BUTTONS, _detect_msg_type, _message_preview


# ── _MENU_BUTTONS ─────────────────────────────────────────────────────────────


def test_menu_buttons_is_frozenset():
    assert isinstance(_MENU_BUTTONS, frozenset)


def test_menu_buttons_contains_deposit():
    assert "💰 充值" in _MENU_BUTTONS


def test_menu_buttons_contains_withdrawal():
    assert "💸 提款" in _MENU_BUTTONS


def test_menu_buttons_contains_contact_cs():
    assert "📞 联系客服" in _MENU_BUTTONS


def test_menu_buttons_contains_back():
    assert "⬅️ 返回" in _MENU_BUTTONS


def test_free_text_not_in_menu_buttons():
    assert "hello" not in _MENU_BUTTONS
    assert "我的账号无法登录" not in _MENU_BUTTONS


# ── _detect_msg_type ──────────────────────────────────────────────────────────


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
    def __init__(self, file_name=None):
        self.file_name = file_name


class _FakeSticker:
    def __init__(self, emoji=None):
        self.emoji = emoji


def test_detect_type_text():
    assert _detect_msg_type(_FakeMsg(text="hi")) == "TEXT"


def test_detect_type_photo():
    assert _detect_msg_type(_FakeMsg(photo=["x"])) == "PHOTO"


def test_detect_type_document():
    assert _detect_msg_type(_FakeMsg(document=_FakeDoc("a.pdf"))) == "DOCUMENT"


def test_detect_type_voice():
    assert _detect_msg_type(_FakeMsg(voice=True)) == "VOICE"


def test_detect_type_sticker():
    assert _detect_msg_type(_FakeMsg(sticker=_FakeSticker("😎"))) == "STICKER"


def test_detect_type_other():
    assert _detect_msg_type(_FakeMsg()) == "OTHER"


# ── _message_preview unchanged behaviour ─────────────────────────────────────


def test_preview_text_returns_tuple():
    msg_type, preview = _message_preview(_FakeMsg(text="hello"))
    assert msg_type == "TEXT"
    assert preview == "hello"


def test_preview_photo_no_caption():
    msg_type, preview = _message_preview(_FakeMsg(photo=["x"]))
    assert msg_type == "PHOTO"
    assert preview == "[图片]"


def test_preview_photo_with_caption():
    msg_type, preview = _message_preview(_FakeMsg(photo=["x"], caption="nice"))
    assert "nice" in preview
