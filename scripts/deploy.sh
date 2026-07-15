#!/usr/bin/env bash
# deploy.sh — Tesla88 / SSWIN88 Production 一键部署
#
# 用法：
#   ./scripts/deploy.sh            # 普通更新
#   ./scripts/deploy.sh --fresh    # 首次部署（生成 SSL 证书）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

FRESH_INSTALL=false
[[ "${1:-}" == "--fresh" ]] && FRESH_INSTALL=true

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "${GREEN}  ✓  ${NC}$*"; }
fail() { echo -e "${RED}  ✗  ${NC}$*" >&2; }
info() { echo -e "${BLUE}  →  ${NC}$*"; }
warn() { echo -e "${YELLOW}  ⚠  ${NC}$*"; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }
die()  { fail "$*"; exit 1; }

DEPLOY_START=$(date +%s)

# Compose 项目名 = 目录名小写（Docker Compose V2 规则）
COMPOSE_PROJECT=$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9_-' '-' | sed 's/-*$//')
MIGRATE_CONTAINER="${COMPOSE_PROJECT}-migrate-1"
NGINX_CONTAINER="${COMPOSE_PROJECT}-nginx-1"

# 各项检查结果（用于最终 Banner）
R_MIGRATION="✗ FAIL"; R_SEED="✗ FAIL"
R_POSTGRES="✗ FAIL"; R_REDIS="✗ FAIL"
R_ERP="✗ FAIL";      R_WEBSITE="✗ FAIL"
R_BOT="⚠ SKIP";     R_NGINX="✗ FAIL"
R_ERP_REACH="✗ FAIL"; R_WEB_REACH="✗ FAIL"
R_HTTP="✗ FAIL"

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Tesla88 / SSWIN88 Production       ║${NC}"
echo -e "${BOLD}${CYAN}║     Deploy — $(date '+%Y-%m-%d %H:%M:%S')       ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""
info "Compose 项目: ${COMPOSE_PROJECT}"

# ════════════════════════════════════════════════════════════════════════
# wait_for_migrate
#
#   One-shot Container 生命周期：Created → Running → Exited
#   不等 Healthy，不用 docker compose ps。
#   直接 docker inspect <container-name> 读取 State.Status + State.ExitCode。
#
#   Step 1：等待容器出现（最长 max_wait 秒）
#   Step 2：循环读取 State.Status
#     exited + ExitCode=0  → 成功
#     exited + ExitCode!=0 → 失败，打印 200 行日志，exit 1
#     running              → 继续等待
#     其他状态             → 继续等待
#   超时                   → 打印日志，exit 1
# ════════════════════════════════════════════════════════════════════════
wait_for_migrate() {
    local max_wait=300 elapsed=0 state exit_code

    info "等待 Migration 容器出现（${MIGRATE_CONTAINER}）..."

    # Step 1：容器出现
    while [ $elapsed -lt $max_wait ]; do
        if docker inspect "$MIGRATE_CONTAINER" >/dev/null 2>&1; then
            break
        fi
        sleep 2; elapsed=$((elapsed + 2))
    done

    if ! docker inspect "$MIGRATE_CONTAINER" >/dev/null 2>&1; then
        fail "Migration 容器未出现（超时 ${max_wait}s）"
        return 1
    fi

    info "Migration 容器已发现，等待执行完毕..."

    # Step 2：等待退出
    while [ $elapsed -lt $max_wait ]; do
        state=$(docker inspect --format '{{.State.Status}}' "$MIGRATE_CONTAINER" 2>/dev/null || echo "")

        case "$state" in
            exited)
                exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$MIGRATE_CONTAINER" 2>/dev/null || echo "1")
                if [ "$exit_code" = "0" ]; then
                    ok "Migration 完成（ExitCode=0）"
                    return 0
                else
                    fail "Migration 失败（ExitCode=${exit_code}）"
                    echo ""
                    echo -e "${YELLOW}━━━ Migration 日志（最后 200 行）━━━${NC}"
                    docker logs "$MIGRATE_CONTAINER" 2>&1 | tail -200
                    return 1
                fi
                ;;
            running)
                info "  Migration 执行中... (${elapsed}s)"
                sleep 3; elapsed=$((elapsed + 3))
                ;;
            *)
                # created / restarting / removing / dead
                sleep 2; elapsed=$((elapsed + 2))
                ;;
        esac
    done

    fail "Migration 超时（${max_wait}s）"
    echo -e "${YELLOW}━━━ Migration 日志（最后 50 行）━━━${NC}"
    docker logs "$MIGRATE_CONTAINER" 2>&1 | tail -50
    return 1
}

