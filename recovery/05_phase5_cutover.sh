#!/bin/bash
# ============================================================
# Phase 5: Atomic Database Rename (Cutover)
# Requires smoke test approval (SMOKE_APPROVED=yes in checkpoint)
# Causes ~30 second downtime
# After this: member_bot = new clean DB | member_bot_old = original
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
SMOKE_OVERRIDE="${PLATFORM_DIR}/docker-compose.smoke-test.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
LOG="${BACKUP_DIR}/logs/phase5_cutover_$(date +%Y%m%d_%H%M%S).log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " Phase 5: Database Cutover                                   " | tee -a "${LOG}"
echo " Start: $(date)                                              " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# PRE-FLIGHT: Verify smoke test was approved
# ============================================================
hdr "Pre-flight: Verifying smoke test approval"

source "${CHECKPOINT}" 2>/dev/null \
  || fail "Checkpoint file not found."
[[ -n "${PHASE4_COMPLETE:-}" ]] \
  || fail "Phase 4 not completed. Run 04_phase4_smoketest.sh first."
[[ "${SMOKE_APPROVED:-no}" == "yes" ]] \
  || fail "Smoke tests NOT approved. ABORT. Run 07_rollback.sh if needed."
ok "Smoke test approval confirmed (${PHASE4_DATE:-unknown})"

# Verify member_bot and member_bot_new both exist
DB_LIST=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT datname FROM pg_database WHERE datname LIKE 'member_bot%' ORDER BY datname;")
echo "${DB_LIST}" | grep -q "^member_bot$" \
  || fail "member_bot not found — unexpected state"
echo "${DB_LIST}" | grep -q "^member_bot_new$" \
  || fail "member_bot_new not found — unexpected state"
! echo "${DB_LIST}" | grep -q "^member_bot_old$" \
  || { warn "member_bot_old already exists — previous cutover attempt?"; \
       warn "If this is a re-attempt, verify state carefully before proceeding."; }
ok "Pre-rename state confirmed: member_bot + member_bot_new exist"

# ============================================================
# FINAL CONFIRMATION (requires typing 'CUTOVER')
# ============================================================
echo ""
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║  FINAL CUTOVER CONFIRMATION                          ║"
echo "  ║                                                       ║"
echo "  ║  member_bot     → member_bot_old  (original, kept)   ║"
echo "  ║  member_bot_new → member_bot      (new clean DB)     ║"
echo "  ║                                                       ║"
echo "  ║  Downtime: ~30 seconds                                ║"
echo "  ║  Rollback: available via 07_rollback.sh               ║"
echo "  ║  member_bot_old retained for 7 days minimum          ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo ""
read -r -p "  Type 'CUTOVER' to confirm: " CONFIRM
[[ "${CONFIRM}" == "CUTOVER" ]] || fail "Cutover not confirmed. Aborting safely."
echo "" | tee -a "${LOG}"
echo "  Cutover confirmed at $(date)" | tee -a "${LOG}"

# ============================================================
# STEP 1: Stop apps
# ============================================================
hdr "Step 1: Stopping apps — DOWNTIME BEGINS"

$COMPOSE stop erp website telegram-bot >> "${LOG}" 2>&1
ok "Apps stopped"

# ============================================================
# STEP 2: Terminate all database connections
# ============================================================
hdr "Step 2: Terminating all database connections"

$COMPOSE exec -T postgres psql -U postgres << 'EOSQL' >> "${LOG}" 2>&1
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('member_bot', 'member_bot_new')
  AND pid <> pg_backend_pid();
EOSQL
sleep 2

REMAINING=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_stat_activity
      WHERE datname IN ('member_bot','member_bot_new');" 2>/dev/null || echo 0)
info "Remaining connections after termination: ${REMAINING}"

# ============================================================
# STEP 3: Execute the two-step rename
# Note: Two separate ALTER DATABASE commands — minimal window between them.
# If system crashes between the two: both DBs still intact, 07_rollback.sh handles it.
# ============================================================
hdr "Step 3: Executing database rename"

RENAME_START=$(date +%s)

$COMPOSE exec -T postgres psql -U postgres << 'EOSQL' >> "${LOG}" 2>&1
ALTER DATABASE member_bot     RENAME TO member_bot_old;
ALTER DATABASE member_bot_new RENAME TO member_bot;
EOSQL

RENAME_END=$(date +%s)
RENAME_DURATION=$((RENAME_END - RENAME_START))
info "Rename completed in ${RENAME_DURATION} seconds"

# Verify rename result
DB_LIST=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT datname FROM pg_database WHERE datname LIKE 'member_bot%' ORDER BY datname;")
info "Post-rename databases: $(echo "${DB_LIST}" | tr '\n' ' ')"

echo "${DB_LIST}" | grep -q "^member_bot$" \
  || fail "member_bot not found after rename! Run 07_rollback.sh immediately."
echo "${DB_LIST}" | grep -q "^member_bot_old$" \
  || fail "member_bot_old not found after rename!"
! echo "${DB_LIST}" | grep -q "^member_bot_new$" \
  || warn "member_bot_new still exists — unexpected, investigate"

ok "Rename verified: member_bot (new) + member_bot_old (original backup)"

