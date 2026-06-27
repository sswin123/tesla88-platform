#!/usr/bin/env bash
# status.sh — display system status: containers, services, migrations, git, uptime.
# Usage:  ./scripts/status.sh
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_docker
load_env

echo ""
echo -e "${BOLD}${CYAN}════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  System Status${NC}"
echo -e "${BOLD}${CYAN}════════════════════════════════════════════════${NC}"

# ── Git info ──────────────────────────────────────────────────────────────────
if command -v git &>/dev/null && git -C "${PROJECT_ROOT}" rev-parse --is-inside-work-tree &>/dev/null; then
  GIT_COMMIT="$(git -C "${PROJECT_ROOT}" rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
  GIT_BRANCH="$(git -C "${PROJECT_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'N/A')"
  GIT_MESSAGE="$(git -C "${PROJECT_ROOT}" log -1 --pretty=%s 2>/dev/null || echo '')"
  echo ""
  echo -e "  ${BOLD}Git${NC}"
  echo -e "    Branch:   ${GIT_BRANCH}"
  echo -e "    Commit:   ${GIT_COMMIT}  ${GIT_MESSAGE}"
fi

# ── System uptime ─────────────────────────────────────────────────────────────
if command -v uptime &>/dev/null; then
  SYS_UPTIME="$(uptime | sed 's/^.*up //' | sed 's/,.*//')"
  echo ""
  echo -e "  ${BOLD}Host${NC}"
  echo -e "    Uptime:   ${SYS_UPTIME}"
fi

# ── Container status ──────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}Containers${NC}"

print_container() {
  local label="$1"
  local running="$2"
  local extra="${3:-}"
  if [[ "$running" == "true" ]]; then
    echo -e "    ${GREEN}●${NC} ${label}${extra:+  (${extra})}"
  else
    echo -e "    ${RED}●${NC} ${label}  — NOT running"
  fi
}

# db
if root_running db; then
  print_container "db  (PostgreSQL)" "true" "port 5432"
else
  print_container "db  (PostgreSQL)" "false"
fi

# app (bot + relay)
if root_running app; then
  print_container "app (Telegram Bot + Relay)" "true" "relay port ${BOT_RELAY_HOST_PORT}"
else
  print_container "app (Telegram Bot + Relay)" "false"
fi

# erp
if erp_running; then
  print_container "erp (Next.js ERP)" "true" "port ${ERP_HOST_PORT}"
else
  print_container "erp (Next.js ERP)" "false"
fi

# ── Service health ─────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}Service Health${NC}"

check_url() {
  local label="$1" url="$2"
  local code
  code=$(http_status "$url")
  if [[ "$code" =~ ^2 ]]; then
    echo -e "    ${GREEN}✓${NC} ${label}  HTTP ${code}"
  else
    echo -e "    ${RED}✗${NC} ${label}  HTTP ${code}"
  fi
}

check_url "ERP health " "$ERP_HEALTH_URL"
check_url "ERP status " "$ERP_STATUS_URL"
check_url "Bot relay  " "$BOT_RELAY_HEALTH_URL"

if root_running db; then
  if db_psql -c "SELECT 1;" &>/dev/null; then
    echo -e "    ${GREEN}✓${NC} Database    connected"
  else
    echo -e "    ${RED}✗${NC} Database    connection failed"
  fi
else
  echo -e "    ${RED}✗${NC} Database    container not running"
fi

# ── Migrations ────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}Migrations${NC}"

if root_running db; then
  # Check if schema_migrations table exists
  table_exists=$(
    db_psql -tAc \
      "SELECT COUNT(*) FROM information_schema.tables
       WHERE table_name = 'schema_migrations';" \
      2>/dev/null | tr -d '[:space:]'
  ) || table_exists="0"

  if [[ "$table_exists" == "1" ]]; then
    applied=$(
      db_psql -tAc "SELECT COUNT(*) FROM schema_migrations;" 2>/dev/null \
        | tr -d '[:space:]'
    ) || applied="?"

    # Count total SQL files
    total=$(find "${MIGRATIONS_DIR}" -maxdepth 1 -name "*.sql" 2>/dev/null | wc -l | tr -d ' ')
    pending=$((total - ${applied:-0}))

    echo -e "    Applied:  ${applied} / ${total}"
    if [[ $pending -gt 0 ]]; then
      echo -e "    ${YELLOW}Pending:  ${pending} migration(s) not yet applied${NC}"
      echo -e "    ${YELLOW}Run:      ./scripts/migrate.sh${NC}"
    else
      echo -e "    ${GREEN}Status:   up to date${NC}"
    fi

    # Show last 3 applied
    last=$(
      db_psql -tAc \
        "SELECT filename FROM schema_migrations ORDER BY executed_at DESC LIMIT 3;" \
        2>/dev/null | sed 's/^ *//' | sed '/^$/d'
    ) || last=""
    if [[ -n "$last" ]]; then
      echo -e "    Recent:"
      while IFS= read -r f; do
        echo -e "      ${f}"
      done <<< "$last"
    fi
  else
    echo -e "    ${YELLOW}schema_migrations table not found — run ./scripts/migrate.sh${NC}"
  fi
else
  echo -e "    ${YELLOW}Database not reachable — migration status unknown${NC}"
fi

# ── Backup info ────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}Backups${NC}"
if [[ -d "$BACKUPS_DIR" ]]; then
  backup_count=$(find "${BACKUPS_DIR}" -name "*.sql" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$backup_count" -gt 0 ]]; then
    latest=$(find "${BACKUPS_DIR}" -name "*.sql" 2>/dev/null | sort | tail -1)
    latest_size=$(du -sh "$latest" 2>/dev/null | cut -f1)
    echo -e "    Count:    ${backup_count} backup(s)"
    echo -e "    Latest:   $(basename "$latest")  (${latest_size})"
  else
    echo -e "    ${YELLOW}No backups found in ${BACKUPS_DIR}${NC}"
  fi
else
  echo -e "    ${YELLOW}${BACKUPS_DIR} does not exist — no backups yet${NC}"
fi

echo ""
echo -e "${BOLD}${CYAN}════════════════════════════════════════════════${NC}"
echo ""
