#!/bin/bash
# ============================================================
# Phase 3: Restore data to member_bot_new
# Does NOT touch member_bot — idempotent (TRUNCATE before COPY)
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
DATA_DIR="${BACKUP_DIR}/data"
MANIFEST="${BACKUP_DIR}/manifest.txt"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
TARGET_DB="member_bot_new"
LOG="${BACKUP_DIR}/logs/phase3_restore_$(date +%Y%m%d_%H%M%S).log"
RESTORE_REPORT="${BACKUP_DIR}/restore_report.txt"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " Phase 3: Data Restore → ${TARGET_DB}                       " | tee -a "${LOG}"
echo " Start: $(date)                                              " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# PRE-FLIGHT
# ============================================================
hdr "Pre-flight checks"

source "${CHECKPOINT}" 2>/dev/null \
  || fail "Checkpoint file not found. Run Phases 1 and 2 first."
[[ -n "${PHASE2_COMPLETE:-}" ]] \
  || fail "Phase 2 not completed. Run 02_phase2_create_database.sh first."
ok "Phase 2 checkpoint verified (${PHASE2_DATE:-unknown})"

[[ -f "${BACKUP_DIR}/users_import_cols.txt" ]] \
  || fail "users_import_cols.txt not found. Re-run Phase 1."
USERS_COLS=$(cat "${BACKUP_DIR}/users_import_cols.txt")
ok "users import columns: ${USERS_COLS}"

[[ -f "${MANIFEST}" ]] || fail "manifest.txt not found. Re-run Phase 1."

# Verify target DB exists
EXISTS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='${TARGET_DB}';" 2>/dev/null || echo 0)
[[ "${EXISTS}" == "1" ]] || fail "${TARGET_DB} not found. Run Phase 2 first."
ok "${TARGET_DB} exists"

# ============================================================
# STEP 1: Disable all triggers (disables FK enforcement too)
# ============================================================
hdr "Step 1: Disabling all triggers on ${TARGET_DB}"

$COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" << 'EOSQL' >> "${LOG}" 2>&1
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  LOOP
    EXECUTE 'ALTER TABLE ' || quote_ident(t) || ' DISABLE TRIGGER ALL';
    RAISE NOTICE 'Disabled triggers: %', t;
  END LOOP;
END $$;
EOSQL
ok "All triggers disabled"

# ============================================================
# STEP 2: Restore tables
# - schema_migrations: SKIP (already populated by migrations)
# - Tables with MISSING_IN_SOURCE in manifest: SKIP (no CSV, keep as empty)
# - users: SPECIAL handling (exclude generated columns)
# - All others: TRUNCATE then COPY FROM (idempotent)
# ============================================================
hdr "Step 2: Restoring data"

RESTORE_OK=0 RESTORE_FAIL=0 RESTORE_SKIP=0
echo "TABLE|EXPECTED_ROWS|RESTORED_ROWS|SHA256_OK|STATUS" > "${RESTORE_REPORT}"

# ---- Mass TRUNCATE before restore (idempotency: re-run after partial failure) ----
# TRUNCATE...CASCADE handles FK dependencies at DDL level — not affected by DISABLE TRIGGER.
# Without CASCADE, TRUNCATE fails if a child table still has referencing rows from
# a previous partial run. schema_migrations is excluded (it must retain migration records).
info "Truncating all tables (schema_migrations preserved) for idempotent re-run..."
$COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" << 'EOSQL' >> "${LOG}" 2>&1
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname='public'
             AND tablename != 'schema_migrations'
           ORDER BY tablename
  LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(t) || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE 'Truncated: %', t;
  END LOOP;
END $$;
EOSQL
ok "All tables cleared (schema_migrations preserved)"

# Tables to skip entirely
SKIP_TABLES=(schema_migrations)

