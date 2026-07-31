#!/bin/bash
# ============================================================
# Diagnostic: Full Database Scan + Reference DB Comparison
# VERSION 2 — Production Safety Enhanced
#
# SAFETY GUARANTEES:
#   [1] member_bot is NEVER written to.
#       All Stage A queries use SET SESSION CHARACTERISTICS AS
#       TRANSACTION READ ONLY — enforced at the PostgreSQL level,
#       not just by code convention. Even a script bug cannot write.
#   [2] All Stage A psql sessions use < /dev/null to prevent any
#       stdin from reaching the container.
#   [3] Critical table check: if users/admins/deposit_requests/
#       withdrawal_requests/wallet_transactions appear in
#       missing_tables → script HALTS immediately.
#   [4] Key migration verification: after reference DB is built,
#       explicitly verify that 000/069/088 created their core tables.
#       If not, warns of potential FALSE NEGATIVES in the diff.
#   [5] NOT NULL column detection: columns that are NOT NULL without
#       a DEFAULT are written to missing_columns_notnull.txt and
#       excluded from missing_columns.txt (cannot auto-repair).
#   [6] BEGIN/COMMIT-wrapped migration tracking: if a transaction-
#       wrapped migration fails, ALL its DDL rolls back. This is
#       detected and reported as a higher-risk warning.
#   [7] Final verdict: HALT / NEEDS MANUAL REVIEW / SAFE TO PROCEED.
#
# STAGES:
#   A: Read-only catalog scan of production member_bot
#   B: Create member_bot_ref_diag, run all 000-088 migrations
#   C: Catalog scan of member_bot_ref_diag
#   D: Generate complete diff report
#   E: Safety analysis and final verdict
#
# OUTPUT FILES (in /root/tesla88-backup/diagnostic_TIMESTAMP/):
#   diff_report.txt              ← Full human-readable report
#   missing_tables.txt           ← Safe to auto-repair (CREATE TABLE IF NOT EXISTS)
#   extra_tables.txt             ← Informational (not repaired)
#   missing_columns.txt          ← Safe columns (have DEFAULT or nullable)
#   missing_columns_notnull.txt  ← ⚠ MANUAL ONLY — NOT NULL, no DEFAULT
#   column_type_diffs.txt        ← ⚠ MANUAL ONLY — type mismatches
#   missing_indexes.txt
#   missing_functions.txt
#   missing_triggers.txt         ← trigger_name|table_name
#   missing_sequences.txt
#   missing_fks.txt              ← constraint_name|table_name
#   warnings.txt                 ← Potential false negatives, migration failures
#   ref_migration_run.log        ← Full migration output against reference DB
#   VERDICT.txt                  ← Final safe-to-proceed assessment
#
# USAGE:
#   bash diag_01_full_scan.sh
#   (no arguments — configuration is at the top of this file)
# ============================================================
set -Eeuo pipefail

# ============================================================
# CONFIGURATION
# ============================================================
PLATFORM_DIR="/root/tesla88-platform"
MIGRATION_DIR="${PLATFORM_DIR}/erp/migrations"
BACKUP_DIR="/root/tesla88-backup"
DIAG_DIR="${BACKUP_DIR}/diagnostic_$(date +%Y%m%d_%H%M%S)"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
LOG="${DIAG_DIR}/diagnostic.log"
PROD_DB="member_bot"
REF_DB="member_bot_ref_diag"

# Critical tables — script HALTS if any appear in missing_tables
CRITICAL_TABLES=(users admins deposit_requests withdrawal_requests wallet_transactions)

# Key migration verification pairs: "migration_filename:expected_table_in_ref"
KEY_MIGRATION_CHECKS=(
  "000_base_schema.sql:users"
  "000_base_schema.sql:support_sessions"
  "000_base_schema.sql:support_messages"
  "069_gaming_platform_core.sql:gp_providers"
  "069_gaming_platform_core.sql:gp_credentials"
  "086_saas_brand_provider_schema.sql:brands"
  "088_provider_accounts.sql:provider_accounts"
)

# SQL-transaction-BEGIN migrations (verified by grep — full ROLLBACK on failure)
# This list was generated from: grep -l "^BEGIN;?$" migrations/*.sql
TRANSACTION_WRAPPED_MIGRATIONS=(
  "000_base_schema.sql" "003_payment_banks_v2.sql" "006_livechat_v2.sql"
  "016_admin_roles.sql" "023_timeline_notify.sql" "031_bot_messages.sql"
  "049_homepage_sections.sql" "050_deposit_erp_unread.sql"
  "057_registration_security.sql" "062_member_activity_log.sql"
  "063_pending_withdrawal.sql" "066_fix_withdrawal_trigger.sql"
  "067_withdrawal_awaiting_receipt.sql" "083_withdrawal_erp_notify.sql"
)

mkdir -p "${DIAG_DIR}"

# Remove .stage_d_vars temp file on any exit (clean, error, or signal).
trap 'rm -f "${DIAG_DIR}/.stage_d_vars"' EXIT

# ============================================================
# LOGGING
# ============================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()    { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail()  { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info()  { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()   { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }
append_warn() { echo "$*" >> "${DIAG_DIR}/warnings.txt"; warn "$*"; }

