#!/usr/bin/env bash
# deploy.sh — First-time production deployment for apidemo.club
#
# Run once on a fresh Ubuntu 24.04 server after:
#   1. git clone <repo> telegram-member-bot && cd telegram-member-bot
#   2. cp .env.example .env && nano .env   (fill in all secrets)
#   3. chmod +x scripts/*.sh && ./scripts/deploy.sh
#
# What this script does:
#   1. Verifies prerequisites (Docker, git, curl, openssl)
#   2. Validates .env completeness
#   3. Generates SSL certificates (self-signed; replace with Let's Encrypt later)
#   4. Creates nginx/ssl directory and certs
#   5. Builds all Docker images
#   6. Starts postgres and runs database migrations
#   7. Starts all remaining services
#   8. Runs health checks
#   9. Prints access URLs and next steps
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

# ── Check root or sudo ────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]] && ! sudo -n true 2>/dev/null; then
  log_warn "Not running as root. Some steps may require sudo."
fi

# ── Prerequisites ─────────────────────────────────────────────────────────────
log_step "Step 1 — Prerequisites"

require_docker

for cmd in git curl openssl; do
  if command -v "$cmd" &>/dev/null; then
    log_success "${cmd}"
  else
    die "'${cmd}' not found. Install it first."
  fi
done

# ── Validate .env ─────────────────────────────────────────────────────────────
log_step "Step 2 — Validate .env"

load_env

required_vars=(
  BOT_TOKEN SUPER_ADMIN_ID
  POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD
  JWT_SECRET MEMBER_JWT_SECRET
  CS_USERNAME ADMIN_CHAT_ID SUPPORT_CHAT_ID
  BOT_RELAY_AUTH_TOKEN
)

for var in "${required_vars[@]}"; do
  val="${!var:-}"
  if [[ -z "$val" ]] || [[ "$val" == *"change"* ]] || [[ "$val" == *"your_"* ]] || [[ "$val" == *"changeme"* ]]; then
    die "Environment variable '${var}' is not set or still contains placeholder value.\nEdit .env and retry."
  fi
  log_success "  ${var}"
done

# ── SSL Certificates ──────────────────────────────────────────────────────────
log_step "Step 3 — SSL Certificates"

SSL_DIR="${PROJECT_ROOT}/nginx/ssl"
mkdir -p "${SSL_DIR}"

if [[ -f "${SSL_DIR}/apidemo.club.crt" ]] && [[ -f "${SSL_DIR}/apidemo.club.key" ]]; then
  log_info "SSL certificates already exist — skipping generation"
else
  log_info "Generating self-signed SSL certificate for apidemo.club…"
  log_info "(Replace with Let's Encrypt cert via: certbot certonly --standalone -d apidemo.club -d api.apidemo.club -d erp.apidemo.club)"

  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/apidemo.club.key" \
    -out    "${SSL_DIR}/apidemo.club.crt" \
    -subj "/C=MY/ST=Kuala Lumpur/L=Kuala Lumpur/O=apidemo/CN=apidemo.club" \
    -addext "subjectAltName=DNS:apidemo.club,DNS:www.apidemo.club,DNS:api.apidemo.club,DNS:erp.apidemo.club" \
    2>/dev/null

  chmod 600 "${SSL_DIR}/apidemo.club.key"
  chmod 644 "${SSL_DIR}/apidemo.club.crt"
  log_success "Self-signed SSL certificate created (valid 10 years)"
fi

# ── Build Images ──────────────────────────────────────────────────────────────
log_step "Step 4 — Build Docker Images"

log_info "Building all images (this may take 5–10 minutes on first run)…"
docker compose -f "${PROJECT_ROOT}/docker-compose.production.yml" \
  --project-directory "${PROJECT_ROOT}" \
  build --no-cache --parallel

log_success "All images built"

# ── Start Database ────────────────────────────────────────────────────────────
log_step "Step 5 — Start Database"

docker compose -f "${PROJECT_ROOT}/docker-compose.production.yml" \
  --project-directory "${PROJECT_ROOT}" \
  up -d postgres

