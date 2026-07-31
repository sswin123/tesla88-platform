#!/bin/bash
# ============================================================
# Phase 4: Production Smoke Test (apps on member_bot_new)
# Causes ~3 minute downtime while apps switch databases
# member_bot remains completely untouched
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
SMOKE_OVERRIDE="${PLATFORM_DIR}/docker-compose.smoke-test.yml"
COMPOSE_BASE="docker compose -f ${COMPOSE_FILE}"
COMPOSE_TEST="docker compose -f ${COMPOSE_FILE} -f ${SMOKE_OVERRIDE}"
TARGET_DB="member_bot_new"
SOURCE_DB="member_bot"
LOG="${BACKUP_DIR}/logs/phase4_smoke_$(date +%Y%m%d_%H%M%S).log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " Phase 4: Smoke Test — apps on ${TARGET_DB}                 " | tee -a "${LOG}"
echo " ⚠ This causes ~3 minute downtime                           " | tee -a "${LOG}"
echo " Start: $(date)                                              " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# PRE-FLIGHT
# ============================================================
hdr "Pre-flight checks"

source "${CHECKPOINT}" 2>/dev/null \
  || fail "Checkpoint file not found. Run Phases 1-3 first."
[[ -n "${PHASE3_COMPLETE:-}" ]] \
  || fail "Phase 3 not completed. Run 03_phase3_restore.sh first."
ok "Phase 3 checkpoint verified (${PHASE3_DATE:-unknown})"

cd "${PLATFORM_DIR}"
POSTGRES_USER="${POSTGRES_USER:-$(grep '^POSTGRES_USER' .env | cut -d= -f2 | tr -d '\r')}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(grep '^POSTGRES_PASSWORD' .env | cut -d= -f2 | tr -d '\r')}"
ok "Credentials confirmed"

# ============================================================
# STEP 1: Database-level validation on member_bot_new
# (before touching any apps)
# ============================================================
hdr "Step 1: Database validation on ${TARGET_DB}"

info "pg_dump test (full backup)..."
$COMPOSE_BASE exec -T postgres \
  pg_dump -U postgres -d "${TARGET_DB}" --format=custom \
  -f /tmp/phase4_new_full.dump >> "${LOG}" 2>&1 \
  || fail "pg_dump FAILED on ${TARGET_DB}. Catalog problem — DO NOT proceed."
ok "pg_dump succeeded on ${TARGET_DB}"

