#!/usr/bin/env bash
# update-erp.sh — rebuild and restart the ERP (Next.js) only.
# Uses docker-compose.production.yml (root-level production compose).
# Does NOT touch Telegram Bot, postgres, redis, or nginx.
# Does NOT run migrations.
#
# Usage:
#   ./scripts/update-erp.sh            # rebuild from current local code
#   ./scripts/update-erp.sh --pull     # git pull first, then rebuild
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${SCRIPT_DIR}/lib.sh"

require_docker

# ── Flag parsing ──────────────────────────────────────────────────────────────
DO_PULL=false
for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=true ;;
    *) log_warn "Unknown flag ignored: $arg" ;;
  esac
done

# ── Git pull (optional) ───────────────────────────────────────────────────────
if $DO_PULL; then
  log_step "Git Pull"
  git -C "${PROJECT_ROOT}" pull || die "git pull failed."
  log_success "Code: $(git -C "${PROJECT_ROOT}" rev-parse --short HEAD)"
fi

log_step "Update ERP (production compose)"

COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.production.yml"
[[ -f "$COMPOSE_FILE" ]] || die "Not found: $COMPOSE_FILE"

# ── Build ─────────────────────────────────────────────────────────────────────
log_info "Building ERP image from ${COMPOSE_FILE}…"
docker compose -f "$COMPOSE_FILE" build erp

# ── Restart ───────────────────────────────────────────────────────────────────
log_info "Restarting ERP container (no-deps)…"
docker compose -f "$COMPOSE_FILE" up -d --no-deps erp

# ── Wait for healthy ──────────────────────────────────────────────────────────
log_info "Waiting for ERP health check…"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    "http://localhost:3000/api/ping" 2>/dev/null || echo "000")
  if [[ "$code" == "200" ]]; then
    log_success "ERP healthy (HTTP 200) after ${i}s"
    break
  fi
  if [[ $i -eq 60 ]]; then
    log_error "ERP did not become healthy after 60s (last HTTP code: $code)"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 erp
    exit 1
  fi
  sleep 1
done

# ── Verify commit ─────────────────────────────────────────────────────────────
COMMIT=$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'N/A')

log_success "ERP updated successfully."
echo ""
echo "  Commit : ${COMMIT}"
echo "  Health : http://localhost:3000/api/ping"
echo ""
echo "  To watch logs:"
echo "    docker compose -f docker-compose.production.yml logs -f erp"
echo ""
echo "  To test callback endpoint:"
echo "    curl -i -X POST https://api.apidemo.club/api/games/kiss918/callback/authenticate \\"
echo "      -H 'Content-Type: application/json' -d '{}'"
echo "    Expected: HTTP 200 with JSON (not 307)"