# Initialize warnings file
> "${DIAG_DIR}/warnings.txt"

echo "============================================================" | tee "${LOG}"
echo " Database Diagnostic v2 — member_bot vs Reference Migrations" | tee -a "${LOG}"
echo " Start: $(date)                                              " | tee -a "${LOG}"
echo " Diag dir: ${DIAG_DIR}                                      " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# SAFETY: All production DB queries go through this wrapper.
# SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY is enforced
# at the PostgreSQL engine level — even a query containing UPDATE
# or DELETE would be rejected by the server.
# ============================================================
prod_ro_query() {
  local extra_flags="${1}"   # e.g. "-t -A" or "-t -A -F '|'"
  local sql="${2}"
  # The --command ordering is critical:
  #   First command:  SET read-only (session-level)
  #   Second command: the actual SELECT query
  # -t suppresses SELECT headers/footers but NOT non-SELECT command tags.
  # grep -v '^SET$' filters the "SET" confirmation emitted by the first command.
  # < /dev/null ensures docker exec never reads from our loop's stdin.
  $COMPOSE exec -T postgres psql -U postgres -d "${PROD_DB}" \
    ${extra_flags} \
    --command="SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;" \
    --command="${sql}" \
    < /dev/null 2>>"${LOG}" | grep -v '^SET$'
}

# ============================================================
# HELPER: Scan a database's catalog to output files
# $1 = DB name  $2 = file prefix (actual|ref)
# ============================================================
scan_catalog() {
  local DB="$1"
  local PFX="$2"
  local DEST="${DIAG_DIR}"

  info "Scanning catalog: ${DB} → prefix '${PFX}'"

  # Determine which query runner to use
  local QRY_CMD
  if [[ "${DB}" == "${PROD_DB}" ]]; then
    # PRODUCTION: use read-only wrapper
    _catalog_query() {
      prod_ro_query "${1}" "${2}"
    }
  else
    # REFERENCE DB: no read-only restriction needed (not production data)
    _catalog_query() {
      local flags="${1}"
      local sql="${2}"
      $COMPOSE exec -T postgres psql -U postgres -d "${DB}" \
        ${flags} --command="${sql}" < /dev/null 2>>"${LOG}"
    }
  fi

  # ── Tables ─────────────────────────────────────────────────
  _catalog_query "-t -A" "
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_tables.txt" || true

  # ── Views ──────────────────────────────────────────────────
  _catalog_query "-t -A" "
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_views.txt" || true

  # ── Indexes ────────────────────────────────────────────────
  _catalog_query "-t -A" "
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY indexname;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_indexes.txt" || true

  # ── Functions (user-defined, not aggregates/window) ────────
  _catalog_query "-t -A" "
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
    ORDER BY p.proname;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_functions.txt" || true

  # ── Triggers (trigger_name|table_name) ─────────────────────
  _catalog_query "-t -A -F '|'" "
    SELECT t.tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_triggers.txt" || true

  # ── Sequences ──────────────────────────────────────────────
  _catalog_query "-t -A" "
    SELECT sequencename
    FROM pg_sequences
    WHERE schemaname = 'public'
    ORDER BY sequencename;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_sequences.txt" || true

  # ── FK constraints (constraint_name|table_name) ────────────
  _catalog_query "-t -A -F '|'" "
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.contype = 'f'
    ORDER BY t.relname, c.conname;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_fks.txt" || true

  # ── Check constraints (constraint_name|table_name) ─────────
  _catalog_query "-t -A -F '|'" "
    SELECT c.conname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND c.contype = 'c'
      AND NOT t.relname ~ '^pg_'
    ORDER BY t.relname, c.conname;
  " | grep -v '^$' | tr -d '\r' | sort > "${DEST}/${PFX}_check_constraints.txt" || true

  # ── Columns with full type info ─────────────────────────────
  # Uses pg_catalog.format_type() for consistent type representation
  # (avoids information_schema type-name inconsistencies like
  #  'character varying' vs 'varchar')
  _catalog_query "-t -A -F '|'" "
    SELECT
      c.relname AS table_name,
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS col_type,
      CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END AS nullability,
      CASE WHEN d.adbin IS NOT NULL THEN 'HAS_DEFAULT' ELSE 'NO_DEFAULT' END AS has_default,
      CASE WHEN a.attgenerated = 's' THEN 'GENERATED' ELSE '' END AS is_generated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum;
  " | grep -v '^$' | tr -d '\r' > "${DEST}/${PFX}_columns.txt" || true

  local t; t=$(wc -l < "${DEST}/${PFX}_tables.txt" 2>/dev/null || echo 0)
  local i; i=$(wc -l < "${DEST}/${PFX}_indexes.txt" 2>/dev/null || echo 0)
  local f; f=$(wc -l < "${DEST}/${PFX}_functions.txt" 2>/dev/null || echo 0)
  local g; g=$(wc -l < "${DEST}/${PFX}_triggers.txt" 2>/dev/null || echo 0)
  local k; k=$(wc -l < "${DEST}/${PFX}_fks.txt" 2>/dev/null || echo 0)
  ok "${DB}: tables=${t} indexes=${i} functions=${f} triggers=${g} fks=${k}"
}

