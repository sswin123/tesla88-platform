import asyncpg
from bot.config import Config


async def create_pool(config: Config) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        host=config.postgres_host,
        port=config.postgres_port,
        database=config.postgres_db,
        user=config.postgres_user,
        password=config.postgres_password,
        min_size=2,
        max_size=10,
    )
