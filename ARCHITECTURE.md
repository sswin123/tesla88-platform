# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MEMBERS (Telegram)                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ Telegram Bot API (HTTPS long-polling)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      TELEGRAM BOT  (Python)                         │
│                                                                     │
│  aiogram 3 dispatcher                                               │
│  ├── Registration FSM                                               │
│  ├── Deposit FSM                                                    │
│  ├── Withdrawal FSM                                                 │
│  ├── Game Account handlers                                          │
│  ├── Promotion handlers                                             │
│  ├── Live Chat handlers                                             │
│  └── Admin command handlers                                         │
│                                                                     │
│  aiohttp Relay Server  ←────────── HTTP POST  ──────────────────┐  │
│  POST /relay                        (Bearer token auth)          │  │
│  POST /notify_close                                              │  │
│                    │                                             │  │
│                    ▼                                             │  │
└────────────────────┼─────────────────────────────────────────── │──┘
                     │                                             │
                     │ asyncpg (async SQL)                         │
                     │                                             │
┌────────────────────▼─────────────────────────────────────────── │──┐
│                      POSTGRESQL 14                               │  │
│                                                                  │  │
│  22 tables across 4 domains:                                     │  │
│  ├── Members:     users, admins                                  │  │
│  ├── Finance:     deposit_requests, withdrawal_requests          │  │
│  │                payment_banks, bonus_types, bonus_claims       │  │
│  │                promotions                                     │  │
│  ├── Game:        free_list, account_pool, user_game_accounts    │  │
│  │                providers                                      │  │
│  ├── Live Chat:   support_sessions, support_messages             │  │
│  │                quick_reply_categories, quick_replies          │  │
│  │                quick_reply_favorites, session_notes           │  │
│  │                customer_tags, user_tag_assignments            │  │
│  └── Operations:  audit_logs, risk_flags, announcements          │  │
│                   system_settings                                │  │
└──────────────────────────────────────────────────────────────── │──┘
                                                                   │
                                              HTTP POST /relay      │
