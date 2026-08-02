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
WEBSITE_DIR="${PROJECT_ROOT}/website"

# ── Well-known ports/URLs ─────────────────────────────────────────────────────
ERP_HOST_PORT=3001
BOT_RELAY_HOST_PORT=8090
WEBSITE_HOST_PORT=3002

ERP_HEALTH_URL="http://localhost:${ERP_HOST_PORT}/api/maintenance/health"
ERP_STATUS_URL="http://localhost:${ERP_HOST_PORT}/api/maintenance/status"
BOT_RELAY_HEALTH_URL="http://localhost:${BOT_RELAY_HOST_PORT}/health"
WEBSITE_HEALTH_URL="http://localhost:${WEBSITE_HOST_PORT}/api/health"

# ── Compose file — production-first ──────────────────────────────────────────
# Priority: docker-compose.production.yml → staging.yml → docker-compose.yml
if   [[ -f "${PROJECT_ROOT}/docker-compose.production.yml" ]]; then
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"
elif [[ -f "${PROJECT_ROOT}/docker-compose.staging.yml" ]]; then
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.staging.yml"
else
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
fi

# ── Service name variables — populated by detect_services() ──────────────────
DB_SERVICE=""           # postgres | db | (empty if none found)
HAS_ERP_SVC=false       # 'erp' service in COMPOSE_FILE
HAS_WEBSITE_SVC=false   # 'website' service in COMPOSE_FILE
HAS_TELEGRAM_SVC=false  # 'telegram-bot' service in COMPOSE_FILE
HAS_REDIS_SVC=false     # 'redis' service in COMPOSE_FILE
HAS_NGINX_SVC=false     # 'nginx' service in COMPOSE_FILE
# Dev-mode sub-project compose files (separate ERP / Website directories)
HAS_ERP_COMPOSE=false
HAS_WEBSITE_COMPOSE=false

