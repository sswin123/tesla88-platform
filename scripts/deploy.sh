#!/usr/bin/env bash
# deploy.sh — Tesla88 / SSWIN88 Production 一键部署 (v1.0)
#
# 用法：
#   ./scripts/deploy.sh            # 普通更新
#   ./scripts/deploy.sh --fresh    # 首次部署（生成 SSL 证书）
#   ./scripts/deploy.sh --verbose  # 显示更多过程信息
#   ./scripts/deploy.sh --debug    # 完整 Debug 输出（排查专用）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DC="docker compose -f $COMPOSE_FILE"

FRESH_INSTALL=false
VERBOSE=false
DEBUG=false

for _arg in "$@"; do
    case "$_arg" in
        --fresh)   FRESH_INSTALL=true ;;
        --verbose) VERBOSE=true ;;
        --debug)   DEBUG=true; VERBOSE=true ;;
    esac
done

# ── 颜色 ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()      { echo -e "${GREEN}  ✓  ${NC}$*"; }
fail()    { echo -e "${RED}  ✗  ${NC}$*" >&2; }
info()    { echo -e "${BLUE}  →  ${NC}$*"; }
warn()    { echo -e "${YELLOW}  ⚠  ${NC}$*"; }
step()    { echo -e "\n${BOLD}${CYAN}━━━ $* ━━━${NC}"; }
die()     { fail "$*"; exit 1; }
debug()   { [ "$DEBUG"   = "true" ] && echo -e "${CYAN}[DEBUG]${NC} $*"  || true; }
verbose() { [ "$VERBOSE" = "true" ] && echo -e "${BLUE}  ·  ${NC}$*"     || true; }

# ── 各项检查结果（用于最终 Banner）─────────────────────────────────────────
R_MIGRATION="✗ FAIL"; R_SEED="✗ FAIL"
R_POSTGRES="✗ FAIL";  R_REDIS="⚠ SKIP"
R_ERP="✗ FAIL";       R_WEBSITE="✗ FAIL"
R_BOT="⚠ SKIP";      R_NGINX="✗ FAIL"
R_ERP_REACH="✗ FAIL"; R_WEB_REACH="✗ FAIL"
R_HTTP="✗ FAIL"

# ── 各步骤耗时（秒）────────────────────────────────────────────────────────
T_BUILD=0; T_MIGRATE=0; T_HEALTH=0; T_CONN=0; T_HTTP_DUR=0

# ── 版本信息（git pull 后更新）──────────────────────────────────────────────
GIT_COMMIT="unknown"; GIT_BRANCH="unknown"

DEPLOY_START=$(date +%s)
DEPLOY_DATE=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     Tesla88 / SSWIN88 Production       ║${NC}"
echo -e "${BOLD}${CYAN}║     Deploy — $(date '+%Y-%m-%d %H:%M:%S')       ║${NC}"
if [ "$DEBUG" = "true" ]; then
    echo -e "${BOLD}${CYAN}║     Mode: --debug                      ║${NC}"
elif [ "$VERBOSE" = "true" ]; then
    echo -e "${BOLD}${CYAN}║     Mode: --verbose                    ║${NC}"
