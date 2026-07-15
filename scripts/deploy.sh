#!/usr/bin/env bash
# deploy.sh — 一键 Production 部署（适用于 Demo 前每次执行）
#
# 功能：
#   1. Git Pull 最新代码
#   2. Build Docker 镜像（仅重建有变更的）
#   3. 启动全部服务
#   4. 等待 Migration 完成
#   5. 等待所有服务 Healthy
#   6. 检查公网 URL
#   7. 输出部署状态
#
# 用法：
#   ./scripts/deploy.sh
#
# 首次部署（需要先生成 SSL 证书）：
#   ./scripts/deploy.sh --fresh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

FRESH_INSTALL=false
[[ "${1:-}" == "--fresh" ]] && FRESH_INSTALL=true

# ── 颜色 ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓${NC}  $*"; }
fail() { echo -e "${RED}  ✗${NC}  $*" >&2; }
info() { echo -e "${BLUE}  →${NC}  $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC}  $*"; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }
die()  { fail "$*"; exit 1; }

DEPLOY_START=$(date +%s)

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Tesla88 / SSWIN88 Production       ║${NC}"
echo -e "${BOLD}${CYAN}║     Deploy — $(date '+%Y-%m-%d %H:%M:%S')       ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# ── 工具函数 ──────────────────────────────────────────────────────────────────

wait_for_migrate() {
    local max_wait=300
    local elapsed=0
    local cid state exit_code

    info "等待数据库 Migration 完成..."
    sleep 3

    while [ $elapsed -lt $max_wait ]; do
        cid=$($DC ps -q migrate 2>/dev/null | head -1)
        if [ -z "$cid" ]; then
            sleep 3; elapsed=$((elapsed + 3)); continue
        fi

        state=$(docker inspect --format '{{.State.Status}}' "$cid" 2>/dev/null || echo "starting")
        case "$state" in
            exited)
                exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$cid" 2>/dev/null || echo "1")
                if [ "$exit_code" = "0" ]; then
                    ok "Migration 完成"
                    return 0
                else
                    fail "Migration 失败 (exit code: $exit_code)"
                    echo ""
                    echo -e "${YELLOW}Migration 日志：${NC}"
                    $DC logs migrate 2>/dev/null | tail -30
                    return 1
                fi
                ;;
            running) info "  Migration 运行中… (${elapsed}s)"; sleep 5; elapsed=$((elapsed + 5)) ;;
            *)       sleep 3; elapsed=$((elapsed + 3)) ;;
        esac
    done

    fail "Migration 超时 (${max_wait}s)"
    return 1
}

wait_for_healthy() {
    local service="$1"
    local max_wait="${2:-240}"
    local elapsed=0
    local cid health

    while [ $elapsed -lt $max_wait ]; do
        cid=$($DC ps -q "$service" 2>/dev/null | head -1)
        if [ -n "$cid" ]; then
            health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "starting")
            case "$health" in
                healthy)   ok "${service} healthy"; return 0 ;;
                unhealthy) fail "${service} unhealthy"; return 1 ;;
            esac
        fi
        sleep 5; elapsed=$((elapsed + 5))
    done

    fail "${service} 超时 (${max_wait}s)"
    return 1
}

check_http() {
    local url="$1"
    local label="${2:-$url}"
    local code

    if command -v curl >/dev/null 2>&1; then
        code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 15 "$url" 2>/dev/null || echo "000")
    else
        code=$(wget -q --spider --server-response --timeout=10 "$url" 2>&1 | awk '/HTTP\// {print $2}' | tail -1 || echo "000")
    fi

    if echo "$code" | grep -qE "^(2|3)"; then
        ok "${label} → HTTP ${code}"
        return 0
    else
        fail "${label} → HTTP ${code}"
        return 1
    fi
}

# ── 0. 切换到项目目录 ─────────────────────────────────────────────────────────
cd "$PROJECT_ROOT"
ok "项目目录: $PROJECT_ROOT"

# ── 1. 检查 Docker ────────────────────────────────────────────────────────────
step "检查环境"

command -v docker >/dev/null 2>&1 || die "Docker 未安装"
docker info >/dev/null 2>&1       || die "Docker daemon 未运行"
docker compose version >/dev/null 2>&1 || die "Docker Compose V2 未安装"
ok "Docker & Docker Compose"

[ -f "$PROJECT_ROOT/.env" ] || die ".env 文件不存在，请先创建并填写环境变量"
ok ".env 文件存在"

