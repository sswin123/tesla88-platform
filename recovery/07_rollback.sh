#!/bin/bash
# ============================================================
# Emergency Rollback Script
# Automatically detects current state and takes correct action
# Safe to run at any point during recovery
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
SMOKE_OVERRIDE="${PLATFORM_DIR}/docker-compose.smoke-test.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
LOG="${BACKUP_DIR}/logs/rollback_$(date +%Y%m%d_%H%M%S).log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " EMERGENCY ROLLBACK                                          " | tee -a "${LOG}"
echo " $(date)                                                     " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# STEP 1: Detect current database state
# ============================================================
hdr "Step 1: Detecting current state"

DB_RAW=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT datname FROM pg_database WHERE datname LIKE 'member_bot%' ORDER BY datname;" \
  2>/dev/null || echo "CANNOT_CONNECT")

if [[ "${DB_RAW}" == "CANNOT_CONNECT" ]]; then
  fail "Cannot connect to PostgreSQL. Is the postgres container running?"
fi

info "Current member_bot* databases: $(echo "${DB_RAW}" | tr '\n' ' ')"

HAS_MEMBER_BOT=$(echo "${DB_RAW}" | grep -c "^member_bot$" || true)
HAS_MEMBER_BOT_NEW=$(echo "${DB_RAW}" | grep -c "^member_bot_new$" || true)
HAS_MEMBER_BOT_OLD=$(echo "${DB_RAW}" | grep -c "^member_bot_old$" || true)

echo "" | tee -a "${LOG}"
echo "  member_bot:      ${HAS_MEMBER_BOT} (exists=${HAS_MEMBER_BOT})" | tee -a "${LOG}"
echo "  member_bot_new:  ${HAS_MEMBER_BOT_NEW} (exists=${HAS_MEMBER_BOT_NEW})" | tee -a "${LOG}"
echo "  member_bot_old:  ${HAS_MEMBER_BOT_OLD} (exists=${HAS_MEMBER_BOT_OLD})" | tee -a "${LOG}"
echo "" | tee -a "${LOG}"

# ============================================================
# STATE A: Phase 1-3 state
# member_bot + member_bot_new exist, member_bot_old does not
# Phase 4 not started yet — just drop member_bot_new if needed
# ============================================================
if [[ "${HAS_MEMBER_BOT}" -eq 1 && "${HAS_MEMBER_BOT_NEW}" -eq 1 && \
      "${HAS_MEMBER_BOT_OLD}" -eq 0 ]]; then

  # Check if Phase 4 was started (apps might be on member_bot_new)
  source "${CHECKPOINT}" 2>/dev/null || true
  PHASE4_STARTED="${PHASE4_COMPLETE:-}"

  echo "STATE: Phase 4 rollback (member_bot + member_bot_new both exist)"
  echo "       member_bot is UNTOUCHED — rollback is completely safe"
  echo ""
  echo "This will:"
  echo "  1. Stop any apps currently running on member_bot_new"
  echo "  2. Remove smoke test override file"
  echo "  3. Restart apps with original config → member_bot"
  echo ""
  read -r -p "Execute Phase 4 rollback? (yes/no): " CONFIRM
  [[ "${CONFIRM}" == "yes" ]] || { info "Rollback cancelled."; exit 0; }

  hdr "Phase 4 Rollback"

  info "Stopping apps..."
  $COMPOSE stop erp website telegram-bot >> "${LOG}" 2>&1
  ok "Apps stopped"

  info "Removing smoke test override..."
  rm -f "${SMOKE_OVERRIDE}" && info "Override removed" || info "Override not found (OK)"

  info "Starting apps with original config → member_bot..."
  $COMPOSE up -d --no-deps erp website telegram-bot >> "${LOG}" 2>&1
  ok "Apps starting with original member_bot"

  info "Waiting 30 seconds for apps to initialize..."
  sleep 30
  $COMPOSE ps erp website | tee -a "${LOG}"

  # Verify connections to member_bot
  CONNS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
    -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='member_bot';" 2>/dev/null || echo 0)
  info "member_bot connections: ${CONNS}"

  # Mark checkpoint as rolled back
  echo "ROLLBACK_PHASE4=$(date +%s)" >> "${CHECKPOINT}"

  echo "" | tee -a "${LOG}"
  ok "Phase 4 ROLLBACK COMPLETE"
  ok "Production is on original member_bot — data 100% safe"
  echo ""
  info "member_bot_new still exists. Drop it when ready:"
  info "  docker compose exec postgres psql -U postgres -c 'DROP DATABASE member_bot_new;'"
  exit 0