fi
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# ════════════════════════════════════════════════════════════════════════
# resolve_project_name
#
# 三重保障获取 Compose 项目名，不硬编码目录名：
#   Method 1: docker compose config（读取 compose 文件的 name 字段）
#   Method 2: 从已运行容器的 label 读取
#   Method 3: 目录名小写（最终兜底）
# ════════════════════════════════════════════════════════════════════════
resolve_project_name() {
    local name=""

    # Method 1: docker compose config → name: xxx
    name=$($DC config 2>/dev/null \
           | grep '^name:' | head -1 \
           | sed 's/^name:[[:space:]]*//' | tr -d '"' | tr -d "'")
    if [ -n "$name" ]; then
        debug "项目名来源: compose config → ${name}"
        echo "$name"; return
    fi

    # Method 2: 从已运行容器 label 读取
    local cid
    cid=$(docker ps --filter "label=com.docker.compose.project" \
          --format "{{.ID}}" 2>/dev/null | head -1)
    if [ -n "$cid" ]; then
        name=$(docker inspect --format \
               '{{index .Config.Labels "com.docker.compose.project"}}' \
               "$cid" 2>/dev/null || echo "")
        if [ -n "$name" ]; then
            debug "项目名来源: 运行容器 label → ${name}"
            echo "$name"; return
        fi
    fi

    # Method 3: 目录名兜底
    name=$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' \
           | tr -cs 'a-z0-9_-' '-' | sed 's/-*$//')
    debug "项目名来源: 目录名（兜底）→ ${name}"
    echo "$name"
}

# ════════════════════════════════════════════════════════════════════════
# wait_for_migrate
#
# One-shot Container 生命周期：Created → Running → Exited(0)
# 不使用 docker compose ps / docker compose ps -q migrate。
#
# 查找容器两路并行（都不硬编码名称）：
#   路径 A：docker inspect ${PROJECT_NAME}-migrate-1  （名称推导，最快）
#   路径 B：docker ps -a --filter label=...            （标签查找，兜底）
#
# 每次循环打印 DEBUG 状态，出现问题立即可见。
# ════════════════════════════════════════════════════════════════════════
wait_for_migrate() {
    local project="$1"
    local max_wait=300 elapsed=0
    local migrate_cid="" cname="" state="" exit_code="" inspect_raw

    info "等待 Migration 容器（service label: com.docker.compose.service=migrate）..."

    # ── Step 1：等待容器出现（正式方案：service label only，不依赖 project name）
    # docker ps -a 默认 Created 降序，head -1 取最新容器
    while [ $elapsed -lt $max_wait ]; do

        migrate_cid=$(docker ps -a \
            --filter "label=com.docker.compose.service=migrate" \
            --format "{{.ID}}" 2>/dev/null | head -1)

        if [ -n "$migrate_cid" ]; then
            cname=$(docker inspect --format '{{.Name}}' "$migrate_cid" 2>/dev/null | tr -d '/' || echo "?")
            inspect_raw=$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}' "$migrate_cid" 2>/dev/null || echo "?|?")
            state="${inspect_raw%|*}"
            exit_code="${inspect_raw#*|}"
        fi

        if [ "$DEBUG" = "true" ]; then
            echo "--------------------------------"
            echo "[Migration Debug] elapsed=${elapsed}s"
            echo "  filter: label=com.docker.compose.service=migrate"
            echo "  Container ID:   ${migrate_cid:-EMPTY}"
            echo "  Container Name: ${cname:-N/A}"
            echo "  Status:         ${state:-N/A}"
            echo "  ExitCode:       ${exit_code:-N/A}"
            echo "  docker ps -a (前10行):"
            docker ps -a --format "    {{.Names}}\t{{.Status}}" 2>/dev/null | head -10
            echo "--------------------------------"
        fi

        if [ -n "$migrate_cid" ]; then
            verbose "  发现容器: ${cname} (${migrate_cid:0:12}) Status=${state}"
            break
        fi

        verbose "  ${elapsed}s — Migration 容器未出现，继续等待..."
        sleep 2; elapsed=$((elapsed + 2))
    done

    if [ -z "$migrate_cid" ]; then
        fail "Migration 容器未出现（超时 ${max_wait}s）"
        echo "=== 超时诊断：docker ps -a ==="
        docker ps -a --format "  {{.Names}}\t{{.Status}}" 2>/dev/null
        return 1
    fi

    info "Migration 容器已发现: ${cname} (${migrate_cid:0:12})，等待执行完毕..."

    # ── Step 2：轮询 Status + ExitCode，exited/0 立即退出（不再 sleep）────
    while [ $elapsed -lt $max_wait ]; do

        inspect_raw=$(docker inspect --format '{{.State.Status}}|{{.State.ExitCode}}' "$migrate_cid" 2>/dev/null || echo "inspect_failed|?")
        state="${inspect_raw%|*}"
        exit_code="${inspect_raw#*|}"

        if [ "$DEBUG" = "true" ]; then
            echo "--------------------------------"
            echo "[Migration Debug] elapsed=${elapsed}s"
            echo "  Container: ${cname} (${migrate_cid:0:12})"
            echo "  Status:    ${state}"
            echo "  ExitCode:  ${exit_code}"
            echo "--------------------------------"
        fi

        case "$state" in
            exited)
                if [ "$exit_code" = "0" ]; then
                    ok "Migration 完成（Status=exited ExitCode=0 elapsed=${elapsed}s）"
                    return 0
                else
                    fail "Migration 失败（ExitCode=${exit_code}）"
                    echo "=== Migration 日志（最后 200 行）==="
                    docker logs "$migrate_cid" 2>&1 | tail -200
                    return 1
                fi
                ;;
            running)
                verbose "  Migration 执行中... (${elapsed}s)"
                sleep 3; elapsed=$((elapsed + 3))
                ;;
            inspect_failed)
                fail "  docker inspect 失败（容器消失？）"
                sleep 2; elapsed=$((elapsed + 2))
                ;;
            *)
                debug "  状态='${state}'，继续等待..."
                sleep 2; elapsed=$((elapsed + 2))
                ;;
        esac
    done

    fail "Migration 超时（${max_wait}s）"
    echo ""
    echo "=== 超时诊断：docker ps -a ==="
    docker ps -a --format "  {{.Names}}\t{{.Status}}" 2>/dev/null
    echo ""
    echo "=== 超时诊断：docker inspect ==="
    docker inspect "$migrate_cid" 2>/dev/null \
        | grep -E '"Status"|"ExitCode"|"StartedAt"|"FinishedAt"' || true
    echo ""
    echo "=== 超时诊断：docker logs migrate（最后 100 行）==="
    docker logs "$migrate_cid" 2>&1 | tail -100
    return 1
}

