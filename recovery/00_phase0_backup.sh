#!/bin/bash
# ============================================================
# Phase 0: Complete Pre-Recovery Backup
# MUST be run BEFORE any other recovery script.
# Creates a timestamped, immutable backup of:
#   1. PostgreSQL data volume (PGDATA)
#   2. docker-compose.production.yml
#   3. .env
#   4. Migration files
#   5. Recovery scripts (this directory)
#   6. Export directory (if it already exists from a prior attempt)
#
# This script does NOT modify member_bot or any running service.
# ============================================================
set -Eeuo pipefail

PLATFORM_DIR="/root/tesla88-platform"
BACKUP_DIR="/root/tesla88-backup"
COMPOSE_FILE="${PLATFORM_DIR}/docker-compose.production.yml"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PHASE0_DIR="${BACKUP_DIR}/phase0_${TIMESTAMP}"
LOG="${PHASE0_DIR}/phase0_backup.log"
CHECKPOINT="${BACKUP_DIR}/checkpoints.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*" | tee -a "${LOG}"; }
fail() { echo -e "${RED}✗ FATAL:${NC} $*" | tee -a "${LOG}"; exit 1; }
info() { echo -e "${BLUE}→${NC} $*" | tee -a "${LOG}"; }
warn() { echo -e "${YELLOW}⚠${NC} $*" | tee -a "${LOG}"; }
hdr()  { echo -e "\n${BOLD}$*${NC}" | tee -a "${LOG}"; }

mkdir -p "${PHASE0_DIR}"
mkdir -p "${BACKUP_DIR}/logs"

echo "============================================================" | tee "${LOG}"
echo " Phase 0: Pre-Recovery Backup                               " | tee -a "${LOG}"
echo " Start: $(date)                                             " | tee -a "${LOG}"
echo " Backup dir: ${PHASE0_DIR}                                  " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

# ============================================================
# SAFETY CHECK: Verify postgres is running before backup
# ============================================================
hdr "Safety check: PostgreSQL status"

PG_RUNNING=$($COMPOSE ps postgres 2>/dev/null | grep -c "Up" || echo 0)
if [[ "${PG_RUNNING}" -eq 0 ]]; then
  fail "postgres container is not running. Cannot take a consistent backup. Start postgres first."
fi
ok "postgres container is Up"

# Verify member_bot is accessible (READ-ONLY check)
MB_CHECK=$($COMPOSE exec -T postgres psql -U postgres -t -A \
  -c "SELECT COUNT(*) FROM pg_database WHERE datname='member_bot';" 2>/dev/null || echo 0)
[[ "${MB_CHECK}" == "1" ]] \
  || fail "Cannot reach member_bot. Verify PostgreSQL is healthy."
ok "member_bot is accessible"

# ============================================================
# STEP 1: Backup PostgreSQL data volume (PGDATA)
# Uses a temporary alpine container to tar the volume without
# stopping postgres. This gives a crash-consistent snapshot
# (suitable for point-in-time reference; not a hot backup).
# ============================================================
hdr "Step 1: Backing up PostgreSQL data volume"

# Find the volume name from the postgres container
VOLUME_NAME=$(docker inspect \
  "$(${COMPOSE} ps -q postgres | head -1)" \
  --format='{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\n"}}{{end}}{{end}}' 2>/dev/null \
  | grep -i "postgres\|data\|pgdata" | head -1 || echo "")

if [[ -z "${VOLUME_NAME}" ]]; then
  warn "Cannot auto-detect postgres volume name."
  warn "Listing all volumes for this stack:"
  docker inspect \
    "$(${COMPOSE} ps -q postgres | head -1)" \
    --format='{{range .Mounts}}Type={{.Type}} Name={{.Name}} Src={{.Source}}{{"\n"}}{{end}}' 2>/dev/null \
    | tee -a "${LOG}"
  warn "Attempting fallback: listing docker volumes..."
  docker volume ls | grep -i "postgres\|data\|pgdata" | tee -a "${LOG}" || true
  warn "MANUAL ACTION REQUIRED: Identify the correct volume and back it up before continuing."
  warn "  docker run --rm -v <VOLUME_NAME>:/data -v ${PHASE0_DIR}:/backup alpine \\"
  warn "    tar czf /backup/pgdata_volume.tar.gz -C /data ."
  warn "Skipping automated PGDATA backup — continuing with remaining backups."
