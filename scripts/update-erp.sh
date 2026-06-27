#!/usr/bin/env bash
# update-erp.sh — rebuild and restart the ERP (Next.js) only.
# Does NOT touch the Telegram Bot.
# Does NOT run migrations.
# Usage:  ./scripts/update-erp.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker

log_step "Update ERP"

# ── Build ─────────────────────────────────────────────────────────────────────
log_info "Building ERP image…"
erp_dc build erp

# ── Restart ───────────────────────────────────────────────────────────────────
log_info "Restarting ERP container…"
erp_dc up -d --no-deps erp

# ── Wait for ERP to become healthy ────────────────────────────────────────────
wait_http "$ERP_HEALTH_URL" "ERP" 180

log_success "ERP updated successfully."
