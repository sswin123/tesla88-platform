#!/bin/bash
# ============================================================
# Phase 6: Post-Cutover Monitoring and Validation
# Idempotent — safe to run multiple times
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
MANIFEST="${BACKUP_DIR}/manifest.txt"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
LOG="${BACKUP_DIR}/logs/phase6_postcheck_$(date +%Y%m%d_%H%M%S).log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " Phase 6: Post-Cutover Monitoring                           " | tee -a "${LOG}"
echo " $(date)                                                     " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

source "${CHECKPOINT}" 2>/dev/null \
  || { fail "Checkpoint file not found."; exit 1; }
[[ -n "${PHASE5_COMPLETE:-}" ]] \
  || { fail "Phase 5 not completed. Run 05_phase5_cutover.sh first."; exit 1; }

CUTOVER_EPOCH="${PHASE5_COMPLETE}"
RETAIN_UNTIL=$(date -d "@$((CUTOVER_EPOCH + 604800))" '+%Y-%m-%d' 2>/dev/null \
  || date -v+7d '+%Y-%m-%d' 2>/dev/null || echo "(cutover+7d)")

# ============================================================
# CHECK 1: Database state
# ============================================================
hdr "Check 1: Database state"

$COMPOSE exec -T postgres psql -U postgres \
  -c "
    SELECT datname,
           pg_size_pretty(pg_database_size(datname)) AS size,
           CASE datname
             WHEN 'member_bot'     THEN '← PRODUCTION (new clean DB)'
             WHEN 'member_bot_old' THEN '← BACKUP (original, keep until ${RETAIN_UNTIL})'
           END AS role
    FROM pg_database
    WHERE datname IN ('member_bot','member_bot_old','member_bot_new')
    ORDER BY datname;
  " | tee -a "${LOG}"

# Verify member_bot exists
MB_EXISTS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='member_bot';" 2>/dev/null || echo 0)
[[ "${MB_EXISTS}" == "1" ]] && ok "member_bot exists" || fail "member_bot NOT FOUND"

MB_OLD_EXISTS=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='member_bot_old';" 2>/dev/null || echo 0)
[[ "${MB_OLD_EXISTS}" == "1" ]] && ok "member_bot_old exists (backup)" \
  || warn "member_bot_old NOT found — backup may have been deleted"

# ============================================================
# CHECK 2: pg_dump verification
# ============================================================
hdr "Check 2: pg_dump verification"

$COMPOSE exec -T postgres \
  pg_dump -U postgres -d member_bot --schema-only --format=plain \
  -f /tmp/phase6_schema_check.sql >> "${LOG}" 2>&1 \
  && ok "pg_dump: PASS" || fail "pg_dump: FAIL — investigate catalog"

# ============================================================
# CHECK 3: Application health
# ============================================================
hdr "Check 3: Application health"

