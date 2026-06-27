#!/usr/bin/env bash
# lib.sh — shared utilities sourced by every deployment script.
# Usage:  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Logging ───────────────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC}    $*"; }
log_success() { echo -e "${GREEN}[ ✓ ]${NC}    $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}    $*"; }
log_error()   { echo -e "${RED}[ ✗ ]${NC}    $*" >&2; }
log_step()    { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }
die()         { log_error "$*"; exit 1; }

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUPS_DIR="${PROJECT_ROOT}/backups"
MIGRATIONS_DIR="${PROJECT_ROOT}/erp/migrations"
ERP_DIR="${PROJECT_ROOT}/erp"

# ── Well-known ports/URLs ─────────────────────────────────────────────────────
ERP_HOST_PORT=3001
BOT_RELAY_HOST_PORT=8090
ERP_HEALTH_URL="http://localhost:${ERP_HOST_PORT}/api/maintenance/health"
ERP_STATUS_URL="http://localhost:${ERP_HOST_PORT}/api/maintenance/status"
BOT_RELAY_HEALTH_URL="http://localhost:${BOT_RELAY_HOST_PORT}/health"

# ── Load .env ─────────────────────────────────────────────────────────────────
load_env() {
  local env_file="${PROJECT_ROOT}/.env"
  [[ -f "$env_file" ]] || die ".env not found at ${env_file}"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

# ── Docker Compose helpers ────────────────────────────────────────────────────
# Root project: db + app (Telegram bot + relay)
dc() {
  docker compose \
    -f "${PROJECT_ROOT}/docker-compose.yml" \
    --project-directory "${PROJECT_ROOT}" \
    "$@"
}

# ERP project (Next.js)
erp_dc() {
  docker compose \
    -f "${ERP_DIR}/docker-compose.yml" \
    --project-directory "${ERP_DIR}" \
    "$@"
}

# ── psql in the db container ──────────────────────────────────────────────────
db_psql() {
  dc exec -T \
    -e PGPASSWORD="${POSTGRES_PASSWORD}" \
    db psql \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    "$@"
}

# ── Check if a service container is running ───────────────────────────────────
root_running() {
  local service="$1"
  local cid
  cid=$(dc ps -q "${service}" 2>/dev/null | head -1)
  [[ -n "$cid" ]] || return 1
  [[ "$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)" == "running" ]]
}

erp_running() {
  local cid
  cid=$(erp_dc ps -q erp 2>/dev/null | head -1)
  [[ -n "$cid" ]] || return 1
  [[ "$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)" == "running" ]]
}

# ── Check if a container exists at all (running or stopped) ──────────────────
root_exists() {
  local service="$1"
  dc ps -q "${service}" 2>/dev/null | grep -q .
}

erp_exists() {
  erp_dc ps -q erp 2>/dev/null | grep -q .
}

# ── HTTP status code ──────────────────────────────────────────────────────────
http_status() {
  local url="$1"
  if command -v curl &>/dev/null; then
    curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 8 "$url" 2>/dev/null \
      || echo "000"
  else
    # wget fallback (Linux servers without curl)
    wget -q --spider --server-response --timeout=8 "$url" 2>&1 \
      | awk '/HTTP\// {print $2}' | tail -1 \
      || echo "000"
  fi
}

# ── Poll URL until 2xx or timeout ─────────────────────────────────────────────
wait_http() {
  local url="$1"
  local label="${2:-service}"
  local max_wait="${3:-120}"
  local interval=5
  local elapsed=0
  log_info "Waiting for ${label}…"
  log_info "  Checking: ${url}"
  while [[ $elapsed -lt $max_wait ]]; do
    local code
    code=$(http_status "$url")
    if [[ "$code" =~ ^2 ]]; then
      log_success "  HTTP ${code} — ${label} ready."
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
    log_info "  ${elapsed}s — HTTP ${code}"
  done
  die "${label} did not become healthy within ${max_wait}s"
}

# ── Require Docker (Compose V2) ───────────────────────────────────────────────
require_docker() {
  command -v docker &>/dev/null \
    || die "'docker' not found in PATH. Install Docker Desktop or Docker Engine."
  docker info &>/dev/null \
    || die "Docker daemon is not running. Start Docker and retry."
  docker compose version &>/dev/null \
    || die "Docker Compose V2 ('docker compose') not available. Upgrade Docker."
}
