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
from bot.handlers.admin.livechat_agent import router as livechat_agent_router
from bot.handlers.admin.promotion_manager import router as promotion_manager_router
from bot.handlers.common import router as common_router
from bot.handlers.user.livechat import router as livechat_router
from bot.handlers.user.promotions import router as promotions_router
from bot.handlers.user.deposit import router as deposit_router
from bot.handlers.user.game_accounts import router as game_accounts_router
from bot.handlers.user.registration import router as registration_router
from bot.handlers.user.transaction_history import router as transaction_history_router
from bot.handlers.user.withdrawal import router as withdrawal_router
from bot.middlewares.admin_middleware import AdminMiddleware
from bot.middlewares.fsm_timeout_middleware import FsmTimeoutMiddleware
from bot.api_server import start_relay_server
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

    # ── DB identity diagnostics (remove after confirming) ─────────────────────
    async with pool.acquire() as conn:
        db_name = await conn.fetchval("SELECT current_database()")
        db_user = await conn.fetchval("SELECT current_user")
        logger.info("DB connected: database=%s user=%s", db_name, db_user)
        try:
            promo_count = await conn.fetchval("SELECT COUNT(*) FROM promotions")
            logger.info("DB check: promotions table exists, rows=%s", promo_count)
        except Exception as exc:
            logger.error("DB check FAILED — promotions table missing: %s", exc)
    # ─────────────────────────────────────────────────────────────────────────

    bot = Bot(token=config.bot_token)
    dp = Dispatcher(storage=MemoryStorage())

    dp["pool"] = pool
    dp["config"] = config

    dp.message.middleware(AdminMiddleware())
    dp.callback_query.middleware(AdminMiddleware())
    dp.message.middleware(FsmTimeoutMiddleware())

    # common_router MUST be first: its global cancel fires before any flow-specific handler
    dp.include_router(common_router)

    # User routers first — registration catches /start and F.text menu buttons
    dp.include_router(registration_router)
    dp.include_router(game_accounts_router)
    # All FSM-bearing routers BEFORE livechat so their state-filtered handlers
    # win over HasLivechatSession's catch-all.  livechat_router is last among
    # user routers so it only intercepts messages that no FSM handler claimed.
    dp.include_router(promotions_router)
    dp.include_router(deposit_router)
    dp.include_router(withdrawal_router)
    dp.include_router(livechat_router)
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
    dp.include_router(livechat_agent_router)
    dp.include_router(promotion_manager_router)

    relay_runner = await start_relay_server(bot, pool)
    logger.info("Bot starting — polling...")
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await relay_runner.cleanup()
        await pool.close()
        await bot.session.close()
        logger.info("Bot stopped.")


if __name__ == "__main__":
    asyncio.run(main())