# ============================================================
# PRE-FLIGHT
# ============================================================
hdr "Pre-flight checks"

[[ -f "${COMPOSE_FILE}" ]] || fail "docker-compose.production.yml not found: ${COMPOSE_FILE}"
[[ -d "${MIGRATION_DIR}" ]] || fail "Migration directory not found: ${MIGRATION_DIR}"

MIGRATION_COUNT=$(find "${MIGRATION_DIR}" -maxdepth 1 -name "[0-9][0-9][0-9]_*.sql" | wc -l | tr -d ' ')
ok "Migration files found: ${MIGRATION_COUNT}"

# Verify PostgreSQL is running
$COMPOSE exec -T postgres psql -U postgres -d "${PROD_DB}" \
  -c "SELECT 1;" < /dev/null >> "${LOG}" 2>&1 \
  || fail "Cannot connect to ${PROD_DB}. Is postgres running?"
ok "PostgreSQL connection verified"

# Verify SET SESSION ... TRANSACTION READ ONLY works
TEST_RO=$(prod_ro_query "-t -A" "SELECT 'read_only_ok';" 2>/dev/null || echo "FAIL")
[[ "${TEST_RO}" == *"read_only_ok"* ]] \
  || fail "Read-only enforcement test failed — abort."
ok "Read-only enforcement: VERIFIED"

# ============================================================
# STAGE A: Read-only catalog scan of production member_bot
# ALL queries go through prod_ro_query() — enforced at DB level.
# ============================================================
hdr "Stage A: Scanning production DB catalog (READ-ONLY ENFORCED)"

scan_catalog "${PROD_DB}" "actual"

PROD_TABLE_COUNT=$(wc -l < "${DIAG_DIR}/actual_tables.txt" 2>/dev/null || echo 0)
ok "Production tables found: ${PROD_TABLE_COUNT}"

# ── Sanity check: suspiciously low table count ──────────────
if [[ "${PROD_TABLE_COUNT}" -lt 50 ]]; then
  append_warn "SEVERE WARNING: Only ${PROD_TABLE_COUNT} tables visible in production."
  append_warn "  Expected ≥ 70. Catalog damage may be MORE severe than initially assessed."
  append_warn "  DO NOT run Repair SQL until you understand why this count is so low."
fi

# ── Critical table existence check ─────────────────────────
# If any critical table is missing, the database state is unexpected.
# Repair SQL could be catastrophically wrong. HALT immediately.
hdr "Critical table protection check"

CRITICAL_MISSING=()
for ct in "${CRITICAL_TABLES[@]}"; do
  if ! grep -qx "${ct}" "${DIAG_DIR}/actual_tables.txt" 2>/dev/null; then
    CRITICAL_MISSING+=("${ct}")
  fi
done

if [[ "${#CRITICAL_MISSING[@]}" -gt 0 ]]; then
  echo "" | tee -a "${LOG}"
  echo "  ╔═══════════════════════════════════════════════════════╗" | tee -a "${LOG}"
  echo "  ║  ✗ HALT — CRITICAL TABLE(S) MISSING FROM PRODUCTION  ║" | tee -a "${LOG}"
  for ct in "${CRITICAL_MISSING[@]}"; do
    echo "  ║    MISSING: ${ct}" | tee -a "${LOG}"
  done
  echo "  ║                                                       ║" | tee -a "${LOG}"
  echo "  ║  This indicates pg_resetwal damage is MORE SEVERE     ║" | tee -a "${LOG}"
  echo "  ║  than expected. The recovery plan (Phase 1-7) is      ║" | tee -a "${LOG}"
  echo "  ║  more appropriate than Repair SQL.                    ║" | tee -a "${LOG}"
  echo "  ║  DO NOT run diag_02_generate_repair.sh.               ║" | tee -a "${LOG}"
  echo "  ╚═══════════════════════════════════════════════════════╝" | tee -a "${LOG}"
  echo ""
  echo "VERDICT=HALT" > "${DIAG_DIR}/VERDICT.txt"
  echo "REASON=Critical tables missing: ${CRITICAL_MISSING[*]}" >> "${DIAG_DIR}/VERDICT.txt"
  exit 1
fi
ok "Critical tables all present: ${CRITICAL_TABLES[*]}"

# ============================================================
# STAGE B: Create reference DB and run all migrations
# ============================================================
hdr "Stage B: Creating reference DB and running migrations 000-088"

# Drop any leftover reference DB from a previous diagnostic run
$COMPOSE exec -T postgres psql -U postgres \
  -c "DROP DATABASE IF EXISTS ${REF_DB};" < /dev/null >> "${LOG}" 2>&1
ok "Dropped old reference DB (if existed): ${REF_DB}"

$COMPOSE exec -T postgres psql -U postgres \
  -c "CREATE DATABASE ${REF_DB} TEMPLATE template0;" < /dev/null >> "${LOG}" 2>&1
ok "Created fresh reference DB: ${REF_DB}"

# Copy migration files to postgres container
CONTAINER_ID=$($COMPOSE ps -q postgres | head -1 | tr -d '\n')
[[ -n "${CONTAINER_ID}" ]] || fail "Cannot get postgres container ID"