for svc in erp website; do
  CONTAINER_ID=$($COMPOSE ps -q "${svc}" 2>/dev/null | head -1 || echo "")
  if [[ -n "${CONTAINER_ID}" ]]; then
    STATUS=$(docker inspect "${CONTAINER_ID}" --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
    [[ "${STATUS}" == "healthy" ]] && ok "${svc}: ${STATUS}" || warn "${svc}: ${STATUS}"
  else
    warn "${svc}: container not found"
  fi
done

BOT_RUNNING=$($COMPOSE ps telegram-bot 2>/dev/null | grep -c "Up" || echo 0)
[[ "${BOT_RUNNING}" -gt 0 ]] && ok "telegram-bot: running" || warn "telegram-bot: not running"

# ============================================================
# CHECK 4: Active connections
# ============================================================
hdr "Check 4: Active connections to member_bot"

$COMPOSE exec -T postgres psql -U postgres \
  -c "
    SELECT datname, state, COUNT(*) AS connections
    FROM pg_stat_activity
    WHERE datname = 'member_bot'
    GROUP BY datname, state
    ORDER BY connections DESC;
  " | tee -a "${LOG}"

# ============================================================
# CHECK 5: Row count validation vs export manifest
# Counts should be >= export baseline (new transactions may have occurred)
# ============================================================
hdr "Check 5: Row count validation vs export baseline"

LOWER_COUNT=0
CHECKED_COUNT=0

if [[ -f "${MANIFEST}" ]]; then
  while IFS='|' read -r table csv_file db_rows csv_rows sha256 status; do
    [[ "${table}" == "TABLE" ]] && continue
    [[ "${status}" != "OK" ]] && continue
    [[ "${table}" == "schema_migrations" ]] && continue

    CURRENT=$($COMPOSE exec -T postgres psql -U postgres -d member_bot -t -A \
      -c "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null | tr -d ' ' || echo "ERROR")

    if [[ "${CURRENT}" == "ERROR" ]]; then
      warn "Cannot query ${table}"
      continue
    fi

    CHECKED_COUNT=$((CHECKED_COUNT+1))
    NEW_ROWS=$((CURRENT - db_rows))
    if [[ "${CURRENT}" -ge "${db_rows}" ]]; then
      ok "✓ ${table}: export=${db_rows} current=${CURRENT} (+${NEW_ROWS} new)"
    else
      warn "↓ LOWER: ${table}: export=${db_rows} current=${CURRENT}"
      LOWER_COUNT=$((LOWER_COUNT+1))
    fi
  done < "${MANIFEST}"
  info "Checked: ${CHECKED_COUNT} tables | Below baseline: ${LOWER_COUNT}"
  [[ "${LOWER_COUNT}" -eq 0 ]] && ok "All tables at or above export baseline"
else
  warn "manifest.txt not found — skip row count validation"
fi

# ============================================================
# CHECK 6: Trigger status
# ============================================================
hdr "Check 6: Trigger status"

DISABLED_TRIGGERS=$($COMPOSE exec -T postgres psql -U postgres -d member_bot -t -A \
  -c "
    SELECT COUNT(*) FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      AND t.tgenabled='D' AND NOT t.tgisinternal;
  " 2>/dev/null | tr -d ' ' || echo 0)
[[ "${DISABLED_TRIGGERS}" -eq 0 ]] \
  && ok "All triggers enabled" \
  || warn "${DISABLED_TRIGGERS} triggers disabled — investigate"

# ============================================================
# CHECK 7: Sequence sanity
# ============================================================
hdr "Check 7: Sequence sanity"

$COMPOSE exec -T postgres psql -U postgres -d member_bot \
  -c "
    SELECT schemaname, sequencename, last_value, start_value
    FROM pg_sequences
    WHERE schemaname='public'
    ORDER BY last_value DESC NULLS LAST
    LIMIT 10;
  " 2>/dev/null | tee -a "${LOG}"

# ============================================================
# 7-DAY RETENTION WARNING
# ============================================================
hdr "7-Day Retention Reminder"

echo "" | tee -a "${LOG}"
echo "  ╔═══════════════════════════════════════════════════════╗" | tee -a "${LOG}"
echo "  ║  member_bot_old RETENTION SCHEDULE                   ║" | tee -a "${LOG}"
echo "  ║                                                       ║" | tee -a "${LOG}"
echo "  ║  Cutover:          ${PHASE5_DATE:-unknown}            ║" | tee -a "${LOG}"
echo "  ║  Earliest delete:  ${RETAIN_UNTIL}                    ║" | tee -a "${LOG}"
echo "  ║                                                       ║" | tee -a "${LOG}"
echo "  ║  To delete (ONLY after ${RETAIN_UNTIL}):              ║" | tee -a "${LOG}"
echo "  ║  docker compose exec postgres psql -U postgres \\     ║" | tee -a "${LOG}"
echo "  ║    -c \"DROP DATABASE member_bot_old;\"               ║" | tee -a "${LOG}"
echo "  ║                                                       ║" | tee -a "${LOG}"
echo "  ║  ⚠ DO NOT delete before ${RETAIN_UNTIL}              ║" | tee -a "${LOG}"
echo "  ╚═══════════════════════════════════════════════════════╝" | tee -a "${LOG}"

# ============================================================
# Monitoring commands
# ============================================================
echo ""
echo "Monitoring commands:"
echo "  Watch ERP logs:     docker compose -f ${COMPOSE_FILE} logs -f --tail=50 erp"
echo "  Watch Website logs: docker compose -f ${COMPOSE_FILE} logs -f --tail=50 website"
echo "  DB connections:     docker compose -f ${COMPOSE_FILE} exec postgres psql -U postgres -c \"SELECT datname,state,count(*) FROM pg_stat_activity WHERE datname='member_bot' GROUP BY 1,2;\""
echo "  Re-run this check:  bash $(basename "${BASH_SOURCE[0]}")"
echo ""
ok "PHASE 6 COMPLETE — Post-cutover validation done"
