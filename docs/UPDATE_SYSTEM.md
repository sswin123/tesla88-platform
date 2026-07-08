# Production Update Guide

## Quick Reference

| Goal | Command |
|------|---------|
| Update running system | `./scripts/update-system.sh` |
| Pull code + update | `./scripts/update-system.sh --pull` |
| Restore latest backup | `./scripts/rollback-db.sh` |
| List available backups | `./scripts/rollback-db.sh --list` |
| Database backup only | `./scripts/backup.sh` |
| Migrations only | `./scripts/migrate.sh` |

---

## Normal Update (code already on server)

When you have pushed new code to the server manually:

```bash
./scripts/update-system.sh
```

What this does:
1. Creates a database backup → `backups/auto/YYYY-MM-DD-HHMM.sql`
2. Runs any new migrations safely
3. Rebuilds all Docker containers
4. Restarts containers (`docker compose up -d`)
5. Runs health checks
6. Prints a summary

---

## Update After git pull

When you want the script to pull the latest code automatically:

```bash
./scripts/update-system.sh --pull
```

Same as above but runs `git pull` first.

---

## What the Script Does NOT Do

- ❌ Never runs `docker compose down -v` (volumes are preserved)
- ❌ Never deletes data
- ❌ Never skips the backup step

---

## Service Detection

The script detects services automatically:

```bash
docker compose config --services
```

Currently detected services:
- `db` — PostgreSQL (always backed up first)
- `app` — Telegram Bot

Additionally checks for:
- `erp/docker-compose.yml` → ERP (Next.js admin panel)
- `website/docker-compose.yml` → Member website (if configured)

---

## Database Migrations

Migrations are applied from `erp/migrations/*.sql` (numbered files only, e.g. `031_bot_messages.sql`).

The migration engine:
- **SKIP** — already recorded in `schema_migrations` table
- **BOOTSTRAP** — schema already has these changes (records without re-executing)
- **EXECUTE** — new migration, applied to the database

Migrations are idempotent — running the same migration twice is safe.

---

## Health Checks

After update, the script verifies:

| Service | Check |
|---------|-------|
| Database | `pg_isready` |
| Bot (app) | Container running |
| ERP | HTTP `GET /api/maintenance/health` → 2xx |
| Website | HTTP `GET /` → 2xx (if dockerized) |

If any health check fails, the script exits with an error and shows the last 100 lines of logs from all services.

---

## On Failure

If the update fails at any point:

1. Logs are automatically printed to the terminal
2. The pre-update backup path is shown
3. Restore with:

```bash
./scripts/rollback-db.sh
```

---

## Database Rollback

### Restore latest backup

```bash
./scripts/rollback-db.sh
```

The script will:
1. Show you which backup will be restored
2. Ask for confirmation (type `yes`)
3. Save a safety backup of the current state
4. Restore the chosen backup

### List available backups

```bash
./scripts/rollback-db.sh --list
```

### Restore a specific backup

```bash
./scripts/rollback-db.sh backups/auto/2026-07-08-1430.sql
```

---

## File Locations

```
backups/
  auto/                    ← automatic backups (created by update-system.sh)
    YYYY-MM-DD-HHMM.sql
    pre-rollback-YYYY-MM-DD-HHMM.sql  ← safety backup before rollback

scripts/
  update-system.sh         ← main update script (this guide)
  rollback-db.sh           ← database restore helper
  migrate.sh               ← run migrations only
  backup.sh                ← manual backup only
  lib.sh                   ← shared utilities

erp/migrations/
  001_*.sql … 031_*.sql    ← database migrations (applied in order)

logs/
  migration_YYYY-MM-DD_HHMM.log  ← migration run logs
```

---

## Common Scenarios

### First deployment on a new server

```bash
# 1. Clone repo and set up .env
git clone <repo>
cd telegram-member-bot
cp .env.example .env
nano .env   # fill in credentials

# 2. Start containers
docker compose up -d
cd erp && docker compose up -d && cd ..

# 3. Apply all migrations
./scripts/migrate.sh
```

### Routine code update

```bash
# On the server:
./scripts/update-system.sh --pull
```

### Emergency rollback after bad deployment

```bash
# List what's available
./scripts/rollback-db.sh --list

# Restore latest
./scripts/rollback-db.sh

# Restart containers
docker compose up -d
cd erp && docker compose up -d && cd ..
```

### Apply new migration manually

```bash
./scripts/migrate.sh
```

---

## Environment Variables Required

The following must be set in `.env` (root project):

```
POSTGRES_DB=member_bot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>
```

ERP requires its own `.env` at `erp/.env`:

```
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/member_bot
JWT_SECRET=<secret>
```
