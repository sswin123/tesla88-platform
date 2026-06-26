# Backup & Recovery Guide

---

## 1. Database Backup

### Option A — ERP Built-in Backup (Recommended for Operators)

The ERP provides a one-click database backup via the Maintenance page:

1. Log in to the ERP as SUPER_ADMIN
2. Navigate to **Maintenance** (`/maintenance`)
3. Click **Download Backup**

The ERP runs `pg_dump` server-side and streams the result as a `.sql` file download. The filename includes the timestamp: `backup_YYYY-MM-DD_HH-MM-SS.sql`.

> This requires `DATABASE_URL` to be set correctly in `erp/.env`. If the URL is missing, the endpoint returns HTTP 503.

### Option B — Manual pg_dump (CLI)

```bash
# Via Docker
docker compose exec db pg_dump -U postgres member_bot > backup_$(date +%Y%m%d_%H%M%S).sql

# Against a remote database
pg_dump "postgresql://USER:PASS@HOST:5432/member_bot" > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Option C — Automated Scheduled Backup (cron)

Add to the server's crontab to back up daily at 3 AM:

```bash
crontab -e
```

```cron
0 3 * * * docker compose -f /opt/telegram-member-bot/docker-compose.yml exec -T db \
  pg_dump -U postgres member_bot \
  > /opt/backups/db_$(date +\%Y\%m\%d).sql \
  && find /opt/backups -name "db_*.sql" -mtime +30 -delete
```

This keeps 30 days of daily backups and automatically removes older ones.

---

## 2. Restore Procedure

### Restore into a running Docker container

```bash
# Stop the bot to prevent writes during restore
docker compose stop app

# Restore (this overwrites all existing data)
docker compose exec -T db psql -U postgres -d member_bot < backup_20260627_030000.sql

# Restart the bot
docker compose start app
```

### Restore into a fresh database

```bash
# Create a fresh database
docker compose exec db createdb -U postgres member_bot_restored

# Restore
docker compose exec -T db psql -U postgres -d member_bot_restored < backup_20260627_030000.sql
```

### Restore the ERP's database from a downloaded backup file

```bash
# Copy the backup file into the container
docker compose cp backup_20260627.sql db:/tmp/restore.sql

# Run the restore
docker compose exec db psql -U postgres -d member_bot -f /tmp/restore.sql
```

> Warning: Restoring will remove all data added after the backup timestamp. Confirm the backup file before proceeding.

---

## 3. Docker Volume Backup

The PostgreSQL data directory is stored in the `postgres_data` Docker named volume. Back this up to preserve raw data files (useful when `pg_dump` is not an option).

### Backup the volume

```bash
docker run --rm \
  -v telegram-member-bot_postgres_data:/data \
  -v $(pwd)/volume-backups:/backup \
  alpine \
  tar czf /backup/postgres_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

### Restore the volume

```bash
# Stop containers first
docker compose down

# Restore (overwrites all volume data)
docker run --rm \
  -v telegram-member-bot_postgres_data:/data \
  -v $(pwd)/volume-backups:/backup \
  alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/postgres_data_20260627_030000.tar.gz -C /data"

# Restart
docker compose up -d
```

---

## 4. What to Back Up

| Asset | Method | Frequency |
|-------|--------|-----------|
| PostgreSQL database | `pg_dump` | Daily (minimum) |
| Docker volume (`postgres_data`) | `tar` archive | Weekly |
| `.env` file | Manual copy to secure vault | On every change |
| `erp/.env` file | Manual copy to secure vault | On every change |
| Uploaded receipt images | Stored in Telegram — no local copy required | N/A |

Receipt images are uploaded to Telegram's servers and proxied on demand. They do not need to be backed up locally.

---

## 5. Disaster Recovery

### Scenario 1 — Database Corruption

1. Stop the bot to halt writes:
   ```bash
   docker compose stop app
   ```
2. Drop and recreate the database:
   ```bash
   docker compose exec db psql -U postgres -c "DROP DATABASE member_bot;"
   docker compose exec db psql -U postgres -c "CREATE DATABASE member_bot;"
   ```
3. Restore the most recent backup:
   ```bash
   docker compose exec -T db psql -U postgres -d member_bot < /opt/backups/db_latest.sql
   ```
4. Restart services:
   ```bash
   docker compose start app
   ```

### Scenario 2 — Server Loss (Full Rebuild)

1. Provision a new server and install Docker.
2. Clone the repository.
3. Restore `.env` and `erp/.env` from your secure vault.
4. Start the database:
   ```bash
   docker compose up -d db
   ```
5. Wait for it to be healthy, then restore data:
   ```bash
   docker compose exec -T db psql -U postgres -d member_bot < backup_latest.sql
   ```
6. Start all services:
   ```bash
   docker compose up -d
   cd erp && docker build -t erp . && docker run -d --name erp --restart always -p 3000:3000 --env-file .env erp
   ```
7. Update DNS to point to the new server IP.
8. Verify with the health check endpoint.

**Target RTO (Recovery Time Objective):** ~30 minutes with a current backup on hand.

### Scenario 3 — Accidental Data Deletion

If records were accidentally deleted (member data, deposit records, etc.):

1. Do **not** take a new backup — this would overwrite the pre-deletion backup.
2. Restore to a staging database:
   ```bash
   docker compose exec db createdb -U postgres member_bot_recovery
   docker compose exec -T db psql -U postgres -d member_bot_recovery < backup_pre_deletion.sql
   ```
3. Extract the specific rows from the recovery database and re-insert them into production.

---

## 6. Backup Verification

Test your backups monthly by doing a restore into a staging environment:

```bash
# Create a staging DB
docker compose exec db createdb -U postgres member_bot_staging

# Restore
docker compose exec -T db psql -U postgres -d member_bot_staging < backup_latest.sql

# Verify row counts
docker compose exec db psql -U postgres -d member_bot_staging -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"

# Clean up
docker compose exec db psql -U postgres -c "DROP DATABASE member_bot_staging;"
```

A backup that cannot be restored is not a backup.
