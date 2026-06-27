#!/usr/bin/env bash
# migrate.sh — apply pending SQL migrations from erp/migrations/.
#
# Tracks applied migrations in the schema_migrations table.
# Safe to run multiple times (idempotent).
# Migrations are applied in alphabetical filename order.
#
# Auto-bootstrap:
#   If schema_migrations is empty but application tables already exist
#   (existing installation), all current migration files are recorded as
#   already applied WITHOUT being executed. Only future new migrations run.
#
# Usage:  ./scripts/migrate.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
load_env

log_step "Database Migrations"

# ── Verify db container is running ────────────────────────────────────────────
root_running db || die "Database container is not running. Run: docker compose up -d"

# ── Ensure schema_migrations table exists ────────────────────────────────────
db_psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ── Collect and sort migration files ─────────────────────────────────────────
MIGRATION_FILES=()
while IFS= read -r f; do
  MIGRATION_FILES+=("$f")
done < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -name "*.sql" 2>/dev/null | sort)

if [ "${#MIGRATION_FILES[@]}" -eq 0 ]; then
  log_warn "No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

# ── Bootstrap detection ───────────────────────────────────────────────────────
# If schema_migrations is completely empty but core application tables exist,
# this is an existing installation set up before the deployment toolkit.
# Record all current migration files as already applied WITHOUT executing them.
# Only migrations added after this point will ever run.
tracked_count=$(db_psql -tAc \
  "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null | tr -d '[:space:]')

if [ "${tracked_count:-0}" -eq 0 ]; then
  app_exists=$(db_psql -tAc \
    "SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('users','admins','deposit_requests');" \
    2>/dev/null | tr -d '[:space:]')

  if [ "${app_exists:-0}" -gt 0 ]; then
    log_warn "Detected existing database with no migration history."
    log_info "Bootstrapping — marking all current migrations as already applied…"
    bootstrap_count=0
    for migration_file in "${MIGRATION_FILES[@]+"${MIGRATION_FILES[@]}"}"; do
      filename="$(basename "${migration_file}")"
      db_psql -c \
        "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;"
      log_info "  recorded: ${filename}"
      bootstrap_count=$((bootstrap_count + 1))
    done
    log_success "Bootstrap complete — ${bootstrap_count} migration(s) recorded as already applied."
    log_success "Only NEW migrations added after today will be executed."
    exit 0
  fi
  # No app tables and empty tracking → fresh blank DB.
  # Fall through to apply all migrations normally.
  # (Should not occur when docker compose up -d was run first, because
  #  database.sql initialises the schema automatically.)
fi

# ── Apply pending migrations ──────────────────────────────────────────────────
applied_count=0
skipped_count=0
failed_file=""

for migration_file in "${MIGRATION_FILES[@]+"${MIGRATION_FILES[@]}"}"; do
  filename="$(basename "${migration_file}")"

  already_run=$(db_psql -tAc \
    "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}';" \
    2>/dev/null | tr -d '[:space:]')

  if [ "${already_run:-0}" != "0" ]; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  log_info "  apply ${filename}…"

  if dc exec -T \
       -e PGPASSWORD="${POSTGRES_PASSWORD}" \
       db psql \
       -U "${POSTGRES_USER}" \
       -d "${POSTGRES_DB}" \
       -v ON_ERROR_STOP=1 \
       < "${migration_file}"; then
    db_psql -c \
      "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;"
    log_success "  done: ${filename}"
    applied_count=$((applied_count + 1))
  else
    failed_file="${filename}"
    break
  fi
done

echo ""
if [ -n "${failed_file:-}" ]; then
  die "Migration FAILED: ${failed_file} — fix the SQL and retry."
fi

log_success "Migrations complete — applied: ${applied_count}, already up to date: ${skipped_count}"
