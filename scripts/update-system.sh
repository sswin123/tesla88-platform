#!/usr/bin/env bash
# update-system.sh — One-command safe system updater.
#
# Compose priority:  docker-compose.production.yml → staging.yml → docker-compose.yml
# DB service:        postgres (production) or db (development) — auto-detected
# Never deletes volumes.
#
# Usage:
#   ./scripts/update-system.sh          # Update without pulling code
#   ./scripts/update-system.sh --pull   # git pull first, then update
#
# Steps:
#   1. Optional git pull (--pull flag)
#   2. Verify Docker
#   3. Detect compose file + services   ← COMPOSE_FILE set here
#   4. Backup database → backups/auto/YYYY-MM-DD-HHMM.sql
#   5. Run migrations
#   6. Rebuild + restart containers
#   7. Health checks
#   8. Print summary
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"   # logging helpers, paths, http_status, wait_http, require_docker

START_TIME="$(date +%s)"
BACKUP_FILE=""

# ── Flag parsing ──────────────────────────────────────────────────────────────
DO_PULL=false
for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=true ;;
    *) log_warn "Unknown flag ignored: $arg" ;;
  esac
done

# ── Failure handler ───────────────────────────────────────────────────────────
show_logs_and_exit() {
  echo ""
  log_error "Update failed.  Showing last 100 log lines:"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
    logs --tail=100 2>/dev/null || true
  if [[ -n "${BACKUP_FILE:-}" && -f "${BACKUP_FILE}" ]]; then
    echo ""
    log_warn "A backup was taken before this run: ${BACKUP_FILE}"
    log_warn "Restore with:  ./scripts/rollback-db.sh"
  fi
  exit 1
}
trap 'show_logs_and_exit' ERR

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Optional git pull
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 1 / 8 — Git Pull"

if $DO_PULL; then
  command -v git &>/dev/null || die "git not found in PATH"
  git -C "${PROJECT_ROOT}" rev-parse --is-inside-work-tree &>/dev/null \
    || die "Not a git repository: ${PROJECT_ROOT}"

  upstream=$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
  if [[ -z "${upstream}" ]]; then
    die "No upstream tracking branch configured. Run: git branch --set-upstream-to=origin/main main"
  fi

  log_info "Pulling from ${upstream}…"
  git -C "${PROJECT_ROOT}" pull || die "git pull failed. Resolve conflicts and retry."
  log_success "Code updated to $(git -C "${PROJECT_ROOT}" rev-parse --short HEAD)."
else
  log_info "(Skipped — pass --pull to include git pull)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Verify Docker
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 2 / 8 — Verify Docker"

require_docker
log_success "Docker is running."

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Detect compose file and services
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 3 / 8 — Detect Services"

load_env
"${SCRIPT_DIR}/gen-env.sh"

# ── COMPOSE_FILE: production → staging → development ─────────────────────────
if   [[ -f "${PROJECT_ROOT}/docker-compose.production.yml" ]]; then
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"
elif [[ -f "${PROJECT_ROOT}/docker-compose.staging.yml" ]]; then
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.staging.yml"
else
  COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
fi
log_info "Compose file: ${COMPOSE_FILE##*/}"

# ── Enumerate all services from COMPOSE_FILE ─────────────────────────────────
SVCS="$(docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
         config --services 2>/dev/null || true)"
log_info "Services:     $(echo "${SVCS}" | tr '\n' ' ')"

# ── DB service: postgres (production) → db (development) ─────────────────────
if echo "${SVCS}" | grep -qx 'postgres'; then
  DB_SERVICE="postgres"
elif echo "${SVCS}" | grep -qx 'db'; then
  DB_SERVICE="db"
else
  die "No database service found in ${COMPOSE_FILE##*/} (expected 'postgres' or 'db')."
fi
log_info "DB service:   ${DB_SERVICE}"

# ── Application service flags ─────────────────────────────────────────────────
HAS_ERP_SVC=false;  HAS_WEBSITE_SVC=false;  HAS_TELEGRAM_SVC=false
HAS_REDIS_SVC=false; HAS_NGINX_SVC=false

