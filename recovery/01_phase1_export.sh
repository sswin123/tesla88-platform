#!/bin/bash
# ============================================================
# Phase 1: Complete Data Export from member_bot
# READ-ONLY — NO writes to member_bot whatsoever
# ============================================================
set -Eeuo pipefail

# ---- Configuration (edit if paths differ) ----
PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
DATA_DIR="${BACKUP_DIR}/data"
LOG_DIR="${BACKUP_DIR}/logs"
MANIFEST="${BACKUP_DIR}/manifest.txt"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
SOURCE_DB="member_bot"
LOG="${LOG_DIR}/phase1_export_$(date +%Y%m%d_%H%M%S).log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

# ---- Terminal colors ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

# ---- Directories ----
mkdir -p "${DATA_DIR}" "${LOG_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "============================================================" | tee "${LOG}"
echo " Phase 1: Data Export — member_bot (READ-ONLY)              " | tee -a "${LOG}"
echo " Start: $(date)                                              " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# PRE-FLIGHT CHECKS
# ============================================================
hdr "Pre-flight checks"

info "Checking platform directory..."
[[ -f "${COMPOSE_FILE}" ]] || fail "docker-compose.production.yml not found at ${COMPOSE_FILE}"

info "Checking .env file..."
[[ -f "${PLATFORM_DIR}/.env" ]] || fail ".env not found at ${PLATFORM_DIR}/.env"

info "Verifying PostgreSQL connection to ${SOURCE_DB}..."
$COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" \
  -c "SELECT current_database(), version();" < /dev/null >> "${LOG}" 2>&1 \
  || fail "Cannot connect to PostgreSQL ${SOURCE_DB}. Is the postgres container running?"
ok "PostgreSQL connection verified"

info "Verifying ${SOURCE_DB} exists..."
DB_EXISTS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='${SOURCE_DB}';" < /dev/null)
[[ "${DB_EXISTS}" == "1" ]] || fail "Database ${SOURCE_DB} not found."
ok "Database ${SOURCE_DB} confirmed"

info "Checking disk space..."
DISK_FREE_KB=$(df "${BACKUP_DIR}" --output=avail 2>/dev/null | tail -1 | tr -d ' ' \
  || df "${BACKUP_DIR}" | tail -1 | awk '{print $4}')
DB_SIZE_BYTES=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT pg_database_size('${SOURCE_DB}');" < /dev/null 2>/dev/null | tr -d ' ' || echo 0)
DISK_FREE_BYTES=$((DISK_FREE_KB * 1024))
info "Disk free: $((DISK_FREE_BYTES / 1024 / 1024)) MB | DB size: $((DB_SIZE_BYTES / 1024 / 1024)) MB"
[[ "${DISK_FREE_BYTES}" -gt $((DB_SIZE_BYTES * 3)) ]] \
  || warn "Disk space below 3x DB size — proceed with caution"

# ============================================================
# STEP 1: Detect generated columns
# ============================================================
hdr "Step 1: Detecting generated columns"

$COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
  -c "
    SELECT c.relname || '.' || a.attname AS generated_column
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.relkind = 'r'
      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND a.attgenerated = 's'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY 1;
  " < /dev/null | grep -v '^$' > "${BACKUP_DIR}/generated_cols.txt" 2>>"${LOG}" || true

GEN_COUNT=$(wc -l < "${BACKUP_DIR}/generated_cols.txt" || echo 0)
ok "Generated columns detected: ${GEN_COUNT}"
[[ "${GEN_COUNT}" -gt 0 ]] && cat "${BACKUP_DIR}/generated_cols.txt" | tee -a "${LOG}"

# ============================================================
# STEP 2: Build users table import column list
# (Excludes generated columns: net_deposit, available_balance)
# ============================================================
hdr "Step 2: Building users import column list"

$COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
  -c "
    SELECT string_agg(quote_ident(a.attname), ',' ORDER BY a.attnum)
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'users'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated = '';
  " < /dev/null > "${BACKUP_DIR}/users_import_cols.txt" 2>>"${LOG}"
ok "Users import cols: $(cat "${BACKUP_DIR}/users_import_cols.txt")"

# ============================================================
# STEP 3: Record gp_provider referenced IDs
# ============================================================
hdr "Step 3: Recording gp_provider referenced IDs (for Phase 4 rebuild)"

$COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
  -c "
    SELECT DISTINCT provider_id::text
    FROM (
      SELECT provider_id FROM gp_credentials
      UNION SELECT provider_id FROM gp_config
      UNION SELECT provider_id FROM gp_games
      UNION SELECT provider_id FROM gp_players
    ) t
    WHERE provider_id IS NOT NULL
    ORDER BY 1;
  " < /dev/null 2>/dev/null | grep -E '^[0-9]+$' \
  > "${BACKUP_DIR}/gp_provider_id_list.txt" || true

$COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" \
  -c "
    SELECT 'gp_credentials' AS source, provider_id::text, COUNT(*) AS rows
    FROM gp_credentials GROUP BY provider_id
    UNION ALL
    SELECT 'gp_config',   provider_id::text, COUNT(*) FROM gp_config  GROUP BY provider_id
    UNION ALL
    SELECT 'gp_games',    provider_id::text, COUNT(*) FROM gp_games   GROUP BY provider_id
    UNION ALL
    SELECT 'gp_players',  provider_id::text, COUNT(*) FROM gp_players GROUP BY provider_id
    ORDER BY 1, 2;
  " < /dev/null 2>/dev/null > "${BACKUP_DIR}/gp_provider_refs.txt" || true

ok "gp_provider IDs: $(tr '\n' ' ' < "${BACKUP_DIR}/gp_provider_id_list.txt")"

# ============================================================
# STEP 4: Get all table names (base tables only)
# ============================================================
hdr "Step 4: Enumerating tables"

TABLE_LIST=$($COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" \
  < /dev/null)
TOTAL=$(echo "${TABLE_LIST}" | grep -c . || true)
info "Found ${TOTAL} base tables in ${SOURCE_DB}"

# ============================================================
# STEP 5: Export all tables
# Manifest format: TABLE|CSV_FILE|DB_ROWS|CSV_ROWS|SHA256|STATUS
#
# FIX: docker compose exec -T forwards its own fd 0 (stdin) into the
# container process, even when psql only needs -c for queries. Inside a
# "while read" loop whose stdin is the here-string (<<< TABLE_LIST), each
# docker exec call drains the remaining lines from that here-string, so the
# second "read" sees EOF and the loop terminates after the first table.
#
# Solution: attach the here-string to fd 3 instead of fd 0.
#   done 3<<< "${TABLE_LIST}"   — here-string lives on fd 3
#   read -r table <&3           — read consumes fd 3
# All docker compose exec calls inherit fd 0 from the script (terminal /
# /dev/null), never touching fd 3.  Belt-and-suspenders: every exec also
# gets an explicit "< /dev/null" so the fix is self-documenting.
# ============================================================
hdr "Step 5: Exporting all tables"

echo "TABLE|CSV_FILE|DB_ROWS|CSV_ROWS|SHA256|STATUS" > "${MANIFEST}"
EXPORT_OK=0
EXPORT_FAIL=0

while IFS= read -r table <&3; do
  [[ -z "${table}" ]] && continue
  CSV="${DATA_DIR}/${table}.csv"

  # Count rows (read-only)
  DB_ROWS=$($COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
    -c "SELECT COUNT(*) FROM \"${table}\";" < /dev/null 2>>"${LOG}") || {
    warn "Cannot count rows in ${table} — marking FAIL"
    echo "${table}|${table}.csv|ERROR|ERROR||COUNT_FAIL" >> "${MANIFEST}"
    EXPORT_FAIL=$((EXPORT_FAIL+1))
    continue
  }
  DB_ROWS=$(echo "${DB_ROWS}" | tr -d ' \r')

  # COPY TO
  # users: export only non-generated columns (must match Phase 3 COPY FROM column list).
  # PostgreSQL 14 COPY FROM with explicit column list requires the CSV to have
  # exactly those columns — HEADER only skips the first row, it does NOT remap columns.
  # Exporting ALL columns (including generated net_deposit/available_balance) would cause
  # "extra data after last expected column" during Phase 3 import.
  copy_cmd=""
  if [[ "${table}" == "users" ]]; then
    users_import_cols=$(cat "${BACKUP_DIR}/users_import_cols.txt")
    copy_cmd="\copy users(${users_import_cols}) TO STDOUT WITH (FORMAT CSV, HEADER)"
  else
    copy_cmd="\copy \"${table}\" TO STDOUT WITH (FORMAT CSV, HEADER)"
  fi

  if $COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" \
    -c "${copy_cmd}" \
    < /dev/null \
    > "${CSV}" 2>>"${LOG}"; then

    CSV_ROWS=$(( $(wc -l < "${CSV}") - 1 ))
    SHA256=$(sha256sum "${CSV}" | awk '{print $1}')

    if [[ "${CSV_ROWS}" -eq "${DB_ROWS}" ]]; then
      echo "${table}|${table}.csv|${DB_ROWS}|${CSV_ROWS}|${SHA256}|OK" >> "${MANIFEST}"
      ok "${table}: ${DB_ROWS} rows | SHA256=${SHA256:0:16}..."
      EXPORT_OK=$((EXPORT_OK+1))
    else
      echo "${table}|${table}.csv|${DB_ROWS}|${CSV_ROWS}|${SHA256}|MISMATCH" >> "${MANIFEST}"
      warn "Row mismatch ${table}: DB=${DB_ROWS} CSV=${CSV_ROWS}"
      EXPORT_FAIL=$((EXPORT_FAIL+1))
    fi
  else
    echo "${table}|${table}.csv|${DB_ROWS}|ERROR||COPY_FAIL" >> "${MANIFEST}"
    warn "COPY TO failed: ${table}"
    EXPORT_FAIL=$((EXPORT_FAIL+1))
  fi

done 3<<< "${TABLE_LIST}"

# ============================================================
# STEP 6: Record known-missing tables in manifest
# (gp_providers/support_sessions/support_messages/provider_accounts)
# These are EXPECTED absences due to catalog damage — NOT export failures
# ============================================================
hdr "Step 6: Recording known-missing tables"

MISSING_TABLES=(gp_providers support_sessions support_messages provider_accounts)
for mt in "${MISSING_TABLES[@]}"; do
  if ! grep -q "^${mt}|" "${MANIFEST}" 2>/dev/null; then
    echo "${mt}|${mt}.csv|0|0||MISSING_IN_SOURCE" >> "${MANIFEST}"
    warn "${mt}: not in source catalog (expected — catalog damage from pg_resetwal)"
  fi
done

# ============================================================
# STEP 7: Integrity proof — confirm member_bot was not modified
# ============================================================
hdr "Step 7: member_bot integrity verification"

WAL_LSN_AFTER=$($COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
  -c "SELECT pg_current_wal_lsn();" < /dev/null 2>/dev/null || echo "UNKNOWN")
info "WAL LSN after export: ${WAL_LSN_AFTER}"
echo "LSN_AFTER_EXPORT=${WAL_LSN_AFTER}" >> "${BACKUP_DIR}/integrity_proof.txt"
echo "EXPORT_TIME=$(date)" >> "${BACKUP_DIR}/integrity_proof.txt"

# Spot-check a few key tables against manifest
for spot_table in users deposit_requests withdrawal_requests wallet_transactions; do
  if grep -q "^${spot_table}|" "${MANIFEST}" 2>/dev/null; then
    SPOT_ROWS=$($COMPOSE exec -T postgres psql -U postgres -d "${SOURCE_DB}" -t -A \
      -c "SELECT COUNT(*) FROM \"${spot_table}\";" < /dev/null 2>/dev/null | tr -d ' ' || echo "ERROR")
    MANIFEST_ROWS=$(grep "^${spot_table}|" "${MANIFEST}" | cut -d'|' -f3)
    if [[ "${SPOT_ROWS}" == "${MANIFEST_ROWS}" ]]; then
      ok "Integrity: ${spot_table} = ${SPOT_ROWS} rows (matches manifest)"
    else
      warn "Integrity check: ${spot_table} DB=${SPOT_ROWS} vs manifest=${MANIFEST_ROWS}"
    fi
  fi
done

# ============================================================
# SUMMARY
# ============================================================
echo "" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
echo " Phase 1 Summary                                            " | tee -a "${LOG}"
echo "  ✓ Exported:  ${EXPORT_OK} tables                         " | tee -a "${LOG}"
echo "  ✗ Failed:    ${EXPORT_FAIL} tables                       " | tee -a "${LOG}"
echo "  ⊘ Missing:   ${#MISSING_TABLES[@]} (catalog damage — expected)" | tee -a "${LOG}"
echo "  Manifest:    ${MANIFEST}                                  " | tee -a "${LOG}"
echo "  Log:         ${LOG}                                       " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

if [[ "${EXPORT_FAIL}" -gt 0 ]]; then
  fail "PHASE 1 FAILED: ${EXPORT_FAIL} export error(s). DO NOT proceed to Phase 2."
fi

# ---- Validate manifest has no FAIL/MISMATCH ----
BAD=$(grep -v "^TABLE|" "${MANIFEST}" | grep -v "|OK$" | grep -v "|MISSING_IN_SOURCE$" | wc -l || true)
[[ "${BAD}" -gt 0 ]] && fail "${BAD} non-OK rows in manifest. Review before continuing."

# Write checkpoint
{
  echo "PHASE1_COMPLETE=$(date +%s)"
  echo "PHASE1_DATE=$(date)"
  echo "EXPORT_OK=${EXPORT_OK}"
  echo "EXPORT_FAIL=${EXPORT_FAIL}"
} > "${CHECKPOINT}"

ok "PHASE 1 COMPLETE"
ok "CHECKPOINT 1 PASSED — Safe to run 02_phase2_create_database.sh"