log_info "Waiting for PostgreSQL to be ready…"
for i in $(seq 1 30); do
  if docker compose -f "${PROJECT_ROOT}/docker-compose.production.yml" \
       --project-directory "${PROJECT_ROOT}" \
       exec -T postgres pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" &>/dev/null; then
    log_success "PostgreSQL is ready"
    break
  fi
  if [[ $i -eq 30 ]]; then
    die "PostgreSQL did not become ready in 60s"
  fi
  sleep 2
done

# ── Run Migrations ────────────────────────────────────────────────────────────
log_step "Step 6 — Database Migrations"

log_info "Applying all migrations (001–048)…"

applied=0
failed=0

for sql_file in $(find "${MIGRATIONS_DIR}" -name '*.sql' | sort -V); do
  migration_name="$(basename "${sql_file}")"
  if docker compose -f "${PROJECT_ROOT}/docker-compose.production.yml" \
       --project-directory "${PROJECT_ROOT}" \
       exec -T \
       -e PGPASSWORD="${POSTGRES_PASSWORD}" \
       postgres psql \
       -U "${POSTGRES_USER}" \
       -d "${POSTGRES_DB}" \
       -f "/dev/stdin" < "${sql_file}" &>/dev/null; then
    applied=$((applied + 1))
  else
    failed=$((failed + 1))
    log_warn "  Migration may have partially applied: ${migration_name}"
  fi
done

log_success "Migrations applied: ${applied} | Warnings: ${failed}"

# ── Start All Services ────────────────────────────────────────────────────────
log_step "Step 7 — Start All Services"

docker compose -f "${PROJECT_ROOT}/docker-compose.production.yml" \
  --project-directory "${PROJECT_ROOT}" \
  up -d

log_info "Waiting for all services to become healthy…"
sleep 10

# ── Health Checks ─────────────────────────────────────────────────────────────
log_step "Step 8 — Health Checks"

all_ok=true

check_url() {
  local label="$1" url="$2"
  local code
  code=$(http_status "$url")
  if [[ "$code" =~ ^2 ]]; then
    log_success "  ${label}  →  HTTP ${code}"
  else
    log_error   "  ${label}  →  HTTP ${code}  (${url})"
    all_ok=false
  fi
}

# Give services more time to start
log_info "Waiting 30s for services to fully start…"
sleep 30

check_url "Website        " "http://localhost/"
check_url "ERP Admin      " "http://localhost/api/maintenance/health"
check_url "Bot relay      " "http://localhost:8090/health"

# ── Summary ───────────────────────────────────────────────────────────────────
log_step "Deployment Complete"

echo ""
echo "  Production URLs:"
echo "    Website:  https://apidemo.club"
echo "    API:      https://api.apidemo.club"
echo "    ERP:      https://erp.apidemo.club"
echo ""
echo "  Service status:"
docker compose -f "${PROJECT_ROOT}/docker-compose.production.yml" \
  --project-directory "${PROJECT_ROOT}" \
  ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

if $all_ok; then
  log_success "All checks passed. Platform is live!"
else
  log_warn "Some checks failed. Check logs:"
  echo "  docker compose -f docker-compose.production.yml logs -f"
fi

echo ""
echo "  Next steps:"
echo "    • Replace self-signed SSL with Let's Encrypt:"
echo "      certbot certonly --standalone -d apidemo.club -d api.apidemo.club -d erp.apidemo.club"
echo "      cp /etc/letsencrypt/live/apidemo.club/fullchain.pem nginx/ssl/apidemo.club.crt"
echo "      cp /etc/letsencrypt/live/apidemo.club/privkey.pem  nginx/ssl/apidemo.club.key"
echo "      docker compose -f docker-compose.production.yml restart nginx"
echo ""
echo "    • Create your first admin account:"
echo "      docker compose -f docker-compose.production.yml exec erp node scripts/create-admin.js"
echo ""
echo "    • Monitor logs:"
echo "      docker compose -f docker-compose.production.yml logs -f"