if echo "${SVCS}" | grep -qx 'erp';         then HAS_ERP_SVC=true;      fi
if echo "${SVCS}" | grep -qx 'website';      then HAS_WEBSITE_SVC=true;  fi
if echo "${SVCS}" | grep -qx 'telegram-bot'; then HAS_TELEGRAM_SVC=true; fi
if echo "${SVCS}" | grep -qx 'redis';        then HAS_REDIS_SVC=true;    fi
if echo "${SVCS}" | grep -qx 'nginx';        then HAS_NGINX_SVC=true;    fi

# ── Dev-mode sub-project compose files (fallback when not in production compose) ──
HAS_ERP_COMPOSE=false; HAS_WEBSITE_COMPOSE=false
if [[ -f "${ERP_DIR}/docker-compose.yml" ]];     then HAS_ERP_COMPOSE=true;     fi
if [[ -f "${WEBSITE_DIR}/docker-compose.yml" ]]; then HAS_WEBSITE_COMPOSE=true; fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Database backup
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 4 / 8 — Database Backup"

AUTO_BACKUPS_DIR="${BACKUPS_DIR}/auto"
mkdir -p "${AUTO_BACKUPS_DIR}"
TIMESTAMP="$(date +"%Y-%m-%d-%H%M")"
BACKUP_FILE="${AUTO_BACKUPS_DIR}/${TIMESTAMP}.sql"

# Verify DB container is running
_DB_CID="$(docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
              ps -q "${DB_SERVICE}" 2>/dev/null | head -1 || true)"
if [[ -z "${_DB_CID}" ]] || \
   [[ "$(docker inspect --format '{{.State.Status}}' "${_DB_CID}" 2>/dev/null)" != "running" ]]; then
  die "Database container '${DB_SERVICE}' is not running.  Start it: docker compose -f ${COMPOSE_FILE##*/} up -d ${DB_SERVICE}"
fi

log_info "Backing up → ${BACKUP_FILE}"
docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
  exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${DB_SERVICE}" pg_dump \
  -U "${POSTGRES_USER}" \
  --no-password \
  "${POSTGRES_DB}" \
  > "${BACKUP_FILE}" \
  || die "Database backup FAILED — aborting."

SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
log_success "Backup complete — ${BACKUP_FILE} (${SIZE})"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Database migrations
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 5 / 8 — Database Migrations"

"${SCRIPT_DIR}/migrate.sh" \
  || die "Migration FAILED — restore from: ${BACKUP_FILE}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Rebuild + restart containers
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 6 / 8 — Rebuild Services"

# All production commands use COMPOSE_FILE explicitly.
# Dev fallback uses sub-project compose files.

if $HAS_ERP_SVC; then
  log_info "Building ERP…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" build erp
  log_info "Restarting ERP…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" up -d --no-deps erp
elif $HAS_ERP_COMPOSE; then
  log_info "Building ERP (sub-project)…"
  docker compose -f "${ERP_DIR}/docker-compose.yml" --project-directory "${ERP_DIR}" build
  docker compose -f "${ERP_DIR}/docker-compose.yml" --project-directory "${ERP_DIR}" up -d
fi

if $HAS_WEBSITE_SVC; then
  log_info "Building Website…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" build website
  log_info "Restarting Website…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" up -d --no-deps website
elif $HAS_WEBSITE_COMPOSE; then
  log_info "Building Website (sub-project)…"
  docker compose -f "${WEBSITE_DIR}/docker-compose.yml" --project-directory "${WEBSITE_DIR}" build
  docker compose -f "${WEBSITE_DIR}/docker-compose.yml" --project-directory "${WEBSITE_DIR}" up -d
fi

if $HAS_TELEGRAM_SVC; then
  log_info "Building Telegram Bot…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" build telegram-bot
  log_info "Restarting Telegram Bot…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" up -d --no-deps telegram-bot
fi

if $HAS_NGINX_SVC; then
  log_info "Restarting Nginx…"
  docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" up -d --no-deps nginx
fi

log_success "All containers rebuilt and restarted."

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Health checks
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 7 / 8 — Health Checks"

health_errors=0

# Returns 0 if service container is running, 1 otherwise
_svc_running() {
  local svc="$1"
  local cid
  cid="$(docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
           ps -q "${svc}" 2>/dev/null | head -1 || true)"
  [[ -n "${cid}" ]] && \
    [[ "$(docker inspect --format '{{.State.Status}}' "${cid}" 2>/dev/null)" == "running" ]]
}

