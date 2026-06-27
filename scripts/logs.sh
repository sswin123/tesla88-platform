#!/usr/bin/env bash
# logs.sh — quick log viewer for ERP, Bot, and Database containers.
#
# Usage:
#   ./scripts/logs.sh erp [--tail N] [--follow]
#   ./scripts/logs.sh bot [--tail N] [--follow]
#   ./scripts/logs.sh db  [--tail N] [--follow]
#
# Defaults:  --tail 100   (no follow)
#
# Examples:
#   ./scripts/logs.sh erp
#   ./scripts/logs.sh bot --follow
#   ./scripts/logs.sh db  --tail 50 --follow
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker

# ── Parse arguments ───────────────────────────────────────────────────────────
TARGET="${1:-}"
shift || true

TAIL_LINES="100"
FOLLOW_FLAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--follow)
      FOLLOW_FLAG="--follow"
      ;;
    --tail)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || { log_error "--tail requires a positive integer"; exit 1; }
      TAIL_LINES="$2"
      shift
      ;;
    -n)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || { log_error "-n requires a positive integer"; exit 1; }
      TAIL_LINES="$2"
      shift
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

# ── Dispatch ──────────────────────────────────────────────────────────────────
case "$TARGET" in
  erp)
    log_info "Showing ERP logs (tail=${TAIL_LINES}${FOLLOW_FLAG:+, following})…"
    erp_dc logs --tail="${TAIL_LINES}" ${FOLLOW_FLAG} erp
    ;;
  bot)
    log_info "Showing Bot logs (tail=${TAIL_LINES}${FOLLOW_FLAG:+, following})…"
    dc logs --tail="${TAIL_LINES}" ${FOLLOW_FLAG} app
    ;;
  db)
    log_info "Showing Database logs (tail=${TAIL_LINES}${FOLLOW_FLAG:+, following})…"
    dc logs --tail="${TAIL_LINES}" ${FOLLOW_FLAG} db
    ;;
  *)
    echo -e "${BOLD}Usage:${NC}  $(basename "$0") <service> [--tail N] [--follow]"
    echo ""
    echo "  Services:"
    echo "    erp    Next.js ERP admin panel"
    echo "    bot    Telegram Bot + relay server"
    echo "    db     PostgreSQL database"
    echo ""
    echo "  Options:"
    echo "    --tail N     Show last N lines  (default: 100)"
    echo "    -f, --follow Stream new log lines in real time"
    echo ""
    echo "  Examples:"
    echo "    $(basename "$0") erp"
    echo "    $(basename "$0") bot --follow"
    echo "    $(basename "$0") db  --tail 50 --follow"
    exit 1
    ;;
esac