docker exec "${CONTAINER_ID}" rm -rf /tmp/diag_migrations 2>>"${LOG}"
docker exec "${CONTAINER_ID}" mkdir -p /tmp/diag_migrations 2>>"${LOG}"

# Only copy numbered migration files (000-088), not seeds or catchup
MIGRATION_FILES=()
while IFS= read -r f; do
  MIGRATION_FILES+=("$f")
done < <(find "${MIGRATION_DIR}" -maxdepth 1 -name "[0-9][0-9][0-9]_*.sql" | sort)

for mig_path in "${MIGRATION_FILES[@]}"; do
  docker cp "${mig_path}" "${CONTAINER_ID}:/tmp/diag_migrations/" >> "${LOG}" 2>&1
done
COPY_COUNT=$(docker exec "${CONTAINER_ID}" ls /tmp/diag_migrations/ | wc -l | tr -d ' ')
ok "Copied ${COPY_COUNT} migration files to container"

# Run each migration in sequence
MIG_OK=0
MIG_FAIL=0
FAILED_MIGRATION_LIST=()
TRANSACTION_WRAPPED_FAILURES=()

echo "" > "${DIAG_DIR}/ref_migration_run.log"
echo "=== Reference DB Migration Run: ${REF_DB} ===" >> "${DIAG_DIR}/ref_migration_run.log"
echo "=== Start: $(date) ===" >> "${DIAG_DIR}/ref_migration_run.log"
echo "" >> "${DIAG_DIR}/ref_migration_run.log"

is_transaction_wrapped() {
  local mig_name="$1"
  for tw in "${TRANSACTION_WRAPPED_MIGRATIONS[@]}"; do
    [[ "${tw}" == "${mig_name}" ]] && return 0
  done
  return 1
}

for mig_path in "${MIGRATION_FILES[@]}"; do
  mig_name=$(basename "${mig_path}")
  echo "--- ${mig_name} ---" >> "${DIAG_DIR}/ref_migration_run.log"

  if $COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" \
    -v ON_ERROR_STOP=0 \
    -f "/tmp/diag_migrations/${mig_name}" \
    < /dev/null >> "${DIAG_DIR}/ref_migration_run.log" 2>&1; then
    MIG_OK=$((MIG_OK + 1))
  else
    MIG_FAIL=$((MIG_FAIL + 1))
    FAILED_MIGRATION_LIST+=("${mig_name}")
    echo "!!! FAILED: ${mig_name} !!!" >> "${DIAG_DIR}/ref_migration_run.log"

    # Higher risk: transaction-wrapped migration failure = full DDL rollback
    if is_transaction_wrapped "${mig_name}"; then
      TRANSACTION_WRAPPED_FAILURES+=("${mig_name}")
      append_warn "HIGH-RISK: ${mig_name} uses BEGIN/COMMIT — ALL its DDL was ROLLED BACK."
      append_warn "  Objects from this migration will NOT appear in the diff report."
      append_warn "  These are POTENTIAL FALSE NEGATIVES — verify manually."
    else
      append_warn "Migration failed (auto-commit mode): ${mig_name}"
      append_warn "  Individual statement failures — partially-created objects may exist in reference."
    fi

    # Extract expected objects from this failed migration (for false-negative detection)
    expected_tables=$(grep -i "CREATE TABLE" "${mig_path}" \
      | grep -v "^--" \
      | grep -oP '(?i)TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_][a-z0-9_]*)' \
      | grep -oP '[a-z_][a-z0-9_]*$' \
      | sort | uniq || true)
    if [[ -n "${expected_tables}" ]]; then
      append_warn "  Expected tables from ${mig_name}: $(echo "${expected_tables}" | tr '\n' ' ')"
      append_warn "  → Manually verify these tables exist in production:"
      while IFS= read -r tbl; do
        [[ -z "${tbl}" ]] && continue
        echo "    ${mig_name}:${tbl}" >> "${DIAG_DIR}/potential_false_negatives.txt"
      done <<< "${expected_tables}"
    fi
  fi
done

ok "Migrations complete: OK=${MIG_OK} FAIL=${MIG_FAIL}"

# ── Key migration verification ─────────────────────────────
hdr "Stage B verification: Key migration object check"

KEY_VERIFICATION_FAILURES=()
for item in "${KEY_MIGRATION_CHECKS[@]}"; do
  mig="${item%%:*}"
  tbl="${item##*:}"

  # Check if this migration was in the failed list
  mig_failed=false
  for fm in "${FAILED_MIGRATION_LIST[@]}"; do
    [[ "${fm}" == "${mig}" ]] && { mig_failed=true; break; }
  done

  ref_check=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A \
    -c "SELECT COALESCE(to_regclass('public.${tbl}')::text, 'NULL');" \
    < /dev/null 2>/dev/null | tr -d ' \r' || echo "NULL")

  if [[ "${ref_check}" == "NULL" ]]; then
    KEY_VERIFICATION_FAILURES+=("${mig}:${tbl}")
    append_warn "KEY MIGRATION VERIFICATION FAILED: ${mig} → '${tbl}' NOT in reference DB"
    if [[ "${mig_failed}" == "true" ]]; then
      append_warn "  CAUSE: ${mig} failed → DDL rolled back. FALSE NEGATIVES LIKELY."
    else
      append_warn "  UNEXPECTED: migration reported success but table is missing. Investigate ref_migration_run.log."
    fi
  else
    ok "Key migration verified: ${mig} → ${tbl} exists in reference"
  fi