# ════════════════════════════════════════════════════════════════════════
# wait_for_healthy  — 长驻服务（postgres/erp/website/nginx/bot）
# ════════════════════════════════════════════════════════════════════════
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
    fail "${service} 超时（${max_wait}s）"; return 1
}

# ════════════════════════════════════════════════════════════════════════
# check_internal — 从 Nginx 容器内部测试后端连通性
#   目的：提前发现 nginx → backend 502，不等客户打开浏览器才知道
# ════════════════════════════════════════════════════════════════════════
check_internal() {
    local target="$1" label="$2"
    if docker exec "$NGINX_CONTAINER" wget -qO- --timeout=10 "$target" >/dev/null 2>&1; then
        ok "${label} ✓"
        return 0
    else
        fail "${label} 连接失败"
        return 1
    fi
}

# ════════════════════════════════════════════════════════════════════════
# check_http — 公网 URL HTTP 状态码检查
# ════════════════════════════════════════════════════════════════════════
check_http() {
    local url="$1" label="${2:-$url}" code
    if command -v curl >/dev/null 2>&1; then
        code=$(curl -sk -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 15 "$url" 2>/dev/null || echo "000")
    else
        code=$(wget -q --spider --server-response --timeout=15 "$url" 2>&1 | awk '/HTTP\// {print $2}' | tail -1 || echo "000")
    fi
    echo "$code" | grep -qE "^(2|3)" && { ok "${label} → HTTP ${code}"; return 0; }
    fail "${label} → HTTP ${code}"; return 1
}

# ────────────────────────────────────────────────────────────────────────

cd "$PROJECT_ROOT"

# ── 1/8  环境检查 ─────────────────────────────────────────────────────────────
step "1 / 8  环境检查"
command -v docker >/dev/null 2>&1        || die "Docker 未安装"
docker info >/dev/null 2>&1              || die "Docker daemon 未运行"
docker compose version >/dev/null 2>&1   || die "Docker Compose V2 未安装"
[ -f "$PROJECT_ROOT/.env" ]              || die ".env 文件不存在，请先创建"
ok "Docker & Compose ✓  |  .env ✓  |  项目: ${COMPOSE_PROJECT}"

# ── 2/8  Git Pull ─────────────────────────────────────────────────────────────
step "2 / 8  Git Pull"
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
git pull origin main
AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
if [ "$BEFORE" = "$AFTER" ]; then
    ok "已是最新版本（${AFTER:0:7}）"
else
    ok "已更新：${BEFORE:0:7} → ${AFTER:0:7}"
    git diff --name-only "$BEFORE" HEAD 2>/dev/null | head -15 | while read -r f; do info "  $f"; done
fi

# ── 3/8  SSL 证书 ─────────────────────────────────────────────────────────────
step "3 / 8  SSL 证书"
SSL_VOLUME_EXISTS=$(docker volume ls -q | grep -c "nginx_ssl" || true)
if [ "$FRESH_INSTALL" = "true" ] || [ "$SSL_VOLUME_EXISTS" = "0" ]; then
    info "首次部署，生成自签名 SSL 证书..."
    $DC run --rm certgen
    ok "SSL 证书已生成"
else
    ok "SSL Volume 已存在，跳过"
fi

# ── 4/8  Build & 启动 ─────────────────────────────────────────────────────────
step "4 / 8  Build & 启动"
info "Build 镜像（仅重建有变更的）..."
$DC build --parallel
info "启动全部服务..."
$DC up -d
ok "Docker Compose Up 完成"

# ── 5/8  Migration ────────────────────────────────────────────────────────────
step "5 / 8  Database Migration"
if wait_for_migrate; then
    R_MIGRATION="✓ PASS"
    R_SEED="✓ PASS"