# ============================================================
# STEP 4: Remove smoke test override file
# ============================================================
hdr "Step 4: Removing smoke test override"

if [[ -f "${SMOKE_OVERRIDE}" ]]; then
  rm -f "${SMOKE_OVERRIDE}"
  ok "docker-compose.smoke-test.yml removed"
else
  info "docker-compose.smoke-test.yml already absent (OK)"
fi

# ============================================================
# STEP 5: Start apps with original config
# DATABASE_URL / DB_NAME / POSTGRES_DB now all point to 'member_bot'
# which is the renamed new clean database
# ============================================================
hdr "Step 5: Restarting apps — DOWNTIME ENDS"

$COMPOSE up -d --no-deps erp website telegram-bot >> "${LOG}" 2>&1
ok "Apps starting with original config → member_bot (new clean DB)"

# Wait for healthy
wait_healthy() {
  local service_name="$1"
  local container_id
  container_id=$($COMPOSE ps -q "${service_name}" 2>/dev/null | head -1 || echo "")
  [[ -n "${container_id}" ]] || { echo "unknown"; return; }
  docker inspect "${container_id}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown"
}

DEADLINE=$((SECONDS + 150))
while [[ ${SECONDS} -lt ${DEADLINE} ]]; do
  ERP_STATUS=$(wait_healthy "erp")
  WEB_STATUS=$(wait_healthy "website")
  info "[$(date +%H:%M:%S)] ERP: ${ERP_STATUS} | Website: ${WEB_STATUS}"
  [[ "${ERP_STATUS}" == "healthy" && "${WEB_STATUS}" == "healthy" ]] && break
  sleep 10
done

ERP_FINAL=$(wait_healthy "erp")
WEB_FINAL=$(wait_healthy "website")
[[ "${ERP_FINAL}" == "healthy" ]] \
  && ok "ERP: healthy" \
  || warn "ERP: ${ERP_FINAL} — check logs: docker compose logs --tail=50 erp"
[[ "${WEB_FINAL}" == "healthy" ]] \
  && ok "Website: healthy" \
  || warn "Website: ${WEB_FINAL}"

# ============================================================
# STEP 6: pg_dump against member_bot post-rename
# REQUIREMENT 6: Recovery is only successful if pg_dump succeeds
# ============================================================
hdr "Step 6: pg_dump verification (Requirement 6)"

DUMP_TIME=$(date +%Y%m%d_%H%M%S)
info "Running pg_dump against member_bot (post-rename)..."

$COMPOSE exec -T postgres \
  pg_dump -U postgres -d member_bot --format=custom \
  -f "/tmp/phase5_final_${DUMP_TIME}.dump" >> "${LOG}" 2>&1 \
  || fail "pg_dump FAILED on member_bot after rename! CRITICAL — run 07_rollback.sh."

# Copy dump to backup directory
PGID=$(docker compose -f "${COMPOSE_FILE}" ps -q postgres | head -1 | tr -d '\n')
if [[ -n "${PGID}" ]]; then
  docker cp "${PGID}:/tmp/phase5_final_${DUMP_TIME}.dump" \
    "${BACKUP_DIR}/member_bot_final_${DUMP_TIME}.dump" >> "${LOG}" 2>&1 || true
fi

ok "pg_dump SUCCEEDED — recovery verified (Requirement 6 satisfied)"
info "Dump: ${BACKUP_DIR}/member_bot_final_${DUMP_TIME}.dump"

# ============================================================
# STEP 7: Connection verification
# ============================================================
hdr "Step 7: Verifying app connections"

sleep 8
MEMBER_CONNS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='member_bot';" 2>/dev/null || echo 0)
info "member_bot active connections: ${MEMBER_CONNS}"
[[ "${MEMBER_CONNS}" -gt 0 ]] \
  && ok "Applications connected to member_bot" \
  || warn "No connections yet — apps may still be starting"

# ============================================================
# CHECKPOINT 5
# ============================================================
CUTOVER_EPOCH=$(date +%s)
{
  echo "PHASE5_COMPLETE=${CUTOVER_EPOCH}"
  echo "PHASE5_DATE=$(date)"
  echo "CUTOVER_EPOCH=${CUTOVER_EPOCH}"
} >> "${CHECKPOINT}"

RETAIN_UNTIL=$(date -d "@$((CUTOVER_EPOCH + 604800))" '+%Y-%m-%d' 2>/dev/null \
  || date -v+7d '+%Y-%m-%d' 2>/dev/null || echo "(7 days from now)")

echo "" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
echo " CUTOVER COMPLETE                                            " | tee -a "${LOG}"
echo " Time: $(date)                                               " | tee -a "${LOG}"
echo " member_bot     = NEW clean database (production)           " | tee -a "${LOG}"
echo " member_bot_old = ORIGINAL database (backup)                " | tee -a "${LOG}"
echo " Retain member_bot_old until: ${RETAIN_UNTIL}               " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
ok "PHASE 5 COMPLETE"
ok "CHECKPOINT 5 PASSED — Recovery successful"
echo ""
warn "⚠ DO NOT delete member_bot_old before ${RETAIN_UNTIL} (7-day minimum)"
warn "→ Run 06_phase6_postcheck.sh for monitoring"
