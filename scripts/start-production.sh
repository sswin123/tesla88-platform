#!/usr/bin/env bash
# start-production.sh — 快速启动（不 Build，直接使用已有镜像）
#
# 适用场景：
#   VPS 开机后，代码没有变更，只需要重新启动服务
#   启动速度比 deploy.sh / update-production.sh 快很多
#
# 用法：
#   ./scripts/start-production.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
info() { echo -e "${BLUE}  →${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

cd "$PROJECT_ROOT"

echo ""
echo -e "${BOLD}${CYAN}━━━ Start Production — $(date '+%Y-%m-%d %H:%M:%S') ━━━${NC}"

step "启动服务（使用已有镜像）"
info "不重新 Build，直接启动..."
$DC up -d
ok "所有服务已启动"

step "等待核心服务..."
sleep 10

echo ""
step "服务状态"
$DC ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || $DC ps

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  Production 已启动                   ║${NC}"
echo -e "${BOLD}${GREEN}║  Website  → https://apidemo.club     ║${NC}"
echo -e "${BOLD}${GREEN}║  ERP      → https://erp.apidemo.club ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
info "查看日志: docker compose -f docker-compose.production.yml logs -f"
info "停止服务: ./scripts/stop-production.sh"