else
  info "Detected postgres volume: ${VOLUME_NAME}"
  info "Creating PGDATA snapshot (this may take a few minutes)..."
  docker run --rm \
    -v "${VOLUME_NAME}:/pgdata:ro" \
    -v "${PHASE0_DIR}:/backup" \
    alpine \
    tar czf /backup/pgdata_volume.tar.gz -C /pgdata . \
    >> "${LOG}" 2>&1 \
    || fail "PGDATA volume backup failed. Check disk space."

  PGDATA_SIZE=$(du -sh "${PHASE0_DIR}/pgdata_volume.tar.gz" 2>/dev/null | cut -f1 || echo "?")
  ok "PGDATA volume backed up: ${PHASE0_DIR}/pgdata_volume.tar.gz (${PGDATA_SIZE})"
fi

# Also record pg_controldata for reference
info "Recording pg_controldata output..."
$COMPOSE exec -T postgres bash -c "pg_controldata 2>/dev/null || true" \
  > "${PHASE0_DIR}/pg_controldata.txt" 2>&1 || true
ok "pg_controldata recorded"

# ============================================================
# STEP 2: Backup docker-compose.production.yml
# ============================================================
hdr "Step 2: Backing up docker-compose.production.yml"

[[ -f "${COMPOSE_FILE}" ]] \
  || fail "${COMPOSE_FILE} not found."
cp "${COMPOSE_FILE}" "${PHASE0_DIR}/docker-compose.production.yml.bak"
ok "docker-compose.production.yml backed up"

# ============================================================
# STEP 3: Backup .env
# ============================================================
hdr "Step 3: Backing up .env"

ENV_FILE="${PLATFORM_DIR}/.env"
[[ -f "${ENV_FILE}" ]] \
  || fail ".env not found at ${ENV_FILE}"
cp "${ENV_FILE}" "${PHASE0_DIR}/env.bak"
chmod 600 "${PHASE0_DIR}/env.bak"
ok ".env backed up (permissions: 600)"

# ============================================================
# STEP 4: Backup migration files
# ============================================================
hdr "Step 4: Backing up migration files"

# Check common migration directories
MIGRATION_DIR=""
for candidate in \
  "${PLATFORM_DIR}/erp/migrations" \
  "${PLATFORM_DIR}/migrations" \
  "${PLATFORM_DIR}/db/migrations" \
  "${PLATFORM_DIR}/erp/db/migrations"; do
  if [[ -d "${candidate}" ]]; then
    MIGRATION_DIR="${candidate}"
    break
  fi
done

if [[ -n "${MIGRATION_DIR}" ]]; then
  MIGRATION_COUNT=$(find "${MIGRATION_DIR}" -name "*.sql" -o -name "*.ts" -o -name "*.js" \
    2>/dev/null | wc -l)
  tar czf "${PHASE0_DIR}/migrations.tar.gz" -C "$(dirname "${MIGRATION_DIR}")" \
    "$(basename "${MIGRATION_DIR}")" >> "${LOG}" 2>&1 \
    || fail "Migration backup failed."
  ok "Migration files backed up: ${MIGRATION_COUNT} files from ${MIGRATION_DIR}"
else
  warn "Migration directory not found in known locations."
  warn "Checked: erp/migrations, migrations, db/migrations, erp/db/migrations"
  warn "MANUAL: tar czf ${PHASE0_DIR}/migrations.tar.gz -C <MIGRATION_PARENT_DIR> <MIGRATION_DIR_NAME>"
fi

# ============================================================
# STEP 5: Backup recovery scripts
# ============================================================
hdr "Step 5: Backing up recovery scripts"

RECOVERY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tar czf "${PHASE0_DIR}/recovery_scripts.tar.gz" -C "$(dirname "${RECOVERY_DIR}")" \
  "$(basename "${RECOVERY_DIR}")" >> "${LOG}" 2>&1 \
  || fail "Recovery scripts backup failed."
