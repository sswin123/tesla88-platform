from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence

from bot.constants import PROVIDERS


def format_user_info(user: Any) -> str:
    status_emoji = "🟢" if user["status"] == "ACTIVE" else "🔴"
    free_text = "✅ 有资格领取" if user["eligible_free_credit"] else "❌ 无资格领取"
    username = f"@{user['telegram_username']}" if user["telegram_username"] else "无"

    created_at = user["created_at"]
    created_str = (
        created_at.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(created_at, datetime)
        else str(created_at)
    )

    total_bonus = user["total_bonus"] if "total_bonus" in user.keys() else 0.00

    return (
        f"👤 会员资料\n\n"
        f"用户ID：#{user['id']}\n"
        f"Telegram ID：{user['telegram_id']}\n"
        f"Username：{username}\n"
        f"First Name：{user['first_name']}\n"
        f"电话号码：{user['phone']}\n"
        f"银行名称：{user['bank_name']}\n"
        f"银行账号：{user['bank_account']}\n"
        f"银行户口姓名：{user['bank_holder_name']}\n"
        f"免费资格：{free_text}\n"
        f"状态：{status_emoji} {user['status']}\n\n"
        f"💰 充值统计\n"
        f"总充值：RM {user['total_deposit']:,.2f}\n"
        f"总提款：RM {user['total_withdraw']:,.2f}\n"
        f"总优惠：RM {total_bonus:,.2f}\n"
        f"净充值：RM {user['net_deposit']:,.2f}\n\n"
        f"📅 注册时间：{created_str}"
    )


def format_user_profile(user: Any) -> str:
    """Simplified profile for user-facing 📋 我的资料."""
    created_at = user["created_at"]
    created_str = (
        created_at.strftime("%Y-%m-%d %H:%M")
        if isinstance(created_at, datetime)
        else str(created_at)
    )
    return (
        f"👤 会员资料\n\n"
        f"📱 电话号码：{user['phone']}\n"
        f"🏦 银行名称：{user['bank_name']}\n"
        f"💳 银行账号：{user['bank_account']}\n"
        f"👤 户口姓名：{user['bank_holder_name']}\n"
        f"📅 注册时间：{created_str}"
    )


def format_game_accounts(
    accounts: Sequence[Any],
    all_providers: Sequence[str] | None = None,
) -> str:
    """Format game accounts section for admin search_user output."""
    if all_providers is None:
        all_providers = PROVIDERS

    if not accounts:
        return "🎮 游戏平台账号\n\n尚未领取任何账号"

    assigned = {acc["provider"]: acc["username"] for acc in accounts}
    lines = ["🎮 游戏平台账号\n"]

    for provider in all_providers:
        if provider in assigned:
            lines.append(f"{provider}：{assigned[provider]}")

    not_assigned = [p for p in all_providers if p not in assigned]
    if not_assigned:
        lines.append(f"\n尚未领取：{' / '.join(not_assigned)}")

    return "\n".join(lines)
