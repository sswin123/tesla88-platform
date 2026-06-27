#!/usr/bin/env bash
# health.sh — verify ERP, Bot relay, and Database are healthy.
# Usage:  ./scripts/health.sh
# Exit:   0 if all checks pass, 1 if any fail.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
load_env

log_step "Health Checks"

overall_ok=true

# ── ERP /api/maintenance/health ───────────────────────────────────────────────
code=$(http_status "$ERP_HEALTH_URL")
if [[ "$code" =~ ^2 ]]; then
  log_success "ERP health endpoint         HTTP ${code}"
else
  log_error   "ERP health endpoint         HTTP ${code}  (${ERP_HEALTH_URL})"
  overall_ok=false
fi

# ── ERP /api/maintenance/status ───────────────────────────────────────────────
code=$(http_status "$ERP_STATUS_URL")
if [[ "$code" =~ ^2 ]]; then
  log_success "ERP status endpoint         HTTP ${code}"
else
  log_error   "ERP status endpoint         HTTP ${code}  (${ERP_STATUS_URL})"
  overall_ok=false
fi

# ── Bot relay /health ─────────────────────────────────────────────────────────
code=$(http_status "$BOT_RELAY_HEALTH_URL")
if [[ "$code" =~ ^2 ]]; then
  log_success "Bot relay /health           HTTP ${code}"
else
  log_error   "Bot relay /health           HTTP ${code}  (${BOT_RELAY_HEALTH_URL})"
  overall_ok=false
fi

# ── PostgreSQL connection ─────────────────────────────────────────────────────
if root_running db; then
  if db_psql -c "SELECT 1;" &>/dev/null; then
    log_success "PostgreSQL connection       OK"
  else
    log_error   "PostgreSQL connection       FAILED (psql returned error)"
    overall_ok=false
  fi
else
  log_error   "PostgreSQL connection       FAILED (db container not running)"
  overall_ok=false
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
if $overall_ok; then
  log_success "All health checks passed."
  exit 0
else
  log_error   "One or more health checks FAILED."
  exit 1
fi
