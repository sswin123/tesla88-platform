#!/usr/bin/env bash
# backup.sh — create a timestamped PostgreSQL dump.
# Usage:  ./scripts/backup.sh
# Output: backups/YYYY-MM-DD_HH-MM.sql
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
load_env

# ── Ensure backups directory exists ───────────────────────────────────────────
mkdir -p "${BACKUPS_DIR}"

# ── Build filename (minute-level timestamp prevents overwrites) ────────────────
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M")"
BACKUP_FILE="${BACKUPS_DIR}/${TIMESTAMP}.sql"

if [[ -f "$BACKUP_FILE" ]]; then
  die "Backup file already exists: ${BACKUP_FILE}  (wait a minute and retry)"
fi

# ── Verify db container is running ────────────────────────────────────────────
root_running db || die "Database container is not running. Start it first."

# ── Dump ──────────────────────────────────────────────────────────────────────
log_step "Database Backup"
log_info "Destination: ${BACKUP_FILE}"

dc exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  db pg_dump \
  -U "${POSTGRES_USER}" \
  --no-password \
  "${POSTGRES_DB}" \
  > "${BACKUP_FILE}"

SIZE="$(du -sh "${BACKUP_FILE}" | cut -f1)"
log_success "Backup complete — ${BACKUP_FILE} (${SIZE})"
