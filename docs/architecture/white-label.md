# White Label Architecture — v1.0

## Overview

Brand configuration is managed from a single source of truth: the `brand_settings` table (single row, id=1). Every system component reads from this table — either directly or via a service layer with caching. No system component hardcodes any brand value in production paths.

---

## Deployment Architecture

```
                    ┌─────────────────────────────────────┐
                    │         PostgreSQL Database          │
                    │   brand_settings (id=1, single row) │
                    │   cache_versions (component tracking)│
                    └────────────┬────────────────────────┘
                                 │  shared DB connection
           ┌─────────────────────┼──────────────────────┐
           │                     │                      │
    ┌──────▼──────┐     ┌────────▼──────┐    ┌─────────▼──────┐
    │  ERP Admin  │     │    Website    │    │  Telegram Bot  │
    │  (port 3000)│     │  (port 3001)  │    │  (Python)      │
    └─────────────┘     └───────────────┘    └────────────────┘
```

**Decision: Shared database, not HTTP federation.**
The ERP and Website are intentionally co-deployed with a shared PostgreSQL database. The Website reads `brand_settings` directly rather than calling the ERP's HTTP API. This avoids:
- An inter-service HTTP dependency (website fails if ERP is down)
- Latency of an extra network hop
- The need for an `ERP_INTERNAL_URL` environment variable

If the deployment model ever changes to independent services, migrate `website/src/lib/brand.ts` → `getBrand()` to call `GET /api/public/brand` instead of querying the DB.

---

## Brand Flow

### 1. Brand Settings Storage

```
brand_settings (single row, id=1)
├── Identity:    brand_name, company_name, tagline
├── Assets:      logo_media_id, favicon_media_id
├── Theme:       primary_color, secondary_color, theme_mode
├── Domain:      website_domain, api_domain
├── Contact:     support_whatsapp, support_telegram, telegram_channel, facebook_url
└── SEO:         seo_title, seo_description, seo_keywords
```

Updates go through:
`ERP Brand Center UI → PATCH /api/settings/brand → brand_repo.updateBrandSettings() → DB`

Post-update side effects (non-blocking):
- `invalidateBrandCache()` — clears ERP in-memory cache
- `bumpBrandCacheVersion()` — increments `cache_versions.version` for the bot to detect

---

## ERP Flow

```
erp/src/lib/brand_service.ts
  getBrand()          — 60s in-memory cache over getBrandSettings()
  invalidateBrandCache() — called after PATCH /api/settings/brand
  BRAND_FALLBACK      — SSWIN88 defaults, used when DB is unreachable

Consumed by:
  erp/src/app/layout.tsx          → page <title> = "{brand_name} — ERP"
  erp/src/components/sidebar.tsx  → header shows brand_name + logo (client fetch)
  erp/src/app/(dashboard)/settings/brand/page.tsx → Brand Center form
```

**Public API (no auth):**
`GET /api/public/brand` — returns brand fields excluding `id`, `updated_by`, `created_at`, `updated_at`.
Consumed by the ERP sidebar (client-side fetch) and available for external integrations.

---

## Website Flow

```
website/src/lib/brand.ts
  getBrand()          — 60s in-memory cache, DB direct query
  BRAND_FALLBACK      — SSWIN88 defaults

Consumed by:
  website/src/app/layout.tsx   → SEO metadata, favicon, nav logo/brand name,
                                  --brand-primary/--brand-secondary CSS variables,
                                  footer contact (WhatsApp, Telegram)
  website/src/app/page.tsx     → Hero color, brand name in welcome text
```

### Theme Engine

CSS variables are injected by the Server Component layout onto `<html>`:

```html
<html style="--brand-primary:#1d4ed8; --brand-secondary:#1e40af;">
```

All client pages use these variables via CSS utility classes defined in `globals.css`:

| Class          | Usage                            | CSS                                       |
|----------------|----------------------------------|-------------------------------------------|
| `.btn-brand`   | Primary action buttons           | `background-color: var(--brand-primary)`  |
| `.text-brand`  | Brand-colored links/text         | `color: var(--brand-primary)`             |
| `.input-brand` | Form input focus ring            | `box-shadow: 0 0 0 2px var(--brand-primary)` |
| `.bubble-brand`| User chat message bubble         | `background-color: var(--brand-primary)`  |
| `.bubble-brand-time` | Timestamp inside user bubble | `color: rgb(255 255 255 / 0.65)`       |

Client pages (`'use client'`) cannot call server functions, but they inherit CSS variables from the `<html>` element set by the Server Component layout.

### Light / Dark / System Theme

`theme_mode` is stored in `brand_settings`. The Website layout reads this field from `getBrand()` and can apply a `dark` class to `<html>` to activate Tailwind dark mode. Currently, light mode is the default for v1.0.

