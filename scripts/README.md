# Deployment Toolkit

One-command deployment and operations scripts for the Telegram Member Bot system.

---

## Quick Start

```bash
# Full update (backup → migrate → rebuild bot → rebuild ERP → health check)
./scripts/update.sh

# Check system status
./scripts/status.sh

# Check service health
./scripts/health.sh
```

---

## Scripts

### `update.sh` — Full system update

The main deployment script. Run this after every `git pull` or code change.

```bash
./scripts/update.sh
```

**What it does (in order):**
1. Verifies Docker is running
2. Verifies all three containers (`db`, `app`, `erp`) are running
3. Creates a timestamped database backup → `backups/YYYY-MM-DD_HH-MM.sql`
4. Applies pending SQL migrations from `erp/migrations/`
5. Rebuilds and restarts the Telegram Bot
6. Rebuilds and restarts the ERP
7. Runs health checks (ERP + Bot relay + Database)
8. Prints a summary

**Stops immediately** on any failure. The backup from Step 3 can be used to restore if needed.

---

### `update-erp.sh` — ERP only

Rebuild and restart the ERP without touching the Bot or running migrations.

```bash
./scripts/update-erp.sh
```

Use when only ERP code changed (e.g. UI fixes, API changes).

---

### `update-bot.sh` — Bot only

Rebuild and restart the Telegram Bot (and relay server) without touching the ERP.

```bash
./scripts/update-bot.sh
```

Use when only bot Python code changed.

---

### `migrate.sh` — Database migrations only

Apply all pending SQL migrations from `erp/migrations/` without rebuilding anything.

```bash
./scripts/migrate.sh
```

Migrations are tracked in the `schema_migrations` table (created automatically). Each `.sql` file is applied exactly once, in alphabetical order. Safe to run multiple times.

**Adding a migration:**
```
erp/migrations/018_my_feature.sql
```
Run `./scripts/migrate.sh` — it will be detected and applied automatically. No code changes required.

---

### `backup.sh` — Database backup

Create a manual PostgreSQL dump.

```bash
./scripts/backup.sh
```

Output: `backups/YYYY-MM-DD_HH-MM.sql`

All backups are kept (never overwritten). Use `./scripts/status.sh` to see backup count and latest file.

---

### `health.sh` — Health checks

Verify all services are healthy.

```bash
./scripts/health.sh
```

Checks:
- `GET /api/maintenance/health` → ERP health
- `GET /api/maintenance/status` → ERP maintenance mode
- `GET http://localhost:8090/health` → Bot relay
- `psql SELECT 1` → PostgreSQL connection

Exit code `0` = all healthy, `1` = at least one failure.

---

### `logs.sh` — Log viewer

View container logs.

```bash
# Show last 100 lines
./scripts/logs.sh erp
./scripts/logs.sh bot
./scripts/logs.sh db

# Follow logs in real time
./scripts/logs.sh erp --follow
./scripts/logs.sh bot -f

# Show last N lines
./scripts/logs.sh bot --tail 200
./scripts/logs.sh db  --tail 50 --follow
```

Services: `erp` | `bot` | `db`

---

### `status.sh` — System status

Display a full system dashboard.

```bash
./scripts/status.sh
```

Shows:
- Git branch and commit
- Host system uptime
- Container running state (db / app / erp)
- Service HTTP health status
- Migration count (applied vs total, pending list)
- Backup count and latest file

---

## Environment

All scripts read the project root `.env` file for database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`). Make sure `.env` is present before running any script.

---

## Adding Future Migrations

Drop a new `.sql` file into `erp/migrations/` following the naming convention:

```
018_description.sql
019_description.sql
```

The next run of `./scripts/update.sh` or `./scripts/migrate.sh` will detect and apply it automatically.

---

## Recovery

If a deployment fails:

1. Check which step failed from the error output.
2. If the database was already modified, restore from backup:
   ```bash
   docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < backups/YYYY-MM-DD_HH-MM.sql
   ```
3. Fix the issue and re-run `./scripts/update.sh`.

---

## Requirements

- Docker Engine + Docker Compose V2 (`docker compose` not `docker-compose`)
- macOS or Linux
- Bash 4+
- `curl` or `wget` (for health checks — both are pre-installed on macOS/Linux)
