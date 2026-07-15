#!/usr/bin/env bash
# update-production.sh — 拉取最新代码并重新 Build 部署
#
# 适用场景：
#   Mac 开发完成 → git push origin main → VPS 执行此脚本
#
# 用法：
#   ./scripts/update-production.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

# ── 颜色 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
fail() { echo -e "${RED}  ✗${NC}  $*" >&2; }
info() { echo -e "${BLUE}  →${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }
die()  { fail "$*"; exit 1; }

# ── 工具函数 ──────────────────────────────────────────────────────────────────

wait_for_migrate() {
    local max_wait=300 elapsed=0 cid state exit_code
    info "等待 Migration 完成..."
    sleep 3
    while [ $elapsed -lt $max_wait ]; do
        cid=$($DC ps -q migrate 2>/dev/null | head -1)
        [ -z "$cid" ] && { sleep 3; elapsed=$((elapsed + 3)); continue; }
        state=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo "")
        case "$state" in
            exited)
                exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$cid" 2>/dev/null || echo "1")
                if [ "$exit_code" = "0" ]; then
                    ok "Migration 完成"; return 0
                else
                    fail "Migration 失败 (exit: $exit_code)"
                    $DC logs migrate 2>/dev/null | tail -20
                    return 1
                fi ;;
            running) info "  Migration 运行中… (${elapsed}s)"; sleep 5; elapsed=$((elapsed + 5)) ;;
            *) sleep 3; elapsed=$((elapsed + 3)) ;;
        esac
    done
    fail "Migration 超时 (${max_wait}s)"; return 1
}

wait_for_healthy() {
    local service="$1" max_wait="${2:-240}" elapsed=0 cid health
    info "等待 ${service} healthy..."
    while [ $elapsed -lt $max_wait ]; do
        cid=$($DC ps -q "$service" 2>/dev/null | head -1)
        if [ -n "$cid" ]; then
            health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "")
            case "$health" in
                healthy)   ok "${service} ✓"; return 0 ;;
                unhealthy) fail "${service} unhealthy"; return 1 ;;
            esac
        fi
        sleep 5; elapsed=$((elapsed + 5))
    done
    fail "${service} 超时 (${max_wait}s)"; return 1
}

check_http() {
    local url="$1" label="${2:-$url}" code
    if command -v curl >/dev/null 2>&1; then
        code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 15 "$url" 2>/dev/null || echo "000")
    else
        code=$(wget -q --spider --server-response --timeout=10 "$url" 2>&1 | awk '/HTTP\// {print $2}' | tail -1 || echo "000")
    fi
    echo "$code" | grep -qE "^(2|3)" && { ok "${label} → HTTP ${code}"; return 0; }
    fail "${label} → HTTP ${code}"; return 1
}

# ── Main ──────────────────────────────────────────────────────────────────────

cd "$PROJECT_ROOT"

echo ""
echo -e "${BOLD}${CYAN}━━━ Update Production — $(date '+%Y-%m-%d %H:%M:%S') ━━━${NC}"

# Step 1: Git Pull
step "1/4  Git Pull"
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
git pull origin main
AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
if [ "$BEFORE" = "$AFTER" ]; then
    ok "已是最新版本 (${AFTER:0:7})"
else
    ok "已更新: ${BEFORE:0:7} → ${AFTER:0:7}"
    git diff --name-only "$BEFORE" HEAD 2>/dev/null | head -10 | while read -r f; do info "  $f"; done
fi

# Step 2: Build & Restart
step "2/4  Build & Restart"
info "Build 镜像..."
$DC build --parallel
info "重启服务..."
$DC up -d
ok "服务已启动"

# Step 3: Wait Migration
step "3/4  Database Migration"
wait_for_migrate || die "Migration 失败"

# Step 4: Wait Healthy
step "4/4  服务健康检查"
wait_for_healthy postgres 60   || die "PostgreSQL unhealthy"
wait_for_healthy erp 240       || { $DC logs erp 2>/dev/null | tail -10; die "ERP unhealthy"; }
wait_for_healthy website 240   || { $DC logs website 2>/dev/null | tail -10; die "Website unhealthy"; }
wait_for_healthy telegram-bot 120 || echo -e "${YELLOW}  ⚠  Bot unhealthy，请检查 BOT_TOKEN${NC}"
wait_for_healthy nginx 60      || echo -e "${YELLOW}  ⚠  Nginx unhealthy${NC}"

# URL check
check_http "https://apidemo.club"     "Website" || true
check_http "https://erp.apidemo.club" "ERP"     || true

# Summary
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║       Deployment Complete  ✓         ║${NC}"
echo -e "${BOLD}${GREEN}║                                      ║${NC}"
echo -e "${BOLD}${GREEN}║  Website  → https://apidemo.club     ║${NC}"
echo -e "${BOLD}${GREEN}║  ERP      → https://erp.apidemo.club ║${NC}"
echo -e "${BOLD}${GREEN}║  Telegram Bot  ✓                     ║${NC}"
echo -e "${BOLD}${GREEN}║  Nginx         ✓                     ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

$DC ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || $DC ps
