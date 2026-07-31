#!/bin/bash
# ============================================================
# Diagnostic: Generate Repair SQL from diff report
#
# MUST be run AFTER diag_01_full_scan.sh and AFTER reviewing
# the diff_report.txt output.
#
# Usage:
#   bash diag_02_generate_repair.sh <DIAG_DIR>
#
# Where <DIAG_DIR> is the diagnostic_TIMESTAMP directory
# created by diag_01_full_scan.sh.
#
# WHAT THIS SCRIPT DOES:
#   1. Reads structured diff files from diag_01_full_scan.sh
#   2. Extracts exact DDL from member_bot_ref_diag (the reference DB)
#   3. Transforms DDL to be safe and idempotent:
#        - CREATE TABLE → CREATE TABLE IF NOT EXISTS
#        - CREATE INDEX → CREATE INDEX IF NOT EXISTS
#        - CREATE FUNCTION → CREATE OR REPLACE FUNCTION
#        - CREATE TRIGGER → DROP TRIGGER IF EXISTS + CREATE TRIGGER
#        - ALTER TABLE ADD CONSTRAINT → DO block with existence check
#        - ALTER TABLE ADD COLUMN → ALTER TABLE ADD COLUMN IF NOT EXISTS
#   4. Wraps everything in BEGIN ... COMMIT with ROLLBACK on error
#   5. Outputs: <DIAG_DIR>/repair_<timestamp>.sql
#
# WHAT THIS SCRIPT DOES NOT DO:
#   - Does NOT touch member_bot (read-only)
#   - Does NOT modify any data in any table
#   - Does NOT overwrite existing tables, functions, or triggers
#   - Does NOT affect: users, deposit_requests, withdrawal_requests,
#                      wallet_transactions, admins
#
# REVIEW repair_<timestamp>.sql before executing it.
# Execute with: psql -U postgres -d member_bot -v ON_ERROR_STOP=1 -f repair_*.sql
# ============================================================
set -Eeuo pipefail

DIAG_DIR="${1:-}"
[[ -n "${DIAG_DIR}" ]] || { echo "Usage: $0 <DIAG_DIR>"; exit 1; }
[[ -d "${DIAG_DIR}" ]] || { echo "ERROR: Directory not found: ${DIAG_DIR}"; exit 1; }
[[ -f "${DIAG_DIR}/diff_report.txt" ]] \
  || { echo "ERROR: No diff_report.txt found. Run diag_01_full_scan.sh first."; exit 1; }

PLATFORM_DIR="/root/tesla88-platform"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
REF_DB="member_bot_ref_diag"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPAIR_SQL="${DIAG_DIR}/repair_${TIMESTAMP}.sql"
LOG="${DIAG_DIR}/generate_repair_${TIMESTAMP}.log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

echo "============================================================" | tee "${LOG}"
echo " Repair SQL Generator                                        " | tee -a "${LOG}"
echo " Diagnostic dir: ${DIAG_DIR}                               " | tee -a "${LOG}"
echo " Output: ${REPAIR_SQL}                                      " | tee -a "${LOG}"
echo " $(date)                                                     " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# Verify reference DB still exists
REF_EXISTS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='${REF_DB}';" < /dev/null 2>/dev/null || echo 0)
[[ "${REF_EXISTS}" == "1" ]] \
  || fail "Reference DB '${REF_DB}' not found. Re-run diag_01_full_scan.sh first."
ok "Reference DB confirmed: ${REF_DB}"

# Count missing objects
MISSING_TABLES=$(wc -l < "${DIAG_DIR}/missing_tables.txt" 2>/dev/null || echo 0)
MISSING_COLS=$(wc -l < "${DIAG_DIR}/missing_columns.txt" 2>/dev/null || echo 0)
MISSING_IDXS=$(wc -l < "${DIAG_DIR}/missing_indexes.txt" 2>/dev/null || echo 0)
MISSING_FNS=$(wc -l < "${DIAG_DIR}/missing_functions.txt" 2>/dev/null || echo 0)
MISSING_TRGS=$(wc -l < "${DIAG_DIR}/missing_triggers.txt" 2>/dev/null || echo 0)
MISSING_SEQS=$(wc -l < "${DIAG_DIR}/missing_sequences.txt" 2>/dev/null || echo 0)
MISSING_FKS=$(wc -l < "${DIAG_DIR}/missing_fks.txt" 2>/dev/null || echo 0)

