#!/usr/bin/env bash
# healthcheck.sh — Comprehensive production health monitoring.
#
# Checks: CPU, memory, disk, Docker services, PostgreSQL, Redis,
#         Website, ERP API, ERP Admin, Bot relay.
#
# Usage:  ./scripts/healthcheck.sh
# Exit:   0 if all critical checks pass, 1 if any critical check fails.
#
# Output: Color-coded status for each component.
#         Use in cron for alerting:  ./scripts/healthcheck.sh || notify-admin
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib.sh"

load_env

overall_ok=true
WARN_ONLY=false

warn_or_fail() {
  if $WARN_ONLY; then
    log_warn "$*"
  else
    log_error "$*"
    overall_ok=false
  fi
}

# ── Determine which compose file is active ────────────────────────────────────
PROD_COMPOSE="${PROJECT_ROOT}/docker-compose.production.yml"
DEV_COMPOSE="${PROJECT_ROOT}/docker-compose.yml"

USE_PROD=false
if [[ -f "$PROD_COMPOSE" ]] && docker compose -f "$PROD_COMPOSE" --project-directory "${PROJECT_ROOT}" ps 2>/dev/null | grep -qE 'running|Up'; then
  USE_PROD=true
fi

dc_prod() {
  docker compose -f "${PROD_COMPOSE}" --project-directory "${PROJECT_ROOT}" "$@"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_step "System Resources"

# CPU
cpu_idle=$(top -bn1 | grep "Cpu(s)" | awk '{print $8}' | cut -d. -f1 2>/dev/null || echo "?")
if [[ "$cpu_idle" != "?" ]]; then
  cpu_used=$((100 - cpu_idle))
  if [[ $cpu_used -ge 90 ]]; then
    warn_or_fail "CPU usage HIGH: ${cpu_used}%"
  elif [[ $cpu_used -ge 75 ]]; then
    log_warn "CPU usage: ${cpu_used}%"
  else
    log_success "CPU usage:              ${cpu_used}%"
  fi
else
  log_info "CPU usage:              (unavailable)"
fi

# Memory
if command -v free &>/dev/null; then
  mem_total=$(free -m | awk '/^Mem:/{print $2}')
  mem_used=$(free -m  | awk '/^Mem:/{print $3}')
  mem_pct=$((mem_used * 100 / mem_total))
  if [[ $mem_pct -ge 90 ]]; then
    warn_or_fail "Memory usage HIGH: ${mem_used}MB / ${mem_total}MB (${mem_pct}%)"
  elif [[ $mem_pct -ge 80 ]]; then
    log_warn "Memory usage: ${mem_used}MB / ${mem_total}MB (${mem_pct}%)"
  else
    log_success "Memory usage:           ${mem_used}MB / ${mem_total}MB (${mem_pct}%)"
  fi
else
  log_info "Memory:                 (free not available)"
fi

# Disk
disk_pct=$(df -h / | awk 'NR==2{gsub(/%/,"",$5); print $5}' 2>/dev/null || echo "?")
if [[ "$disk_pct" != "?" ]]; then
  if [[ $disk_pct -ge 90 ]]; then
    warn_or_fail "Disk usage CRITICAL: ${disk_pct}% on /"
  elif [[ $disk_pct -ge 80 ]]; then
    log_warn "Disk usage: ${disk_pct}% on /"
  else
    log_success "Disk usage:             ${disk_pct}% on /"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_step "Docker Services"

check_service() {
  local service="$1"
  local state

  if $USE_PROD; then
    state=$(dc_prod ps --format '{{.State}}' "${service}" 2>/dev/null | head -1 || echo "missing")
  else
    state=$(docker compose -f "${DEV_COMPOSE}" --project-directory "${PROJECT_ROOT}" ps --format '{{.State}}' "${service}" 2>/dev/null | head -1 || echo "missing")
  fi

  case "$state" in
    running)
      log_success "  ${service}: running" ;;
    "")
      log_warn    "  ${service}: not found in compose" ;;
    *)
      warn_or_fail "  ${service}: ${state:-missing}"
      ;;
  esac
}

if $USE_PROD; then
  for svc in postgres redis erp website telegram-bot nginx; do
    check_service "$svc"
  done
else
  for svc in db app; do
    check_service "$svc"
  done
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_step "Database"

# PostgreSQL connectivity
pg_ok=false
if $USE_PROD; then
  if dc_prod exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres psql \
       -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "SELECT 1;" &>/dev/null; then
    pg_ok=true
  fi
elif root_running db 2>/dev/null; then
  if db_psql -c "SELECT 1;" &>/dev/null; then
    pg_ok=true
  fi
fi

if $pg_ok; then
  # Count tables as a basic sanity check
  if $USE_PROD; then
    table_count=$(dc_prod exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres psql \
      -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' \n' || echo "?")
  else
    table_count=$(db_psql -t -c \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' \n' || echo "?")
  fi
  log_success "PostgreSQL:             connected (${table_count} tables)"
else
  warn_or_fail "PostgreSQL:             CANNOT CONNECT"
fi

# Redis
if $USE_PROD; then
  if dc_prod exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    log_success "Redis:                  PONG"
  else
    log_warn "Redis:                  not responding (non-critical)"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_step "HTTP Endpoints"

check_http() {
  local label="$1" url="$2" critical="${3:-true}"
  local code
  code=$(http_status "$url")
  if [[ "$code" =~ ^2 ]]; then
    log_success "  ${label}  HTTP ${code}"
  elif $critical; then
    warn_or_fail "  ${label}  HTTP ${code}  (${url})"
  else
    log_warn     "  ${label}  HTTP ${code}  (${url})"
  fi
}

if $USE_PROD; then
  # Production: check via nginx (public ports 80/443)
  # These check the actual proxied endpoints
  check_http "Website (HTTP→HTTPS)   " "http://localhost/"              false
  check_http "ERP health (internal)  " "http://localhost:3000/api/maintenance/health" true
  check_http "Website health (intrnl)" "http://localhost:3001/api/health"              true
  check_http "Bot relay /health      " "http://localhost:8090/health"   true
else
  # Dev: check direct ports
  check_http "ERP health             " "${ERP_HEALTH_URL}"          true
  check_http "ERP status             " "${ERP_STATUS_URL}"          true
  check_http "Bot relay /health      " "${BOT_RELAY_HEALTH_URL}"    true
  check_http "Website health         " "${WEBSITE_HEALTH_URL}"      true
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_step "Summary"

# Backup age check
if [[ -d "${BACKUPS_DIR}" ]]; then
  latest_backup=$(find "${BACKUPS_DIR}" -name '*.sql' | sort -r | head -1)
  if [[ -n "$latest_backup" ]]; then
    backup_age_hours=$(( ($(date +%s) - $(stat -c %Y "${latest_backup}" 2>/dev/null || stat -f %m "${latest_backup}" 2>/dev/null || echo 0)) / 3600 ))
    if [[ $backup_age_hours -gt 25 ]]; then
      log_warn "Latest backup is ${backup_age_hours}h old: ${latest_backup}"
    else
      log_success "Latest backup:          ${backup_age_hours}h ago (${latest_backup##*/})"
    fi
  else
    log_warn "No backups found in ${BACKUPS_DIR}"
  fi
fi

echo ""
if $overall_ok; then
  log_success "All critical health checks PASSED."
  exit 0
else
  log_error   "One or more critical health checks FAILED."
  exit 1
fi
