from __future__ import annotations

import logging
from typing import Any

import asyncpg

logger = logging.getLogger(__name__)

DEFAULT_LANGUAGE = "zh"
_CACHE_COMPONENT = "bot_messages"


class BotMessageService:
    """In-memory cache of bot message translations with version-based invalidation.

    Usage:
        svc = BotMessageService(pool)
        text = await svc.get_message("start_returning_user", variables={"first_name": "Ali"})

    Cache is loaded on first use.  Call check_and_reload() periodically to pick
    up ERP edits (cache_versions.version increment triggers a full reload).
    Never raises — returns a safe fallback string on any error.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._cache: dict[str, dict[str, str]] = {}  # key → {lang_code → content}
        self._version: int = 0
        self._loaded: bool = False

    # ── Public API ────────────────────────────────────────────────────────────

    async def get_message(
        self,
        key: str,
        language: str = DEFAULT_LANGUAGE,
        variables: dict[str, Any] | None = None,
    ) -> str:
        """Return a translated, variable-substituted message.

        Fallback chain:
          1. Requested language
          2. Default language (zh)
          3. Any available translation for the key
          4. The key string itself (if key unknown)

        Never raises.
        """
        if not self._loaded:
            await self.load_cache()

        try:
            content = self._resolve(key, language)
            return self._substitute(content, variables or {})
        except Exception:
            logger.exception("BotMessageService.get_message: key=%s", key)
            return key

    async def load_cache(self) -> None:
        """Fetch all live translations from DB and store in memory.

        On DB failure: keeps existing cache intact, marks as loaded to avoid
        hammering the database on every subsequent message call.
        """
        try:
            rows = await self._pool.fetch(
                """
                SELECT bmk.message_key, bmt.language_code, bmt.content
                FROM bot_message_translations bmt
                JOIN bot_message_keys bmk ON bmk.id = bmt.key_id
                """
            )
        except Exception:
            logger.exception("BotMessageService.load_cache: fetch failed")
            self._loaded = True  # Prevent retry storm; cache stays as-is
            return

        try:
            version = await self._pool.fetchval(
                "SELECT version FROM cache_versions WHERE component = $1",
                _CACHE_COMPONENT,
            )
            version = int(version) if version is not None else 0
        except Exception:
            logger.warning("BotMessageService.load_cache: version fetch failed, using 0")
            version = 0

        new_cache: dict[str, dict[str, str]] = {}
        for row in rows:
            key = row["message_key"]
            lang = row["language_code"]
            if key not in new_cache:
                new_cache[key] = {}
            new_cache[key][lang] = row["content"]

        self._cache = new_cache
        self._version = version
        self._loaded = True
        logger.info(
            "BotMessageService: loaded %d keys at version %d",
            len(self._cache), self._version,
        )

    async def invalidate_cache(self) -> None:
        """Clear the in-memory cache. Next get_message() will reload from DB."""
        self._cache = {}
        self._version = 0
        self._loaded = False
        logger.info("BotMessageService: cache invalidated")

    async def reload_cache(self) -> None:
        """Force a full reload from DB regardless of current state."""
        self._loaded = False
        await self.load_cache()

    async def get_current_version(self) -> int:
        """Query cache_versions table — does not touch the in-memory cache."""
        try:
            v = await self._pool.fetchval(
                "SELECT version FROM cache_versions WHERE component = $1",
                _CACHE_COMPONENT,
            )
            return int(v) if v is not None else 0
        except Exception:
            logger.exception("BotMessageService.get_current_version: DB error")
            return self._version

    async def check_and_reload(self) -> bool:
        """Reload cache if the DB version differs from the cached version.

        Returns True if a reload was performed (version changed).
        Intended to be called from a periodic polling task (e.g. every 10 s).
        """
        current = await self.get_current_version()
        if current != self._version:
            logger.info(
                "BotMessageService: version %d → %d, reloading cache",
                self._version, current,
            )
            await self.reload_cache()
            return True
        return False

    # ── Internals ─────────────────────────────────────────────────────────────

    def _resolve(self, key: str, language: str) -> str:
        """Resolve content with fallback chain. Returns key string if not found."""
        translations = self._cache.get(key)
        if not translations:
            return key  # Unknown key — return key as fallback text

        # 1. Requested language
        if language in translations:
            return translations[language]

        # 2. Default language (zh)
        if DEFAULT_LANGUAGE in translations:
            return translations[DEFAULT_LANGUAGE]

        # 3. Any available translation
        return next(iter(translations.values()))

    @staticmethod
    def _substitute(template: str, variables: dict[str, Any]) -> str:
        """Replace {placeholder} variables in template.

        Returns the original template unchanged if any variable is missing or
        the substitution fails — never raises.
        """
        if not variables:
            return template
        try:
            return template.format_map(variables)
        except (KeyError, ValueError, IndexError):
            return template
