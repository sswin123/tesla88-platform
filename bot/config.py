from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    bot_token: str
    super_admin_id: int
    postgres_host: str
    postgres_port: int
    postgres_db: str
    postgres_user: str
    postgres_password: str
    cs_username: str
    account_change_cooldown_hours: int
    admin_chat_id: int
    support_chat_id: int
    min_deposit_amount: float
    min_withdrawal_amount: float


def load_config() -> Config:
    return Config(
        bot_token=os.environ["BOT_TOKEN"],
        super_admin_id=int(os.environ["SUPER_ADMIN_ID"]),
        postgres_host=os.environ.get("POSTGRES_HOST", "localhost"),
        postgres_port=int(os.environ.get("POSTGRES_PORT", "5432")),
        postgres_db=os.environ["POSTGRES_DB"],
        postgres_user=os.environ["POSTGRES_USER"],
        postgres_password=os.environ["POSTGRES_PASSWORD"],
        cs_username=os.environ.get("CS_USERNAME", "support"),
        account_change_cooldown_hours=int(
            os.environ.get("ACCOUNT_CHANGE_COOLDOWN_HOURS", "24")
        ),
        admin_chat_id=int(os.environ.get("ADMIN_CHAT_ID", "0")),
        support_chat_id=int(os.environ.get("SUPPORT_CHAT_ID", "0")),
        min_deposit_amount=float(os.environ.get("MIN_DEPOSIT_AMOUNT", "30")),
        min_withdrawal_amount=float(os.environ.get("MIN_WITHDRAWAL_AMOUNT", "50")),
    )
