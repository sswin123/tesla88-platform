# Production Deployment Guide

## Overview

The system consists of three components, each deployed independently:

| Component | Runtime | Default Port |
|-----------|---------|-------------|
| PostgreSQL | Docker | 5432 |
| Telegram Bot + Relay | Python / Docker | 8090 (relay) |
| ERP (Next.js) | Node.js / Docker | 3000 |

---

## Production Deployment Steps

### Step 1 — Provision a Server

Recommended minimum specs for a single-server deployment:
- 2 vCPU, 4 GB RAM, 40 GB SSD
- Ubuntu 22.04 LTS
- Docker 24+ and Docker Compose v2 installed

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Step 2 — Clone and Configure

```bash
git clone <repo-url> /opt/telegram-member-bot
cd /opt/telegram-member-bot
```

Create environment files:

```bash
cp .env.example .env
nano .env                  # Fill in all required values

mkdir -p erp
cp erp/.env.example erp/.env
nano erp/.env              # Fill in all required values
```

Critical values to set:
- `BOT_TOKEN` — from @BotFather
- `SUPER_ADMIN_ID` — your Telegram numeric ID
- `JWT_SECRET` — generate with `openssl rand -hex 32`
- `BOT_RELAY_AUTH_TOKEN` — same value in both `.env` files
- `POSTGRES_PASSWORD` — strong random password
- All group chat IDs

### Step 3 — Start the Database and Bot

```bash
docker compose up -d
```

Wait for the database healthcheck to pass:

```bash
docker compose ps
# db should show "(healthy)"
```

Verify the bot started:

```bash
docker compose logs app --tail=30
# Should show: "Bot started" and "Relay server listening on port 8090"
```

### Step 4 — Deploy the ERP

#### Option A — Docker container (same server)

```bash
cd erp
docker build -t erp:v1.0.0 .
docker run -d \
  --name erp \
  --restart always \
  -p 3000:3000 \
  --env-file .env \
  erp:v1.0.0
```

Update `BOT_RELAY_URL` in `erp/.env` to use the server's internal IP or `host.docker.internal`:

```
BOT_RELAY_URL=http://host.docker.internal:8090
```

#### Option B — Vercel / managed platform

```bash
cd erp
npx vercel --prod
```

Set all environment variables in the platform's dashboard. Set `BOT_RELAY_URL` to the public URL of your server.

### Step 5 — Configure Reverse Proxy (Optional but Recommended)

Use nginx to serve the ERP on port 443 with HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name erp.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/erp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/erp.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        # Required for SSE (Live Chat real-time stream)
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

### Step 6 — Verify Deployment

```bash
# Health check
curl http://localhost:3000/api/maintenance/health
# Expected: {"status":"ok","db":"connected","uptime":...}

# Relay server
curl http://localhost:8090/health
# Expected: {"status":"ok"}

# Bot: Send /start to your bot in Telegram
```

### Step 7 — First Login

Open the ERP at `https://erp.yourdomain.com` and log in:
- Username: `superadmin`
- Password: `superadmin123`

**Immediately:**
1. Change the superadmin password (Admin Users → your account → change password)
2. Configure System Settings (company name, timezone, bot relay URL)
3. Add your team admins (Admin Users → Add Admin)

---

## Migration Steps

### Applying Schema Changes (New Deployment)

The `database.sql` file contains the complete schema. It is mounted as an init script and applied automatically on first `docker compose up`. No manual migration steps are required for a fresh install.

### Upgrading an Existing Deployment

1. Pull the latest code:
   ```bash
   git pull origin main
   ```

2. Check for new migration files (if any are added in future versions, they will be documented in `CHANGELOG.md`).

3. Apply any new SQL migrations manually:
   ```bash
   docker compose exec db psql -U postgres -d member_bot -f /tmp/migration.sql
   ```
   Or copy the file into the container first:
   ```bash
   docker compose cp migration.sql db:/tmp/migration.sql
   docker compose exec db psql -U postgres -d member_bot -f /tmp/migration.sql
   ```

4. Rebuild and restart services:
   ```bash
   docker compose build app
   docker compose up -d app

   # For ERP:
   cd erp && docker build -t erp:latest . && docker restart erp
   ```

---

## Health Check

### Automated health endpoint

```bash
curl http://localhost:3000/api/maintenance/health
```

Returns:
```json
{
  "status": "ok",
  "db": "connected",
  "uptime": 12345.6
}
```

`db: "error"` indicates the ERP cannot reach PostgreSQL. Check `DATABASE_URL` and network connectivity.

### Manual checks

```bash
# All containers running?
docker compose ps

# Bot logs (last 50 lines)
docker compose logs app --tail=50

# ERP logs
docker logs erp --tail=50

# Database accepting connections?
docker compose exec db pg_isready -U postgres
```

---

## Rollback Steps

### Rolling back to a previous Docker image

```bash
# Tag before upgrading
docker tag erp:latest erp:backup-$(date +%Y%m%d)
docker tag telegram-member-bot-app:latest app:backup-$(date +%Y%m%d)

# Roll back ERP
docker stop erp
docker run -d --name erp --restart always -p 3000:3000 --env-file erp/.env erp:backup-20260627

# Roll back bot
docker compose down app
docker tag app:backup-20260627 telegram-member-bot-app:latest
docker compose up -d app
```

### Rolling back the database

If a migration introduced a schema change that needs to be reversed, run the inverse SQL manually. Always take a backup before any migration:

```bash
# Backup before migration
docker compose exec db pg_dump -U postgres member_bot > backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql

# Restore if needed
docker compose exec -T db psql -U postgres -d member_bot < backup_pre_migration_<timestamp>.sql
```

See [BACKUP.md](BACKUP.md) for full backup and restore procedures.

---

## Environment-Specific Notes

### Docker networking

When both the bot and ERP run in Docker on the same host:
- The bot relay is on `host.docker.internal:8090` from within the ERP container
- Set `BOT_RELAY_URL=http://host.docker.internal:8090` in `erp/.env`

When the ERP is on a separate server:
- Set `BOT_RELAY_URL` to the public IP/domain of the bot server
- Ensure port 8090 is accessible (firewall rule or VPN tunnel recommended)
- Do not expose 8090 to the public internet; use a firewall to allow only the ERP server's IP

### SSL / HTTPS

The ERP itself does not terminate SSL. Use nginx or a load balancer in front. The `BOT_RELAY_AUTH_TOKEN` protects the relay endpoint regardless of SSL.

### Maintenance Mode

To take the ERP into maintenance mode without stopping it:
1. Go to System Settings → toggle Maintenance Mode ON
2. The sidebar shows a yellow maintenance banner to all ERP users
3. Toggle OFF when done
