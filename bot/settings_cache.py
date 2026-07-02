from __future__ import annotations

import asyncio
import logging
from typing import Optional

import asyncpg

logger = logging.getLogger(__name__)


class SettingsCache:
    """Polls system_settings from PostgreSQL every `refresh_interval` seconds.

    Initialized once at relay startup; /reload-settings forces an immediate reload.
    """

    def __init__(self, pool: asyncpg.Pool, refresh_interval: int = 60) -> None:
        self._pool = pool
        self._cache: dict[str, str] = {}
        self._interval = refresh_interval
        self._task: Optional[asyncio.Task] = None  # type: ignore[type-arg]

    async def start(self) -> None:
        await self._load()
        self._task = asyncio.create_task(self._refresh_loop())
        logger.info("SettingsCache started — %d keys loaded", len(self._cache))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def reload(self) -> None:
        """Force immediate reload (called by /reload-settings endpoint)."""
        await self._load()
        logger.info("SettingsCache reloaded — %d keys", len(self._cache))

    async def _load(self) -> None:
        rows = await self._pool.fetch("SELECT key, value FROM system_settings")
        self._cache = {row["key"]: row["value"] for row in rows}

    async def _refresh_loop(self) -> None:
        while True:
            await asyncio.sleep(self._interval)
            try:
                await self._load()
            except Exception as exc:  # noqa: BLE001
                logger.error("SettingsCache refresh failed: %s", exc)

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self._cache.get(key, default)

    def get_bool(self, key: str, default: bool = False) -> bool:
        v = self._cache.get(key)
        if v is None:
            return default
        return v.lower() in ("true", "1", "yes", "on")

    def get_int(self, key: str, default: int = 0) -> int:
        v = self._cache.get(key)
        if v is None:
            return default
        try:
            return int(v)
        except (ValueError, TypeError):
            return default
