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
1. Git pull (skipped if no remote or no upstream branch configured)
2. Verifies Docker is running
3. Verifies all three containers (`db`, `app`, `erp`) are running
4. Creates a timestamped database backup → `backups/YYYY-MM-DD_HH-MM.sql`
5. Applies pending SQL migrations from `erp/migrations/` (auto-bootstraps on first run)
6. Rebuilds and restarts the Telegram Bot
7. Rebuilds and restarts the ERP
8. Runs health checks (ERP + Bot relay + Database)
9. Prints a summary

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

**Auto-bootstrap (first run on existing databases):**
On the very first run, if `schema_migrations` is empty but the database already has application tables (i.e. it was set up before the toolkit was introduced), the script automatically records all current migration files as "already applied" without executing them. Only migration files added *after* that point will ever be executed.

**Adding a migration:**
```
erp/migrations/018_my_feature.sql
```
Run `./scripts/migrate.sh` or `./scripts/update.sh` — it will be detected and applied automatically.

---

### `bootstrap-migrations.sh` — Manual migration bootstrap

Explicitly mark all existing migration files as already applied, without running any SQL.

```bash
./scripts/bootstrap-migrations.sh          # interactive (shows preview, asks to confirm)
./scripts/bootstrap-migrations.sh --yes    # non-interactive (CI / scripting)
```

Use this when:
- The auto-bootstrap in `migrate.sh` did not trigger (e.g. `schema_migrations` already has some entries but is missing newer ones)
- You want to see exactly what will be bootstrapped before committing

After bootstrap, `./scripts/update.sh` and `./scripts/migrate.sh` will only execute migration files that do not yet appear in `schema_migrations`.

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

## Migration Strategy

`database.sql` is the **installation snapshot** — it creates the full schema for a fresh install. It is never replayed as a migration.

`erp/migrations/` contains **incremental changes** applied on top. Each file runs exactly once, tracked by filename in the `schema_migrations` table.

### First run on an existing production database

The toolkit auto-detects existing installations and never replays historical migrations:

1. First `./scripts/update.sh` (or `./scripts/migrate.sh`) run detects empty `schema_migrations`
2. Checks whether application tables already exist
3. If yes → records all current migration files as done **without running them** (bootstrap)
4. Future runs only execute new files not yet in `schema_migrations`

No manual SQL required. Run `./scripts/status.sh` afterwards to confirm.

### Adding future migrations

Drop a new `.sql` file into `erp/migrations/` following the naming convention:

```
018_description.sql
019_description.sql
```

The next `./scripts/update.sh` or `./scripts/migrate.sh` detects and applies it automatically.

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
- Bash 3.2+ (macOS system Bash is sufficient)
- `curl` or `wget` (for health checks — both are pre-installed on macOS/Linux)