SCRIPT_COUNT=$(find "${RECOVERY_DIR}" -name "*.sh" | wc -l)
ok "Recovery scripts backed up: ${SCRIPT_COUNT} scripts from ${RECOVERY_DIR}"

# ============================================================
# STEP 6: Backup existing export directory (if any)
# In case this is a retry — preserve any prior Phase 1 exports
# ============================================================
hdr "Step 6: Backing up export directory (if exists)"

DATA_DIR="${BACKUP_DIR}/data"
if [[ -d "${DATA_DIR}" ]]; then
  CSV_COUNT=$(find "${DATA_DIR}" -name "*.csv" 2>/dev/null | wc -l)
  if [[ "${CSV_COUNT}" -gt 0 ]]; then
    info "Found ${CSV_COUNT} CSV files in ${DATA_DIR} — backing up prior export..."
    tar czf "${PHASE0_DIR}/prior_export_data.tar.gz" -C "${BACKUP_DIR}" data \
      >> "${LOG}" 2>&1 || warn "Prior export backup failed (non-fatal)"
    ok "Prior export data backed up: ${CSV_COUNT} CSVs"
  else
    info "Export directory exists but is empty — skipping"
  fi
else
  info "No existing export directory found (expected for first run)"
fi

# Also backup manifest and checkpoints if they exist
for f in "${BACKUP_DIR}/manifest.txt" "${BACKUP_DIR}/checkpoints.env" \
          "${BACKUP_DIR}/users_import_cols.txt" "${BACKUP_DIR}/gp_provider_id_list.txt"; do
  [[ -f "${f}" ]] && { cp "${f}" "${PHASE0_DIR}/"; info "Backed up: $(basename "${f}")"; }
done

# ============================================================
# STEP 7: Record pre-recovery state
# ============================================================
hdr "Step 7: Recording pre-recovery database state"

$COMPOSE exec -T postgres psql -U postgres \
  -c "
    SELECT datname,
           pg_size_pretty(pg_database_size(datname)) AS size,
           (SELECT COUNT(*) FROM pg_stat_activity WHERE datname=d.datname) AS connections
    FROM pg_database d
    WHERE datname NOT IN ('template0','template1','postgres')
    ORDER BY datname;
  " 2>/dev/null | tee "${PHASE0_DIR}/pre_recovery_db_state.txt" | tee -a "${LOG}"

# Record table count in member_bot (will be wrong/incomplete due to WAL corruption)
$COMPOSE exec -T postgres psql -U postgres -d member_bot \
  -c "
    SELECT schemaname, COUNT(*) AS tables
    FROM pg_tables
    WHERE schemaname='public'
    GROUP BY schemaname;
  " 2>/dev/null >> "${PHASE0_DIR}/pre_recovery_db_state.txt" 2>&1 || true

ok "Pre-recovery database state recorded"

# ============================================================
# CHECKPOINT 0
# ============================================================
mkdir -p "${BACKUP_DIR}/logs"
{
  echo "PHASE0_COMPLETE=$(date +%s)"
  echo "PHASE0_DATE=$(date)"
  echo "PHASE0_BACKUP_DIR=${PHASE0_DIR}"
} >> "${CHECKPOINT}"

# ============================================================
# SUMMARY
# ============================================================
echo "" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
echo " Phase 0 Backup Summary                                     " | tee -a "${LOG}"
echo " Backup location: ${PHASE0_DIR}                             " | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"
ls -lh "${PHASE0_DIR}/" | tee -a "${LOG}"
echo "============================================================" | tee -a "${LOG}"

BACKUP_TOTAL=$(du -sh "${PHASE0_DIR}" 2>/dev/null | cut -f1 || echo "?")
ok "PHASE 0 COMPLETE — Total backup size: ${BACKUP_TOTAL}"
ok "CHECKPOINT 0 PASSED"
echo ""
info "All backups stored in: ${PHASE0_DIR}"
info "Safe to run 01_phase1_export.sh"
