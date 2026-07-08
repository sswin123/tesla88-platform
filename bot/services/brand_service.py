from __future__ import annotations

import logging
from typing import Any

import asyncpg

logger = logging.getLogger(__name__)

_CACHE_COMPONENT = "brand_settings"

_FALLBACK: dict[str, Any] = {
    "id": 1,
    "brand_name": "SSWIN88",
    "company_name": "SSWIN88",
    "tagline": None,
    "logo_media_id": None,
    "favicon_media_id": None,
    "primary_color": "#1d4ed8",
    "secondary_color": "#1e40af",
    "theme_mode": "light",
    "website_domain": None,
    "api_domain": None,
    "support_whatsapp": None,
    "support_telegram": None,
    "telegram_channel": None,
    "facebook_url": None,
    "seo_title": None,
    "seo_description": None,
    "seo_keywords": None,
}


class BrandService:
    """In-memory cache of brand settings with version-based invalidation.

    Cache is loaded on first use.  Call check_and_reload() periodically to
    detect ERP brand saves (cache_versions.version increment triggers reload).
    Never raises — returns SSWIN88 fallback on any DB error.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._brand: dict[str, Any] = dict(_FALLBACK)
        self._version: int = 0
        self._loaded: bool = False

    # ── Public API ─────────────────────────────────────────────────────────────

    async def get_brand(self) -> dict[str, Any]:
        """Return current brand settings dict.  Loads from DB on first call."""
        if not self._loaded:
            await self.load_cache()
        return self._brand

    async def get_variables(self) -> dict[str, str]:
        """Return standard brand template variables for CMS message substitution.

        Keys match the placeholders bot message templates use:
          {brand_name}, {company_name}, {support_whatsapp},
          {telegram_channel}, {website_domain}
        """
        b = await self.get_brand()
        return {
            "brand_name":       str(b.get("brand_name") or "SSWIN88"),
            "company_name":     str(b.get("company_name") or "SSWIN88"),
            "support_whatsapp": str(b.get("support_whatsapp") or ""),
            "telegram_channel": str(b.get("telegram_channel") or ""),
            "website_domain":   str(b.get("website_domain") or ""),
        }

    async def load_cache(self) -> None:
        """Fetch brand settings row from DB.

        On DB failure: keeps existing cache intact, marks as loaded to avoid
        hammering the database on every subsequent call.
        """
        try:
            row = await self._pool.fetchrow(
                "SELECT * FROM brand_settings WHERE id = 1"
            )
        except Exception:
            logger.exception("BrandService.load_cache: fetch failed")
            self._loaded = True  # Prevent retry storm; cache stays as fallback
            return

        try:
            version = await self._pool.fetchval(
                "SELECT version FROM cache_versions WHERE component = $1",
                _CACHE_COMPONENT,
            )
            version = int(version) if version is not None else 0
        except Exception:
            logger.warning("BrandService.load_cache: version fetch failed, using 0")
            version = 0

        self._brand = dict(row) if row else dict(_FALLBACK)
        self._version = version
        self._loaded = True
        logger.info(
            "BrandService: loaded brand_name=%r at version %d",
            self._brand.get("brand_name"),
            self._version,
        )

    async def invalidate_cache(self) -> None:
        """Force reload on next get_brand() / get_variables() call."""
        self._brand = dict(_FALLBACK)
        self._version = 0
        self._loaded = False
        logger.info("BrandService: cache invalidated")

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
            logger.exception("BrandService.get_current_version: DB error")
            return self._version

    async def check_and_reload(self) -> tuple[bool, str | None, str | None]:
        """Reload cache if the DB version differs from cached version.

        Returns (reloaded, old_brand_name, new_brand_name).
        old/new_brand_name are non-None only when reloaded AND the name changed.
        Intended to be called from a periodic polling task (e.g. every 30 s).
        """
        current = await self.get_current_version()
        if current == self._version:
            return False, None, None

        old_name = str(self._brand.get("brand_name") or "")
        logger.info(
            "BrandService: version %d → %d, reloading cache",
            self._version,
            current,
        )
        await self.reload_cache()
        new_name = str(self._brand.get("brand_name") or "")
        name_changed = old_name != new_name
        return (
            True,
            old_name if name_changed else None,
            new_name if name_changed else None,
        )