# ════════════════════════════════════════════════════════════════════════
# wait_for_healthy — 长驻服务（postgres/redis/erp/website/nginx/bot）
# ════════════════════════════════════════════════════════════════════════
wait_for_healthy() {
    local service="$1" max_wait="${2:-240}" elapsed=0
    local cid="" health="" status=""
    info "等待 ${service} healthy..."
    while [ $elapsed -lt $max_wait ]; do
        cid=$($DC ps -q "$service" 2>/dev/null | head -1)
        if [ -n "$cid" ]; then
            health=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "none")
            status=$(docker inspect --format '{{.State.Status}}'        "$cid" 2>/dev/null || echo "unknown")
        else
            health="none"; status="not_found"
        fi

        if [ "$DEBUG" = "true" ]; then
            echo "--------------------------------"
            echo "[Health Debug] service=${service} elapsed=${elapsed}s"
            echo "  Container ID: ${cid:-EMPTY}"
            echo "  Status:       ${status}"
            echo "  Health:       ${health}"
            echo "--------------------------------"
        fi

        case "$health" in
            healthy)   ok "${service} ✓ (${elapsed}s)"; return 0 ;;
            unhealthy)
                fail "${service} unhealthy"
                if [ -n "$cid" ]; then
                    echo "=== 诊断：${service} 最后 20 行日志 ==="
                    $DC logs "$service" 2>/dev/null | tail -20
                fi
                return 1
                ;;
        esac
        verbose "  ${service}: ${health:-starting}... (${elapsed}s)"
        sleep 5; elapsed=$((elapsed + 5))
    done
    fail "${service} 超时（${max_wait}s）"
    if [ -n "$cid" ]; then
        echo "=== 超时诊断：docker inspect ${service} ==="
        docker inspect "$cid" 2>/dev/null \
            | grep -E '"Status"|"Health"|"ExitCode"' || true
        echo "=== 超时诊断：${service} 最后 20 行日志 ==="
        $DC logs "$service" 2>/dev/null | tail -20
    fi
    return 1
}