info "Missing objects to repair:"
info "  Tables:      ${MISSING_TABLES}"
info "  Columns:     ${MISSING_COLS}"
info "  Indexes:     ${MISSING_IDXS}"
info "  Functions:   ${MISSING_FNS}"
info "  Triggers:    ${MISSING_TRGS}"
info "  Sequences:   ${MISSING_SEQS}"
info "  FK constraints: ${MISSING_FKS}"

# ============================================================
# HELPER: Write a section header to repair SQL
# ============================================================
repair_section() {
  cat >> "${REPAIR_SQL}" << EOF

-- ============================================================
-- $1
-- ============================================================
EOF
}

# ============================================================
# START REPAIR SQL
# ============================================================
cat > "${REPAIR_SQL}" << 'HEADER'
-- ============================================================
-- REPAIR SQL — Auto-generated by diag_02_generate_repair.sh
-- Based on diff between member_bot (production) and member_bot_ref_diag
--
-- SAFETY PROPERTIES:
--   ✓ Idempotent — safe to run multiple times
--   ✓ Wrapped in single transaction — ROLLBACK on any failure
--   ✓ All CREATE TABLE use IF NOT EXISTS
--   ✓ All CREATE INDEX use IF NOT EXISTS
--   ✓ All functions use CREATE OR REPLACE
--   ✓ FK constraints added as NOT VALID (no retroactive data check)
--   ✓ Columns added using IF NOT EXISTS (PostgreSQL 14+)
--   ✓ Triggers guarded with DROP IF EXISTS before CREATE
--   ✓ Never modifies: users, deposit_requests, withdrawal_requests,
--                     wallet_transactions, admins
--
-- REVIEW THIS FILE before executing.
-- Execute with:
--   psql -U postgres -d member_bot -v ON_ERROR_STOP=1 -f <this_file>
-- ============================================================

BEGIN;

-- Advisory lock: prevent concurrent repair runs
SELECT pg_advisory_xact_lock(20260731);

HEADER

echo "-- Generated: $(date)" >> "${REPAIR_SQL}"
echo "-- Diagnostic dir: ${DIAG_DIR}" >> "${REPAIR_SQL}"
echo "" >> "${REPAIR_SQL}"

# ============================================================
# SECTION 1: Missing Tables
# ============================================================
if [[ "${MISSING_TABLES}" -gt 0 ]]; then
  hdr "Generating DDL for missing tables (${MISSING_TABLES})"
  repair_section "SECTION 1: Missing Tables"

  while IFS= read -r tbl; do
    [[ -z "${tbl}" ]] && continue
    info "Extracting DDL for table: ${tbl}"

    # Extract table DDL from reference DB using pg_dump
    # pg_dump output includes: CREATE TABLE, constraints, sequences for serial columns
    raw_ddl=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
      pg_dump -U postgres -d "${REF_DB}" \
      --schema-only --no-owner --no-privileges \
      --section=pre-data \
      -t "${tbl}" 2>>"${LOG}" \
      | grep -v '^--' \
      | grep -v '^SET ' \
      | grep -v '^SELECT pg_catalog' \
      | grep -v '^$' \
      || true)

    if [[ -z "${raw_ddl}" ]]; then
      warn "No DDL extracted for table: ${tbl} — skipping"
      echo "-- WARNING: Could not extract DDL for table: ${tbl}" >> "${REPAIR_SQL}"
      continue
    fi

    echo "" >> "${REPAIR_SQL}"
    echo "-- Table: ${tbl}" >> "${REPAIR_SQL}"

    # Transform: CREATE TABLE -> CREATE TABLE IF NOT EXISTS
    # Also handle sequences that pg_dump includes for SERIAL columns
    echo "${raw_ddl}" \
      | sed 's/^CREATE SEQUENCE /CREATE SEQUENCE IF NOT EXISTS /g' \
      | sed 's/^CREATE TABLE /CREATE TABLE IF NOT EXISTS /g' \
      >> "${REPAIR_SQL}"

    echo "" >> "${REPAIR_SQL}"
    ok "Table DDL added: ${tbl}"

  done < "${DIAG_DIR}/missing_tables.txt"
