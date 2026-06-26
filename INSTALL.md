# Installation Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | 24+ | Recommended deployment method |
| Docker Compose | v2 (`docker compose`) | Included with Docker Desktop |
| PostgreSQL | 14+ | Provided via Docker or external |
| Node.js | 22+ | Only needed for local ERP development |
| Python | 3.11+ | Only needed for local bot development |

---

## 1. Clone the Repository

```bash
git clone <repo-url> telegram-member-bot
cd telegram-member-bot
```

---

## 2. PostgreSQL Setup

### Option A — Docker (recommended)

PostgreSQL is included in `docker-compose.yml`. No manual setup required. The schema is loaded automatically from `database.sql` on first start.

### Option B — External PostgreSQL

Create the database and user:

```sql
CREATE DATABASE member_bot;
CREATE USER botuser WITH PASSWORD 'changeme';
GRANT ALL PRIVILEGES ON DATABASE member_bot TO botuser;
```

Then run the schema:

```bash
psql -U botuser -d member_bot -f database.sql
```

---

## 3. Environment Variables

### 3.1 Bot + Relay Server (`.env` in project root)

Copy the example and fill in values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Telegram bot token from @BotFather |
| `SUPER_ADMIN_ID` | Yes | Your Telegram numeric user ID (from @userinfobot) |
| `POSTGRES_HOST` | Yes | `db` when using Docker Compose; IP/hostname otherwise |
| `POSTGRES_PORT` | No | Default: `5432` |
| `POSTGRES_DB` | Yes | Database name (e.g. `member_bot`) |
| `POSTGRES_USER` | Yes | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `CS_USERNAME` | Yes | Telegram username of the default CS agent (no `@`) |
| `ACCOUNT_CHANGE_COOLDOWN_HOURS` | No | Default: `24`. Hours before member can change game account |
| `ADMIN_CHAT_ID` | Yes | Telegram group ID for deposit/withdrawal notifications (negative number) |
| `SUPPORT_CHAT_ID` | Yes | Telegram group ID for live chat notifications (negative number) |
| `BOT_RELAY_AUTH_TOKEN` | Yes | Shared secret between bot relay and ERP. Set the same value in both `.env` files |
| `BOT_RELAY_PORT` | No | Default: `8090`. Port the relay HTTP server listens on |
| `MIN_DEPOSIT_AMOUNT` | No | Default: `30`. Minimum deposit in RM |
| `MIN_WITHDRAWAL_AMOUNT` | No | Default: `50`. Minimum withdrawal in RM |

### 3.2 ERP (`erp/.env`)

```bash
cp erp/.env.example erp/.env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | `postgresql://USER:PASS@HOST:5432/DB` |
| `JWT_SECRET` | Yes | Random 64-character string. Generate with: `openssl rand -hex 32` |
| `TELEGRAM_BOT_TOKEN` | Yes | Same token as the bot (used for Telegram API calls from ERP) |
| `BOT_RELAY_URL` | Yes | `http://localhost:8090` (local) or `http://host.docker.internal:8090` (Docker) |
| `BOT_RELAY_AUTH_TOKEN` | Yes | Must match the bot's `.env` |
| `DATABASE_SSL` | No | Set to `true` for managed PostgreSQL (RDS, Supabase, etc.) |
| `NODE_ENV` | No | `production` in production. Set automatically by Docker build |

---

## 4. Docker Deployment (Recommended)

This is the recommended way to run the entire stack.

### 4.1 Start all services

```bash
docker compose up -d
```

This starts:
- `db` — PostgreSQL 14 on port 5432
- `app` — Telegram bot + relay server on port 8090

> The ERP (Next.js) is **not** in `docker-compose.yml` by default because it is typically deployed separately (Vercel, a VPS, or a container behind a reverse proxy). See Section 5 for ERP deployment.

### 4.2 Verify services are running

```bash
docker compose ps
docker compose logs app --tail=30
```

### 4.3 Stop services

```bash
docker compose down
```

---

## 5. ERP Deployment

### Option A — Docker (standalone image)

Build and run the ERP as a separate container:

```bash
cd erp
docker build -t erp .
docker run -d \
  --name erp \
  -p 3000:3000 \
  --env-file .env \
  erp
```

Access the ERP at `http://your-server:3000`.

### Option B — Local development server

```bash
cd erp
npm install
npm run dev
```

Access at `http://localhost:3000`. Hot reload is enabled.

### Option C — Production build (local)

```bash
cd erp
npm install
npm run build
node .next/standalone/server.js
```

### First login

After deploying, log in to the ERP at `/login`:

| Field | Value |
|-------|-------|
| Username | `superadmin` |
| Password | `superadmin123` |

**Change this password immediately** via Admin Users → your account.

---

## 6. Telegram Bot Setup

### 6.1 Create the bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the token into `BOT_TOKEN` in `.env`

### 6.2 Get your Telegram user ID

Message [@userinfobot](https://t.me/userinfobot). Copy the numeric ID into `SUPER_ADMIN_ID`.

### 6.3 Create admin and finance groups

1. Create two Telegram groups (or channels):
   - **Finance Group** — for deposit/withdrawal notifications
   - **Support Group** — for live chat notifications
2. Add the bot to both groups as an administrator
3. Get the group chat IDs (negative numbers — use [@RawDataBot](https://t.me/RawDataBot) or similar)
4. Set `ADMIN_CHAT_ID` and `SUPPORT_CHAT_ID` in `.env`

### 6.4 Start the bot

```bash
# Via Docker Compose (recommended):
docker compose up -d app

# Locally:
pip install -r requirements.txt
python -m bot.main
```

---

## 7. Verify the Installation

```bash
# Check bot is reachable
docker compose logs app --tail=20

# Check ERP build
cd erp && npm run build

# Check database connection
docker compose exec db psql -U postgres -d member_bot -c "SELECT COUNT(*) FROM admins;"

# Check relay server (should return {"status":"ok"})
curl http://localhost:8090/health
```

---

## 8. Running Tests

```bash
# Python bot tests
pytest

# TypeScript type-check
cd erp && npm run lint
```
