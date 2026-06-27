#!/usr/bin/env bash
# migrate.sh — apply pending SQL migrations from erp/migrations/.
#
# Only files whose names begin with a digit (001_…, 002_…) are treated as
# migrations.  Non-numbered files such as phase4_catchup.sql are ignored.
#
# ── Migration Doctor ──────────────────────────────────────────────────────────
# Before touching the database, every migration is pre-classified:
#
#   SKIP      — already recorded in schema_migrations
#   BOOTSTRAP — schema already contains this migration's changes
#               (dry-run failed) → record without executing
#   EXECUTE   — genuinely new migration → apply
#
# The classification is printed as a table, followed by a summary, so you
# always know exactly what will happen before it happens.
#
# ── Auto-bootstrap / Safety Mechanism ────────────────────────────────────────
# On an EXISTING production database (≥5 known tables detected), each
# untracked migration is first run inside a BEGIN … ROLLBACK transaction:
#
#   Dry-run FAILS  → schema already has these changes  → BOOTSTRAP
#   Dry-run PASSES → schema genuinely needs this change → EXECUTE
#
# Historical migrations (001–018) always fail their dry-run on a database
# initialised from database.sql — they are bootstrapped automatically.
# Future migrations (019, 020, …) pass the dry-run and are executed normally.
#
# ── Migration Log ─────────────────────────────────────────────────────────────
# Every run writes a timestamped plain-text log to logs/migration_DATE_TIME.log
# containing the classification table, per-migration result, execution time,
# and any SQL error output.
#
# Usage:  ./scripts/migrate.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

require_docker
load_env

log_step "Database Migrations"

root_running db || die "Database container is not running. Run: docker compose up -d"

# ── Temp-file cleanup ─────────────────────────────────────────────────────────
TMP_DRY="${TMPDIR:-/tmp}/migrate_dry_$$.out"
TMP_APPLY="${TMPDIR:-/tmp}/migrate_apply_$$.out"
trap 'rm -f "${TMP_DRY}" "${TMP_APPLY}"' EXIT

# ── Ensure schema_migrations table ───────────────────────────────────────────
db_psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    VARCHAR(255) PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

# ── Collect migration files ───────────────────────────────────────────────────
# Only [0-9]*.sql — excludes phase4_catchup.sql and any other one-off scripts.
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

# ── Migration Log setup ───────────────────────────────────────────────────────
LOGS_DIR="${PROJECT_ROOT}/logs"
mkdir -p "${LOGS_DIR}"
LOG_TIMESTAMP="$(date +"%Y-%m-%d_%H%M")"
LOG_FILE="${LOGS_DIR}/migration_${LOG_TIMESTAMP}.log"

logf() { printf '%s\n' "$*" >> "${LOG_FILE}"; }

logf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
logf "Migration Run — $(date)"
logf "Database:      ${POSTGRES_DB} @ ${POSTGRES_HOST:-localhost}"
logf "Migrations dir: ${MIGRATIONS_DIR}"
logf "Files on disk: ${total_files}"
logf "Production DB: ${IS_PRODUCTION_DB} (${prod_table_count} known tables found)"
logf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
logf ""

# ── Phase 1: Pre-scan — classify every migration ──────────────────────────────
#
# Parallel arrays (bash 3.2 compatible):
#   FILE_NAMES[]   — filename only
#   FILE_STATUS[]  — SKIP | BOOTSTRAP | EXECUTE
#   FILE_REASON[]  — human-readable reason / dry-run error snippet

FILE_NAMES=()
FILE_STATUS=()
FILE_REASON=()

count_skip=0
count_bootstrap=0
count_execute=0