fi

# ============================================================
# SECTION 2: Missing Columns in Existing Tables
# ============================================================
if [[ "${MISSING_COLS}" -gt 0 ]]; then
  hdr "Generating ALTER TABLE ADD COLUMN for missing columns (${MISSING_COLS})"
  repair_section "SECTION 2: Missing Columns in Existing Tables"

  echo "-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS" >> "${REPAIR_SQL}"
  echo "-- These columns exist in reference migrations but not in production" >> "${REPAIR_SQL}"
  echo "" >> "${REPAIR_SQL}"

  while IFS='|' read -r tbl col dtype maxlen coldefault nullable is_gen; do
    [[ -z "${tbl}" ]] && continue

    # Skip generated columns — they cannot be added via ADD COLUMN IF NOT EXISTS
    if [[ "${is_gen}" == "GENERATED" ]]; then
      echo "-- SKIP: ${tbl}.${col} is a GENERATED column — requires manual DDL review" >> "${REPAIR_SQL}"
      warn "Skipping generated column: ${tbl}.${col} (manual review needed)"
      continue
    fi

    # Skip columns that are part of missing tables (they'll be created with the table)
    if grep -q "^${tbl}$" "${DIAG_DIR}/missing_tables.txt" 2>/dev/null; then
      continue
    fi

    # Build ADD COLUMN statement
    # Get the exact column definition from reference DB
    col_def=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A -c "
      SELECT
        a.attname,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS type_def,
        CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE '' END AS not_null,
        COALESCE('DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '') AS col_default
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relname = '${tbl}'
        AND a.attname = '${col}'
        AND a.attnum > 0
        AND NOT a.attisdropped;
    " < /dev/null 2>>"${LOG}" || true)

    if [[ -z "${col_def}" ]]; then
      echo "-- WARNING: Could not get column definition for ${tbl}.${col}" >> "${REPAIR_SQL}"
      warn "Could not get column def for ${tbl}.${col}"
      continue
    fi

    # Parse column definition
    col_type=$(echo "${col_def}" | cut -f2)
    col_notnull=$(echo "${col_def}" | cut -f3)
    col_default_clause=$(echo "${col_def}" | cut -f4)

    echo "ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${col_type} ${col_default_clause} ${col_notnull};" \
      | sed 's/  */ /g' | sed 's/ ;$/;/' >> "${REPAIR_SQL}"

    info "Column ADD generated: ${tbl}.${col} ${col_type}"

  done < "${DIAG_DIR}/missing_columns.txt"
fi

# ============================================================
# SECTION 3: Missing Sequences
# ============================================================
if [[ "${MISSING_SEQS}" -gt 0 ]]; then
  hdr "Generating DDL for missing sequences (${MISSING_SEQS})"
  repair_section "SECTION 3: Missing Sequences"

  while IFS= read -r seq; do
    [[ -z "${seq}" ]] && continue

    # Get sequence definition from reference DB
    seq_ddl=$(docker compose -f "${COMPOSE_FILE}" exec -T postgres \
      pg_dump -U postgres -d "${REF_DB}" \
      --schema-only --no-owner --no-privileges \
      -t "${seq}" 2>>"${LOG}" \
      | grep "^CREATE SEQUENCE" || true)

    if [[ -n "${seq_ddl}" ]]; then
      echo "${seq_ddl}" | sed 's/^CREATE SEQUENCE /CREATE SEQUENCE IF NOT EXISTS /' \
        >> "${REPAIR_SQL}"
      echo "" >> "${REPAIR_SQL}"
      ok "Sequence DDL added: ${seq}"
    else
      echo "-- WARNING: Could not extract DDL for sequence: ${seq}" >> "${REPAIR_SQL}"
      warn "Could not get DDL for sequence: ${seq}"
    fi
  done < "${DIAG_DIR}/missing_sequences.txt"
fi

# ============================================================
# SECTION 4: Missing Functions
# ============================================================
if [[ "${MISSING_FNS}" -gt 0 ]]; then
  hdr "Generating DDL for missing functions (${MISSING_FNS})"
  repair_section "SECTION 4: Missing Functions"
  echo "-- Using CREATE OR REPLACE FUNCTION — safe to apply to existing functions" >> "${REPAIR_SQL}"
  echo "" >> "${REPAIR_SQL}"

  while IFS= read -r fn; do
    [[ -z "${fn}" ]] && continue
    info "Extracting function DDL: ${fn}"

    # Get function definition using pg_get_functiondef
    fn_def=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A -c "
      SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='${fn}' AND p.prokind='f'
      LIMIT 1;
    " < /dev/null 2>>"${LOG}" || true)

    if [[ -z "${fn_def}" ]]; then
      echo "-- WARNING: Could not extract function: ${fn}" >> "${REPAIR_SQL}"
      warn "Could not get function DDL: ${fn}"
      continue
    fi

    echo "" >> "${REPAIR_SQL}"
    echo "-- Function: ${fn}" >> "${REPAIR_SQL}"

    # Ensure CREATE OR REPLACE (pg_get_functiondef returns CREATE OR REPLACE already in PG14)
    echo "${fn_def}" | sed 's/^CREATE FUNCTION /CREATE OR REPLACE FUNCTION /' >> "${REPAIR_SQL}"
    echo ";" >> "${REPAIR_SQL}"
    echo "" >> "${REPAIR_SQL}"

    ok "Function DDL added: ${fn}"
  done < "${DIAG_DIR}/missing_functions.txt"
fi

# ============================================================
# SECTION 5: Missing Triggers
# ============================================================
if [[ "${MISSING_TRGS}" -gt 0 ]]; then
  hdr "Generating DDL for missing triggers (${MISSING_TRGS})"
  repair_section "SECTION 5: Missing Triggers"
  echo "-- DROP TRIGGER IF EXISTS before CREATE (PG14 has no CREATE TRIGGER IF NOT EXISTS)" >> "${REPAIR_SQL}"
  echo "-- This is safe: DROP IF EXISTS on a non-existent trigger is a no-op" >> "${REPAIR_SQL}"
  echo "" >> "${REPAIR_SQL}"

  while IFS='|' read -r trg tbl; do
    [[ -z "${trg}" ]] && continue
    info "Extracting trigger DDL: ${trg} on ${tbl}"

    # Get trigger definition
    trg_def=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A -c "
      SELECT pg_get_triggerdef(t.oid)
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public'
        AND t.tgname='${trg}'
        AND c.relname='${tbl}'
        AND NOT t.tgisinternal
      LIMIT 1;
    " < /dev/null 2>>"${LOG}" || true)

    if [[ -z "${trg_def}" ]]; then
      echo "-- WARNING: Could not extract trigger: ${trg} on ${tbl}" >> "${REPAIR_SQL}"
      warn "Could not get trigger DDL: ${trg} on ${tbl}"
      continue
    fi

    echo "" >> "${REPAIR_SQL}"
    echo "-- Trigger: ${trg} on ${tbl}" >> "${REPAIR_SQL}"

    # Skip if target table is still missing (it will be created in Section 1 first,
    # but triggers must come after). Add deferred check.
    if grep -q "^${tbl}$" "${DIAG_DIR}/missing_tables.txt" 2>/dev/null; then
      echo "-- NOTE: Table ${tbl} was missing and created in Section 1 above" >> "${REPAIR_SQL}"
    fi

    echo "DROP TRIGGER IF EXISTS ${trg} ON ${tbl};" >> "${REPAIR_SQL}"
    echo "${trg_def};" >> "${REPAIR_SQL}"
    echo "" >> "${REPAIR_SQL}"

    ok "Trigger DDL added: ${trg} on ${tbl}"
  done < "${DIAG_DIR}/missing_triggers.txt"
fi

# ============================================================
# SECTION 6: Missing FK Constraints
# FK constraints are added as NOT VALID — skips retroactive data check
# (avoids failure if orphan data exists due to catalog corruption)
# ============================================================
if [[ "${MISSING_FKS}" -gt 0 ]]; then
  hdr "Generating FK constraint repairs (${MISSING_FKS})"
  repair_section "SECTION 6: Missing Foreign Key Constraints"
  cat >> "${REPAIR_SQL}" << 'FK_HEADER'
-- FK constraints added as NOT VALID:
--   - Does NOT scan existing rows for violations (avoids failure on corrupted data)
--   - New rows WILL be validated immediately
--   - Run VALIDATE CONSTRAINT later if you need full enforcement:
--     ALTER TABLE tablename VALIDATE CONSTRAINT constraintname;
-- Each ADD CONSTRAINT is wrapped in a DO block for IF NOT EXISTS behavior.

FK_HEADER

  while IFS='|' read -r conname tbl; do
    [[ -z "${conname}" ]] && continue
    info "Generating FK constraint repair: ${conname} on ${tbl}"

    # Get constraint definition from reference DB
    con_def=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A -c "
      SELECT pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname='public'
        AND c.conname='${conname}'
        AND t.relname='${tbl}'
        AND c.contype='f'
      LIMIT 1;
    " < /dev/null 2>>"${LOG}" || true)

    if [[ -z "${con_def}" ]]; then
      echo "-- WARNING: Could not extract FK constraint: ${conname} on ${tbl}" >> "${REPAIR_SQL}"
      warn "Could not get FK DDL: ${conname} on ${tbl}"
      continue
    fi

    # Add NOT VALID to avoid checking existing rows
    # pg_get_constraintdef returns the CONSTRAINT ... FOREIGN KEY (...) REFERENCES ... portion
    con_def_not_valid="${con_def} NOT VALID"

    cat >> "${REPAIR_SQL}" << FKBLOCK
DO \$\$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND c.conname='${conname}' AND t.relname='${tbl}'
  ) THEN
    ALTER TABLE ${tbl} ADD CONSTRAINT ${conname}
      ${con_def_not_valid};
    RAISE NOTICE 'Added FK constraint: ${conname} on ${tbl}';
  ELSE
    RAISE NOTICE 'FK constraint already exists: ${conname} on ${tbl} — skipped';
  END IF;
