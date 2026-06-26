# Changelog

All notable changes to this project are documented in this file.

---

## [1.0.0-rc1] — 2026-06-27

### Phase 4 — Operation Center & Finance Dashboard

**Finance Reports** (`/finance`)
- Date-range reports with 4 quick presets (Today, 7D, 30D, MTD) and custom range picker
- KPI cards: total deposits, withdrawals, net, bonus payout, first-depositor count
- Daily breakdown chart (SVG line chart, no external dependency)
- Per-promotion revenue breakdown table
- First vs. repeat depositor comparison
- CSV export (RFC 4180 compliant) and PDF via browser print

**Member Analytics** (`/analytics`)
- Member growth trend (daily new registrations, SVG line chart)
- Conversion rate, 30-day retention rate, first-deposit rate KPIs
- Top 10 depositors and top 10 bonus recipients tables
- Referral funnel stats
- Top promotions by acquisition

**Risk Center** (`/risk`)
- Automated risk scan: duplicate phones, duplicate bank accounts, high bonus ratio (>50%), frequent withdrawals (>3 in 7 days), rapid deposit pattern (≥2 in 24h)
- Flag / Ignore / Review workflow per flagged user
- Saved flags tab with open/reviewed/ignored counts
- All risk actions logged to audit trail

**Provider Management** (`/providers`)
- Full CRUD for game providers (918Kiss, Mega888, Pussy888, Newtown, Ace333, Live22 seeded)
- Status cycle: ACTIVE → MAINTENANCE → DISABLED
- Sort order, description, logo URL fields
- All mutations audit-logged

**Game Account Manager** (`/accounts`)
- Stats cards: total, available, assigned, disabled
- Provider breakdown table
- Search and filter by provider / status / username
- Per-row reassign to member, enable/disable
- Bulk import via CSV upload (UNNEST single-statement, O(1) DB round-trips)
- Bulk export to CSV with RFC 4180 quoting
- Passwords never returned in list API responses

**Announcement Center** (`/announcements`)
- Create, edit, delete announcements (BANNER, POPUP, TICKER types)
- Target: ALL members or by customer tag
- Status lifecycle: DRAFT → SCHEDULED → ACTIVE → EXPIRED
- Send Now for BROADCAST type (Telegram relay integration)
- Sent count tracked per announcement

**Admin Users & RBAC** (`/admin-users`)
- Full admin user management: create, deactivate, change role
- Six roles: SUPER_ADMIN, ADMIN, CS, FINANCE, SUPERVISOR, SUPPORT
- Password input rendered as `type="password"`
- Role change and user creation audit-logged

**System Settings** (`/settings`)
- Key-value store for 11 system parameters: bot name, timezone, session timeout, notification sound, upload limit, retention days, maintenance mode, auto-reply, relay URL, company name
- Grouped sections with per-section Save buttons
- Maintenance mode shows red warning banner
- SUPER_ADMIN only; all changes audit-logged

**Maintenance & Operations** (`/maintenance`)
- On-demand system health check (DB connectivity, uptime)
- Maintenance mode toggle (persisted in system_settings)
- Database backup download via `pg_dump` (SUPER_ADMIN only, DATABASE_URL guarded)
- Public `/api/maintenance/health` and `/api/maintenance/status` endpoints for monitoring

**Security hardening (Phase 4)**
- `ALLOWED_UPDATE_FIELDS` allowlists block SQL column injection in dynamic SET clauses
- Audit logging on all 13 Phase 4 mutation routes (fire-and-forget, non-fatal)
- Sidebar fetches `/api/maintenance/status` (public) instead of `/api/settings` — eliminates 401 noise for non-SUPER_ADMIN users

---

## [Phase 3.5] — Live Chat UX & Operations

**Desktop Notifications**
- Browser push notification on new message (requires permission grant)
- Sound alert (configurable via system settings)
- Page title flash while tab is in background

**Quick Replies**
- Admin CRUD for quick reply categories and templates
- Favorites system (per-agent)
- ⚡ picker in ReplyBox with instant insertion
- `quick_reply_used` flag tracked in audit log

**Reply Status Indicators**
- Live status per sent message: Sending → ✓ Sent / ✕ Failed
- Retry button on failure

**Conversation Transfer**
- SUPER_ADMIN can transfer session ownership to another agent
- Copy Telegram ID to clipboard (audited)

**Internal Notes**
- Per-session ERP-only notes (never visible to the member)
- Markdown rendering (bold, italic, code, line breaks) with XSS-safe escaping

**Enhanced Member Card**
- Net deposit amount (total deposits minus withdrawals)
- Last 3 transactions with amounts
- Active game account
- Applied promotion
- Previous sessions list

**Customer Tags**
- Tag manager: create, rename, delete colored tags
- Assign/remove tags per member within live chat
- Tag-targeted announcements

**Image Viewer**
- Lightbox for received/sent images in chat
- Zoom, fullscreen, previous/next navigation, keyboard shortcuts (Esc, arrow keys)

