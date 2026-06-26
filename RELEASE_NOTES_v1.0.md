# Release Notes — v1.0.0

**Release date:** 2026-06-27  
**Status:** Release Candidate 1 (v1.0.0-rc1)

---

## What This Release Is

v1.0.0 is the first production-ready release of the Telegram Member Management & ERP System. It covers the full lifecycle of operating an online gaming or financial service business via Telegram — from member onboarding through live support, financial operations, and back-office management.

---

## Major Capabilities

### Member-Facing (Telegram Bot)

| Capability | Details |
|------------|---------|
| Self-service registration | Phone, bank, and account details captured via guided FSM |
| Deposit submission | Receipt upload → group notification → approve/reject |
| Withdrawal request | Multi-step flow with minimum amount enforcement |
| Game account management | Self-service claim and account change (cooldown enforced) |
| Promotion browsing | Browse active promotions and claim bonuses |
| Live chat with CS | Real-time conversation with support team via Telegram |

### ERP — Financial Operations

| Capability | Details |
|------------|---------|
| Deposit review | Approve/reject queue with receipt viewer |
| Withdrawal review | Approve/reject queue with reason tracking |
| Finance reports | Date-range P&L: deposits, withdrawals, net, bonuses, first depositor breakdown |
| Bank manager | Payment bank CRUD with QR code support |
| Promotion manager | Full CRUD, bonus modes (%, flat, buy-1-get-1), expiry, soft delete |

### ERP — Member Operations

| Capability | Details |
|------------|---------|
| Member management | List, search, profile, freeze/unfreeze, manual remarks |
| Member detail | Full financial history, game accounts, bonus claims |
| Member analytics | Growth trends, conversion, retention, top members, referral funnel |
| Customer tags | Colored tag system for segmentation |

### ERP — Support Operations

| Capability | Details |
|------------|---------|
| Live chat | Real-time agent console with SSE stream |
| Session management | Assign, close, reopen, transfer sessions |
| Internal notes | Per-session ERP-only notes with Markdown |
| Quick replies | Reusable templates with categories and per-agent favorites |
| Image viewer | Lightbox for photos shared in chat |
| Desktop notifications | Browser push + sound on new message |
| Search and filters | Phone search, filter by mine/unread/today/VIP |

### ERP — Game Operations

| Capability | Details |
|------------|---------|
| Provider management | CRUD for game providers with status lifecycle |
| Account pool manager | Bulk import (CSV), reassign, enable/disable, bulk export |
| Risk center | 5 automated scan patterns + flag/ignore/review workflow |

### ERP — Operations & Administration

| Capability | Details |
|------------|---------|
| Announcement center | CRUD with type (BANNER/POPUP/TICKER), targeting, Telegram broadcast |
| System settings | 11 configurable parameters via UI |
| Admin users & RBAC | 6 roles, full admin lifecycle, password management |
| Audit log | Full chronological record of all admin actions |
| Maintenance | Health check, maintenance mode toggle, DB backup download |
| Dashboard | KPI cards, 7-day charts, top providers, monthly revenue |

---

## Technical Highlights

- **Zero external UI dependencies** — all charts are pure SVG components; no Chart.js, Recharts, or similar
- **Repository pattern throughout** — SQL lives only in repository modules; no query construction in handlers or API routes
- **TypeScript strict mode** — 0 type errors
- **All mutations audit-logged** — every create/update/delete by any admin is recorded in `audit_logs`
- **SQL injection protection** — all parameterized queries; dynamic SET clauses protected by `ALLOWED_UPDATE_FIELDS` allowlists
- **Defense-in-depth auth** — JWT verified in both middleware and individual route handlers for Phase 4 endpoints
- **Idempotent schema** — `database.sql` uses `IF NOT EXISTS` throughout; safe to re-run on an existing database
- **22-table schema** — single `database.sql` file, no migration tool required

---

## Known Limitations

### Announcement Broadcast
The Telegram broadcast endpoint (`POST /api/announcements/[id]/broadcast`) is implemented in the ERP but requires a `/broadcast` endpoint on the bot relay server that is not yet implemented. Currently, clicking "Send Now" returns a 501 response with a clear message explaining what the relay needs. The announcement is saved and can be sent manually.

### Live Chat — SSE Polling Interval
The SSE stream uses a 30-second DB poll interval rather than true push. New messages from members appear within 30 seconds of arrival. For higher-traffic deployments, this can be reduced (or replaced with PostgreSQL `LISTEN/NOTIFY`).

### Stable Module Auth (Single Layer)
Phase 1–3 API routes (members, deposits, withdrawals, livechat, support, dashboard, audit) rely on Next.js middleware for authentication and do not perform a second JWT check inside the handler. Phase 4 routes have dual-layer auth. This is consistent within each phase but inconsistent across the system. No current exploitability — planned for a future hardening sprint.

### Account Pool Passwords
Game account credentials (usernames and passwords for platforms like 918Kiss, Mega888) are stored in plaintext in the `account_pool` table. These are operational credentials, not user account passwords, but encryption-at-rest at the column level may be required for compliance in some jurisdictions.

### No Email Notifications
All notifications go through Telegram (member notifications) or the ERP UI (admin notifications). No email notification system exists in this version.

### Single-Region Deployment
The system is designed for single-server deployment. There is no built-in support for multi-region replication, read replicas, or horizontal scaling. For most small-to-medium operations, a single server with daily backups is sufficient.

### PDF Export
Finance report PDF export uses `window.print()` (browser print dialog). It is functional but lacks custom formatting. A dedicated PDF generation library could improve this in a future version.

---

## Future Roadmap

### Near-Term (v1.1)

- Implement `/broadcast` endpoint on the relay server to enable Telegram announcement broadcasting
- Add email notification support (deposit/withdrawal outcomes)
- Reduce live chat SSE interval or migrate to PostgreSQL `LISTEN/NOTIFY`
- Add column-level encryption for account pool passwords
- Add dual-layer auth to stable module routes (hardening sprint)

### Medium-Term (v1.2)

- Member self-service portal (web-based, not Telegram-only)
- Telegram webhook mode (alternative to long-polling for higher throughput)
- Multi-language support (i18n for the ERP)
- Configurable deposit/withdrawal approval workflows (multi-stage)
- Advanced analytics: cohort retention, LTV estimation

### Long-Term (v2.0)

- Multi-tenant support (multiple operators on one platform)
- Mobile-responsive ERP (currently optimized for desktop)
- API key system for external integrations
- Automated compliance reporting
- PostgreSQL read replica for analytics queries (avoid impacting OLTP)

---

## Upgrade Path from RC1 to v1.0.0

After real-world testing of v1.0.0-rc1 in a staging or production environment:

1. Collect all bugs and issues found during testing
2. Fix critical and high-severity issues
3. Re-run the full regression test suite
4. If all tests pass and no critical issues remain, tag `v1.0.0`
5. Deploy using the standard [DEPLOY.md](DEPLOY.md) procedure

No schema changes are expected between RC1 and v1.0.0 unless bugs are discovered in the database layer.
