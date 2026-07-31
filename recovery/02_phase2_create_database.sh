#!/bin/bash
# ============================================================
# Phase 2: Create member_bot_new and run all 88 migrations
# Does NOT touch member_bot — idempotent
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
NEW_DB="member_bot_new"
LOG="${BACKUP_DIR}/logs/phase2_create_$(date +%Y%m%d_%H%M%S).log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " Phase 2: Create ${NEW_DB} and Run Migrations               " | tee -a "${LOG}"
echo " Start: $(date)                                              " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# PRE-FLIGHT: Verify Phase 1 completed
# ============================================================
hdr "Pre-flight checks"

source "${CHECKPOINT}" 2>/dev/null \
  || fail "Checkpoint file not found. Run 01_phase1_export.sh first."
[[ -n "${PHASE1_COMPLETE:-}" ]] \
  || fail "Phase 1 not completed. Run 01_phase1_export.sh first."
ok "Phase 1 checkpoint verified (completed: ${PHASE1_DATE:-unknown})"

cd "${PLATFORM_DIR}"
POSTGRES_USER=$(grep '^POSTGRES_USER' .env | cut -d= -f2 | tr -d '\r')
POSTGRES_PASSWORD=$(grep '^POSTGRES_PASSWORD' .env | cut -d= -f2 | tr -d '\r')
[[ -n "${POSTGRES_USER}" ]]    || fail "POSTGRES_USER not found in .env"
[[ -n "${POSTGRES_PASSWORD}" ]] || fail "POSTGRES_PASSWORD not found in .env"
ok "Credentials loaded: user=${POSTGRES_USER}"

# ============================================================
# STEP 1: Create member_bot_new (idempotent)
# ============================================================
hdr "Step 1: Creating ${NEW_DB}"

EXISTING=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='${NEW_DB}';" 2>/dev/null || echo 0)

NEED_MIGRATE=true

