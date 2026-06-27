#!/usr/bin/env bash
# bootstrap-migrations.sh — mark existing migrations as already applied.
#
# Run this ONCE on a database that was initialised before the deployment
# toolkit was introduced (e.g. via database.sql + manual migrations).
#
# What it does:
#   1. Creates the schema_migrations table if missing
#   2. Shows every migration file and whether it is already tracked
#   3. Asks for confirmation, then records all untracked files as APPLIED
#      WITHOUT executing any SQL
#
# After bootstrap, ./scripts/update.sh and ./scripts/migrate.sh will only
# execute NEW migration files that are added in the future.
#
# Usage:
#   ./scripts/bootstrap-migrations.sh          (interactive)
#   ./scripts/bootstrap-migrations.sh --yes    (non-interactive)
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
load_env

FORCE=false
if [ "${1:-}" = "--yes" ] || [ "${1:-}" = "-y" ]; then
  FORCE=true
fi

log_step "Migration Bootstrap"

root_running db || die "Database container is not running. Run: docker compose up -d"

# ── Ensure schema_migrations table exists ─────────────────────────────────────
db_psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ── Collect migration files ───────────────────────────────────────────────────
MIGRATION_FILES=()
while IFS= read -r f; do
  MIGRATION_FILES+=("$f")
done < <(find "${MIGRATIONS_DIR}" -maxdepth 1 -name "*.sql" 2>/dev/null | sort)

total_files="${#MIGRATION_FILES[@]}"

if [ "${total_files}" -eq 0 ]; then
  log_warn "No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

# ── Show current state ────────────────────────────────────────────────────────
already_tracked=$(db_psql -tAc \
  "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null | tr -d '[:space:]')

echo ""
log_info "Migration files in ${MIGRATIONS_DIR}: ${total_files}"
log_info "Already tracked in schema_migrations: ${already_tracked}"
echo ""

new_count=0
for migration_file in "${MIGRATION_FILES[@]+"${MIGRATION_FILES[@]}"}"; do
  filename="$(basename "${migration_file}")"
  check=$(db_psql -tAc \
    "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}';" \
    2>/dev/null | tr -d '[:space:]')
  if [ "${check:-0}" -eq 0 ]; then
    echo -e "  ${YELLOW}○${NC} ${filename}  [will be recorded as applied]"
    new_count=$((new_count + 1))
  else
    echo -e "  ${GREEN}✓${NC} ${filename}  [already tracked]"
  fi
done

echo ""

if [ "${new_count}" -eq 0 ]; then
  log_success "All ${total_files} migration(s) are already tracked. Nothing to do."
  exit 0
fi

log_warn "${new_count} migration(s) will be marked as APPLIED without being executed."
log_warn "Only NEW migrations added after this point will ever be run."
echo ""

if ! $FORCE; then
  printf "%bContinue? [y/N]%b " "${YELLOW}" "${NC}"
  read -r answer || true
  case "${answer:-N}" in
    y|Y|yes|YES) ;;
    *) log_info "Aborted — no changes made."; exit 0 ;;
  esac
fi

# ── Record untracked migrations ───────────────────────────────────────────────
bootstrapped=0
for migration_file in "${MIGRATION_FILES[@]+"${MIGRATION_FILES[@]}"}"; do
  filename="$(basename "${migration_file}")"
  db_psql -c \
    "INSERT INTO schema_migrations (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;"
  bootstrapped=$((bootstrapped + 1))
done

echo ""
log_success "Bootstrap complete — ${bootstrapped} migration(s) recorded."
log_success "Run ./scripts/migrate.sh (or ./scripts/update.sh) to apply only NEW migrations."