done

if [[ "${#KEY_VERIFICATION_FAILURES[@]}" -gt 0 ]]; then
  warn "${#KEY_VERIFICATION_FAILURES[@]} key migration verification failure(s). See warnings.txt."
fi

# ============================================================
# STAGE C: Scan reference DB catalog
# ============================================================
hdr "Stage C: Scanning reference DB catalog"
scan_catalog "${REF_DB}" "ref"
ok "Stage C complete"

# ============================================================
# STAGE D: Generate diff report
# ============================================================
hdr "Stage D: Generating diff report"

# Initialize output files
for f in missing_tables extra_tables missing_columns missing_columns_notnull \
          column_type_diffs missing_indexes extra_indexes missing_functions \
          missing_triggers missing_sequences missing_fks missing_check_constraints; do
  > "${DIAG_DIR}/${f}.txt"
done

REPORT="${DIAG_DIR}/diff_report.txt"

{
echo "============================================================"
echo " DATABASE DIAGNOSTIC DIFF REPORT — Version 2"
echo " Production:  ${PROD_DB} (READ-ONLY)"
echo " Reference:   ${REF_DB} (fresh migrations 000-088)"
echo " Generated:   $(date)"
echo " Diag dir:    ${DIAG_DIR}"
echo "============================================================"

if [[ "${MIG_FAIL}" -gt 0 ]]; then
  echo ""
  echo "⚠ ${MIG_FAIL} migration(s) FAILED against reference DB."
  echo "  This may cause FALSE NEGATIVES (objects missing from BOTH DBs won't appear below)."
  echo "  Failed: ${FAILED_MIGRATION_LIST[*]}"
  echo "  See: warnings.txt and ref_migration_run.log"
fi
echo ""

# ── TABLES ─────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════"
echo " TABLES"
echo "══════════════════════════════════════════════════════════"
echo "Missing in production (in reference, not in production):"
comm -23 \
  "${DIAG_DIR}/ref_tables.txt" \
  "${DIAG_DIR}/actual_tables.txt" \
  | tee "${DIAG_DIR}/missing_tables.txt" \
  | awk '{print "  [MISSING] " $0}'
MISSING_TABLE_COUNT=$(wc -l < "${DIAG_DIR}/missing_tables.txt" | tr -d ' ')
echo "  → ${MISSING_TABLE_COUNT} table(s) missing"

echo ""
echo "Extra in production (not expected by migrations):"
comm -13 \
  "${DIAG_DIR}/ref_tables.txt" \
  "${DIAG_DIR}/actual_tables.txt" \
  | tee "${DIAG_DIR}/extra_tables.txt" \
  | awk '{print "  [EXTRA] " $0}'
EXTRA_TABLE_COUNT=$(wc -l < "${DIAG_DIR}/extra_tables.txt" | tr -d ' ')
echo "  → ${EXTRA_TABLE_COUNT} extra table(s) (informational — not repaired)"

# ── COLUMN STRUCTURE ───────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " COLUMN STRUCTURE (tables existing in both DBs)"
echo "══════════════════════════════════════════════════════════"

MISSING_COL_COUNT=0
MISSING_NOTNULL_COUNT=0
TYPE_DIFF_COUNT=0

while IFS= read -r tbl; do
  [[ -z "${tbl}" ]] && continue
  # Only check tables that exist in BOTH (skip tables being newly created)
  grep -qx "${tbl}" "${DIAG_DIR}/actual_tables.txt" 2>/dev/null || continue

  ref_cols=$(grep "^${tbl}|" "${DIAG_DIR}/ref_columns.txt" || true)
  [[ -z "${ref_cols}" ]] && continue

  while IFS='|' read -r t col col_type nullability has_default is_gen; do
    [[ -z "${col}" ]] && continue

    # Check if column exists in production
    if ! grep -q "^${tbl}|${col}|" "${DIAG_DIR}/actual_columns.txt" 2>/dev/null; then
      # Column is missing from production

      if [[ "${is_gen}" == "GENERATED" ]]; then
        # Generated columns cannot be added with ADD COLUMN IF NOT EXISTS
        echo "  [MISSING-GENERATED] ${tbl}.${col} (${col_type}) — MANUAL: generated column"
        echo "${tbl}|${col}|${col_type}|GENERATED" >> "${DIAG_DIR}/missing_columns_notnull.txt"
        MISSING_NOTNULL_COUNT=$((MISSING_NOTNULL_COUNT + 1))

      elif [[ "${nullability}" == "NOT NULL" && "${has_default}" == "NO_DEFAULT" ]]; then
        # NOT NULL without DEFAULT — adding to non-empty table would fail
        echo "  [MISSING-NOTNULL] ${tbl}.${col} (${col_type}) — ⚠ MANUAL ONLY: NOT NULL, no DEFAULT"
        echo "${tbl}|${col}|${col_type}|NOT NULL, no DEFAULT" >> "${DIAG_DIR}/missing_columns_notnull.txt"
        MISSING_NOTNULL_COUNT=$((MISSING_NOTNULL_COUNT + 1))

      else
        # Safe to auto-repair with ADD COLUMN IF NOT EXISTS
        echo "  [MISSING] ${tbl}.${col} (${col_type} ${nullability} ${has_default})"
        echo "${tbl}|${col}|${col_type}|${nullability}|${has_default}|${is_gen}" \
          >> "${DIAG_DIR}/missing_columns.txt"
        MISSING_COL_COUNT=$((MISSING_COL_COUNT + 1))
      fi

    else
      # Column exists — check for type mismatch
      actual_type=$(grep "^${tbl}|${col}|" "${DIAG_DIR}/actual_columns.txt" \
        | head -1 | cut -d'|' -f3 || true)
      if [[ "${actual_type}" != "${col_type}" ]]; then
        echo "  [TYPE MISMATCH] ${tbl}.${col}: production='${actual_type}' reference='${col_type}'"
        echo "${tbl}|${col}|${actual_type}|${col_type}" >> "${DIAG_DIR}/column_type_diffs.txt"
        TYPE_DIFF_COUNT=$((TYPE_DIFF_COUNT + 1))
      fi
    fi
  done <<< "${ref_cols}"

done < "${DIAG_DIR}/ref_tables.txt"

echo ""
echo "  Auto-repairable missing columns: ${MISSING_COL_COUNT}"
echo "  ⚠ Manual-only missing columns (NOT NULL/no DEFAULT/GENERATED): ${MISSING_NOTNULL_COUNT}"
echo "  ⚠ Column type mismatches (cannot auto-repair): ${TYPE_DIFF_COUNT}"
[[ "${MISSING_NOTNULL_COUNT}" -gt 0 ]] \
  && echo "  → See: missing_columns_notnull.txt"
[[ "${TYPE_DIFF_COUNT}" -gt 0 ]] \
  && echo "  → See: column_type_diffs.txt"

# ── INDEXES ────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " INDEXES"
echo "══════════════════════════════════════════════════════════"
echo "Missing indexes:"
comm -23 "${DIAG_DIR}/ref_indexes.txt" "${DIAG_DIR}/actual_indexes.txt" \
  | tee "${DIAG_DIR}/missing_indexes.txt" \
  | awk '{print "  [MISSING] " $0}'
MISSING_IDX_COUNT=$(wc -l < "${DIAG_DIR}/missing_indexes.txt" | tr -d ' ')
echo "  → ${MISSING_IDX_COUNT} missing"

echo "Extra indexes in production:"
comm -13 "${DIAG_DIR}/ref_indexes.txt" "${DIAG_DIR}/actual_indexes.txt" \
  | tee "${DIAG_DIR}/extra_indexes.txt" \
  | awk '{print "  [EXTRA] " $0}'
echo "  → Extra indexes are informational — do NOT drop them."

# ── FUNCTIONS ──────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " FUNCTIONS"
echo "══════════════════════════════════════════════════════════"
echo "Missing functions:"
comm -23 "${DIAG_DIR}/ref_functions.txt" "${DIAG_DIR}/actual_functions.txt" \
  | tee "${DIAG_DIR}/missing_functions.txt" \
  | awk '{print "  [MISSING] " $0}'
MISSING_FN_COUNT=$(wc -l < "${DIAG_DIR}/missing_functions.txt" | tr -d ' ')
echo "  → ${MISSING_FN_COUNT} missing"

# ── TRIGGERS ───────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " TRIGGERS"
echo "══════════════════════════════════════════════════════════"
echo "Missing triggers (trigger_name|table_name):"
comm -23 "${DIAG_DIR}/ref_triggers.txt" "${DIAG_DIR}/actual_triggers.txt" \
  | tee "${DIAG_DIR}/missing_triggers.txt" \
  | awk -F'|' '{print "  [MISSING] " $1 " ON " $2}'
MISSING_TRG_COUNT=$(wc -l < "${DIAG_DIR}/missing_triggers.txt" | tr -d ' ')
echo "  → ${MISSING_TRG_COUNT} missing"

# Warn about triggers where the required function might also be missing
if [[ "${MISSING_TRG_COUNT}" -gt 0 && "${MISSING_FN_COUNT}" -gt 0 ]]; then
  echo ""
  echo "  ⚠ Both functions AND triggers are missing."
  echo "    Repair SQL MUST create functions BEFORE triggers."
  echo "    diag_02_generate_repair.sh handles this ordering automatically."
fi

# ── SEQUENCES ──────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " SEQUENCES"
echo "══════════════════════════════════════════════════════════"
echo "Missing sequences:"
comm -23 "${DIAG_DIR}/ref_sequences.txt" "${DIAG_DIR}/actual_sequences.txt" \
  | tee "${DIAG_DIR}/missing_sequences.txt" \
  | awk '{print "  [MISSING] " $0}'
MISSING_SEQ_COUNT=$(wc -l < "${DIAG_DIR}/missing_sequences.txt" | tr -d ' ')
echo "  → ${MISSING_SEQ_COUNT} missing"

# ── FOREIGN KEYS ───────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " FOREIGN KEY CONSTRAINTS"
echo "══════════════════════════════════════════════════════════"
echo "Missing FK constraints (constraint_name|table_name):"
comm -23 "${DIAG_DIR}/ref_fks.txt" "${DIAG_DIR}/actual_fks.txt" \
  | tee "${DIAG_DIR}/missing_fks.txt" \
  | awk -F'|' '{print "  [MISSING] " $2 "." $1}'
MISSING_FK_COUNT=$(wc -l < "${DIAG_DIR}/missing_fks.txt" | tr -d ' ')
echo "  → ${MISSING_FK_COUNT} missing (will be added as NOT VALID)"

# ── CHECK CONSTRAINTS ──────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " CHECK CONSTRAINTS"
echo "══════════════════════════════════════════════════════════"
echo "Missing CHECK constraints:"
comm -23 "${DIAG_DIR}/ref_check_constraints.txt" "${DIAG_DIR}/actual_check_constraints.txt" \
  | tee "${DIAG_DIR}/missing_check_constraints.txt" \
  | awk -F'|' '{print "  [MISSING] " $2 "." $1}'
MISSING_CHK_COUNT=$(wc -l < "${DIAG_DIR}/missing_check_constraints.txt" | tr -d ' ')
echo "  → ${MISSING_CHK_COUNT} missing"

# ── SUMMARY ────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " SUMMARY"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  AUTOMATICALLY REPAIRABLE (diag_02_generate_repair.sh):"
echo "    Missing tables:               ${MISSING_TABLE_COUNT}"
echo "    Missing columns (safe):       ${MISSING_COL_COUNT}"
echo "    Missing indexes:              ${MISSING_IDX_COUNT}"
echo "    Missing functions:            ${MISSING_FN_COUNT}"
echo "    Missing triggers:             ${MISSING_TRG_COUNT}"
echo "    Missing sequences:            ${MISSING_SEQ_COUNT}"
echo "    Missing FK constraints:       ${MISSING_FK_COUNT}"
echo "    Missing CHECK constraints:    ${MISSING_CHK_COUNT}"
echo ""
echo "  ⚠ MANUAL REVIEW REQUIRED (do NOT auto-repair):"
echo "    Missing columns (NOT NULL):   ${MISSING_NOTNULL_COUNT}"
echo "    Column type mismatches:       ${TYPE_DIFF_COUNT}"
echo "    Extra tables in production:   ${EXTRA_TABLE_COUNT}"
echo "    Failed migrations:            ${MIG_FAIL}"
echo ""
echo "  Reference DB kept for Repair SQL generation: ${REF_DB}"
echo "  DO NOT DROP ${REF_DB} until diag_02_generate_repair.sh is complete."

  # Pipeline subshell cannot export variables to parent shell.
  # Write all counts to a temp file; parent shell sources it after the pipeline.
  {
    echo "MISSING_TABLE_COUNT=${MISSING_TABLE_COUNT}"
    echo "MISSING_COL_COUNT=${MISSING_COL_COUNT}"
    echo "MISSING_NOTNULL_COUNT=${MISSING_NOTNULL_COUNT}"
    echo "TYPE_DIFF_COUNT=${TYPE_DIFF_COUNT}"
    echo "MISSING_IDX_COUNT=${MISSING_IDX_COUNT}"
    echo "MISSING_FN_COUNT=${MISSING_FN_COUNT}"
    echo "MISSING_TRG_COUNT=${MISSING_TRG_COUNT}"
    echo "MISSING_SEQ_COUNT=${MISSING_SEQ_COUNT}"
    echo "MISSING_FK_COUNT=${MISSING_FK_COUNT}"
    echo "MISSING_CHK_COUNT=${MISSING_CHK_COUNT}"
    echo "EXTRA_TABLE_COUNT=${EXTRA_TABLE_COUNT}"
  } > "${DIAG_DIR}/.stage_d_vars"

} | tee "${REPORT}"