else
    die "Migration 失败，停止部署"
fi

# ── 6/8  服务健康检查 ─────────────────────────────────────────────────────────
step "6 / 8  服务健康检查"

if wait_for_healthy postgres 60; then
    R_POSTGRES="✓ PASS"
else
    die "PostgreSQL unhealthy，停止部署"
fi

if wait_for_healthy redis 60; then
    R_REDIS="✓ PASS"
else
    warn "Redis unhealthy"
fi

if wait_for_healthy erp 240; then
    R_ERP="✓ PASS"
else
    $DC logs erp 2>/dev/null | tail -20
    die "ERP unhealthy，停止部署"
fi

if wait_for_healthy website 240; then
    R_WEBSITE="✓ PASS"
else
    $DC logs website 2>/dev/null | tail -20
    die "Website unhealthy，停止部署"
fi

if wait_for_healthy telegram-bot 120; then
    R_BOT="✓ PASS"
else
    warn "Telegram Bot unhealthy（请检查 BOT_TOKEN，不影响部署继续）"
    R_BOT="⚠ WARN"
fi

if wait_for_healthy nginx 60; then
    R_NGINX="✓ PASS"
else
    warn "Nginx unhealthy"
    R_NGINX="⚠ WARN"
fi

# ── 7/8  Nginx → 后端内部连通测试 ────────────────────────────────────────────
step "7 / 8  Nginx → 后端连通测试"

if check_internal "http://erp:3000/login" "Nginx → ERP (http://erp:3000/login)"; then
    R_ERP_REACH="✓ PASS"
else
    die "ERP 无法从 Nginx 访问（Connection refused），停止部署"
fi

if check_internal "http://website:3000" "Nginx → Website (http://website:3000)"; then
    R_WEB_REACH="✓ PASS"
else
    die "Website 无法从 Nginx 访问（Connection refused），停止部署"
fi

# ── 8/8  公网 HTTP 检查 ───────────────────────────────────────────────────────
step "8 / 8  公网 HTTP 检查"
HTTP_ALL=true
check_http "https://apidemo.club"           "https://apidemo.club"           || HTTP_ALL=false
check_http "https://erp.apidemo.club/login" "https://erp.apidemo.club/login" || HTTP_ALL=false
[ "$HTTP_ALL" = "true" ] && R_HTTP="✓ PASS" || R_HTTP="✗ FAIL"

# ── 最终汇总 Banner ───────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
ELAPSED=$((DEPLOY_END - DEPLOY_START))

# 辅助：根据结果输出带颜色的行
result_line() {
    local label="$1" result="$2"
    if [[ "$result" == "✓ PASS" ]]; then
        echo -e "  ${GREEN}✓  PASS${NC}  ${label}"
    elif [[ "$result" == "⚠ WARN" || "$result" == "⚠ SKIP" ]]; then
        echo -e "  ${YELLOW}⚠  WARN${NC}  ${label}"
    else
        echo -e "  ${RED}✗  FAIL${NC}  ${label}"
    fi
}

echo ""
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo -e "${BOLD}${GREEN}         Production Ready              ${NC}"
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo ""
result_line "Migration"                    "$R_MIGRATION"
result_line "Seed"                         "$R_SEED"
echo ""
result_line "PostgreSQL"                   "$R_POSTGRES"
result_line "Redis"                        "$R_REDIS"
result_line "ERP"                          "$R_ERP"
result_line "Website"                      "$R_WEBSITE"
result_line "Telegram Bot"                 "$R_BOT"
result_line "Nginx"                        "$R_NGINX"
echo ""
result_line "ERP Reachable from Nginx"     "$R_ERP_REACH"
result_line "Website Reachable from Nginx" "$R_WEB_REACH"
echo ""
result_line "HTTP Check"                   "$R_HTTP"
echo ""
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo -e "  Website  →  https://apidemo.club"
echo -e "  ERP      →  https://erp.apidemo.club"
echo -e "  部署耗时: ${ELAPSED}s"
echo ""
echo -e "${BOLD}${GREEN}  Deployment Finished Successfully${NC}"
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo ""
