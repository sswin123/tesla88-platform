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

# ── Well-known host-mapped ports (display / external access only) ─────────────
ERP_HOST_PORT=3001
BOT_RELAY_HOST_PORT=8090
WEBSITE_HOST_PORT=3002

# ── Compose file — PRODUCTION ONLY ───────────────────────────────────────────
# All scripts MUST use docker-compose.production.yml.
# docker-compose.yml is development-only and must never be used on the server.
# If docker-compose.production.yml is missing, abort immediately.
if [[ -f "${PROJECT_ROOT}/docker-compose.production.yml" ]]; then
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"
else
  echo -e "\033[0;31m[FATAL]\033[0m docker-compose.production.yml not found at ${PROJECT_ROOT}" >&2
  echo -e "\033[0;31m[FATAL]\033[0m All deployment scripts require docker-compose.production.yml." >&2
  echo -e "\033[0;31m[FATAL]\033[0m Do NOT use docker-compose.yml (development only)." >&2
  exit 1
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
# Health Check Framework  —  Docker HEALTHCHECK is the single Source of Truth
# ═══════════════════════════════════════════════════════════════════════════════
#
# Architecture:
#   Dockerfile HEALTHCHECK CMD → Docker Engine → container health status
#   update-system.sh → hc_docker_healthy() → run_container_healthcheck()
#                                             (re-executes the same CMD)
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
#   hc_erp        — Docker healthy + re-run image HEALTHCHECK CMD
#   hc_website    — Docker healthy + re-run image HEALTHCHECK CMD
#   hc_telegram   — Docker healthy + re-run image HEALTHCHECK CMD (or running check)
#   hc_nginx      — Docker healthy + re-run image HEALTHCHECK CMD (or running check)
#
# Adding a new service (zero changes to update-system.sh needed):
#   1. Define HEALTHCHECK in its Dockerfile
#   2. hc_myservice() { hc_docker_healthy "MyService" myservice 60 && \
#                       run_container_healthcheck "MyService" myservice; }
#   3. hc_register "MyService" hc_myservice
#
# Fallback (image has no HEALTHCHECK):
#   → try wget http://127.0.0.1:3000/api/ping inside container
#   → if unreachable, accept if container state == running
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

# ── run_container_healthcheck ─────────────────────────────────────────────────
#
# Re-execute the Docker image's own HEALTHCHECK command inside the container.
# This is the ONLY place that runs application-level health probes.
# No hardcoded URLs — all probe logic lives in the Dockerfile.
#
# Reads:  docker inspect .Config.Healthcheck.Test
# Runs:   CMD-SHELL → docker exec <cid> sh -c "<shell command>"
#         CMD       → docker exec <cid> <argv...>
#         NONE/none → fallback: /api/ping, then container running check
#
# Returns 0 (PASS) or 1 (FAIL).
# max_wait is not used here (Docker healthy is already confirmed upstream).
run_container_healthcheck() {
  local label="$1" svc="$2"

  local cid
  cid=$(_hc_cid "${svc}")
  if [[ -z "$cid" ]]; then
    log_error "  [${label}] container not found for healthcheck"
    return 1
  fi

  # Read HEALTHCHECK.Test from the container's image config.
  # Output: one element per line — first line is CMD-SHELL / CMD / NONE, rest is the command.
  local hc_parts
  hc_parts=$(docker inspect \
    --format '{{if .Config.Healthcheck}}{{range .Config.Healthcheck.Test}}{{println .}}{{end}}{{end}}' \
    "$cid" 2>/dev/null || true)

  local hc_type
  hc_type=$(printf '%s' "$hc_parts" | head -1 | tr -d '[:space:]')

  local t0 elapsed
  t0=$(date +%s)

  case "$hc_type" in

    CMD-SHELL)
      local hc_cmd
      hc_cmd=$(printf '%s' "$hc_parts" | tail -n +2)
      log_info "  [${label}] HealthCheck CMD-SHELL: ${hc_cmd}"
      if docker exec -T "$cid" sh -c "$hc_cmd" &>/dev/null; then
        elapsed=$(( $(date +%s) - t0 ))
        log_success "  [${label}] PASS ✓  (${elapsed}s)"
        return 0
      else
        elapsed=$(( $(date +%s) - t0 ))
        log_error "  [${label}] FAIL  (${elapsed}s)"
        return 1
      fi
      ;;

    CMD)
      # Build argv array from remaining lines (one arg per line)
      local -a cmd_args=()
      while IFS= read -r arg; do
        [[ -n "$arg" ]] && cmd_args+=("$arg")
      done < <(printf '%s' "$hc_parts" | tail -n +2)
      log_info "  [${label}] HealthCheck CMD: ${cmd_args[*]}"
      if docker exec -T "$cid" "${cmd_args[@]}" &>/dev/null; then
        elapsed=$(( $(date +%s) - t0 ))
        log_success "  [${label}] PASS ✓  (${elapsed}s)"
        return 0
      else
        elapsed=$(( $(date +%s) - t0 ))
        log_error "  [${label}] FAIL  (${elapsed}s)"
        return 1
      fi
      ;;

    NONE)
      # Dockerfile explicitly set HEALTHCHECK NONE — healthcheck disabled
      log_warn "  [${label}] HEALTHCHECK NONE — skipping API probe"
      local cstate
      cstate=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)
      if [[ "$cstate" == "running" ]]; then
        log_success "  [${label}] Container running ✓ (healthcheck disabled)"
        return 0
      fi
      log_error "  [${label}] Container not running (state=${cstate})"
      return 1
      ;;

    "")
      # Image has no HEALTHCHECK defined — try /api/ping fallback, then running check
      log_warn "  [${label}] no HEALTHCHECK in image"
      if dc exec -T "${svc}" sh -c \
          "wget -qO /dev/null --timeout=5 http://127.0.0.1:3000/api/ping 2>/dev/null \
           || curl -sf --connect-timeout 4 --max-time 7 \
              http://127.0.0.1:3000/api/ping -o /dev/null 2>/dev/null" \
          &>/dev/null 2>&1; then
        log_success "  [${label}] /api/ping ✓ (fallback)"
        return 0
      fi
      local cstate
      cstate=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null)
      if [[ "$cstate" == "running" ]]; then
        log_success "  [${label}] Container running ✓ (no healthcheck)"
        return 0
      fi
      log_error "  [${label}] Container not running (state=${cstate})"
      return 1
      ;;

    *)
      log_error "  [${label}] Unknown HEALTHCHECK type: ${hc_type}"
      return 1
      ;;
  esac
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

hc_erp()     { hc_docker_healthy "ERP"         erp          150 || return 1; run_container_healthcheck "ERP"         erp; }
hc_website() { hc_docker_healthy "Website"     website      150 || return 1; run_container_healthcheck "Website"     website; }
hc_telegram() { hc_docker_healthy "Telegram Bot" telegram-bot  60 || return 1; run_container_healthcheck "Telegram Bot" telegram-bot; }
hc_nginx()   { hc_docker_healthy "Nginx"        nginx          30 || return 1; run_container_healthcheck "Nginx"        nginx; }

# ── Require Docker (Compose V2) ───────────────────────────────────────────────
require_docker() {
  command -v docker &>/dev/null \
    || die "'docker' not found in PATH. Install Docker Desktop or Docker Engine."
  docker info &>/dev/null \
    || die "Docker daemon is not running. Start Docker and retry."
  docker compose version &>/dev/null \
    || die "Docker Compose V2 ('docker compose') not available. Upgrade Docker."
  # Confirm active compose file is production
  log_info "Using compose: ${COMPOSE_FILE##*/}"
}