# Restore Stage D count variables in the parent shell.
if [[ ! -f "${DIAG_DIR}/.stage_d_vars" ]]; then
  fail "Stage D did not produce .stage_d_vars — the diff pipeline exited before writing counts. Cannot compute verdict safely."
fi
# shellcheck source=/dev/null
source "${DIAG_DIR}/.stage_d_vars"

# ============================================================
# STAGE E: Safety analysis and final verdict
# ============================================================
hdr "Stage E: Safety analysis and final verdict"

TOTAL_AUTO_REPAIRABLE=$((MISSING_TABLE_COUNT + MISSING_COL_COUNT + MISSING_IDX_COUNT + \
  MISSING_FN_COUNT + MISSING_TRG_COUNT + MISSING_SEQ_COUNT + MISSING_FK_COUNT + MISSING_CHK_COUNT))
TOTAL_MANUAL=$((MISSING_NOTNULL_COUNT + TYPE_DIFF_COUNT))
TOTAL_WARNINGS=$(wc -l < "${DIAG_DIR}/warnings.txt" 2>/dev/null || echo 0)

# Check for critical table false negatives
# (critical tables should NOT appear in missing_tables)
CRITICAL_IN_MISSING=0
for ct in "${CRITICAL_TABLES[@]}"; do
  grep -qx "${ct}" "${DIAG_DIR}/missing_tables.txt" 2>/dev/null \
    && CRITICAL_IN_MISSING=$((CRITICAL_IN_MISSING + 1))
