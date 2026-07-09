# v1.0.0 Production Release Guide

**Version:** 1.0.0  
**Status:** Release Candidate — awaiting final approval

---

## System Architecture

| Service | Runtime | Port | Purpose |
|---------|---------|------|---------|
| PostgreSQL | Docker (postgres:14) | 5432 | Primary database |
| Telegram Bot + Relay | Python 3.11 / Docker | 8090 | Member bot + relay API |
| ERP (Next.js) | Node.js 22 / Docker | 3001 | Admin back-office |
| Website (Next.js) | Node.js 22 / Docker | 3002 | Member portal |

---

## Installation (Fresh Server)

### Prerequisites

- Ubuntu 22.04 LTS (or Debian 12)
- Docker 24+ and Docker Compose v2
- Minimum: 2 vCPU, 4 GB RAM, 40 GB SSD

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Step 1 — Clone Repository

```bash
git clone <repo-url> /opt/telegram-member-bot
cd /opt/telegram-member-bot
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required values to set:**

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | `123456:ABC...` |
| `SUPER_ADMIN_ID` | Your Telegram user ID | `987654321` |
| `POSTGRES_PASSWORD` | Strong random password | `openssl rand -hex 16` |
| `JWT_SECRET` | 64-char random string for ERP sessions | `openssl rand -hex 32` |
| `MEMBER_JWT_SECRET` | 64-char random string for website sessions | `openssl rand -hex 32` |
| `ADMIN_CHAT_ID` | Finance group chat ID (negative) | `-1001234567890` |
| `SUPPORT_CHAT_ID` | Support group chat ID (negative) | `-1001234567890` |
| `BOT_RELAY_AUTH_TOKEN` | Relay authentication token | `openssl rand -hex 16` |
| `ERP_URL` | Public URL of ERP panel | `https://admin.yourdomain.com` |
| `WEBSITE_URL` | Public URL of member website | `https://www.yourdomain.com` |

### Step 3 — Generate Sub-project Configs

```bash
./scripts/gen-env.sh
```

This generates `erp/.env` and `website/.env` from the root `.env`.

### Step 4 — Run Database Migrations

```bash
./scripts/migrate.sh
```

This applies all migrations in `erp/migrations/` sequentially.

### Step 5 — Start All Services

**Bot + Database:**
```bash
docker compose up -d
```

**ERP Admin Panel:**
```bash
cd erp && docker compose up -d
cd ..
```

**Member Website:**
```bash
cd website && docker compose up -d
cd ..
```

### Step 6 — Verify Health

```bash
# Bot relay
curl http://localhost:8090/health

# ERP
curl http://localhost:3001/api/health/system

# Website
curl http://localhost:3002/api/health
```

All should return `{"status":"ok",...}` or similar.

### Step 7 — Create First Super Admin

```bash
# Enter the database container
docker compose exec db psql -U postgres member_bot

# Create the first admin (replace values)
INSERT INTO erp_admins (username, password_hash, role)
VALUES ('admin', '<bcrypt-hash>', 'SUPER_ADMIN');
```

To generate a bcrypt hash:
```bash
python3 -c "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"
```

---

## Update Procedure

```bash
cd /opt/telegram-member-bot

# 1. Pull latest code
git pull origin main

# 2. Regenerate sub-project configs (if .env.example changed)
./scripts/gen-env.sh

# 3. Run new migrations
./scripts/migrate.sh

# 4. Rebuild and restart services
./scripts/update-system.sh
```

Alternatively, update individual services:
```bash
./scripts/update-erp.sh      # ERP only
./scripts/update-bot.sh      # Bot + relay only
```

---

## Backup

### Manual Backup (ERP UI)

1. Log in to ERP as **SUPER_ADMIN**
2. Navigate to **System → Backups**
3. Click **创建备份**
4. Click **下载** on the completed backup

Backups are stored in the `erp_backups` Docker volume (`/backups` inside the container). Retention is controlled by the `backup_retention_days` system setting (default: 30 days).

### Manual Backup (CLI)