for migration_file in "${MIGRATION_FILES[@]+"${MIGRATION_FILES[@]}"}"; do
  filename="$(basename "${migration_file}")"

  # ── Already recorded? → SKIP ─────────────────────────────────────────────
  already_run=$(db_psql -tAc \
    "SELECT COUNT(*) FROM schema_migrations WHERE filename = '${filename}';" \
    | tr -d '[:space:]')

  if [ "${already_run:-0}" -ne 0 ]; then
    FILE_NAMES+=("${filename}")
    FILE_STATUS+=("SKIP")
    FILE_REASON+=("already recorded in schema_migrations")
    count_skip=$((count_skip + 1))
    continue
  fi

  # ── Untracked on production DB: dry-run to classify ──────────────────────
  if $IS_PRODUCTION_DB; then
    # Run migration inside BEGIN…ROLLBACK.  Output (stdout + stderr) captured.
    # `cmd && var=true || var=false` prevents set -e from aborting the script.
    { printf 'BEGIN;\n'; cat "${migration_file}"; printf '\nROLLBACK;\n'; } | \
      dc exec -T \
        -e PGPASSWORD="${POSTGRES_PASSWORD}" \
        db psql \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -v ON_ERROR_STOP=1 \
      >"${TMP_DRY}" 2>&1 \
    && dry_ok=true || dry_ok=false

    if ! $dry_ok; then
      # Extract first ERROR line from psql output as the reason.
      reason=$(grep -o 'ERROR:.*' "${TMP_DRY}" | head -1 \
        | sed 's/^ERROR:[[:space:]]*//' | cut -c1-72 || true)
      [ -z "${reason}" ] && reason="dry-run failed (schema incompatible)"
      FILE_NAMES+=("${filename}")
      FILE_STATUS+=("BOOTSTRAP")
      FILE_REASON+=("${reason}")
      count_bootstrap=$((count_bootstrap + 1))
      continue
    fi
  fi

  # ── Not skipped, dry-run passed (or fresh DB) → EXECUTE ──────────────────
  FILE_NAMES+=("${filename}")
  FILE_STATUS+=("EXECUTE")
  FILE_REASON+=("pending — not yet applied to this database")
  count_execute=$((count_execute + 1))
done

# ── Migration Doctor — print classification table ─────────────────────────────
tracked_count=$(db_psql -tAc "SELECT COUNT(*) FROM schema_migrations;" \
  | tr -d '[:space:]')
highest_recorded=$(db_psql -tAc \
  "SELECT COALESCE(MAX(filename), '(none)') FROM schema_migrations;" \
  | tr -d '[:space:]')
highest_file="$(basename "${MIGRATION_FILES[$((total_files - 1))]}")"

echo ""
log_info "━━━ Migration Doctor ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "  Files on disk:     ${total_files}  (latest: ${highest_file})"
log_info "  Recorded in DB:    ${tracked_count}  (latest: ${highest_recorded})"
log_info "  Production tables: ${prod_table_count}  (existing install: ${IS_PRODUCTION_DB})"
echo ""

logf "Migration Doctor:"
logf "  Files on disk:     ${total_files}  (latest: ${highest_file})"
logf "  Recorded in DB:    ${tracked_count}  (latest: ${highest_recorded})"
logf "  Production tables: ${prod_table_count}  (existing install: ${IS_PRODUCTION_DB})"
logf ""
logf "Classification:"

idx=0
while [ "${idx}" -lt "${#FILE_NAMES[@]}" ]; do
  fname="${FILE_NAMES[${idx}]}"
  fstatus="${FILE_STATUS[${idx}]}"
  freason="${FILE_REASON[${idx}]}"

  case "${fstatus}" in
    SKIP)
      printf "  ${CYAN}%-12s${NC} %s\n" "[SKIP]" "${fname}"
      ;;
    BOOTSTRAP)
      printf "  ${YELLOW}%-12s${NC} %s\n" "[BOOTSTRAP]" "${fname}"
      printf "  ${YELLOW}%-12s${NC} %s\n" "" "${freason}"
      ;;
    EXECUTE)
      printf "  ${GREEN}%-12s${NC} %s\n" "[EXECUTE]" "${fname}"
      ;;
  esac

  logf "  [${fstatus}] ${fname}"
  if [ "${fstatus}" = "BOOTSTRAP" ]; then
    logf "               reason: ${freason}"
  fi

  idx=$((idx + 1))