---

## Telegram Bot Flow

```
bot/services/brand_service.py
  BrandService(pool)
    get_brand()          — loads brand_settings from DB, in-memory cache
    get_variables()      — returns {brand_name, company_name, support_whatsapp,
                            telegram_channel, website_domain} as str dict
    check_and_reload()   — called every 30s by _periodic_reload() in main.py
    _FALLBACK            — SSWIN88 defaults

Integration with BotMessageService:
  BotMessageService(pool, brand_service=brand_svc)
    get_message(key)     — auto-injects brand variables into CMS template substitution
                           (brand vars can be overridden per-call)

Periodic reload (main.py _periodic_reload — every 30s):
  1. BotMessageService.check_and_reload()  — detects CMS message version change
  2. BrandService.check_and_reload()       — detects brand version change
     └─ if brand_name changed → bot.set_my_name(new_name)  — syncs Telegram profile
```

---

## Cache Flow

```
Write path:
  PATCH /api/settings/brand
    → updateBrandSettings() [DB write]
    → invalidateBrandCache()   [ERP in-memory cache cleared immediately]
    → bumpBrandCacheVersion()  [cache_versions.version += 1, non-blocking]

Read paths:
  ERP  → getBrand() in brand_service.ts → 60s TTL cache → DB
  Web  → getBrand() in brand.ts         → 60s TTL cache → DB
  Bot  → BrandService.get_brand()       → until check_and_reload() detects version bump
            └─ check_and_reload() polls every 30s → compares local vs DB version
```

Maximum propagation delay:
- ERP: up to 60s (cache TTL)
- Website: up to 60s (cache TTL)
- Bot: up to 30s (poll interval) + DB query

---

## Architecture Audit Results

### No Duplicate Brand Services

| Component | Brand Service File             | Pattern        |
|-----------|-------------------------------|----------------|
| ERP       | `erp/src/lib/brand_service.ts` | Module-level cache |
| Website   | `website/src/lib/brand.ts`     | Module-level cache |
| Bot       | `bot/services/brand_service.py`| Class with asyncpg pool |

Each component has exactly one brand service. No duplication.

### No Duplicate Theme Logic

Theme CSS variables are injected in exactly one place: `website/src/app/layout.tsx` (line with `html style`).

### No Duplicate Brand Cache

Each service maintains its own in-memory cache appropriate to its runtime:
- ERP (Node.js): module-level variables (`cache`, `cacheAt`)
- Website (Node.js): module-level variables (`_cache`, `_cacheAt`)
- Bot (Python): instance variables on `BrandService`

These are separate processes with separate caches — by design.

### Remaining Hardcoded Values

The following are **intentional fallback defaults**, not hardcoded branding:
- `BRAND_FALLBACK` / `_FALLBACK` in all three brand services → used when DB is unreachable
- `resetBrandSettings()` in `brand_repo.ts` → resets to SSWIN88 defaults on demand
- SQL seed data in `migrations/034_brand_settings.sql` → initial DB population

ERP admin UI blue buttons (`bg-blue-600`) are the **ERP's own design system** color, not brand colors. They are intentionally kept as-is per the "No redesign" constraint.

---

## White Label Readiness Checklist

### Brand Center (ERP)
- [x] `brand_settings` table with full schema
- [x] Brand Center UI page (`/settings/brand`)
- [x] PATCH API with audit logging
- [x] Cache invalidation on save
- [x] `bumpBrandCacheVersion()` signals bot after update

### Website
- [x] `getBrand()` with 60s cache and fallback
- [x] Layout: brand name, logo, SEO title/description, favicon
- [x] Layout: `--brand-primary`, `--brand-secondary` CSS variables on `<html>`
- [x] Layout: WhatsApp and Telegram channel in footer
- [x] Home page: hero color and brand name from brand
- [x] All client pages: buttons/inputs use CSS variable classes
- [x] No `site_primary_color` or `site_brand_name` from system_settings in brand paths

### ERP
- [x] Sidebar header: brand name + logo from `/api/public/brand`
- [x] Page title: `{brand_name} — ERP` (dynamic via `generateMetadata`)
- [x] Public API: `GET /api/public/brand` (no auth, hides private fields)

### Telegram Bot
- [x] `BrandService` reads brand from DB with cache and fallback
- [x] `BotMessageService` auto-injects brand variables into message templates
- [x] Periodic reload detects version change every 30s
- [x] Bot name synced to Telegram via `set_my_name()` when brand_name changes

### Architecture
- [x] Single source of truth: `brand_settings` table
- [x] No hardcoded brand values in production paths
- [x] Deployment model documented (shared DB, not HTTP federation)
- [x] Cache propagation delay documented (≤60s ERP/Web, ≤30s Bot)