restore_table() {
  local table="$1"
  local csv="${DATA_DIR}/${table}.csv"

  # --- Skip explicitly listed tables ---
  for skip in "${SKIP_TABLES[@]}"; do
    if [[ "${table}" == "${skip}" ]]; then
      info "⊘ SKIP: ${table} (kept from migration)"
      echo "${table}|0|0|N/A|SKIP_MIGRATION" >> "${RESTORE_REPORT}"
      RESTORE_SKIP=$((RESTORE_SKIP+1))
      return
    fi
  done

  # --- Skip if no CSV (table was missing in source — expected for 4 tables) ---
  if [[ ! -f "${csv}" ]]; then
    info "⊘ SKIP: ${table} (no CSV — missing in source, kept as empty)"
    echo "${table}|0|0|N/A|MISSING_IN_SOURCE" >> "${RESTORE_REPORT}"
    RESTORE_SKIP=$((RESTORE_SKIP+1))
    return
  fi

  # --- Get expected row count from manifest ---
  MANIFEST_LINE=$(grep "^${table}|" "${MANIFEST}" 2>/dev/null || true)
  EXPECTED_ROWS=$(echo "${MANIFEST_LINE}" | cut -d'|' -f3)
  MANIFEST_SHA=$(echo "${MANIFEST_LINE}" | cut -d'|' -f5)
  MANIFEST_STATUS=$(echo "${MANIFEST_LINE}" | cut -d'|' -f6)

  # Skip if manifest says MISSING or non-OK
  if [[ "${MANIFEST_STATUS}" == "MISSING_IN_SOURCE" ]]; then
    info "⊘ SKIP: ${table} (MISSING_IN_SOURCE in manifest)"
    echo "${table}|0|0|N/A|MISSING_IN_SOURCE" >> "${RESTORE_REPORT}"
    RESTORE_SKIP=$((RESTORE_SKIP+1))
    return
  fi

  # Skip empty tables
  local csv_rows=$(( $(wc -l < "${csv}") - 1 ))
  if [[ "${csv_rows}" -le 0 ]]; then
    info "⊘ SKIP: ${table} (empty — 0 rows)"
    echo "${table}|0|0|N/A|EMPTY" >> "${RESTORE_REPORT}"
    RESTORE_SKIP=$((RESTORE_SKIP+1))
    return
  fi

  # --- Verify SHA256 integrity before restore ---
  SHA256_OK="YES"
  if [[ -n "${MANIFEST_SHA}" ]]; then
    ACTUAL_SHA=$(sha256sum "${csv}" | awk '{print $1}')
    if [[ "${ACTUAL_SHA}" != "${MANIFEST_SHA}" ]]; then
      fail "SHA256 MISMATCH for ${table}: expected=${MANIFEST_SHA} actual=${ACTUAL_SHA}"
    fi
  fi

  info "→ Restoring: ${table} (${csv_rows} rows expected)..."

  # --- TRUNCATE first for idempotency (FK triggers are disabled) ---
  $COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" \
    -c "TRUNCATE TABLE \"${table}\";" >> "${LOG}" 2>&1 \
    || warn "TRUNCATE had a warning for ${table} (may be OK)"

  # --- COPY FROM ---
  # users: special handling — exclude generated columns (net_deposit, available_balance)
  if [[ "${table}" == "users" ]]; then
    if $COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" \
      -c "\copy users(${USERS_COLS}) FROM STDIN WITH (FORMAT CSV, HEADER)" \
      < "${csv}" >> "${LOG}" 2>&1; then
      ok "✓ ${table}: ${csv_rows} rows (generated cols excluded)"
      echo "${table}|${csv_rows}|${csv_rows}|${SHA256_OK}|OK" >> "${RESTORE_REPORT}"
      RESTORE_OK=$((RESTORE_OK+1))
    else
      echo "${table}|${csv_rows}|ERROR|${SHA256_OK}|COPY_FAIL" >> "${RESTORE_REPORT}"
      fail "COPY FROM failed for users. This is critical. Check ${LOG}."
    fi
    return
  fi

  # Standard COPY FROM for all other tables
  if $COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" \
    -c "\copy \"${table}\" FROM STDIN WITH (FORMAT CSV, HEADER)" \
    < "${csv}" >> "${LOG}" 2>&1; then
    ok "✓ ${table}: ${csv_rows} rows"
    echo "${table}|${csv_rows}|${csv_rows}|${SHA256_OK}|OK" >> "${RESTORE_REPORT}"
    RESTORE_OK=$((RESTORE_OK+1))
  else
    echo "${table}|${csv_rows}|ERROR|${SHA256_OK}|COPY_FAIL" >> "${RESTORE_REPORT}"
    # Do not exit — try remaining tables, but track failures
    warn "✗ COPY FROM failed: ${table} — recorded as FAIL"
    RESTORE_FAIL=$((RESTORE_FAIL+1))
  fi
}