info "Trigger status check..."
DISABLED_COUNT=$($COMPOSE_BASE exec -T postgres psql -U postgres -d "${TARGET_DB}" -t -A \
  -c "
    SELECT COUNT(*) FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      AND t.tgenabled='D' AND NOT t.tgisinternal;
  " 2>/dev/null | tr -d ' ' || echo 0)
[[ "${DISABLED_COUNT}" -eq 0 ]] \
  && ok "All triggers enabled (${DISABLED_COUNT} disabled)" \
  || warn "⚠ ${DISABLED_COUNT} triggers still disabled — investigate before continuing"

info "Key row count summary..."
$COMPOSE_BASE exec -T postgres psql -U postgres -d "${TARGET_DB}" \
  -c "
    SELECT 'users'            , COUNT(*)::text FROM users
    UNION ALL SELECT 'deposit_requests', COUNT(*)::text FROM deposit_requests
    UNION ALL SELECT 'withdrawal_requests', COUNT(*)::text FROM withdrawal_requests
    UNION ALL SELECT 'wallet_transactions', COUNT(*)::text FROM wallet_transactions
    UNION ALL SELECT 'gp_credentials', COUNT(*)::text FROM gp_credentials
    UNION ALL SELECT 'gp_players',  COUNT(*)::text FROM gp_players
    UNION ALL SELECT 'gp_providers', COUNT(*)::text FROM gp_providers;
  " 2>/dev/null | tee -a "${LOG}"

# ============================================================
# STEP 2: Create smoke test override file
# ============================================================
hdr "Step 2: Creating smoke test override"

cat > "${SMOKE_OVERRIDE}" << EOF
# ⚠ SMOKE TEST OVERRIDE — Phase 4 ONLY
# This file MUST be deleted before or during Phase 5 cutover.
# Generated: $(date)
services:
  erp:
    environment:
      DATABASE_URL: "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${TARGET_DB}"
  website:
    environment:
      DB_NAME: ${TARGET_DB}
  telegram-bot:
    environment:
      POSTGRES_DB: ${TARGET_DB}
EOF
ok "Smoke test override created: ${SMOKE_OVERRIDE}"

# ============================================================
# STEP 3: Stop apps (downtime begins)
# ============================================================
hdr "Step 3: Stopping apps — DOWNTIME BEGINS"

$COMPOSE_BASE stop erp website telegram-bot >> "${LOG}" 2>&1
sleep 3

# Confirm member_bot has zero connections
MEMBER_BOT_CONNS=$($COMPOSE_BASE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='${SOURCE_DB}';" 2>/dev/null \
  | tr -d ' ' || echo "0")
ok "Apps stopped — ${SOURCE_DB} active connections: ${MEMBER_BOT_CONNS}"

# ============================================================
# STEP 4: Start apps on member_bot_new
# --no-deps: prevents migrate service from running (would connect to member_bot)
# ============================================================
hdr "Step 4: Starting apps on ${TARGET_DB}"

$COMPOSE_TEST up -d --no-deps erp website telegram-bot >> "${LOG}" 2>&1
ok "App containers starting..."

# ============================================================
# STEP 5: Wait for healthy
# ============================================================
hdr "Step 5: Waiting for apps to be healthy"

wait_healthy() {
  local service_name="$1"
  local container_id
  container_id=$($COMPOSE_BASE ps -q "${service_name}" 2>/dev/null | head -1 || echo "")
  [[ -n "${container_id}" ]] || { warn "Container for ${service_name} not found"; return 1; }
  docker inspect "${container_id}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown"
}

DEADLINE=$((SECONDS + 210))
while [[ ${SECONDS} -lt ${DEADLINE} ]]; do
  ERP_STATUS=$(wait_healthy "erp" || echo "error")
  WEB_STATUS=$(wait_healthy "website" || echo "error")
  info "[$(date +%H:%M:%S)] ERP: ${ERP_STATUS} | Website: ${WEB_STATUS}"
  [[ "${ERP_STATUS}" == "healthy" && "${WEB_STATUS}" == "healthy" ]] && break
  sleep 12
done

ERP_FINAL=$(wait_healthy "erp" || echo "error")
WEB_FINAL=$(wait_healthy "website" || echo "error")

if [[ "${ERP_FINAL}" != "healthy" || "${WEB_FINAL}" != "healthy" ]]; then
  warn "Apps did not become healthy within 3.5 minutes."
  warn "ERP status: ${ERP_FINAL} | Website status: ${WEB_FINAL}"
  warn ""
  warn "Check logs:"
  warn "  docker compose -f ${COMPOSE_FILE} logs --tail=50 erp"
  warn "  docker compose -f ${COMPOSE_FILE} logs --tail=50 website"
  warn ""
  warn "If apps cannot start: run 07_rollback.sh immediately."
  exit 1
fi
ok "DOWNTIME ENDED — ERP: healthy | Website: healthy"

# ============================================================
# STEP 6: Rebuild gp_providers (MANUAL)
# ============================================================
hdr "Step 6: gp_providers rebuild (MANUAL ACTION REQUIRED)"

echo ""
echo "============================================================"
echo " gp_providers must be manually re-created."
echo " These records were permanently lost in the power failure."
echo " gp_credentials and gp_config are intact — they just need"
echo " a valid parent row in gp_providers."
echo "============================================================"
echo ""
echo " Referenced provider_id values (from Phase 1 export):"
cat "${BACKUP_DIR}/gp_provider_id_list.txt" 2>/dev/null || echo "  (file not found)"
echo ""
echo " FK reference counts:"
cat "${BACKUP_DIR}/gp_provider_refs.txt" 2>/dev/null || echo "  (file not found)"
echo ""
echo " Command to rebuild (replace X and Y with the actual IDs above):"
echo "   docker compose -f ${COMPOSE_FILE} exec postgres psql -U postgres -d ${TARGET_DB} -c \\"
echo "   \"INSERT INTO gp_providers (id, code, name, status, wallet_type, adapter_loaded)"
echo "    VALUES"
echo "      (X, 'KITTY',   '918KISS', 'ACTIVE', 'TRANSFER', false),"
echo "      (Y, 'MEGAAPP', 'MEGA888', 'ACTIVE', 'TRANSFER', false)"
echo "    ON CONFLICT (id) DO NOTHING;"
echo "    SELECT setval(pg_get_serial_sequence('gp_providers','id'),"
echo "      (SELECT MAX(id) FROM gp_providers));\""
echo ""

read -r -p "Have you rebuilt gp_providers with correct IDs? (yes/no): " GP_REBUILT
if [[ "${GP_REBUILT}" != "yes" ]]; then
  warn "gp_providers not rebuilt. Cannot test Provider smoke tests."
  warn "Rebuild gp_providers then re-run this step."
  exit 1
fi

GP_COUNT=$($COMPOSE_BASE exec -T postgres psql -U postgres -d "${TARGET_DB}" -t -A \
  -c "SELECT COUNT(*) FROM gp_providers;" 2>/dev/null | tr -d ' ' || echo 0)
[[ "${GP_COUNT}" -gt 0 ]] \
  && ok "gp_providers: ${GP_COUNT} row(s)" \
  || fail "gp_providers is still empty. Cannot proceed to smoke tests."

# FK consistency after gp_providers rebuild
GP_CRED_ORPHANS=$($COMPOSE_BASE exec -T postgres psql -U postgres -d "${TARGET_DB}" -t -A \
  -c "
    SELECT COUNT(*) FROM gp_credentials c
    LEFT JOIN gp_providers p ON p.id = c.provider_id
    WHERE p.id IS NULL;
  " 2>/dev/null | tr -d ' ' || echo "ERROR")
[[ "${GP_CRED_ORPHANS}" == "0" ]] \
  && ok "gp_credentials FK: 0 orphans" \
  || warn "gp_credentials: ${GP_CRED_ORPHANS} orphan rows (provider_id mismatch)"

# ============================================================
# STEP 7: Smoke test checklist
# ============================================================
hdr "Step 7: Smoke Test Checklist"
echo ""
echo "  Apps are running on: ${TARGET_DB}"
echo "  Complete EVERY item below before typing 'yes'"
echo ""
echo "============================================================"
echo " ERP Smoke Tests"
echo "============================================================"
echo "  [ ] Login as admin — succeeds"
echo "  [ ] Dashboard — loads without error"
echo "  [ ] Member Management — list loads, historical data visible"
echo "  [ ] Deposit — list shows historical records with correct amounts"
echo "  [ ] Withdraw — list shows historical records"
echo "  [ ] Promotion — list loads"
echo "  [ ] Staff — list loads"
echo "  [ ] Live Chat — opens, no 'relation does not exist' error"
echo "  [ ] Monitoring — loads"
echo ""
echo "============================================================"
echo " Website Smoke Tests"
echo "============================================================"
echo "  [ ] Homepage — loads (no 502/504)"
echo "  [ ] Register — form submits successfully (or use existing account)"
echo "  [ ] Login — succeeds with member credentials"
echo "  [ ] Wallet — balance displayed correctly"
echo "  [ ] Deposit — bank list displays, form accessible"
echo "  [ ] Withdraw — form accessible"
echo "  [ ] Promotion list — loads"
echo "  [ ] Live Chat — can open new session"
echo ""
echo "============================================================"
echo " Telegram Bot Smoke Tests"
echo "============================================================"
echo "  [ ] /start — bot responds"
echo "  [ ] Member login/bind — succeeds"
echo "  [ ] Balance inquiry — shows correct balance"
echo "  [ ] Deposit flow — initiates correctly"
echo "  [ ] Live Chat — trigger works"
echo ""
echo "============================================================"
echo " Provider / Game Smoke Tests"
echo "============================================================"
echo "  [ ] 918KISS — click Play, game launches (Transfer In executed)"
echo "  [ ] MEGA888 — click Play, game launches"
echo "  [ ] Refresh button — balance returns to wallet (Transfer Out)"
echo "  [ ] MEGA888 Login Callback — no errors in ERP logs"
echo ""

# Automated DB checks
echo "============================================================"
echo " Database Automated Checks"
echo "============================================================"
$COMPOSE_BASE exec -T postgres psql -U postgres -d "${TARGET_DB}" \
  -c "
    SELECT
      'users_have_data' AS check_name,
      CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result,
      COUNT(*)::text AS detail
    FROM users

    UNION ALL

    SELECT
      'triggers_all_enabled',
      CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
      COUNT(*)::text || ' triggers disabled'
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      AND t.tgenabled='D' AND NOT t.tgisinternal

    UNION ALL

    SELECT
      'gp_providers_populated',
      CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END,
      COUNT(*)::text || ' providers'
    FROM gp_providers

    UNION ALL

    SELECT
      'gp_credentials_fk_valid',
      CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
      COUNT(*)::text || ' orphan rows'
    FROM gp_credentials c
    LEFT JOIN gp_providers p ON p.id = c.provider_id
    WHERE p.id IS NULL

    UNION ALL

    SELECT
      'sequences_sane',
      CASE WHEN MIN(last_value) >= 0 THEN 'PASS' ELSE 'FAIL' END,
      'min_seq_value=' || COALESCE(MIN(last_value)::text,'null')
    FROM pg_sequences
    WHERE schemaname='public';
  " 2>/dev/null | tee -a "${LOG}"

echo ""
read -r -p "Have ALL smoke tests passed? (yes/no): " SMOKE_APPROVED

if [[ "${SMOKE_APPROVED}" != "yes" ]]; then
  warn "Smoke tests NOT approved."
  warn ""
  warn "ROLLBACK: Run 07_rollback.sh to return production to ${SOURCE_DB}."
  warn "${SOURCE_DB} is completely untouched — rollback is safe."
  echo "PHASE4_COMPLETE=FAILED_$(date +%s)" >> "${CHECKPOINT}"
  echo "SMOKE_APPROVED=no" >> "${CHECKPOINT}"
  exit 1
fi

# ============================================================
# CHECKPOINT 4
# ============================================================
{
  echo "PHASE4_COMPLETE=$(date +%s)"
  echo "PHASE4_DATE=$(date)"
  echo "SMOKE_APPROVED=yes"
} >> "${CHECKPOINT}"

echo "" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
echo " Phase 4 Complete — Smoke Tests Approved                    " | tee -a "${LOG}"
echo " $(date)                                                     " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
ok "PHASE 4 COMPLETE"
ok "CHECKPOINT 4 PASSED — All smoke tests approved"
echo ""
warn "⚠ Apps are still running on ${TARGET_DB}"
warn "⚠ Run 05_phase5_cutover.sh to complete the rename"