done

echo ""
log_info "  ─────────────────────────────────────────────────────────────"
log_info "  BOOTSTRAP: ${count_bootstrap}   EXECUTE: ${count_execute}   SKIP: ${count_skip}"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

logf ""
logf "Summary:  BOOTSTRAP ${count_bootstrap}   EXECUTE ${count_execute}   SKIP ${count_skip}"
logf ""

if [ "${count_bootstrap}" -eq 0 ] && [ "${count_execute}" -eq 0 ]; then
  log_success "Database is already up to date. Nothing to apply."
  logf "Result: up to date — nothing applied."
  log_success "Log: ${LOG_FILE}"
  exit 0
fi

# ── Phase 2: Execute based on pre-scan ───────────────────────────────────────
applied_count=0
bootstrapped_count=0
failed_file=""

logf "Execution:"

idx=0
while [ "${idx}" -lt "${#FILE_NAMES[@]}" ]; do
  fname="${FILE_NAMES[${idx}]}"
  fstatus="${FILE_STATUS[${idx}]}"
  idx=$((idx + 1))

  case "${fstatus}" in

    SKIP)
      continue
      ;;

    BOOTSTRAP)
      log_warn "  [bootstrap] ${fname}"
      log_warn "              (schema already current — recording without executing)"
      db_psql -c \
        "INSERT INTO schema_migrations (filename) VALUES ('${fname}') ON CONFLICT DO NOTHING;"
      bootstrapped_count=$((bootstrapped_count + 1))
      logf "  [BOOTSTRAP] ${fname} — recorded at $(date +"%H:%M:%S")"
      ;;

    EXECUTE)
      log_info "  Applying ${fname}…"
      migration_file="${MIGRATIONS_DIR}/${fname}"
      t_start="$(date +%s)"

      # Execute: stdout + stderr both go to temp file so we can log them.
      # `cmd && var=true || var=false` keeps set -e from aborting the script.
      dc exec -T \
        -e PGPASSWORD="${POSTGRES_PASSWORD}" \
        db psql \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -v ON_ERROR_STOP=1 \
        < "${migration_file}" \
        >"${TMP_APPLY}" 2>&1 \
      && apply_ok=true || apply_ok=false

      t_end="$(date +%s)"
      elapsed=$((t_end - t_start))

      if $apply_ok; then
        db_psql -c \
          "INSERT INTO schema_migrations (filename) VALUES ('${fname}') ON CONFLICT DO NOTHING;"
        log_success "  Applied: ${fname}  (${elapsed}s)"
        applied_count=$((applied_count + 1))
        logf "  [EXECUTE] ${fname} — OK in ${elapsed}s"
      else
        log_error "  FAILED:  ${fname}  (${elapsed}s)"
        logf "  [EXECUTE] ${fname} — FAILED in ${elapsed}s"
        logf "  SQL output / error:"
        while IFS= read -r line; do
          logf "    ${line}"
        done < "${TMP_APPLY}"
        # Also show the error on the console
        cat "${TMP_APPLY}" >&2
        failed_file="${fname}"
        break
      fi
      ;;

  esac
done

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""

logf ""
logf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -n "${failed_file:-}" ]; then
  logf "Result: FAILED on ${failed_file}"
  logf "Completed at: $(date)"
  die "Migration FAILED: ${failed_file} — see ${LOG_FILE} for details, then restore from backup."
fi

total_skipped=$((total_files - applied_count - bootstrapped_count))

log_success "Migrations complete."
log_success "  Executed:     ${applied_count}"
if [ "${bootstrapped_count}" -gt 0 ]; then
  log_success "  Bootstrapped: ${bootstrapped_count}  (schema already current — recorded without re-executing)"
fi
log_success "  Skipped:      ${total_skipped}"
log_success "  Log:          ${LOG_FILE}"

logf "Result: OK"
logf "  Executed:     ${applied_count}"
logf "  Bootstrapped: ${bootstrapped_count}"
logf "  Skipped:      ${total_skipped}"
logf "Completed at: $(date)"