fi

# ============================================================
# STATE B: Phase 5 rename completed
# member_bot (new) + member_bot_old (original) exist
# Rollback: rename them back
# ============================================================
if [[ "${HAS_MEMBER_BOT}" -eq 1 && "${HAS_MEMBER_BOT_OLD}" -eq 1 && \
      "${HAS_MEMBER_BOT_NEW}" -eq 0 ]]; then

  echo "STATE: Phase 5 rollback (rename already executed)"
  echo "  member_bot     = new database (was member_bot_new)"
  echo "  member_bot_old = original production database"
  echo ""
  echo "This will:"
  echo "  1. Stop apps"
  echo "  2. Rename member_bot → member_bot_broken"
  echo "  3. Rename member_bot_old → member_bot"
  echo "  4. Restart apps on original member_bot"
  echo ""
  echo "  ⚠ Any data written to member_bot_new during Phase 4/5 will be"
  echo "    inaccessible (in member_bot_broken) until you decide to restore."
  echo ""
  read -r -p "Type 'ROLLBACK' to confirm: " CONFIRM
  [[ "${CONFIRM}" == "ROLLBACK" ]] || { info "Rollback cancelled."; exit 0; }

  hdr "Phase 5 Rollback"

  info "Stopping apps..."
  $COMPOSE stop erp website telegram-bot >> "${LOG}" 2>&1
  ok "Apps stopped"

  info "Terminating database connections..."
  $COMPOSE exec -T postgres psql -U postgres << 'EOSQL' >> "${LOG}" 2>&1
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('member_bot', 'member_bot_old')
  AND pid <> pg_backend_pid();
EOSQL
  sleep 2
  ok "Connections terminated"

  info "Renaming databases back..."
  $COMPOSE exec -T postgres psql -U postgres << 'EOSQL' >> "${LOG}" 2>&1
ALTER DATABASE member_bot     RENAME TO member_bot_broken;
ALTER DATABASE member_bot_old RENAME TO member_bot;
EOSQL

  # Verify
  DB_CHECK=$($COMPOSE exec -T postgres psql -U postgres -t -A \
    -c "SELECT datname FROM pg_database WHERE datname LIKE 'member_bot%' ORDER BY datname;")
  info "Post-rollback databases: $(echo "${DB_CHECK}" | tr '\n' ' ')"
  echo "${DB_CHECK}" | grep -q "^member_bot$" \
    || fail "member_bot not found after rollback rename!"
  ok "member_bot restored (original production database)"

  info "Removing smoke test override..."
  rm -f "${SMOKE_OVERRIDE}" || true

  info "Starting apps on original member_bot..."
  $COMPOSE up -d --no-deps erp website telegram-bot >> "${LOG}" 2>&1
  ok "Apps starting"

  sleep 20
  $COMPOSE ps erp website | tee -a "${LOG}"

  CONNS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
    -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='member_bot';" 2>/dev/null || echo 0)
  info "member_bot connections: ${CONNS}"

  echo "ROLLBACK_PHASE5=$(date +%s)" >> "${CHECKPOINT}"

  echo "" | tee -a "${LOG}"
  ok "Phase 5 ROLLBACK COMPLETE"
  ok "Production restored to original member_bot"
  echo ""
  warn "member_bot_broken = the new database that failed. Investigate before deciding to discard."
  exit 0
fi

# ============================================================
# STATE C: Only member_bot exists (no recovery in progress or already clean)
# ============================================================
if [[ "${HAS_MEMBER_BOT}" -eq 1 && "${HAS_MEMBER_BOT_NEW}" -eq 0 && \
      "${HAS_MEMBER_BOT_OLD}" -eq 0 ]]; then
  ok "Production is on original member_bot. No rollback needed."
  info "If apps are down, restart with:"
  info "  docker compose -f ${COMPOSE_FILE} up -d --no-deps erp website telegram-bot"
  exit 0
fi

# ============================================================
# STATE D: Unknown / unusual state
# ============================================================
echo "" | tee -a "${LOG}"
warn "UNKNOWN STATE — Manual assessment required" | tee -a "${LOG}"
echo "" | tee -a "${LOG}"
echo "  Current databases:"
$COMPOSE exec -T postgres psql -U postgres \
  -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size
      FROM pg_database WHERE datname LIKE 'member_bot%' ORDER BY datname;"
echo ""
echo "  Current app status:"
$COMPOSE ps erp website telegram-bot 2>/dev/null || true
echo ""
echo "  DO NOT take destructive action without fully understanding current state."
echo "  Refer to the recovery plan for guidance."
exit 1
