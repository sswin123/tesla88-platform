#!/usr/bin/env bash
# update.sh — one-command full-system deployment update.
#
# Steps:
#   1. Git pull (skipped if no remote / no upstream configured)
#   2. Verify Docker is running
#   3. Verify required containers exist
#   4. Backup database
#   5. Apply pending migrations
#   6. Update Telegram Bot
#   7. Update ERP
#   8. Health checks
#   9. Print summary
#
# Usage:  ./scripts/update.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SCRIPT_NAME="$(basename "$0")"
START_TIME="$(date +%s)"

# Track completed steps for the summary
STEP_BACKUP_OK=false
STEP_MIGRATE_OK=false
STEP_BOT_OK=false
STEP_ERP_OK=false
STEP_HEALTH_OK=false

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Git pull (optional; skipped when no remote or no upstream)
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 1 / 8 — Git Pull"

if ! command -v git >/dev/null 2>&1; then
  log_info "git not found — skipping."
elif ! git -C "${PROJECT_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log_info "Not inside a git repository — skipping."
else
  remote_count=$(git -C "${PROJECT_ROOT}" remote 2>/dev/null | wc -l | tr -d ' ')
  if [ "${remote_count}" -eq 0 ]; then
    log_info "No git remote configured — skipping git pull."
  else
    upstream=$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
    if [ -z "${upstream}" ]; then
      log_warn "No upstream tracking branch configured — skipping git pull."
      log_warn "  To enable: git branch --set-upstream-to=origin/main main"
    else
      log_info "Pulling from ${upstream}…"
      git -C "${PROJECT_ROOT}" pull \
        || die "git pull failed. Resolve conflicts and retry."
      log_success "Code updated to $(git -C "${PROJECT_ROOT}" rev-parse --short HEAD)."
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Verify Docker is running
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 2 / 8 — Verify Docker"

require_docker
log_success "Docker is running."

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Verify required containers exist
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 3 / 8 — Verify Containers"
load_env

errors=0
for service in db app; do
  if root_running "$service"; then
    log_success "  Root project — ${service}: running"
  else
    log_error   "  Root project — ${service}: NOT running"
    errors=$((errors + 1))
  fi
done

if erp_running; then
  log_success "  ERP project  — erp: running"
else
  log_error   "  ERP project  — erp: NOT running"
  errors=$((errors + 1))
fi

if [[ $errors -gt 0 ]]; then
  echo ""
  log_error "One or more required containers are not running."
  log_error "Perform an initial deployment before running ${SCRIPT_NAME}."
  log_error "  Root services:  docker compose up -d"
  log_error "  ERP service:    cd erp && docker compose up -d"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Backup database
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 4 / 8 — Database Backup"

mkdir -p "${BACKUPS_DIR}"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M")"
BACKUP_FILE="${BACKUPS_DIR}/${TIMESTAMP}.sql"

log_info "Backing up to: ${BACKUP_FILE}"
dc exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  db pg_dump \
  -U "${POSTGRES_USER}" \
  --no-password \
  "${POSTGRES_DB}" \
  > "${BACKUP_FILE}" \
  || die "Backup failed — aborting deployment."

SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
log_success "Database backed up — ${BACKUP_FILE} (${SIZE})"
STEP_BACKUP_OK=true

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Apply pending migrations
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 5 / 8 — Database Migrations"

"${SCRIPT_DIR}/migrate.sh" \
  || die "Migration FAILED — restore the database from backup: ${BACKUP_FILE}"
STEP_MIGRATE_OK=true

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Update Telegram Bot
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 6 / 8 — Update Telegram Bot"

log_info "Building bot image…"
dc build app

log_info "Restarting bot container…"
dc up -d --no-deps app

wait_http "$BOT_RELAY_HEALTH_URL" "Bot relay" 90
STEP_BOT_OK=true

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Update ERP
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 7 / 8 — Update ERP"

log_info "Building ERP image…"
erp_dc build erp

log_info "Restarting ERP container…"
erp_dc up -d --no-deps erp

wait_http "$ERP_HEALTH_URL" "ERP" 180
STEP_ERP_OK=true

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Health checks
# ─────────────────────────────────────────────────────────────────────────────
log_step "Step 8 / 8 — Health Checks"

health_errors=0

check() {
  local label="$1" url="$2"
  local code
  code=$(http_status "$url")
  if [[ "$code" =~ ^2 ]]; then
    log_success "  ${label}: HTTP ${code}"
  else
    log_error   "  ${label}: HTTP ${code}"
    health_errors=$((health_errors + 1))
  fi
}

check "ERP health" "$ERP_HEALTH_URL"
check "ERP status" "$ERP_STATUS_URL"
check "Bot relay " "$BOT_RELAY_HEALTH_URL"

if db_psql -c "SELECT 1;" &>/dev/null; then
  log_success "  Database:     OK"
else
  log_error   "  Database:     FAILED"
  health_errors=$((health_errors + 1))
fi

[[ $health_errors -eq 0 ]] || die "${health_errors} health check(s) failed after deployment."
STEP_HEALTH_OK=true

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
ELAPSED=$(( $(date +%s) - START_TIME ))

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Deployment Summary${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"

print_step() {
  local ok="$1" label="$2"
  if $ok; then
    echo -e "  ${GREEN}✓${NC} ${label}"
  else
    echo -e "  ${RED}✗${NC} ${label}"
  fi
}

print_step $STEP_BACKUP_OK  "Database backup completed"
print_step $STEP_MIGRATE_OK "Database migrations completed"
print_step $STEP_BOT_OK     "Telegram Bot updated"
print_step $STEP_ERP_OK     "ERP updated"
print_step $STEP_HEALTH_OK  "Health check passed"

echo ""
echo -e "  ${BOLD}Backup:${NC}  ${BACKUP_FILE}"
echo -e "  ${BOLD}Duration:${NC} ${ELAPSED}s"
echo ""
echo -e "${BOLD}${GREEN}  ✓ Deployment completed successfully${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════${NC}"
echo ""
