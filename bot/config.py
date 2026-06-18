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


def load_config() -> Config:
    return Config(
        bot_token=os.environ["BOT_TOKEN"],
        super_admin_id=int(os.environ["SUPER_ADMIN_ID"]),
        postgres_host=os.environ.get("POSTGRES_HOST", "localhost"),
        postgres_port=int(os.environ.get("POSTGRES_PORT", "5432")),
        postgres_db=os.environ["POSTGRES_DB"],
        postgres_user=os.environ["POSTGRES_USER"],
        postgres_password=os.environ["POSTGRES_PASSWORD"],
    )