check_container() {
  local label="$1" svc="$2"
  if _svc_running "${svc}"; then
    log_success "  ${label}: container running"
  else
    log_error   "  ${label}: container NOT running"
    health_errors=$((health_errors + 1))
  fi
}

# HTTP check inside a container (no host-port dependency).
# Uses curl if available, falls back to wget.
check_http_in_container() {
  local label="$1" svc="$2" url="$3"
  local ok=false
  if docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
       exec -T "${svc}" sh -c \
       "curl -sf --connect-timeout 5 --max-time 8 '${url}' -o /dev/null" \
       &>/dev/null; then
    ok=true
  elif docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
       exec -T "${svc}" sh -c \
       "wget -q --spider --timeout=8 '${url}'" \
       &>/dev/null; then
    ok=true
  fi
  if $ok; then
    log_success "  ${label}: ${url} ✓"
  else
    log_error   "  ${label}: ${url} FAILED"
    health_errors=$((health_errors + 1))
  fi
}

# Database: pg_isready (runs inside the DB container)
if docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
     exec -T "${DB_SERVICE}" pg_isready \
     -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" &>/dev/null; then
  log_success "  Database (${DB_SERVICE}): pg_isready ✓"
else
  log_error   "  Database (${DB_SERVICE}): pg_isready FAILED"
  health_errors=$((health_errors + 1))
fi

# Redis
if $HAS_REDIS_SVC; then
  check_container "Redis" redis
fi

# ERP: check inside container on port 3000 (Nginx sits in front on host)
if $HAS_ERP_SVC; then
  sleep 5
  check_http_in_container "ERP" erp "http://localhost:3000/api/maintenance/health"
fi

# Website: check inside container on port 3000
if $HAS_WEBSITE_SVC; then
  local elapsed=0
  log_info "  Waiting for Website…"
  while [[ $elapsed -lt 60 ]]; do
    if docker compose -f "${COMPOSE_FILE}" --project-directory "${PROJECT_ROOT}" \
         exec -T website sh -c \
         "curl -sf --connect-timeout 5 --max-time 8 'http://localhost:3000/api/health' -o /dev/null \
          || wget -q --spider --timeout=8 'http://localhost:3000/api/health'" \
         &>/dev/null; then
      log_success "  Website: http://localhost:3000/api/health ✓"
      break
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    log_info "  ${elapsed}s — waiting for Website…"
  done
  if [[ $elapsed -ge 60 ]]; then
    log_error "  Website: did not become healthy within 60s"
    health_errors=$((health_errors + 1))
  fi
fi

# Telegram Bot
if $HAS_TELEGRAM_SVC; then
  check_container "Telegram Bot" telegram-bot
fi

# Nginx
if $HAS_NGINX_SVC; then
  check_container "Nginx" nginx
fi

if [[ $health_errors -gt 0 ]]; then
  die "${health_errors} health check(s) failed."
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — Summary
# ─────────────────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TIME ))

log_step "Step 8 / 8 — Summary"

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Update Complete${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} Database backup complete"
echo -e "  ${GREEN}✓${NC} Migrations applied"
echo -e "  ${GREEN}✓${NC} Containers rebuilt"
echo -e "  ${GREEN}✓${NC} Health checks passed"
echo ""
if $HAS_ERP_SVC || $HAS_ERP_COMPOSE; then
  echo -e "  ${BOLD}ERP:${NC}      http://localhost:${ERP_HOST_PORT}"
fi
if $HAS_WEBSITE_SVC || $HAS_WEBSITE_COMPOSE; then
  echo -e "  ${BOLD}Website:${NC}  http://localhost:${WEBSITE_HOST_PORT}"
fi
[[ -n "${BACKUP_FILE}" ]] && echo -e "  ${BOLD}Backup:${NC}   ${BACKUP_FILE}"
echo -e "  ${BOLD}Compose:${NC}  ${COMPOSE_FILE##*/}"
echo -e "  ${BOLD}Duration:${NC} ${ELAPSED}s"
echo -e "  ${BOLD}Commit:${NC}   $(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"
echo ""
