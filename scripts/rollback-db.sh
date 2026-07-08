#!/usr/bin/env bash
# rollback-db.sh — Restore the database from a backup file.
#
# Usage:
#   ./scripts/rollback-db.sh                   # Restore the latest auto backup
#   ./scripts/rollback-db.sh --list            # List available auto backups
#   ./scripts/rollback-db.sh <path/to/file.sql> # Restore a specific file
#
# WARNING: This REPLACES all data in the database.
#          The current database is backed up first as a safety net.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

AUTO_BACKUPS_DIR="${BACKUPS_DIR}/auto"

# ── Parse args ────────────────────────────────────────────────────────────────
LIST_ONLY=false
TARGET_FILE=""

for arg in "$@"; do
  case "$arg" in
    --list) LIST_ONLY=true ;;
    --*)    die "Unknown flag: $arg" ;;
    *)      TARGET_FILE="$arg" ;;
  esac
done

# ── List mode ─────────────────────────────────────────────────────────────────
if $LIST_ONLY; then
  log_step "Available Backups"
  if [[ ! -d "${AUTO_BACKUPS_DIR}" ]] || [[ -z "$(ls -A "${AUTO_BACKUPS_DIR}" 2>/dev/null)" ]]; then
    log_warn "No auto backups found in ${AUTO_BACKUPS_DIR}"
    exit 0
  fi
  echo ""
  ls -lt "${AUTO_BACKUPS_DIR}"/*.sql 2>/dev/null | awk '{print NR".", $NF, "("$5")"}'
  echo ""
  exit 0
fi

# ── Resolve target backup file ────────────────────────────────────────────────
if [[ -z "${TARGET_FILE}" ]]; then
  # Find the latest file in backups/auto/
  [[ -d "${AUTO_BACKUPS_DIR}" ]] \
    || die "No auto backups directory found: ${AUTO_BACKUPS_DIR}"
  TARGET_FILE="$(ls -t "${AUTO_BACKUPS_DIR}"/*.sql 2>/dev/null | head -1 || true)"
  [[ -n "${TARGET_FILE}" ]] \
    || die "No backup files found in ${AUTO_BACKUPS_DIR}. Run ./scripts/update-system.sh to create one."
fi

[[ -f "${TARGET_FILE}" ]] || die "Backup file not found: ${TARGET_FILE}"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
require_docker
load_env

root_running db || die "Database container is not running. Start it first: docker compose up -d"

# ── Confirmation ──────────────────────────────────────────────────────────────
FILE_SIZE="$(du -sh "${TARGET_FILE}" | cut -f1)"
echo ""
echo -e "${BOLD}${RED}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${RED}║  ⚠  DATABASE ROLLBACK — ALL DATA WILL BE REPLACED  ║${NC}"
echo -e "${BOLD}${RED}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Database:${NC} ${POSTGRES_DB}"
echo -e "  ${BOLD}Restoring:${NC} ${TARGET_FILE}"
echo -e "  ${BOLD}File size:${NC} ${FILE_SIZE}"
echo ""
printf "  Type 'yes' to confirm: "
read -r confirmation

[[ "${confirmation}" == "yes" ]] || { log_warn "Rollback cancelled."; exit 0; }

# ── Safety backup of current state ───────────────────────────────────────────
log_step "Safety Backup of Current State"

mkdir -p "${AUTO_BACKUPS_DIR}"
PRE_ROLLBACK_BACKUP="${AUTO_BACKUPS_DIR}/pre-rollback-$(date +"%Y-%m-%d-%H%M").sql"
log_info "Backing up current DB → ${PRE_ROLLBACK_BACKUP}"

dc exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  db pg_dump \
  -U "${POSTGRES_USER}" \
  --no-password \
  "${POSTGRES_DB}" \
  > "${PRE_ROLLBACK_BACKUP}" \
  || die "Pre-rollback backup FAILED — aborting to protect your data."

log_success "Current state saved → ${PRE_ROLLBACK_BACKUP}"

# ── Restore ───────────────────────────────────────────────────────────────────
log_step "Restoring Database"
log_info "Source: ${TARGET_FILE}"

# Drop and recreate the database, then restore
dc exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  db psql \
  -U "${POSTGRES_USER}" \
  --no-password \
  -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};" \
  || die "Failed to drop database"

dc exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  db psql \
  -U "${POSTGRES_USER}" \
  --no-password \
  -d postgres \
  -c "CREATE DATABASE ${POSTGRES_DB};" \
  || die "Failed to create database"

dc exec -T \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  db psql \
  -U "${POSTGRES_USER}" \
  --no-password \
  "${POSTGRES_DB}" \
  < "${TARGET_FILE}" \
  || die "Restore FAILED — current state is preserved in: ${PRE_ROLLBACK_BACKUP}"

log_success "Database restored from: $(basename "${TARGET_FILE}")"
echo ""
echo -e "  ${BOLD}Restored:${NC}     ${TARGET_FILE}"
echo -e "  ${BOLD}Pre-rollback:${NC} ${PRE_ROLLBACK_BACKUP}"
echo ""
log_warn "Restart application containers to reconnect: docker compose up -d"
echo ""
