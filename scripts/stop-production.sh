#!/usr/bin/env bash
# stop-production.sh — 停止 Production 服务（保留数据库 Volume）
#
# 适用场景：
#   Demo 完毕，关闭 VPS 前执行
#   停止全部容器，但保留所有数据（postgres, uploads, media, nginx_ssl）
#
# 用法：
#   ./scripts/stop-production.sh
#
# ⚠ 注意：此脚本不会删除任何 Volume，数据完全保留
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC}  $*"; }
info() { echo -e "\033[0;34m  →${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }

cd "$PROJECT_ROOT"

echo ""
echo -e "${BOLD}${CYAN}━━━ Stop Production — $(date '+%Y-%m-%d %H:%M:%S') ━━━${NC}"

step "停止前状态"
$DC ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || $DC ps || true

step "停止所有服务"
info "停止容器（保留 Volume）..."
$DC down
ok "所有容器已停止"

step "确认 Volume 保留"
echo ""
echo -e "${BOLD}保留的数据 Volume：${NC}"
docker volume ls --format "  {{.Name}}" | grep -E "telegram.member.bot|sswin|postgres|redis|erp|website|nginx" 2>/dev/null || true
echo ""

warn "数据库、上传文件、SSL 证书均已保留"
warn "下次启动请执行："
info "  有代码更新 → ./scripts/update-production.sh"
info "  无代码更新 → ./scripts/start-production.sh"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  Production 已停止                   ║${NC}"
echo -e "${BOLD}${GREEN}║  所有数据已保留（Volume 未删除）     ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