# ── 2. Git Pull ───────────────────────────────────────────────────────────────
step "Git Pull"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
    die "当前目录不是 Git 仓库"
fi

BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
info "当前版本: ${BEFORE:0:7}"

if git pull origin main 2>&1 | tee /tmp/git-pull.log | grep -qE "Already up to date|up-to-date"; then
    ok "已是最新版本"
else
    AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    ok "已更新到: ${AFTER:0:7}"
    info "变更文件:"
    git diff --name-only "$BEFORE" HEAD 2>/dev/null | head -20 | while read -r f; do echo "    $f"; done
fi

# ── 3. SSL 证书（首次部署或 --fresh 时执行）──────────────────────────────────
step "SSL 证书"

SSL_VOLUME_EXISTS=$(docker volume ls -q | grep -c "nginx_ssl" || true)

if [ "$FRESH_INSTALL" = "true" ] || [ "$SSL_VOLUME_EXISTS" = "0" ]; then
    info "首次部署，生成 SSL 证书..."
    $DC run --rm certgen
    ok "SSL 证书已生成"
else
    ok "SSL 证书 Volume 已存在，跳过"
fi

# ── 4. Build & Start ──────────────────────────────────────────────────────────
step "Build & 启动服务"

info "Building 镜像（仅重建有变更的）..."
$DC build --parallel

info "启动全部服务..."
$DC up -d

ok "Docker 指令已执行"

# ── 5. 等待 Migration ────────────────────────────────────────────────────────
step "Database Migration"

wait_for_migrate || die "Migration 失败，停止部署"

# ── 6. 等待服务 Healthy ──────────────────────────────────────────────────────
step "等待服务 Healthy"

info "等待 PostgreSQL..."
wait_for_healthy postgres 60  || die "PostgreSQL unhealthy"

info "等待 ERP..."
wait_for_healthy erp 240      || { fail "ERP unhealthy"; warn "查看日志: docker compose logs erp"; die "部署失败"; }

info "等待 Website..."
wait_for_healthy website 240  || { fail "Website unhealthy"; warn "查看日志: docker compose logs website"; die "部署失败"; }

info "等待 Telegram Bot..."
wait_for_healthy telegram-bot 120 || warn "Telegram Bot unhealthy，请检查 BOT_TOKEN"

info "等待 Nginx..."
wait_for_healthy nginx 60     || warn "Nginx unhealthy，请检查 nginx 配置"

# ── 7. URL 健康检查 ──────────────────────────────────────────────────────────
step "公网 URL 检查"

ALL_OK=true

check_http "https://apidemo.club"     "Website (apidemo.club)"     || ALL_OK=false
check_http "https://erp.apidemo.club" "ERP (erp.apidemo.club)"     || ALL_OK=false
check_http "http://localhost:8090/ping" "Telegram Bot (localhost:8090)" || warn "Bot relay 未响应"

# ── 8. 服务状态 ──────────────────────────────────────────────────────────────
step "服务状态"

$DC ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || $DC ps

# ── 9. 部署完成 ──────────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
ELAPSED=$((DEPLOY_END - DEPLOY_START))

echo ""
if [ "$ALL_OK" = "true" ]; then
    echo -e "${BOLD}${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║         Production Ready  ✓            ║${NC}"
    echo -e "${BOLD}${GREEN}║                                        ║${NC}"
    echo -e "${BOLD}${GREEN}║  Website   → https://apidemo.club      ║${NC}"
    echo -e "${BOLD}${GREEN}║  ERP       → https://erp.apidemo.club  ║${NC}"
    echo -e "${BOLD}${GREEN}║  Telegram Bot  ✓                       ║${NC}"
    echo -e "${BOLD}${GREEN}║  Migration     ✓                       ║${NC}"
    echo -e "${BOLD}${GREEN}║  Nginx         ✓                       ║${NC}"
    echo -e "${BOLD}${GREEN}║                                        ║${NC}"
    printf "${BOLD}${GREEN}║  部署耗时: %-29s║${NC}\n" "${ELAPSED}s"
    echo -e "${BOLD}${GREEN}╚════════════════════════════════════════╝${NC}"
else
    echo -e "${BOLD}${YELLOW}╔════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${YELLOW}║     部署完成（部分服务有警告）          ║${NC}"
    echo -e "${BOLD}${YELLOW}║  查看日志: docker compose logs -f      ║${NC}"
    echo -e "${BOLD}${YELLOW}╚════════════════════════════════════════╝${NC}"
fi
echo ""