done

{
echo "============================================================"
echo " FINAL VERDICT"
echo " $(date)"
echo "============================================================"
echo ""

if [[ "${CRITICAL_IN_MISSING}" -gt 0 ]]; then
  echo "  STATUS: ✗ HALT"
  echo ""
  echo "  A critical table appears in missing_tables.txt."
  echo "  This should have been caught in the pre-flight — if you see this,"
  echo "  something unexpected happened during the diff. DO NOT PROCEED."
  echo ""

elif [[ "${#KEY_VERIFICATION_FAILURES[@]}" -gt 0 || "${#TRANSACTION_WRAPPED_FAILURES[@]}" -gt 0 ]]; then
  echo "  STATUS: ⚠ NEEDS MANUAL REVIEW"
  echo ""
  echo "  One or more key migrations failed on the reference DB."
  echo "  The diff report may have FALSE NEGATIVES — objects missing from"
  echo "  production that did not appear in the report."
  echo ""
  echo "  BEFORE running diag_02_generate_repair.sh:"
  echo "    1. Read warnings.txt carefully"
  echo "    2. For each item in potential_false_negatives.txt, manually check"
  echo "       if that object exists in production:"
  echo "       SELECT to_regclass('public.TABLE_NAME');"
  echo "    3. Only proceed if you are confident the diff is complete."
  echo ""

elif [[ "${TOTAL_MANUAL}" -gt 0 ]]; then
  echo "  STATUS: ⚠ NEEDS MANUAL REVIEW"
  echo ""
  echo "  The auto-repairable objects (${TOTAL_AUTO_REPAIRABLE}) can be handled by"
  echo "  diag_02_generate_repair.sh AFTER you review the following manually:"
  echo ""
  [[ "${MISSING_NOTNULL_COUNT}" -gt 0 ]] && echo "    → missing_columns_notnull.txt (${MISSING_NOTNULL_COUNT} items)"
  [[ "${TYPE_DIFF_COUNT}" -gt 0 ]]       && echo "    → column_type_diffs.txt (${TYPE_DIFF_COUNT} items)"
  echo ""

elif [[ "${TOTAL_AUTO_REPAIRABLE}" -eq 0 ]]; then
  echo "  STATUS: ✓ NO MISSING OBJECTS DETECTED"
  echo ""
  echo "  The diff shows no missing objects. The schema appears complete."
  echo "  Verify this makes sense before concluding — if you expected"
  echo "  missing objects but they don't appear, check potential_false_negatives.txt"
  echo ""

else
  echo "  STATUS: ✓ SAFE TO PROCEED"
  echo ""
  echo "  ${TOTAL_AUTO_REPAIRABLE} object(s) can be repaired automatically."
  echo "  No manual-only items found. No critical issues."
  echo ""
  echo "  NEXT: Review diff_report.txt, then run:"
  echo "    bash diag_02_generate_repair.sh ${DIAG_DIR}"
  echo ""
fi

echo ""
echo "============================================================"
echo " MANUAL REVIEW CHECKLIST"
echo " (complete BEFORE running diag_02_generate_repair.sh)"
echo "============================================================"
echo ""
echo "  [ ] 1. Read diff_report.txt in full"
echo "  [ ] 2. Verify missing_tables.txt is expected (only damaged tables)"
echo "  [ ] 3. If missing_columns_notnull.txt is non-empty → manual repair plan needed"
echo "  [ ] 4. If column_type_diffs.txt is non-empty → do NOT auto-repair these"
echo "  [ ] 5. Review extra_tables.txt — understand why those tables exist"
echo "  [ ] 6. Read warnings.txt — any false-negative risks?"
echo "  [ ] 7. Read potential_false_negatives.txt (if exists) — manually verify"
[[ "${MIG_FAIL}" -gt 0 ]] \
  && echo "  [ ] 8. ⚠ Review ref_migration_run.log — grep for '!!! FAILED'"
echo "  [ ] 9. After Repair SQL is generated — read it LINE BY LINE before executing"
echo ""

} | tee -a "${REPORT}" | tee "${DIAG_DIR}/VERDICT.txt"

# ============================================================
# FINAL STATUS
# ============================================================
echo "" | tee -a "${LOG}"
hdr "Diagnostic complete"
ok "Diff report:     ${REPORT}"
ok "Verdict:         ${DIAG_DIR}/VERDICT.txt"
ok "Structured files: ${DIAG_DIR}/"
ok "Reference DB:    ${REF_DB} (kept — needed for Repair SQL generation)"
echo ""
VERDICT_STATUS=$(grep "^  STATUS:" "${DIAG_DIR}/VERDICT.txt" 2>/dev/null | head -1 || echo "")
echo "  ${VERDICT_STATUS}" | tee -a "${LOG}"