if [[ "${EXISTING}" == "1" ]]; then
  warn "${NEW_DB} already exists — checking state..."
  TABLE_COUNT=$($COMPOSE exec -T postgres psql -U postgres -d "${NEW_DB}" -t -A \
    -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo 0)
  MIGRATION_COUNT=$($COMPOSE exec -T postgres psql -U postgres -d "${NEW_DB}" -t -A \
    -c "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null || echo 0)

  if [[ "${TABLE_COUNT}" -ge 80 && "${MIGRATION_COUNT}" -ge 80 ]]; then
    warn "${NEW_DB} already has ${TABLE_COUNT} tables and ${MIGRATION_COUNT} migrations."
    warn "Skipping CREATE DATABASE and migration — already complete."
    warn "If you need a fresh start: DROP DATABASE ${NEW_DB}; re-run this script."
    NEED_MIGRATE=false
  else
    warn "${NEW_DB} exists but is incomplete (tables=${TABLE_COUNT}, migrations=${MIGRATION_COUNT})."
    warn "Dropping and recreating ${NEW_DB}..."
    $COMPOSE exec -T postgres psql -U postgres \
      -c "DROP DATABASE ${NEW_DB};" >> "${LOG}" 2>&1 \
      || fail "Cannot drop incomplete ${NEW_DB}"
    EXISTING="0"
  fi
fi

if [[ "${EXISTING}" == "0" ]]; then
  info "Creating ${NEW_DB}..."
  $COMPOSE exec -T postgres psql -U postgres \
    -c "
      CREATE DATABASE ${NEW_DB}
        TEMPLATE template0
        ENCODING 'UTF8'
        LC_COLLATE 'en_US.utf-8'
        LC_CTYPE 'en_US.utf-8';
    " >> "${LOG}" 2>&1 \
    || fail "Failed to create ${NEW_DB}"
  ok "${NEW_DB} created"
  NEED_MIGRATE=true
fi

# ============================================================
# STEP 2: Run all 88 migrations against member_bot_new
# Uses --no-deps to avoid starting other services
# Bootstrap mode will NOT trigger: brand_settings does not exist yet
# ============================================================
if [[ "${NEED_MIGRATE}" == "true" ]]; then
  hdr "Step 2: Running migrations against ${NEW_DB}"
  info "DATABASE_URL → postgresql://${POSTGRES_USER}:***@postgres:5432/${NEW_DB}"

  $COMPOSE run --rm \
    -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${NEW_DB}" \
    migrate 2>&1 | tee -a "${LOG}" \
    || fail "Migration failed. Check ${LOG} for details."
  ok "All migrations completed"
else
  info "Skipping migration (already applied)"
fi

# ============================================================
# STEP 3: Validate schema integrity
# ============================================================
hdr "Step 3: Schema validation"

TABLE_COUNT=$($COMPOSE exec -T postgres psql -U postgres -d "${NEW_DB}" -t -A \
  -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public';")
info "${NEW_DB} table count: ${TABLE_COUNT}"
[[ "${TABLE_COUNT}" -ge 80 ]] \
  || fail "Expected ≥80 tables, found ${TABLE_COUNT}. Migration may have failed."
ok "Table count: ${TABLE_COUNT} ≥ 80"

MIGRATION_COUNT=$($COMPOSE exec -T postgres psql -U postgres -d "${NEW_DB}" -t -A \
  -c "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null || echo 0)
info "schema_migrations records: ${MIGRATION_COUNT}"
[[ "${MIGRATION_COUNT}" -ge 80 ]] \
  || fail "Expected ≥80 migration records, found ${MIGRATION_COUNT}."
ok "Migration records: ${MIGRATION_COUNT} ≥ 80"

# Verify 4 previously-missing tables now exist
info "Checking previously-missing tables..."
MISSING_CHECK_FAIL=0
for missing_table in gp_providers support_sessions support_messages provider_accounts; do
  EXISTS=$($COMPOSE exec -T postgres psql -U postgres -d "${NEW_DB}" -t -A \
    -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public' AND tablename='${missing_table}';")
  if [[ "${EXISTS}" == "1" ]]; then
    ok "${missing_table} → EXISTS in ${NEW_DB} (empty, ready for data)"
  else
    warn "${missing_table} NOT found in ${NEW_DB}"
    MISSING_CHECK_FAIL=$((MISSING_CHECK_FAIL+1))
  fi
done
[[ "${MISSING_CHECK_FAIL}" -eq 0 ]] \
  || fail "${MISSING_CHECK_FAIL} expected tables missing from ${NEW_DB}. Migration issue."

# ============================================================
# STEP 4: pg_dump catalog test (CRITICAL)
# This is the definitive proof that member_bot_new has a clean catalog
# ============================================================
hdr "Step 4: pg_dump catalog integrity test"

info "Running pg_dump --schema-only on ${NEW_DB}..."
$COMPOSE exec -T postgres \
  pg_dump -U postgres -d "${NEW_DB}" --schema-only --format=plain \
  -f /tmp/phase2_schema_test.sql >> "${LOG}" 2>&1 \
  || fail "pg_dump FAILED on ${NEW_DB}! Catalog is corrupt — do NOT proceed to Phase 3."

SCHEMA_LINES=$(wc -l < <($COMPOSE exec -T postgres cat /tmp/phase2_schema_test.sql))
ok "pg_dump succeeded — ${NEW_DB} catalog is clean (${SCHEMA_LINES} lines)"

# ============================================================
# SUMMARY
# ============================================================
echo "" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
echo " Phase 2 Summary                                            " | tee -a "${LOG}"
echo "  Database:   ${NEW_DB}                                     " | tee -a "${LOG}"
echo "  Tables:     ${TABLE_COUNT}                                " | tee -a "${LOG}"
echo "  Migrations: ${MIGRATION_COUNT}                            " | tee -a "${LOG}"
echo "  pg_dump:    PASSED                                        " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# Write checkpoint
{
  echo "PHASE2_COMPLETE=$(date +%s)"
  echo "PHASE2_DATE=$(date)"
  echo "NEW_DB_TABLE_COUNT=${TABLE_COUNT}"
  echo "POSTGRES_USER=${POSTGRES_USER}"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
} >> "${CHECKPOINT}"

ok "PHASE 2 COMPLETE"
ok "CHECKPOINT 2 PASSED — Safe to run 03_phase3_restore.sh"
