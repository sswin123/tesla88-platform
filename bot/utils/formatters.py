from __future__ import annotations

from datetime import datetime
from typing import Any


def format_user_info(user: Any) -> str:
    status_emoji = "🟢" if user["status"] == "ACTIVE" else "🔴"
    free_text = "✅ 符合" if user["eligible_free_credit"] else "❌ 不符合"
    username = f"@{user['telegram_username']}" if user["telegram_username"] else "无"

    created_at = user["created_at"]
    created_str = (
        created_at.strftime("%Y-%m-%d %H:%M:%S")
        if isinstance(created_at, datetime)
        else str(created_at)
    )

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
        f"总出款：RM {user['total_withdraw']:,.2f}\n"
        f"净充值：RM {user['net_deposit']:,.2f}\n\n"
        f"📅 注册时间：{created_str}"
    )