**Search & Filters**
- Phone number and session ID search
- Filter pills: My Sessions, Unread, Today, VIP

**Audit Logging (Live Chat)**
- Session close, reopen, assign, transfer
- Message sent (with quick-reply flag)
- Tag add/remove
- Note create/delete
- Telegram ID copy

---

## [Phase 3] — Live Chat System

**Telegram Bot (user side)**
- `/cs` command opens a live chat session with the support team
- Members send text, images, documents directly in Telegram
- Session close notification sent to member when agent closes

**ERP Live Chat interface**
- Conversation list with unread counts, VIP badges, session status
- Real-time message stream via Server-Sent Events (SSE)
- Chat window with message bubbles (TEXT, IMAGE, DOCUMENT, STICKER)
- File upload from ERP to member (images, PDFs up to configured limit)
- Media proxy endpoint: serves Telegram media through the ERP server
- Reply Box with file attachment

**Session Actions Toolbar**
- Assign to self
- Close session
- Reopen closed session

**Bot Relay Server**
- `aiohttp` HTTP server runs alongside the Telegram bot process (port 8090)
- `POST /relay` — ERP sends a message through the bot to the member
- `POST /notify_close` — bot notifies member when ERP closes the session
- Bearer token authentication between ERP and relay

**Database additions**
- `support_sessions` — session lifecycle (OPEN/CLOSED), agent assignment, unread counts
- `support_messages` — full message history with sender type, message type, Telegram message IDs
- `quick_reply_categories`, `quick_replies`, `quick_reply_favorites`
- `session_notes`
- `customer_tags`, `user_tag_assignments`

---

## [Phase 2] — ERP Admin Panel

**Authentication**
- JWT-based login with `httpOnly` cookie
- Session timeout configurable
- Middleware protects all ERP routes

**Dashboard**
- Today's deposits, withdrawals, new members, active members KPIs
- 7-day deposit / withdrawal trend charts (SVG)
- Top 10 promotions by usage
- Top 10 depositors

**Deposit Review**
- Queue of pending deposit requests with receipt image
- Approve (credits member account) / Reject with reason
- Telegram notification to member on decision
- Audit log entry per action

**Withdrawal Review**
- Queue of pending withdrawal requests
- Approve / Reject with reason
- Telegram notification to member on decision
- Audit log entry per action

**Promotion Manager**
- Full CRUD for promotions (bonus percentage, flat bonus, buy-1-get-1 modes)
- Soft delete (deactivated promotions hidden from members but preserved in history)
- Expiry date support
- Bonus preview calculator
- Audit log per action

**Bank Manager**
- Full CRUD for payment bank accounts (bank name, account number, holder name, QR image)
- Enable/disable per bank without deleting
- QR image upload and inline display

**Member Management**
- Member list with search
- Member detail: profile, game accounts, deposit/withdrawal/bonus history
- Manual remarks by ERP admin
- Freeze/unfreeze member account

**Audit Log**
- Full chronological log of all admin actions
- Action type, target, admin username, timestamp, before/after values

**Database additions**
- `promotions` (with expiry, soft delete)
- `bonus_claims`
- `audit_logs`
- `payment_banks` (renamed columns)
- `user_remarks`

---

## [Phase 1] — Telegram Bot Core

**Member Registration**
- Step-by-step FSM: phone number → bank selection → account number → holder name
- Phone normalization (strips +, spaces, dashes; normalises country code)
- Duplicate phone detection

**Deposit Flow**
- Member initiates deposit, selects payment bank
- Uploads receipt image
- Bot forwards request to finance group with inline Approve/Reject buttons
- Admin approves/rejects directly in Telegram group

**Withdrawal Flow**
- Member requests withdrawal
- Bot forwards to finance group
- Admin approves/rejects with reason

**Game Account Pool**
- Admin imports free list (CSV via bot or CLI script)
- Atomic account assignment to member (no double-assignment)
- Member can view their account; one account change per cooldown period
- Pool stats visible to SUPER_ADMIN

**Promotions (Bot)**
- Member browses active promotions
- Claims bonus (FSM-guided)
- Bonus recorded in `bonus_claims`

**Admin Bot Commands**
- `search_phone`, `search_bank`, `search_user` — member lookup
- `freeze_user` / `unfreeze_user`
- `add_admin` / `remove_admin` / `list_admins`
- `update_bank` — update member's bank details
- `stats` — system overview (members, pending requests, pool stats)
- `import_free_list` — CSV file upload to populate account pool

**Architecture**
- Python 3.11 + aiogram 3 (asyncio)
- asyncpg connection pool
- Repository pattern (all DB queries in `*_repo.py` modules)
- Role-based middleware: SUPER_ADMIN / ADMIN / CS
- PostgreSQL schema: `users`, `admins`, `free_list`, `account_pool`, `user_game_accounts`, `deposit_requests`, `withdrawal_requests`, `bonus_types`