# ---- Restore order: parent tables before child tables ----
RESTORE_ORDER=(
  # Tier 0 — No FK dependencies
  system_settings brands admins payment_banks payment_gateways
  customer_tags media_library quick_reply_categories bot_message_keys
  promotions announcements website_game_categories website_game_providers
  gp_game_categories providers registration_security_config
  partner_templates partner_themes apk_versions homepage_sections
  role_permissions risk_flags error_logs system_backups audit_logs
  bonus_types account_pool cache_versions

  # Tier 1 — Reference Tier 0
  brand_settings users quick_replies bot_message_translations
  website_games website_banners website_announcements
  website_lobby_category_icons partner_sites broadcasts
  registration_whitelist_banks registration_whitelist_phones

  # Tier 2 — Reference users
  deposit_requests withdrawal_requests wallet_transactions
  member_activity_logs user_tag_assignments free_list
  bonus_claims registration_security_audit game_sessions
  provider_transactions provider_callback_logs
  provider_callback_idempotency provider_business_logs provider_settings

  # Tier 3 — Reference support_sessions (missing table; FK disabled)
  session_notes

  # Tier 4 — Reference gp_providers (FK disabled; gp_providers empty until Phase 4)
  gp_credentials gp_config gp_games gp_health_checks
  gp_retry_queue gp_timepoints gp_promotion_hooks
  brand_providers brand_provider_credentials brand_provider_config

  # Tier 5 — Reference users + gp_providers
  gp_players gp_config_history gp_config_audit_log user_game_accounts

  # Tier 6 — Remaining
  quick_reply_favorites bot_buttons bot_message_history
  transaction_internal_notes partner_cards partner_sections
)

DONE_TABLES=()
for table in "${RESTORE_ORDER[@]}"; do
  restore_table "${table}"
  DONE_TABLES+=("${table}")
done