┌──────────────────────────────────────────────────────────────────▼──┐
│                      ERP  (Next.js 15)                              │
│                                                                     │
│  App Router  (/app/(dashboard)/...)                                 │
│  ├── /dashboard        — KPIs, charts, top members                 │
│  ├── /deposits         — deposit review queue                      │
│  ├── /withdrawals      — withdrawal review queue                   │
│  ├── /members          — member list + detail                      │
│  ├── /banks            — bank manager                              │
│  ├── /promotions       — promotion manager                         │
│  ├── /audit            — audit log viewer                          │
│  ├── /livechat         — real-time live chat (SSE)                 │
│  ├── /finance          — finance reports + CSV export              │
│  ├── /analytics        — member analytics + trends                 │
│  ├── /risk             — risk scan + flag management               │
│  ├── /providers        — game provider management                  │
│  ├── /accounts         — game account pool manager                 │
│  ├── /announcements    — announcement center                       │
│  ├── /admin-users      — RBAC + admin management                   │
│  ├── /settings         — system settings                           │
│  └── /maintenance      — health, backup, maintenance mode          │
│                                                                     │
│  API Routes  (/app/api/...)                                         │
│  └── Repository layer  (src/lib/repositories/*.ts)                 │
│      └── pg pool  (node-postgres)                                  │
└─────────────────────────────────────────────────────────────────────┘
                             │
                    ADMIN BROWSER
```

---

## Components

### Telegram Bot

**Runtime:** Python 3.11, aiogram 3.x, asyncpg  
**Entry point:** `bot/main.py`  
**Location:** `bot/`

The bot is the member-facing interface. Members interact with it exclusively via Telegram — no web interface. The bot uses aiogram's FSM (Finite State Machine) for multi-step flows (registration, deposit, withdrawal, game account claim).

Key design decisions:
- **Long polling** — no webhook required; simpler deployment
- **asyncio throughout** — all DB calls use `asyncpg` with a connection pool; all handlers are `async def`
- **Repository pattern** — all SQL lives in `bot/` repository modules (`account_repo.py`, `user_repo.py`, etc.); handlers never construct SQL
- **Role middleware** — every update passes through `AdminMiddleware` which injects the caller's role (`SUPER_ADMIN`, `ADMIN`, `CS`) before routing

Handler modules:
| Module | Responsibility |
|--------|----------------|
| `handlers/user/registration.py` | Registration FSM |
| `handlers/user/deposit.py` | Deposit submission FSM |
| `handlers/user/withdrawal.py` | Withdrawal submission FSM |
| `handlers/user/game_accounts.py` | Account view and change |
| `handlers/user/promotions.py` | Browse and claim promotions |
| `handlers/user/livechat.py` | Open CS session, relay messages |
| `handlers/admin/review.py` | Approve/reject deposits and withdrawals |
| `handlers/admin/search.py` | Member lookup commands |
| `handlers/admin/freeze.py` | Freeze/unfreeze members |
| `handlers/admin/manage_admins.py` | Add/remove/list admins |
| `handlers/admin/account_manage.py` | Account pool management |

---

### Relay Server

**Runtime:** aiohttp (runs in the same process as the Telegram bot)  
**Entry point:** `bot/api_server.py`  
**Port:** 8090 (configurable via `BOT_RELAY_PORT`)

The relay server is a small HTTP API that lets the ERP send messages back to members through the bot. Without it, the ERP would have no way to push messages to Telegram.

Endpoints:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /relay` | POST | Send a text or image message to a member's active session |
| `POST /notify_close` | POST | Notify a member that their session was closed by an agent |
| `GET /health` | GET | Health check (public, no auth) |

All POST endpoints require `Authorization: Bearer <BOT_RELAY_AUTH_TOKEN>`. The token must match the value in both `.env` files.

The relay server runs as a background `asyncio` task alongside the aiogram dispatcher — they share the same event loop and the same bot instance.

---

### ERP (Next.js)

**Runtime:** Node.js 22, Next.js 15 App Router  
**Entry point:** `erp/src/app/`  
**Port:** 3000  
**Build output:** `output: 'standalone'` (self-contained Node server, no next.js CLI required in production)

The ERP is the admin panel. All pages require authentication except `/login` and a small number of public API endpoints.

Key design decisions:
- **App Router (Next.js 15)** — all routes use the new App Router; `params` is `Promise<{...}>` and must be awaited
- **TypeScript strict mode** — `tsc --noEmit` runs as the lint step; 0 errors required
- **Repository pattern** — all SQL lives in `erp/src/lib/repositories/*.ts`; API routes call repository functions only
- **JWT authentication** — stored in an `httpOnly` cookie (`erp_session`); verified via `jose` in both middleware and individual API route handlers (dual-layer for Phase 4 routes)
- **No external UI libraries** — all charts are pure SVG components (`BarChart.tsx`, `LineChart.tsx`)
- **Audit logging** — every mutation fires `logAudit(...)` fire-and-forget; never blocks the response

Middleware (`erp/src/middleware.ts`) protects all routes and redirects unauthenticated requests to `/login`. Public paths:
- `/login`, `/api/auth/*`
- `GET /api/providers` (needed by the bot)
- `/api/maintenance/health`, `/api/maintenance/status` (monitoring)

---

### PostgreSQL

**Version:** 14 (Alpine)  
**Schema file:** `database.sql` (single file, idempotent — all `CREATE TABLE IF NOT EXISTS`)  
**Volume:** `postgres_data` (Docker named volume)

The database is the single source of truth for all system state. No data is cached outside the database.

Table domains:

| Domain | Tables |
|--------|--------|
| Identity | `users`, `admins` |
| Finance | `deposit_requests`, `withdrawal_requests`, `payment_banks`, `bonus_types`, `bonus_claims`, `promotions` |
| Game | `free_list`, `account_pool`, `user_game_accounts`, `providers` |
| Live Chat | `support_sessions`, `support_messages`, `quick_reply_categories`, `quick_replies`, `quick_reply_favorites`, `session_notes`, `customer_tags`, `user_tag_assignments` |
| Operations | `audit_logs`, `risk_flags`, `announcements`, `system_settings` |

---

### Repository Layer

**Bot repositories:** `bot/` — Python functions returning typed dicts or dataclasses  
**ERP repositories:** `erp/src/lib/repositories/*.ts` — TypeScript `async` functions returning typed objects

The repository layer is the only place SQL is written. This enforces a strict boundary:
- Handlers / API routes contain business logic and HTTP concerns
- Repositories contain SQL and data-mapping concerns

ERP repositories:
| Repository | Responsibility |
|------------|----------------|
| `audit_repo.ts` | Write audit log entries |
| `bank_repo.ts` | Payment bank CRUD |
| `promotion_repo.ts` | Promotion CRUD, bonus preview |
| `support_repo.ts` | Live chat sessions, messages, tags, notes, quick replies |
| `finance_repo.ts` | Finance reports (multi-query parallel) |
| `analytics_repo.ts` | Member analytics (multi-query parallel) |
| `risk_repo.ts` | Risk scan patterns, flag CRUD |
| `provider_repo.ts` | Game provider CRUD |
| `account_repo.ts` | Account pool CRUD, bulk import, reassign |
| `announcement_repo.ts` | Announcement CRUD, broadcast |
| `settings_repo.ts` | System settings key-value store |
| `admin_repo.ts` | Admin user CRUD (bcrypt passwords) |

---

### API Layer

All ERP API routes follow the pattern:

```
1. Parse cookies → verifyJWT → extract payload
2. Validate request body
3. Call repository function(s)
4. Fire-and-forget logAudit (mutations only)
5. Return NextResponse.json(...)
```

Role enforcement:
- `SUPER_ADMIN` only: `/api/settings`, `/api/admin-users`, `/api/maintenance/backup`
- All authenticated admins: all other routes
- Public (no auth): `GET /api/providers`, `GET /api/maintenance/health`, `GET /api/maintenance/status`

---

## Data Flow — Deposit Approval

```
Member (Telegram)
  → sends deposit receipt to bot
  → bot saves deposit_request (status=PENDING) to DB
  → bot posts notification to ADMIN_CHAT_ID group

Admin (Telegram group)
  → taps [Approve] inline button
  → bot updates deposit_request status=APPROVED
  → bot credits member balance
  → bot sends confirmation to member
  → bot writes DEPOSIT_APPROVE to audit_logs

ERP Admin (browser)
  → sees same deposit in /deposits queue (reads from DB)
  → can also approve from ERP (same DB update)
```

## Data Flow — Live Chat Message

```
Member (Telegram)
  → sends message in chat
  → bot stores message in support_messages (sender_type=USER)
  → bot posts notification to SUPPORT_CHAT_ID group
  → SSE event pushed to ERP via DB poll (30s interval)

ERP Agent (browser /livechat)
  → SSE stream delivers new message in real-time
  → agent types reply → POST /api/livechat/sessions/[id]/messages
  → ERP calls POST http://relay:8090/relay (Bearer token)
  → relay server calls bot.send_message() → member receives reply in Telegram
  → ERP stores agent message in support_messages (sender_type=AGENT)
```