# ── Load .env ─────────────────────────────────────────────────────────────────
load_env() {
  local env_file="${PROJECT_ROOT}/.env"
  [[ -f "$env_file" ]] || die ".env not found at ${env_file}"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

# ── Docker Compose helper — always uses COMPOSE_FILE ─────────────────────────
dc() {
  docker compose \
    -f "${COMPOSE_FILE}" \
    --project-directory "${PROJECT_ROOT}" \
    "$@"
}

# Dev sub-project helpers (backward compat — not called in production mode)
erp_dc() {
  docker compose \
    -f "${ERP_DIR}/docker-compose.yml" \
    --project-directory "${ERP_DIR}" \
    "$@"
}

website_dc() {
  docker compose \
    -f "${WEBSITE_DIR}/docker-compose.yml" \
    --project-directory "${WEBSITE_DIR}" \
    "$@"
}

# ── Detect services from the active compose file ──────────────────────────────
# Call after require_docker. Populates DB_SERVICE, HAS_*_SVC, HAS_*_COMPOSE.
detect_services() {
  local svcs
  svcs="$(dc config --services 2>/dev/null || true)"

  # DB service: prefer 'postgres', fall back to 'db'
  if echo "${svcs}" | grep -q '^postgres$'; then
    DB_SERVICE="postgres"
  elif echo "${svcs}" | grep -q '^db$'; then
    DB_SERVICE="db"
  else
    DB_SERVICE=""
  fi

  if echo "${svcs}" | grep -q '^erp$';         then HAS_ERP_SVC=true;      else HAS_ERP_SVC=false;      fi
  if echo "${svcs}" | grep -q '^website$';      then HAS_WEBSITE_SVC=true;  else HAS_WEBSITE_SVC=false;  fi
  if echo "${svcs}" | grep -q '^telegram-bot$'; then HAS_TELEGRAM_SVC=true; else HAS_TELEGRAM_SVC=false; fi
  if echo "${svcs}" | grep -q '^redis$';        then HAS_REDIS_SVC=true;    else HAS_REDIS_SVC=false;    fi
  if echo "${svcs}" | grep -q '^nginx$';        then HAS_NGINX_SVC=true;    else HAS_NGINX_SVC=false;    fi

  # Dev-mode sub-project compose files
  if [[ -f "${ERP_DIR}/docker-compose.yml" ]];     then HAS_ERP_COMPOSE=true;     else HAS_ERP_COMPOSE=false;     fi
  if [[ -f "${WEBSITE_DIR}/docker-compose.yml" ]]; then HAS_WEBSITE_COMPOSE=true; else HAS_WEBSITE_COMPOSE=false; fi

  log_info "Compose file: ${COMPOSE_FILE##*/}"
  log_info "DB service:   ${DB_SERVICE:-(none detected)}"
  log_info "Services:     $(echo "${svcs}" | tr '\n' ' ')"
}

# ── psql inside the database container ───────────────────────────────────────
db_psql() {
  [[ -n "${DB_SERVICE}" ]] \
    || die "DB_SERVICE is not set — call detect_services after require_docker."
  dc exec -T \
    -e PGPASSWORD="${POSTGRES_PASSWORD}" \
    "${DB_SERVICE}" psql \
    -U "${POSTGRES_USER}" \
    -d "${POSTGRES_DB}" \
    "$@"
}

# ── Check if a service container is running (in COMPOSE_FILE) ────────────────
root_running() {
  local service="$1"
  local cid
  cid=$(dc ps -q "${service}" 2>/dev/null | head -1)
  [[ -n "$cid" ]] || return 1
  [[ "$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)" == "running" ]]
}

# Dev backward-compat aliases
erp_running() {
  local cid
  cid=$(erp_dc ps -q erp 2>/dev/null | head -1)
  [[ -n "$cid" ]] || return 1
  [[ "$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)" == "running" ]]
}

website_running() {
  local cid
  cid=$(website_dc ps -q website 2>/dev/null | head -1)
  [[ -n "$cid" ]] || return 1
  [[ "$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)" == "running" ]]
}

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

# ═══════════════════════════════════════════════════════════════════════════════
# Health Check Framework
# ═══════════════════════════════════════════════════════════════════════════════
#
# Usage in update-system.sh (or any deploy script):
#
#   hc_register "ERP"  hc_erp
#   hc_register "DB"   hc_postgres
#   hc_run_all         # returns number of failures; 0 = all passed
#
# Each hc_* function should return 0 (pass) or 1 (fail).
# hc_run_all logs each result and accumulates failure count.
#
# Built-in checks (call after detect_services):
#   hc_postgres   — pg_isready inside DB container
#   hc_redis      — redis-cli PING inside redis container
#   hc_erp        — Docker healthy + HTTP /api/maintenance/health
#   hc_website    — Docker healthy + HTTP /api/health
#   hc_telegram   — Docker healthy (container-level only)
#   hc_nginx      — Docker healthy
#
# To add a new service in the future:
#   hc_myservice() { hc_docker_healthy "MyService" myservice 60; }
#   hc_register "MyService" hc_myservice
#
# ═══════════════════════════════════════════════════════════════════════════════

# Registry: ordered list of "label:function" pairs
_HC_REGISTRY=()

hc_register() {
  local label="$1" fn="$2"
  _HC_REGISTRY+=("${label}:${fn}")
}

# Run all registered checks; return number of failures.
hc_run_all() {
  local -i failures=0
  for entry in "${_HC_REGISTRY[@]}"; do
    local label="${entry%%:*}"
    local fn="${entry##*:}"
    if "${fn}"; then
      : # already logged inside the function
    else
      log_error "  [FAIL] ${label}"
      failures=$((failures + 1))
    fi
  done
  return "${failures}"
}

# ── Low-level primitives ──────────────────────────────────────────────────────

# Get the container ID for a compose service (empty string if not found).
_hc_cid() {
  dc ps -q "${1}" 2>/dev/null | head -1
}

# Wait until `docker inspect Health.Status` equals "healthy".
# Services without a healthcheck are considered ready once their container is running.
# Returns 0 on success, 1 on timeout or unhealthy.
hc_docker_healthy() {
  local label="$1" svc="$2" max_wait="${3:-150}"
  local interval=5 elapsed=0
  log_info "  [${label}] waiting for Docker health (max ${max_wait}s)…"
  while [[ $elapsed -lt $max_wait ]]; do
    local cid
    cid=$(_hc_cid "${svc}")
    if [[ -z "$cid" ]]; then
      sleep "$interval"; elapsed=$((elapsed + interval))
      log_info "    ${elapsed}s — container not yet started"
      continue
    fi

    local health_status container_status
    health_status=$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
      "$cid" 2>/dev/null)
    container_status=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)

    case "$health_status" in
      healthy)
        log_success "  [${label}] Docker healthy ✓  (${elapsed}s)"
        return 0
        ;;
      unhealthy)
        log_error "  [${label}] Docker UNHEALTHY after ${elapsed}s"
        # Print last healthcheck log for diagnosis
        docker inspect --format \
          '{{range .State.Health.Log}}exit={{.ExitCode}} {{.Output}}{{end}}' \
          "$cid" 2>/dev/null | tail -c 500 >&2 || true
        return 1
        ;;
      none)
        # No healthcheck defined — accept if container is running
        if [[ "$container_status" == "running" ]]; then
          log_success "  [${label}] running (no healthcheck) ✓"
          return 0
        fi
        ;;
    esac

    sleep "$interval"
    elapsed=$((elapsed + interval))
    log_info "    ${elapsed}s — health=${health_status} state=${container_status}"
  done

  log_error "  [${label}] did not reach healthy within ${max_wait}s"
  return 1
}