# ---- Catch-all: restore any CSV not in known order ----
echo "" | tee -a "${LOG}"
info "=== Catch-all pass: restoring remaining CSVs not in known order ==="
for csv_file in "${DATA_DIR}"/*.csv; do
  [[ -f "${csv_file}" ]] || continue
  table=$(basename "${csv_file}" .csv)
  ALREADY=false
  for done_t in "${DONE_TABLES[@]}"; do
    [[ "${done_t}" == "${table}" ]] && { ALREADY=true; break; }
  done
  if [[ "${ALREADY}" == "false" ]]; then restore_table "${table}"; fi
done

# ============================================================
# STEP 3: Re-enable all triggers
# ============================================================
hdr "Step 3: Re-enabling all triggers"

$COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" << 'EOSQL' >> "${LOG}" 2>&1
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
  LOOP
    EXECUTE 'ALTER TABLE ' || quote_ident(t) || ' ENABLE TRIGGER ALL';
    RAISE NOTICE 'Enabled triggers: %', t;
  END LOOP;
END $$;
EOSQL
ok "All triggers re-enabled"

# ============================================================
# STEP 4: Reset all sequences
# Sets each sequence to MAX(id) of its table
# ============================================================
hdr "Step 4: Resetting sequences"

$COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" << 'EOSQL' >> "${LOG}" 2>&1
DO $$
DECLARE
  rec RECORD;
  max_val BIGINT;
  seq_name TEXT;
BEGIN
  FOR rec IN
    SELECT
      c.relname AS tbl,
      a.attname AS col,
      pg_get_serial_sequence(quote_ident(c.relname), a.attname) AS seq
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE c.relkind = 'r'
      AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attgenerated = ''
      AND pg_get_serial_sequence(quote_ident(c.relname), a.attname) IS NOT NULL
    ORDER BY c.relname, a.attname
  LOOP
    seq_name := rec.seq;
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', rec.col, rec.tbl) INTO max_val;
    PERFORM setval(seq_name, GREATEST(max_val, 1));
    RAISE NOTICE 'Sequence %: set to % (next=%), table=%.%',
      seq_name, GREATEST(max_val,1), GREATEST(max_val,1)+1, rec.tbl, rec.col;
  END LOOP;
END $$;
EOSQL
ok "All sequences reset"

# ============================================================
# STEP 5: Run ANALYZE
# Required after COPY — refreshes pg_statistic for query planner
# ============================================================
hdr "Step 5: Running ANALYZE"

$COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" \
  -c "ANALYZE VERBOSE;" 2>&1 | tail -10 | tee -a "${LOG}"
ok "ANALYZE completed"

# ============================================================
# STEP 6: Row count validation
# ============================================================
hdr "Step 6: Row count validation vs manifest"

MISMATCH_COUNT=0
CHECKED=0

while IFS='|' read -r table csv_file db_rows csv_rows sha256 status; do
  [[ "${table}" == "TABLE" ]] && continue
  [[ "${status}" != "OK" ]] && continue
  [[ "${table}" == "schema_migrations" ]] && continue

  NEW_COUNT=$($COMPOSE exec -T postgres psql -U postgres -d "${TARGET_DB}" -t -A \
    -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null | tr -d ' ' || echo "ERROR")

  if [[ "${NEW_COUNT}" == "ERROR" ]]; then
    warn "Cannot query ${table} in ${TARGET_DB}"
    continue
  fi

  CHECKED=$((CHECKED+1))
  if [[ "${db_rows}" == "${NEW_COUNT}" ]]; then
    ok "✓ ${table}: ${db_rows}"
  else
    warn "✗ MISMATCH ${table}: exported=${db_rows} restored=${NEW_COUNT}"
    MISMATCH_COUNT=$((MISMATCH_COUNT+1))
  fi
done < "${MANIFEST}"

info "Checked: ${CHECKED} tables"
[[ "${MISMATCH_COUNT}" -gt 0 ]] \
  && fail "Row count mismatch on ${MISMATCH_COUNT} table(s). See ${LOG}."
ok "All row counts match"

# ============================================================
# FAIL CHECK
# ============================================================
if [[ "${RESTORE_FAIL}" -gt 0 ]]; then
  fail "PHASE 3 FAILED: ${RESTORE_FAIL} table(s) failed to restore. DO NOT proceed."
fi

# ============================================================
# SUMMARY
# ============================================================
echo "" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
echo " Phase 3 Summary                                            " | tee -a "${LOG}"
echo "  ✓ Restored: ${RESTORE_OK} tables                         " | tee -a "${LOG}"
echo "  ✗ Failed:   ${RESTORE_FAIL} tables                       " | tee -a "${LOG}"
echo "  ⊘ Skipped:  ${RESTORE_SKIP} tables                       " | tee -a "${LOG}"
echo "  Report:     ${RESTORE_REPORT}                             " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

{
  echo "PHASE3_COMPLETE=$(date +%s)"
  echo "PHASE3_DATE=$(date)"
  echo "RESTORE_OK=${RESTORE_OK}"
} >> "${CHECKPOINT}"

ok "PHASE 3 COMPLETE"
ok "CHECKPOINT 3 PASSED — Safe to run 04_phase4_smoketest.sh"