# ════════════════════════════════════════════════════════════════════════
# check_internal — 从 Nginx 容器内部测试后端连通性
# ════════════════════════════════════════════════════════════════════════
check_internal() {
    local target="$1" label="$2"
    local nginx_cid
    nginx_cid=$($DC ps -q nginx 2>/dev/null | head -1)
    if [ -z "$nginx_cid" ]; then
        fail "Nginx 容器未运行，无法执行内部连通测试"
        return 1
    fi
    if docker exec "$nginx_cid" wget -qO- --timeout=10 "$target" >/dev/null 2>&1; then
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
        code=$(wget -q --spider --server-response --timeout=15 "$url" 2>&1 \
               | awk '/HTTP\// {print $2}' | tail -1 || echo "000")
    fi
    verbose "[HTTP Debug] ${label} → HTTP ${code}"
    echo "$code" | grep -qE "^(2|3)" && { ok "${label} → HTTP ${code}"; return 0; }
    fail "${label} → HTTP ${code}"; return 1
}

# ── 辅助：Banner 结果行 ───────────────────────────────────────────────────────
result_line() {
    local label="$1" result="$2"
    case "$result" in
        "✓ PASS") echo -e "  ${GREEN}✓  PASS${NC}  ${label}" ;;
        "⚠ WARN"|"⚠ SKIP") echo -e "  ${YELLOW}⚠  WARN${NC}  ${label}" ;;
        *) echo -e "  ${RED}✗  FAIL${NC}  ${label}" ;;
    esac
}

# ────────────────────────────────────────────────────────────────────────

cd "$PROJECT_ROOT"

# ── 1/8  环境检查 ─────────────────────────────────────────────────────────────
step "1 / 8  环境检查"
command -v docker >/dev/null 2>&1       || die "Docker 未安装"
docker info >/dev/null 2>&1             || die "Docker daemon 未运行"
docker compose version >/dev/null 2>&1  || die "Docker Compose V2 未安装"
[ -f "$PROJECT_ROOT/.env" ]             || die ".env 文件不存在，请先创建"

PROJECT_NAME=$(resolve_project_name)
[ -z "$PROJECT_NAME" ] && die "无法确定 Compose 项目名，请检查 docker-compose.production.yml"
DC_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
ok "Docker & Compose ${DC_VERSION} ✓  |  .env ✓  |  项目: ${PROJECT_NAME}"

# ── 2/8  Git Pull ─────────────────────────────────────────────────────────────
step "2 / 8  Git Pull"
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
git pull origin main
AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$BEFORE" = "$AFTER" ]; then
    ok "已是最新版本（${AFTER:0:7}）"
else
    ok "${BEFORE:0:7} → ${AFTER:0:7}"
    git diff --name-only "$BEFORE" HEAD 2>/dev/null | head -15 | while read -r f; do info "  $f"; done
fi
verbose "  Branch: ${GIT_BRANCH}  |  Commit: ${GIT_COMMIT}"

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
_t=$(date +%s)
info "Build 镜像（仅重建有变更的）..."
$DC build --parallel
info "启动全部服务..."
$DC up -d
T_BUILD=$(( $(date +%s) - _t ))
ok "Docker Compose Up 完成（${T_BUILD}s）"

# ── 5/8  Migration ────────────────────────────────────────────────────────────
step "5 / 8  Database Migration"
_t=$(date +%s)
if wait_for_migrate "$PROJECT_NAME"; then
    T_MIGRATE=$(( $(date +%s) - _t ))
    R_MIGRATION="✓ PASS"
    R_SEED="✓ PASS"
else
    die "Migration 失败，停止部署"
fi

