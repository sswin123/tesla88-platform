#!/usr/bin/env bash
# update-system.sh — One-command safe system updater.
#
# Compose file:  docker-compose.production.yml (REQUIRED — exits if missing)
# DB service:    postgres (auto-detected from compose file)
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
  dc logs --tail=100 2>/dev/null || true
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

# lib.sh already set COMPOSE_FILE; detect_services() populates DB_SERVICE, HAS_*_SVC
detect_services

[[ -n "${DB_SERVICE}" ]] \
  || die "No database service found in ${COMPOSE_FILE##*/} (expected 'postgres' or 'db')."

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Database backup
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 4 / 8 — Database Backup"

AUTO_BACKUPS_DIR="${BACKUPS_DIR}/auto"
mkdir -p "${AUTO_BACKUPS_DIR}"
TIMESTAMP="$(date +"%Y-%m-%d-%H%M")"
BACKUP_FILE="${AUTO_BACKUPS_DIR}/${TIMESTAMP}.sql"

# Verify DB container is running
_DB_CID="$(dc ps -q "${DB_SERVICE}" 2>/dev/null | head -1 || true)"
if [[ -z "${_DB_CID}" ]] || \
   [[ "$(docker inspect --format '{{.State.Status}}' "${_DB_CID}" 2>/dev/null)" != "running" ]]; then
  die "Database container '${DB_SERVICE}' is not running.  Start it: docker compose -f docker-compose.production.yml up -d ${DB_SERVICE}"
fi

log_info "Backing up → ${BACKUP_FILE}"
dc exec -T \
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
# Step 6 — Orphan cleanup + Rebuild + restart containers
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 6 / 8 — Rebuild Services"

# ── Orphan cleanup ────────────────────────────────────────────────────────────
# Remove containers that belong to old service names (app, db) that are no
# longer defined in the active compose file. --remove-orphans is passed on
# every `up` call below, so Docker Compose handles this automatically.
log_info "Checking for orphan containers…"
ORPHANS="$(dc ps -a --format '{{.Name}}' 2>/dev/null \
  | grep -vE '^(postgres|redis|erp|website|telegram-bot|nginx|migrate|certgen)' \
  | grep -v '^$' || true)"
if [[ -n "$ORPHANS" ]]; then
  log_warn "Found stale containers — will remove: $(echo "${ORPHANS}" | tr '\n' ' ')"
fi
# --remove-orphans on the next `up` commands will remove them automatically.

# All production `up` commands include --remove-orphans so stale containers
# (e.g. old 'app', 'db' from docker-compose.yml) are removed each run.

if $HAS_ERP_SVC; then
  log_info "Building ERP…"
  dc build erp
  log_info "Restarting ERP…"
  dc up -d --no-deps --remove-orphans erp
elif $HAS_ERP_COMPOSE; then
  log_info "Building ERP (sub-project)…"
  erp_dc build
  erp_dc up -d
fi

if $HAS_WEBSITE_SVC; then
  log_info "Building Website…"
  dc build website
  log_info "Restarting Website…"
  dc up -d --no-deps --remove-orphans website
elif $HAS_WEBSITE_COMPOSE; then
  log_info "Building Website (sub-project)…"
  website_dc build
  website_dc up -d
fi

if $HAS_TELEGRAM_SVC; then
  log_info "Building Telegram Bot…"
  dc build telegram-bot
  log_info "Restarting Telegram Bot…"
  dc up -d --no-deps --remove-orphans telegram-bot
fi

if $HAS_NGINX_SVC; then
  log_info "Restarting Nginx…"
  dc up -d --no-deps --remove-orphans nginx
fi

# Final orphan sweep after all services are up
dc up -d --remove-orphans 2>/dev/null | grep -i orphan | sed 's/^/  /' || true

log_success "All containers rebuilt and restarted."

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Health Checks (via Health Check Framework from lib.sh)
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 7 / 8 — Health Checks"

# Register checks in dependency order
# (Infrastructure first, then application services, then edge/proxy)
[[ -n "${DB_SERVICE}" ]]  && hc_register "Postgres"     hc_postgres
$HAS_REDIS_SVC            && hc_register "Redis"         hc_redis
$HAS_ERP_SVC              && hc_register "ERP"           hc_erp
$HAS_WEBSITE_SVC          && hc_register "Website"       hc_website
$HAS_TELEGRAM_SVC         && hc_register "Telegram Bot"  hc_telegram
$HAS_NGINX_SVC            && hc_register "Nginx"         hc_nginx

# Run all registered checks
health_failures=0
hc_run_all || health_failures=$?

if [[ $health_failures -gt 0 ]]; then
  die "${health_failures} health check(s) failed — see output above."
fi
log_success "All health checks passed."

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