# HTTP probe executed from the HOST (not inside the container).
# Uses host-mapped port; meant for the final "is the API responding?" check.
hc_http_host() {
  local label="$1" url="$2" max_wait="${3:-30}"
  local interval=5 elapsed=0
  log_info "  [${label}] HTTP probe: ${url} (max ${max_wait}s)…"
  while [[ $elapsed -lt $max_wait ]]; do
    local code
    code=$(http_status "$url")
    if [[ "$code" =~ ^2 ]]; then
      log_success "  [${label}] HTTP ${code} ✓  (${elapsed}s)"
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
    log_info "    ${elapsed}s — HTTP ${code}"
  done
  log_error "  [${label}] HTTP never returned 2xx within ${max_wait}s"
  return 1
}

# HTTP probe from INSIDE the container (avoids host-port dependency).
hc_http_container() {
  local label="$1" svc="$2" url="$3" max_wait="${4:-30}"
  local interval=5 elapsed=0
  log_info "  [${label}] in-container probe: ${url} (max ${max_wait}s)…"
  while [[ $elapsed -lt $max_wait ]]; do
    if dc exec -T "${svc}" sh -c \
        "curl -sf --connect-timeout 4 --max-time 7 '${url}' -o /dev/null 2>/dev/null \
         || wget -q --spider --timeout=7 '${url}' 2>/dev/null" &>/dev/null; then
      log_success "  [${label}] ${url} ✓  (${elapsed}s)"
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
    log_info "    ${elapsed}s — not ready yet"
  done
  log_error "  [${label}] in-container probe failed within ${max_wait}s"
  return 1
}

# ── Built-in service checks ───────────────────────────────────────────────────

hc_postgres() {
  [[ -n "${DB_SERVICE}" ]] || { log_warn "  [Postgres] DB_SERVICE not set — skipping"; return 0; }
  local cid
  cid=$(_hc_cid "${DB_SERVICE}")
  [[ -n "$cid" ]] || { log_error "  [Postgres] container not found"; return 1; }
  if dc exec -T "${DB_SERVICE}" \
       pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" &>/dev/null; then
    log_success "  [Postgres] pg_isready ✓"
    return 0
  fi
  log_error "  [Postgres] pg_isready FAILED"
  return 1
}

hc_redis() {
  local cid
  cid=$(_hc_cid redis)
  [[ -n "$cid" ]] || { log_error "  [Redis] container not found"; return 1; }
  if dc exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    log_success "  [Redis] PONG ✓"
    return 0
  fi
  log_error "  [Redis] PING failed"
  return 1
}

hc_erp() {
  # Step 1: wait for Docker healthcheck to pass (Next.js compilation can take 60-120s)
  hc_docker_healthy "ERP" erp 150 || return 1
  # Step 2: confirm the API health endpoint returns 2xx (inside container)
  hc_http_container "ERP API" erp "http://localhost:3000/api/maintenance/health" 30
}

hc_website() {
  hc_docker_healthy "Website" website 150 || return 1
  hc_http_container "Website API" website "http://localhost:3000/api/health" 30
}

hc_telegram() {
  hc_docker_healthy "Telegram Bot" telegram-bot 60
}

hc_nginx() {
  hc_docker_healthy "Nginx" nginx 30
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
