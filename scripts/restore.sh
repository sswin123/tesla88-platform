#!/usr/bin/env bash
# restore.sh — Restore PostgreSQL database from a backup file.
#
# Usage:
#   ./scripts/restore.sh backups/2026-07-15_10-30.sql
#   ./scripts/restore.sh                                   (lists available backups)
#
# WARNING: This will DROP and recreate the public schema — all current data is lost.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_docker
load_env

# ── No arg: list backups ──────────────────────────────────────────────────────
if [[ $# -eq 0 ]]; then
  log_step "Available Backups"
  if [[ -d "${BACKUPS_DIR}" ]]; then
    found=$(find "${BACKUPS_DIR}" -name '*.sql' | sort -r | head -20)
    if [[ -z "$found" ]]; then
      log_warn "No backup files found in ${BACKUPS_DIR}"
    else
      echo "$found" | while read -r f; do
        size=$(du -sh "$f" 2>/dev/null | cut -f1 || echo "?")
        echo "  ${size}  ${f}"
      done
    fi
  else
    log_warn "Backups directory not found: ${BACKUPS_DIR}"
  fi
  echo ""
  echo "Usage: $0 <backup-file.sql>"
  exit 0
fi

BACKUP_FILE="$1"

# ── Validate backup file ──────────────────────────────────────────────────────
[[ -f "$BACKUP_FILE" ]] || die "Backup file not found: ${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
log_step "Database Restore"
log_info "Backup file: ${BACKUP_FILE} (${SIZE})"
log_warn "This will ERASE all current data and restore from the backup."

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
read -r -p "  Type 'restore' to confirm: " confirm
if [[ "$confirm" != "restore" ]]; then
  die "Aborted — confirmation not received."
fi

# ── Check db container ────────────────────────────────────────────────────────
if ! root_running db 2>/dev/null && ! docker ps --format '{{.Names}}' | grep -q 'postgres'; then
  die "Database container is not running. Start it first."
fi

# Determine which compose file has postgres
PROD_COMPOSE="${PROJECT_ROOT}/docker-compose.production.yml"
DEV_COMPOSE="${PROJECT_ROOT}/docker-compose.yml"

if [[ -f "$PROD_COMPOSE" ]] && docker compose -f "$PROD_COMPOSE" --project-directory "${PROJECT_ROOT}" ps -q postgres 2>/dev/null | grep -q .; then
  DC_FILE="$PROD_COMPOSE"
  DB_SERVICE="postgres"
elif root_running db 2>/dev/null; then
  DC_FILE="$DEV_COMPOSE"
  DB_SERVICE="db"
else
  die "Cannot find a running database container (postgres or db)."
fi

log_info "Using compose file: ${DC_FILE}"
log_info "DB service: ${DB_SERVICE}"

# ── Pre-restore backup ────────────────────────────────────────────────────────
log_step "Pre-restore Safety Backup"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M")"
PRE_RESTORE_FILE="${BACKUPS_DIR}/pre-restore_${TIMESTAMP}.sql"
mkdir -p "${BACKUPS_DIR}"

log_info "Creating safety backup before restore → ${PRE_RESTORE_FILE}"
docker compose -f "${DC_FILE}" --project-directory "${PROJECT_ROOT}" \
  exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${DB_SERVICE}" pg_dump \
  -U "${POSTGRES_USER}" \
  --no-password \
  "${POSTGRES_DB}" \
  > "${PRE_RESTORE_FILE}"

log_success "Safety backup created: ${PRE_RESTORE_FILE}"

# ── Drop + recreate schema ────────────────────────────────────────────────────
log_step "Restoring Database"
log_info "Dropping public schema and recreating…"

docker compose -f "${DC_FILE}" --project-directory "${PROJECT_ROOT}" \
  exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${DB_SERVICE}" psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
  &>/dev/null

log_info "Restoring from ${BACKUP_FILE}…"

docker compose -f "${DC_FILE}" --project-directory "${PROJECT_ROOT}" \
  exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  "${DB_SERVICE}" psql \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  < "${BACKUP_FILE}"

log_success "Database restored successfully from ${BACKUP_FILE}"
log_info  "Safety backup retained at: ${PRE_RESTORE_FILE}"
echo ""
log_warn  "Restart all services to pick up the restored data:"
echo "  docker compose -f docker-compose.production.yml restart"
