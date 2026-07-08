#!/usr/bin/env bash
# update-system.sh — One-command safe system updater.
#
# Detects services automatically.  Never deletes volumes.
#
# Usage:
#   ./scripts/update-system.sh          # Update without pulling code
#   ./scripts/update-system.sh --pull   # git pull first, then update
#
# Steps:
#   1. Optional git pull (--pull flag)
#   2. Verify Docker
#   3. Detect compose services
#   4. Backup database → backups/auto/YYYY-MM-DD-HHMM.sql
#   5. Run migrations
#   6. Rebuild + restart containers
#   7. Health checks
#   8. Print summary
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

SCRIPT_NAME="$(basename "$0")"
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

# ── Failure handler — show logs before exiting ───────────────────────────────
show_logs_and_exit() {
  echo ""
  log_error "Update failed.  Showing last 100 log lines per service:"
  echo ""
  echo -e "${YELLOW}── Root services ───────────────────────────────────────────────${NC}"
  dc logs --tail=100 2>/dev/null || true
  if [[ -f "${ERP_DIR}/docker-compose.yml" ]]; then
    echo -e "${YELLOW}── ERP service ─────────────────────────────────────────────────${NC}"
    erp_dc logs --tail=100 2>/dev/null || true
  fi
  if [[ -n "${BACKUP_FILE}" && -f "${BACKUP_FILE}" ]]; then
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
# Step 3 — Detect compose services
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 3 / 8 — Detect Services"

load_env

# Root compose services (e.g. db, app)
ROOT_SERVICES=$(dc config --services 2>/dev/null || true)
log_info "Root compose services: $(echo "${ROOT_SERVICES}" | tr '\n' ' ')"

HAS_DB=false
HAS_APP=false
for svc in ${ROOT_SERVICES}; do
  case "$svc" in
    db)  HAS_DB=true  ;;
    app) HAS_APP=true ;;
  esac
done

# Separate compose files for ERP and Website
WEBSITE_DIR="${PROJECT_ROOT}/website"
HAS_ERP_COMPOSE=false
HAS_WEBSITE_COMPOSE=false

[[ -f "${ERP_DIR}/docker-compose.yml" ]]     && HAS_ERP_COMPOSE=true
[[ -f "${WEBSITE_DIR}/docker-compose.yml" ]] && HAS_WEBSITE_COMPOSE=true

log_info "db service:     $( $HAS_DB            && echo "yes" || echo "no")"
log_info "app service:    $( $HAS_APP           && echo "yes" || echo "no")"
log_info "ERP compose:    $( $HAS_ERP_COMPOSE   && echo "yes (${ERP_DIR})" || echo "no")"
log_info "Website compose:$( $HAS_WEBSITE_COMPOSE && echo "yes (${WEBSITE_DIR})" || echo "no")"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Database backup
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 4 / 8 — Database Backup"

AUTO_BACKUPS_DIR="${BACKUPS_DIR}/auto"
mkdir -p "${AUTO_BACKUPS_DIR}"
TIMESTAMP="$(date +"%Y-%m-%d-%H%M")"
BACKUP_FILE="${AUTO_BACKUPS_DIR}/${TIMESTAMP}.sql"

if $HAS_DB; then
  root_running db || die "Database container is not running. Start it first: docker compose up -d"
  log_info "Backing up → ${BACKUP_FILE}"

  dc exec -T \
    -e PGPASSWORD="${POSTGRES_PASSWORD}" \
    db pg_dump \
    -U "${POSTGRES_USER}" \
    --no-password \
    "${POSTGRES_DB}" \
    > "${BACKUP_FILE}" \
    || die "Database backup FAILED — aborting."

  SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
  log_success "Backup complete — ${BACKUP_FILE} (${SIZE})"
else
  log_warn "No 'db' service detected — skipping backup."
  BACKUP_FILE=""
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Database migrations
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 5 / 8 — Database Migrations"

"${SCRIPT_DIR}/migrate.sh" \
  || die "Migration FAILED${BACKUP_FILE:+ — restore from: ${BACKUP_FILE}}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Rebuild + restart containers
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 6 / 8 — Rebuild Services"

# Root compose (bot + db)
log_info "Building root compose ($(echo "${ROOT_SERVICES}" | tr '\n' ' '))…"
dc build
log_info "Restarting root compose…"
dc up -d

# ERP
if $HAS_ERP_COMPOSE; then
  log_info "Building ERP…"
  erp_dc build
  log_info "Restarting ERP…"
  erp_dc up -d
fi

# Website
if $HAS_WEBSITE_COMPOSE; then
  log_info "Building website…"
  docker compose \
    -f "${WEBSITE_DIR}/docker-compose.yml" \
    --project-directory "${WEBSITE_DIR}" \
    build
  log_info "Restarting website…"
  docker compose \
    -f "${WEBSITE_DIR}/docker-compose.yml" \
    --project-directory "${WEBSITE_DIR}" \
    up -d
fi

log_success "All containers rebuilt and restarted."

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Health checks
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 7 / 8 — Health Checks"

health_errors=0

# Helper: check container running
check_container() {
  local label="$1" service="$2"
  if root_running "${service}"; then
    log_success "  ${label}: container running"
  else
    log_error   "  ${label}: container NOT running"
    health_errors=$((health_errors + 1))
  fi
}

# Helper: check HTTP endpoint
check_http() {
  local label="$1" url="$2"
  local code
  code="$(http_status "${url}")"
  if [[ "$code" =~ ^2 ]]; then
    log_success "  ${label}: HTTP ${code} ✓"
  else
    log_error   "  ${label}: HTTP ${code} — ${url}"
    health_errors=$((health_errors + 1))
  fi
}

# Database: pg_isready
if $HAS_DB; then
  if dc exec -T db pg_isready \
       -U "${POSTGRES_USER}" \
       -d "${POSTGRES_DB}" \
       &>/dev/null; then
    log_success "  Database: pg_isready ✓"
  else
    log_error   "  Database: pg_isready FAILED"
    health_errors=$((health_errors + 1))
  fi
fi

# Bot (app): container running
if $HAS_APP; then
  check_container "Bot (app)" app
fi

# ERP: HTTP health endpoint
if $HAS_ERP_COMPOSE; then
  # Give ERP up to 30s to start before health check
  sleep 5
  check_http "ERP" "${ERP_HEALTH_URL}"
fi

# Website: HTTP check
if $HAS_WEBSITE_COMPOSE; then
  WEBSITE_PORT=3002  # adjust if website uses a different port
  check_http "Website" "http://localhost:${WEBSITE_PORT}/"
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
[[ -n "${BACKUP_FILE}" ]] && echo -e "  ${BOLD}Backup:${NC}   ${BACKUP_FILE}"
echo -e "  ${BOLD}Duration:${NC} ${ELAPSED}s"
echo -e "  ${BOLD}Commit:${NC}   $(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"
echo ""