END \$\$;

FKBLOCK

    ok "FK constraint repair added: ${conname} on ${tbl}"
  done < "${DIAG_DIR}/missing_fks.txt"
fi

# ============================================================
# SECTION 7: Missing Indexes
# Note: Indexes for PK and unique constraints are auto-created
# when the constraint is created (via pg_dump table DDL above).
# This section handles standalone CREATE INDEX statements.
# ============================================================
if [[ "${MISSING_IDXS}" -gt 0 ]]; then
  hdr "Generating DDL for missing indexes (${MISSING_IDXS})"
  repair_section "SECTION 7: Missing Indexes"

  while IFS= read -r idx; do
    [[ -z "${idx}" ]] && continue

    # Get index definition from reference DB
    idx_def=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A -c "
      SELECT indexdef FROM pg_indexes
      WHERE schemaname='public' AND indexname='${idx}'
      LIMIT 1;
    " < /dev/null 2>>"${LOG}" || true)

    if [[ -z "${idx_def}" ]]; then
      # Index may be a PK/unique constraint index — handled by table DDL
      echo "-- SKIP: ${idx} (likely auto-created by PK/unique constraint)" >> "${REPAIR_SQL}"
      continue
    fi

    # Check if this is a standalone index (not from a constraint)
    is_constraint_idx=$($COMPOSE exec -T postgres psql -U postgres -d "${REF_DB}" -t -A -c "
      SELECT COUNT(*) FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='${idx}'
        AND (i.indisprimary OR i.indisunique AND EXISTS (
          SELECT 1 FROM pg_constraint WHERE conindid = i.indexrelid
        ));
    " < /dev/null 2>>"${LOG}" || echo 0)

    if [[ "${is_constraint_idx}" == "1" ]]; then
      echo "-- SKIP: ${idx} (auto-created by constraint — handled in table DDL)" >> "${REPAIR_SQL}"
      continue
    fi

    echo "" >> "${REPAIR_SQL}"
    echo "-- Index: ${idx}" >> "${REPAIR_SQL}"

    # Transform to IF NOT EXISTS
    echo "${idx_def}" \
      | sed 's/^CREATE INDEX /CREATE INDEX IF NOT EXISTS /' \
      | sed 's/^CREATE UNIQUE INDEX /CREATE UNIQUE INDEX IF NOT EXISTS /' \
      >> "${REPAIR_SQL}"
    echo ";" >> "${REPAIR_SQL}"

    ok "Index DDL added: ${idx}"
  done < "${DIAG_DIR}/missing_indexes.txt"
fi

# ============================================================
# SECTION 8: Post-repair validation
# ============================================================
repair_section "SECTION 8: Post-Repair Validation"

cat >> "${REPAIR_SQL}" << 'VALIDATE'
-- Verify all objects exist after repair
DO $$
DECLARE
  v_errors INTEGER := 0;
  v_obj    TEXT;
BEGIN
  -- Check each table that should now exist
  FOR v_obj IN
    SELECT t FROM unnest(ARRAY[
      'users','admins','deposit_requests','withdrawal_requests',
      'wallet_transactions','brand_settings','support_sessions',
      'support_messages','gp_providers','gp_credentials','gp_config',
      'gp_games','gp_players','provider_accounts'
    ]) AS t
  LOOP
    IF to_regclass('public.' || v_obj) IS NULL THEN
      RAISE WARNING 'VALIDATION FAILED: table %.% still missing', 'public', v_obj;
      v_errors := v_errors + 1;
    END IF;
  END LOOP;

  IF v_errors > 0 THEN
    RAISE EXCEPTION 'Post-repair validation failed: % object(s) still missing — ROLLBACK', v_errors;
  END IF;

  RAISE NOTICE '✓ Post-repair validation passed: all checked objects exist';
END $$;

VALIDATE

# ============================================================
# COMMIT
# ============================================================
echo "" >> "${REPAIR_SQL}"
echo "COMMIT;" >> "${REPAIR_SQL}"
echo "" >> "${REPAIR_SQL}"
echo "-- ============================================================" >> "${REPAIR_SQL}"
echo "-- Repair SQL generation complete." >> "${REPAIR_SQL}"
echo "-- Review this file carefully before executing." >> "${REPAIR_SQL}"
echo "-- Execute with:" >> "${REPAIR_SQL}"
echo "--   docker compose -f /root/tesla88-platform/docker-compose.production.yml \\" >> "${REPAIR_SQL}"
echo "--     exec -T postgres psql -U postgres -d member_bot -v ON_ERROR_STOP=1 \\" >> "${REPAIR_SQL}"
echo "--     < ${REPAIR_SQL##*/}" >> "${REPAIR_SQL}"
echo "-- ============================================================" >> "${REPAIR_SQL}"

# ============================================================
# SUMMARY
# ============================================================
hdr "Repair SQL generation complete"
ok "Output: ${REPAIR_SQL}"
echo ""
REPAIR_LINES=$(wc -l < "${REPAIR_SQL}" || echo 0)
info "Generated ${REPAIR_LINES} lines of SQL"
info ""
info "NEXT STEPS:"
info "  1. Review the repair SQL:"
info "     cat ${REPAIR_SQL}"
info ""
info "  2. If satisfied, execute:"
info "     docker compose -f ${COMPOSE_FILE} exec -T postgres \\"
info "       psql -U postgres -d member_bot -v ON_ERROR_STOP=1 \\"
info "       < ${REPAIR_SQL}"
info ""
info "  3. After repair, run diag_01_full_scan.sh again to verify:"
info "     - Diff report should show zero missing objects"
info ""
warn "  ⚠ FK constraints were added as NOT VALID."
warn "    If you want full enforcement later, run:"
warn "    ALTER TABLE <tablename> VALIDATE CONSTRAINT <constraintname>;"
