#!/usr/bin/env bash
# update-bot.sh — rebuild and restart the Telegram Bot + relay server only.
# Does NOT touch the ERP.
# Does NOT run migrations.
# Usage:  ./scripts/update-bot.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker

log_step "Update Telegram Bot"

# ── Build ─────────────────────────────────────────────────────────────────────
log_info "Building bot image…"
dc build app

# ── Restart (only the app service, leave db untouched) ────────────────────────
log_info "Restarting bot container…"
dc up -d --no-deps app

# ── Wait for relay to respond ─────────────────────────────────────────────────
wait_http "$BOT_RELAY_HEALTH_URL" "Bot relay" 90

log_success "Telegram Bot updated successfully."