```bash
# Via Docker (recommended)
docker compose exec db pg_dump -U postgres member_bot \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Against a specific URL
pg_dump "postgresql://postgres:PASSWORD@localhost:5432/member_bot" \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Automated Backup (cron)

```bash
# Add to crontab: daily backup at 03:00
0 3 * * * cd /opt/telegram-member-bot && docker compose exec -T db pg_dump -U postgres member_bot > /backups/daily_$(date +\%Y\%m\%d).sql 2>/dev/null
```

---

## Restore

### From a `.sql` dump file

```bash
# Copy dump into the DB container
docker cp backup.sql $(docker compose ps -q db):/backup.sql

# Restore
docker compose exec db psql -U postgres -d member_bot -f /backup.sql
```

> **Warning:** This restores ALL data. Existing records will be overwritten where there are conflicts. Always restore to a stopped or maintenance-mode system.

---

## Troubleshooting

### Services won't start

```bash
# Check logs
docker compose logs app
docker compose -f erp/docker-compose.yml logs erp
docker compose -f website/docker-compose.yml logs website
```

### ERP startup fails with "Missing required environment variables"

Ensure `erp/.env` contains `DATABASE_URL`, `JWT_SECRET`, and `BOT_RELAY_AUTH_TOKEN`.

```bash
./scripts/gen-env.sh   # regenerate from root .env
```

### Website startup fails with "Missing required environment variables"

Ensure `website/.env` contains `DB_PASSWORD` and `MEMBER_JWT_SECRET`.

### Database connection errors

1. Verify PostgreSQL is running: `docker compose ps db`
2. Check credentials in `.env` match the DB container's `POSTGRES_PASSWORD`
3. Test connection: `docker compose exec db pg_isready -U postgres`

### Migrations fail

```bash
# Check which migrations have been applied
docker compose exec db psql -U postgres member_bot \
  -c "SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at;"

# Re-run migrations (safe — uses IF NOT EXISTS)
./scripts/migrate.sh
```

### Bot not responding

1. Check bot token: `BOT_TOKEN` in `.env`
2. Check relay health: `curl http://localhost:8090/health`
3. Check bot logs: `docker compose logs app`
4. Verify Telegram group IDs (`ADMIN_CHAT_ID`, `SUPPORT_CHAT_ID`)

### ERP health check fails

```bash
curl http://localhost:3001/api/health/system
```

Expected response:
```json
{
  "database": { "ok": true, "latency_ms": 5 },
  "services": {
    "erp":     { "ok": true, "latency_ms": 0 },
    "website": { "ok": true, "latency_ms": 12 },
    "bot":     { "ok": true, "latency_ms": 8 }
  },
  "version": "1.0.0",
  "timestamp": "..."
}
```

If `database.ok` is false, check `DATABASE_URL` and PostgreSQL connectivity.

---

## Migration Reference

| Range | Changes |
|-------|---------|
| 001–006 | Core schema: users, banks, promotions, audit, live chat |
| 007–019 | Incremental improvements: media captions, quick replies, tags, risk |
| 020–026 | Quick reply media, bot settings, provider/announcement tables |
| 027–030 | Media library, website tables (banners, settings, game providers) |
| 031–035 | Bot messages, permissions, staff display, brand settings |
| 036–039 | Website banners/announcements/game providers/payment banks |
| 040 | System monitoring: error_logs, system_backups |

> **Note:** Migration 022 does not exist — it was intentionally skipped during development. The sequence jumps from 021 to 023 without a gap in functionality.

---

## Security Checklist (v1.0.0)

- [x] Rate limiting on login (5/15 min per IP), register (3/hr), deposit/withdrawal (per user)
- [x] Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [x] JWT cookies: `httpOnly`, `secure` (production), `sameSite: strict`
- [x] All ERP routes protected by JWT middleware
- [x] Fine-grained permission checks on all management operations
- [x] File upload validation: MIME type, extension, 50 MB max
- [x] No password hashes in API responses
- [x] Public APIs limited to read-only, non-sensitive data
