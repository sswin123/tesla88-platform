from __future__ import annotations
import asyncio
import logging

# Configure logging BEFORE any project imports so all module-level loggers
# inherit the handler added to the root logger here.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage

from bot.config import load_config
from bot.handlers.admin.account_manage import router as account_manage_router
from bot.handlers.admin.account_stats import router as account_stats_router
from bot.handlers.admin.freeze import router as freeze_router
from bot.handlers.admin.import_accounts import router as import_accounts_router
from bot.handlers.admin.import_free_list import router as import_router
from bot.handlers.admin.manage_admins import router as manage_router
from bot.handlers.admin.search import router as search_router
from bot.handlers.admin.stats import router as stats_router
from bot.handlers.admin.update_bank import router as update_bank_router
from bot.handlers.admin.review import router as review_router
from bot.handlers.user.livechat import router as livechat_router
from bot.handlers.user.deposit import router as deposit_router
from bot.handlers.user.game_accounts import router as game_accounts_router
from bot.handlers.user.registration import router as registration_router
from bot.handlers.user.transaction_history import router as transaction_history_router
from bot.handlers.user.withdrawal import router as withdrawal_router
from bot.middlewares.admin_middleware import AdminMiddleware
from db.connection import create_pool
from db.repositories.admin_repo import create_or_ensure_super_admin

logger = logging.getLogger(__name__)


async def main() -> None:
    config = load_config()

    logger.info("ADMIN_CHAT_ID=%s", config.admin_chat_id)
    logger.info("SUPPORT_CHAT_ID=%s", config.support_chat_id)

    pool = await create_pool(config)
    logger.info("Database pool created.")

    await create_or_ensure_super_admin(pool, config.super_admin_id)
    logger.info(f"Super admin ensured: {config.super_admin_id}")

    bot = Bot(token=config.bot_token)
    dp = Dispatcher(storage=MemoryStorage())

    dp["pool"] = pool
    dp["config"] = config

    dp.message.middleware(AdminMiddleware())
    dp.callback_query.middleware(AdminMiddleware())

    # User routers first — registration catches /start and F.text menu buttons
    dp.include_router(registration_router)
    dp.include_router(game_accounts_router)
    dp.include_router(livechat_router)
    dp.include_router(deposit_router)
    dp.include_router(withdrawal_router)
    dp.include_router(transaction_history_router)

    # Admin routers
    dp.include_router(search_router)
    dp.include_router(manage_router)
    dp.include_router(freeze_router)
    dp.include_router(update_bank_router)
    dp.include_router(import_router)
    dp.include_router(stats_router)
    dp.include_router(import_accounts_router)
    dp.include_router(account_stats_router)
    dp.include_router(account_manage_router)
    dp.include_router(review_router)

    logger.info("Bot starting — polling...")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await pool.close()
        await bot.session.close()
        logger.info("Bot stopped.")


if __name__ == "__main__":
    asyncio.run(main())
