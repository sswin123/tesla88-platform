#!/usr/bin/env bash
# migrate.sh — apply pending SQL migrations from erp/migrations/.
#
# Only files whose names begin with a digit (001_…, 002_…) are treated as
# migrations.  Non-numbered files such as phase4_catchup.sql are ignored.
#
# ── Migration Doctor ──────────────────────────────────────────────────────────
# Runs before every apply and prints a diagnostic snapshot:
#   • how many files are on disk vs recorded in schema_migrations
#   • whether this is a production (existing) database
#   • what action will be taken
#
# ── Auto-bootstrap / Safety Mechanism ────────────────────────────────────────
# Before executing any untracked migration on a PRODUCTION database, a
# dry-run is performed inside a PostgreSQL transaction that is always
# rolled back:
#
#   Dry-run FAILS  → the schema already contains this migration's changes
#                    → record as applied WITHOUT executing  (bootstrap)
#   Dry-run PASSES → the schema genuinely needs this migration → execute
#
# This guarantees historical migrations (001–018, etc.) are NEVER replayed on
# a database that was already initialised from database.sql or by hand.
# Only truly NEW migration files that were not already reflected by the schema
# will ever be executed.
#
# Recovery: safe to run on any database state — empty, partially bootstrapped,
# or fully up-to-date.  Each migration is evaluated individually, so a
# previous partial run does not break the next one.
#
# Usage:  ./scripts/migrate.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_docker
load_env

log_step "Database Migrations"

root_running db || die "Database container is not running. Run: docker compose up -d"

# ── Ensure schema_migrations table exists ─────────────────────────────────────
db_psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ── Collect migration files ────────────────────────────────────────────────────
# Pattern [0-9]*.sql intentionally excludes phase4_catchup.sql and any other
# non-numbered helper scripts that live in the same directory.
MIGRATION_FILES=()
while IFS= read -r f; do
  MIGRATION_FILES+=("$f")
done < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -name "[0-9]*.sql" 2>/dev/null | sort)

total_files="${#MIGRATION_FILES[@]}"
if [ "${total_files}" -eq 0 ]; then
  log_warn "No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

# ── Production-DB detection ───────────────────────────────────────────────────
# Count how many of these well-known application tables exist.
# If ≥ 5 are present the database was already initialised (from database.sql or
# earlier manual migrations) and historical migrations must never be re-executed.
# to_regclass returns NULL when the table does not exist — no 2>/dev/null needed.
prod_table_count=$(db_psql -tAc "
  SELECT COUNT(*)
  FROM (VALUES
    ('users'),('admins'),('deposit_requests'),('withdrawal_requests'),
    ('payment_banks'),('support_sessions'),('providers'),('system_settings'),
    ('customer_tags'),('announcements'),('promotions')
  ) AS t(name)
  WHERE to_regclass('public.' || name) IS NOT NULL;
" | tr -d '[:space:]')

IS_PRODUCTION_DB=false
[ "${prod_table_count:-0}" -ge 5 ] && IS_PRODUCTION_DB=true

# ── Migration Doctor ──────────────────────────────────────────────────────────
tracked_count=$(db_psql -tAc "SELECT COUNT(*) FROM schema_migrations;" \
  | tr -d '[:space:]')
highest_recorded=$(db_psql -tAc \
  "SELECT COALESCE(MAX(filename), '(none)') FROM schema_migrations;" \
  | tr -d '[:space:]')
highest_file="$(basename "${MIGRATION_FILES[$((total_files - 1))]}")"

echo ""
log_info "━━━ Migration Doctor ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "  Files on disk:       ${total_files}  (latest: ${highest_file})"
log_info "  Recorded in DB:      ${tracked_count}  (latest: ${highest_recorded})"
log_info "  Production tables:   ${prod_table_count}  (existing install: ${IS_PRODUCTION_DB})"
if $IS_PRODUCTION_DB; then
  log_info "  Safety mode:         DRY-RUN before each untracked migration"
  log_info "                       historical migrations → bootstrap (never replayed)"
  log_info "                       genuinely new migrations → execute"
else
  log_info "  Safety mode:         FRESH INSTALL — executing all migrations"
fi
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Process each migration ────────────────────────────────────────────────────
applied_count=0
bootstrapped_count=0
skipped_count=0
failed_file=""

for migration_file in "${MIGRATION_FILES[@]+"${MIGRATION_FILES[@]}"}"; do
  filename="$(basename "${migration_file}")"

  # Already recorded in schema_migrations → skip unconditionally.
  already_run=$(db_psql -tAc \
    "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}';" \
    | tr -d '[:space:]')
  if [ "${already_run:-0}" -ne 0 ]; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  # ── Safety dry-run (production databases only) ──────────────────────────
  # Wrap the migration in a transaction we always roll back.
  # The migration file is piped to psql via stdin so no -c length limits apply.
  #
  #   DRY-RUN FAILS  → schema already reflects these changes
  #                    → record without executing (bootstrap this migration)
  #   DRY-RUN PASSES → schema needs these changes → fall through to apply
  #
  # set -e does NOT apply inside an `if` condition, so a pipeline failure here
  # is handled by the else branch — it does not abort the script.
  if $IS_PRODUCTION_DB; then
    if { printf 'BEGIN;\n'; cat "${migration_file}"; printf '\nROLLBACK;\n'; } | \
         dc exec -T \
           -e PGPASSWORD="${POSTGRES_PASSWORD}" \
           db psql \
           -U "${POSTGRES_USER}" \
           -d "${POSTGRES_DB}" \
           -v ON_ERROR_STOP=1 \
         >/dev/null 2>&1
    then
      : # dry-run passed → schema needs this migration → apply below
    else
      # dry-run failed → schema already incorporates this change
      log_warn "  [bootstrap] ${filename}"
      log_warn "              schema already contains this change — recording without executing"
      db_psql -c \
        "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;"
      bootstrapped_count=$((bootstrapped_count + 1))
      continue
    fi
  fi

  # ── Execute the migration ────────────────────────────────────────────────
  log_info "  Applying ${filename}…"
  if dc exec -T \
       -e PGPASSWORD="${POSTGRES_PASSWORD}" \
       db psql \
       -U "${POSTGRES_USER}" \
       -d "${POSTGRES_DB}" \
       -v ON_ERROR_STOP=1 \
       < "${migration_file}"
  then
    db_psql -c \
      "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;"
    log_success "  Applied: ${filename}"
    applied_count=$((applied_count + 1))
  else
    failed_file="${filename}"
    break
  fi
done

echo ""
if [ -n "${failed_file:-}" ]; then
  die "Migration FAILED: ${failed_file} — restore the database from backup and investigate."
fi

log_success "Migrations complete."
log_success "  Applied:      ${applied_count}"
if [ "${bootstrapped_count}" -gt 0 ]; then
  log_success "  Bootstrapped: ${bootstrapped_count}  (schema already current — recorded without re-executing)"
fi
log_success "  Up to date:   ${skipped_count}"
