#!/usr/bin/env bash
# migrate.sh — apply pending SQL migrations from erp/migrations/.
#
# Tracks applied migrations in the schema_migrations table.
# Safe to run multiple times (idempotent).
# Migrations are applied in alphabetical filename order.
#
# Usage:  ./scripts/migrate.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
load_env

log_step "Database Migrations"

# ── Verify db container is running ────────────────────────────────────────────
root_running db || die "Database container is not running."

# ── Ensure schema_migrations table exists ────────────────────────────────────
log_info "Initialising schema_migrations table…"
db_psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ── Collect and sort migration files ─────────────────────────────────────────
mapfile -t MIGRATION_FILES < <(
  find "${MIGRATIONS_DIR}" -maxdepth 1 -name "*.sql" | sort
)

if [[ ${#MIGRATION_FILES[@]} -eq 0 ]]; then
  log_warn "No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

applied_count=0
skipped_count=0
failed_file=""

for migration_file in "${MIGRATION_FILES[@]}"; do
  filename="$(basename "${migration_file}")"

  # Check if already recorded
  already_run=$(
    db_psql -tAc \
      "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}';" \
      2>/dev/null | tr -d '[:space:]'
  )

  if [[ "$already_run" != "0" ]]; then
    log_info "  skip  ${filename}"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  log_info "  apply ${filename}…"

  # Apply migration — ON_ERROR_STOP=1 makes psql return non-zero on SQL error
  if dc exec -T \
       -e PGPASSWORD="${POSTGRES_PASSWORD}" \
       db psql \
       -U "${POSTGRES_USER}" \
       -d "${POSTGRES_DB}" \
       -v ON_ERROR_STOP=1 \
       < "${migration_file}"; then

    # Record successful migration
    db_psql -c \
      "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;"

    log_success "  done  ${filename}"
    applied_count=$((applied_count + 1))
  else
    failed_file="$filename"
    break
  fi
done

echo ""
if [[ -n "$failed_file" ]]; then
  die "Migration FAILED: ${failed_file} — fix the SQL and retry."
fi

log_success "Migrations complete — applied: ${applied_count}, already up to date: ${skipped_count}"