# ── 6/8  服务健康检查 ─────────────────────────────────────────────────────────
step "6 / 8  服务健康检查"
_t=$(date +%s)
wait_for_healthy postgres 60  && R_POSTGRES="✓ PASS" || die "PostgreSQL unhealthy，停止部署"
wait_for_healthy redis    60  && R_REDIS="✓ PASS"    || { warn "Redis unhealthy（继续部署）"; R_REDIS="⚠ WARN"; }
wait_for_healthy erp     240  && R_ERP="✓ PASS"      || { $DC logs erp 2>/dev/null | tail -20; die "ERP unhealthy，停止部署"; }
wait_for_healthy website 240  && R_WEBSITE="✓ PASS"  || { $DC logs website 2>/dev/null | tail -20; die "Website unhealthy，停止部署"; }
wait_for_healthy telegram-bot 120 \
    && R_BOT="✓ PASS" \
    || { warn "Telegram Bot unhealthy（请检查 BOT_TOKEN）"; R_BOT="⚠ WARN"; }
wait_for_healthy nginx    60  && R_NGINX="✓ PASS"    || { warn "Nginx unhealthy"; R_NGINX="⚠ WARN"; }
T_HEALTH=$(( $(date +%s) - _t ))

# ── 7/8  Nginx → 后端内部连通测试 ────────────────────────────────────────────
step "7 / 8  Nginx → 后端连通测试"
_t=$(date +%s)
check_internal "http://erp:3000/login" "Nginx → ERP (http://erp:3000/login)" \
    && R_ERP_REACH="✓ PASS" \
    || die "ERP 无法从 Nginx 访问，停止部署"
check_internal "http://website:3000" "Nginx → Website (http://website:3000)" \
    && R_WEB_REACH="✓ PASS" \
    || die "Website 无法从 Nginx 访问，停止部署"
T_CONN=$(( $(date +%s) - _t ))

# ── 8/8  公网 HTTP 检查 ───────────────────────────────────────────────────────
step "8 / 8  公网 HTTP 检查"
_t=$(date +%s)
HTTP_OK=true
check_http "https://apidemo.club"           "https://apidemo.club"           || HTTP_OK=false
check_http "https://erp.apidemo.club/login" "https://erp.apidemo.club/login" || HTTP_OK=false
T_HTTP_DUR=$(( $(date +%s) - _t ))

if [ "$HTTP_OK" = "true" ]; then
    R_HTTP="✓ PASS"
else
    R_HTTP="✗ FAIL"
    die "公网 HTTP 检查失败（请确认 DNS 和 Cloudflare 配置）"
fi

# ── 最终汇总 Banner ───────────────────────────────────────────────────────────
DEPLOY_END=$(date +%s)
T_TOTAL=$((DEPLOY_END - DEPLOY_START))

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
echo ""
echo -e "${BOLD}  各步骤耗时：${NC}"
printf "    %-14s %ss\n" "Build & Up"  "$T_BUILD"
printf "    %-14s %ss\n" "Migration"   "$T_MIGRATE"
printf "    %-14s %ss\n" "Health"      "$T_HEALTH"
printf "    %-14s %ss\n" "Nginx Conn"  "$T_CONN"
printf "    %-14s %ss\n" "HTTP Check"  "$T_HTTP_DUR"
printf "    %-14s %ss\n" "Total"       "$T_TOTAL"
echo ""
echo -e "${BOLD}  版本信息：${NC}"
printf "    %-14s %s\n" "Git Commit"  "$GIT_COMMIT"
printf "    %-14s %s\n" "Git Branch"  "$GIT_BRANCH"
printf "    %-14s %s\n" "Deploy Time" "$DEPLOY_DATE"
printf "    %-14s %s\n" "Compose Ver" "$DC_VERSION"
echo ""
echo -e "${BOLD}${GREEN}  Deployment Finished Successfully${NC}"
echo -e "${BOLD}${GREEN}=======================================${NC}"
echo ""
